import { initializeFirebase, getTargetSeasonId, getApiKeys, getFirestore } from './config.js';
import { scrapeEvents } from './scrapers/events-scraper.js';
import { scrapeEventDetails, extractDivisions } from './scrapers/event-details-scraper.js';
import { scrapeEventTeams } from './scrapers/event-teams-scraper.js';
import { scrapeEventMatches } from './scrapers/event-matches-scraper.js';
import { scrapeEventRankings } from './scrapers/event-rankings-scraper.js';
import { scrapeEventFinalistRankings } from './scrapers/event-finalist-rankings-scraper.js';
import { scrapeEventSkills } from './scrapers/event-skills-scraper.js';
import { batchWriteToFirestore, updateRealtimeDB, updateSyncProgress, getSyncProgress } from './utils/firebase-helpers.js';
import { sleep } from './utils/rate-limiter.js';

/**
 * Modes: 
 * --full: Scrapes everything (current behavior)
 * --new: Scrapes season, only deep syncs events not in DB
 * --live: Only syncs events happening today (Matches/Rankings only)
 */
const mode = process.argv.includes('--live') ? 'live' : 
             process.argv.includes('--new') ? 'new' : 'full';

async function main() {
  console.log(`Starting RobotEvents Firebase Sync [MODE: ${mode.toUpperCase()}]...`);
  
  // Initialize Firebase
  const { db } = initializeFirebase();
  console.log('Firebase initialized');

  const targetSeasonId = getTargetSeasonId();
  if (!targetSeasonId) {
    console.error('TARGET_SEASON_ID not set. Please set it in environment variables.');
    process.exit(1);
  }

  console.log(`Target season ID: ${targetSeasonId}`);

  try {
    // Fetch all events for the season
    console.log(`Fetching events for season ${targetSeasonId}...`);
    let events = await scrapeEvents(targetSeasonId);
    console.log(`Found ${events.length} total events in season`);

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Filter events based on mode
    if (mode === 'live') {
      events = events.filter(event => {
        const start = event.start ? new Date(event.start).toISOString().split('T')[0] : '';
        const end = event.end ? new Date(event.end).toISOString().split('T')[0] : '';
        // Event is "Live" if today is between start and end date
        return todayStr >= start && todayStr <= end;
      });
      console.log(`📍 Found ${events.length} events happening today.`);
    }

    // Process each event
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const eventId = String(event.id || event.sku);
      
      console.log(`\n[${i + 1}/${events.length}] Checking event ${eventId}: ${event.name || 'Unknown'}`);

      // SKIP LOGIC for 'new' and 'full' modes
      if (mode !== 'live') {
        try {
          const doc = await db.collection('events').doc(eventId).get();
          
          if (doc.exists) {
            // In 'new' mode, if we have metadata, we are DONE with this event.
            if (mode === 'new') {
              process.stdout.write('.');
              if ((i + 1) % 50 === 0) console.log(` [${i + 1}/${events.length}]`); 
              continue;
            }

            // In 'full' mode, we only skip if it's in the past AND "perfect"
            const eventEndDate = event.end ? new Date(event.end) : null;
            const isPastEvent = eventEndDate && (now.getTime() - eventEndDate.getTime() > 24 * 60 * 60 * 1000);

            if (isPastEvent) {
              const finCheck = await db.collection(`events/${eventId}/divisions/1/finalistRankings`).limit(1).get();
              const firstFin = finCheck.docs[0];
              if (firstFin && firstFin.id.startsWith('team_')) {
                process.stdout.write('.'); 
                if ((i + 1) % 50 === 0) console.log(` [${i + 1}/${events.length}]`); 
                continue;
              }
            }
          }
        } catch (e) {
          // If check fails, just proceed
        }
      }

      try {
        // 1. Store event metadata (Skip if exists in live/new mode unless explicit)
        if (mode === 'full' || mode === 'new') {
          console.log(`  📝 Storing metadata...`);
          await batchWriteToFirestore('events', [{ id: eventId, data: event }]);
        }

        // 2. Fetch details to get divisions
        console.log(`  🔍 Fetching event details...`);
        const eventDetails = await scrapeEventDetails(eventId);
        const divisions = extractDivisions(eventDetails);

        if (divisions.length > 0 && mode !== 'live') {
          console.log(`  📂 Storing ${divisions.length} divisions...`);
          await batchWriteToFirestore(`events/${eventId}/divisions`, divisions.map(d => ({ id: String(d.id), data: d })));
        }

        // 3. Process each division (Rankings & Matches)
        for (const division of divisions) {
          const divId = division.id;
          console.log(`  🔷 Division ${divId}: ${division.name}`);
          
          // Rankings
          console.log(`    📊 Fetching rankings...`);
          const rankings = await scrapeEventRankings(eventId, divId);
          if (rankings.length > 0) {
            const rankingDocs = rankings.map(r => ({ id: String(r.id || `team_${r.team?.id || r.team}`), data: r }));
            await batchWriteToFirestore(`events/${eventId}/divisions/${divId}/rankings`, rankingDocs);
            
            // IF LIVE: Also push to Realtime DB for low latency
            if (mode === 'live') {
              await updateRealtimeDB(`live/${eventId}/${divId}/rankings`, rankingDocs);
            }
          }

          // Finalist Rankings (Skip in live mode to save writes)
          if (mode !== 'live') {
            console.log(`    📊 Fetching finalist rankings...`);
            const finalists = await scrapeEventFinalistRankings(eventId, divId);
            if (finalists.length > 0) {
              await batchWriteToFirestore(`events/${eventId}/divisions/${divId}/finalistRankings`, finalists.map(f => ({
                id: String(f.id || `team_${f.team?.id || f.team}`),
                data: f
              })));
            }
          }

          // Matches (includes scores/results)
          console.log(`    ⚔️  Fetching matches...`);
          const matches = await scrapeEventMatches(eventId, divId);
          if (matches.length > 0) {
            const matchDocs = matches.map(m => ({ id: String(m.id || m.matchnum), data: m }));
            await batchWriteToFirestore(`events/${eventId}/divisions/${divId}/matches`, matchDocs);

            // IF LIVE: Also push to Realtime DB for low latency
            if (mode === 'live') {
              await updateRealtimeDB(`live/${eventId}/${divId}/matches`, matchDocs);
            }
          }
        }

        // 4. Teams & Skills (Full/New mode only)
        if (mode !== 'live') {
          console.log(`  👥 Fetching teams...`);
          const teams = await scrapeEventTeams(eventId);
          if (teams.length > 0) {
            console.log(`  💾 Storing ${teams.length} teams...`);
            await batchWriteToFirestore(`events/${eventId}/teams`, teams.map(t => ({ id: String(t.id || t.number), data: t })));
          }

          console.log(`  🏆 Fetching skills...`);
          const skills = await scrapeEventSkills(eventId);
          if (skills.length > 0) {
            console.log(`  💾 Storing ${skills.length} skills scores...`);
            await batchWriteToFirestore(`events/${eventId}/skills`, skills.map(s => ({
              id: String(s.id || `${s.team?.id}_${s.type}`),
              data: s
            })));
          }
        }

        // Update progress in Firestore
        await updateSyncProgress({
          mode,
          lastProcessedEvent: eventId,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error(`Error processing event ${eventId}:`, error.message);
      }
    }

    console.log(`\n✅ ${mode.toUpperCase()} sync completed successfully!`);
  } catch (error) {
    console.error('❌ Sync failed:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

