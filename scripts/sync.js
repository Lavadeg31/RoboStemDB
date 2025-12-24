import { initializeFirebase, getTargetSeasonId, getApiKeys, getFirestore } from './config.js';
import { scrapeEvents } from './scrapers/events-scraper.js';
import { scrapeEventDetails, extractDivisions } from './scrapers/event-details-scraper.js';
import { scrapeEventTeams } from './scrapers/event-teams-scraper.js';
import { scrapeEventMatches } from './scrapers/event-matches-scraper.js';
import { scrapeEventRankings } from './scrapers/event-rankings-scraper.js';
import { scrapeEventFinalistRankings } from './scrapers/event-finalist-rankings-scraper.js';
import { scrapeEventSkills } from './scrapers/event-skills-scraper.js';
import { batchWriteToFirestore, updateSyncProgress, getSyncProgress } from './utils/firebase-helpers.js';
import { sleep } from './utils/rate-limiter.js';

/**
 * Main sync orchestrator
 */
async function main() {
  console.log('Starting RobotEvents Firebase Sync...');
  
  // Initialize Firebase
  const { db } = initializeFirebase();
  console.log('Firebase initialized');

  // Test Database Connection immediately
  try {
    console.log(`🔍 Testing database connection (Project: ${process.env.FIREBASE_PROJECT_ID || 'robostemdb'})...`);
    
    // Create a timeout for the heartbeat check
    const heartbeatTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Heartbeat write timed out after 20s')), 20000)
    );

    const heartbeatWrite = db.collection('sync').doc('heartbeat').set({ 
      lastCheck: new Date().toISOString() 
    }, { merge: true });

    await Promise.race([heartbeatWrite, heartbeatTimeout]);
    console.log('✅ Database connection successful');
  } catch (e) {
    console.error('❌ Database connection failed:', e.message);
    console.log('💡 Troubleshooting: Check if FIREBASE_PROJECT_ID is correct and Firestore is enabled in the console.');
    process.exit(1);
  }

  const targetSeasonId = getTargetSeasonId();
  if (!targetSeasonId) {
    console.error('TARGET_SEASON_ID not set. Please set it in environment variables.');
    process.exit(1);
  }

  console.log(`Target season ID: ${targetSeasonId}`);

  try {
    // Fetch all events for the season
    console.log(`Fetching events for season ${targetSeasonId}...`);
    const events = await scrapeEvents(targetSeasonId);
    console.log(`Found ${events.length} events`);

    const now = new Date();

    // Process each event
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const eventId = String(event.id || event.sku);
      
      console.log(`\n[${i + 1}/${events.length}] Checking event ${eventId}: ${event.name || 'Unknown'}`);

      // SKIP LOGIC:
      const eventEndDate = event.end ? new Date(event.end) : null;
      const isPastEvent = eventEndDate && (now.getTime() - eventEndDate.getTime() > 24 * 60 * 60 * 1000);

      if (isPastEvent) {
        try {
          console.log(`  🔍 Checking if event ${eventId} already exists...`);
          const doc = await db.collection('events').doc(eventId).get();
          if (doc.exists) {
            console.log(`  🔍 Checking teamwork rankings for ${eventId}...`);
            const finCheck = await db.collection(`events/${eventId}/divisions/1/finalistRankings`).limit(1).get();
            const firstFin = finCheck.docs[0];
            
            if (firstFin && !firstFin.id.startsWith('team_')) {
              console.log(`  ♻️  Re-syncing event ${eventId} to fix incomplete teamwork rankings...`);
            } else {
              process.stdout.write('.'); 
              if ((i + 1) % 50 === 0) console.log(` [${i + 1}/${events.length}]`); 
              continue;
            }
          }
        } catch (e) {
          console.warn(`  ⚠️ Skip check failed for ${eventId}: ${e.message}`);
        }
      }

      console.log(`  🚀 Starting full sync for event ${eventId}...`);

      try {
        // 1. Store event metadata
        console.log(`  📝 Storing metadata...`);
        await batchWriteToFirestore('events', [{ id: eventId, data: event }]);

        // 2. Fetch details to get divisions
        console.log(`  🔍 Fetching event details...`);
        const eventDetails = await scrapeEventDetails(eventId);
        const divisions = extractDivisions(eventDetails);

        if (divisions.length > 0) {
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
            console.log(`    💾 Storing ${rankings.length} rankings...`);
            await batchWriteToFirestore(`events/${eventId}/divisions/${divId}/rankings`, rankings.map(r => ({
              // Use official ID or team ID to ensure both teams in an alliance are saved
              id: String(r.id || `team_${r.team?.id || r.team}`),
              data: r
            })));
          }

          // Finalist Rankings
          console.log(`    📊 Fetching finalist rankings...`);
          const finalists = await scrapeEventFinalistRankings(eventId, divId);
          if (finalists.length > 0) {
            console.log(`    💾 Storing ${finalists.length} finalist rankings...`);
            await batchWriteToFirestore(`events/${eventId}/divisions/${divId}/finalistRankings`, finalists.map(f => ({
              // Use official ID or team ID to ensure both teams in an alliance are saved
              id: String(f.id || `team_${f.team?.id || f.team}`),
              data: f
            })));
          }

          // Matches (includes scores/results)
          console.log(`    ⚔️  Fetching matches...`);
          const matches = await scrapeEventMatches(eventId, divId);
          if (matches.length > 0) {
            console.log(`    💾 Storing ${matches.length} matches...`);
            await batchWriteToFirestore(`events/${eventId}/divisions/${divId}/matches`, matches.map(m => ({
              id: String(m.id || m.matchnum),
              data: m
            })));
          }
        }

        // 4. Teams at event
        console.log(`  👥 Fetching teams...`);
        const teams = await scrapeEventTeams(eventId);
        if (teams.length > 0) {
          console.log(`  💾 Storing ${teams.length} teams...`);
          await batchWriteToFirestore(`events/${eventId}/teams`, teams.map(t => ({ id: String(t.id || t.number), data: t })));
        }

        // 5. Skills results
        console.log(`  🏆 Fetching skills...`);
        const skills = await scrapeEventSkills(eventId);
        if (skills.length > 0) {
          console.log(`  💾 Storing ${skills.length} skills scores...`);
          await batchWriteToFirestore(`events/${eventId}/skills`, skills.map(s => ({
            id: String(s.id || `${s.team?.id}_${s.type}`),
            data: s
          })));
        }

        // Update progress in Firestore
        await updateSyncProgress({
          currentSeason: targetSeasonId,
          eventsProcessed: i + 1,
          totalEvents: events.length,
          lastProcessedEvent: eventId
        });

      } catch (error) {
        console.error(`Error processing event ${eventId}:`, error.message);
      }
    }

    console.log('\n✅ Sync completed successfully!');
  } catch (error) {
    console.error('❌ Sync failed:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

