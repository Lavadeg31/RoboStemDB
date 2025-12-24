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
      
      // SKIP LOGIC:
      // 1. Check if event is in the past (ended more than 24 hours ago)
      // 2. Check if event already exists in Firestore
      const eventEndDate = event.end ? new Date(event.end) : null;
      const isPastEvent = eventEndDate && (now.getTime() - eventEndDate.getTime() > 24 * 60 * 60 * 1000);

      if (isPastEvent) {
        const doc = await db.collection('events').doc(eventId).get();
        if (doc.exists) {
          console.log(`[${i + 1}/${events.length}] Skipping past event ${eventId} (already in DB)`);
          continue;
        }
      }

      console.log(`\n[${i + 1}/${events.length}] Processing event ${eventId}: ${event.name || 'Unknown'}`);

      try {
        // 1. Store event metadata
        await batchWriteToFirestore('events', [{ id: eventId, data: event }]);

        // 2. Fetch details to get divisions
        const eventDetails = await scrapeEventDetails(eventId);
        const divisions = extractDivisions(eventDetails);

        if (divisions.length > 0) {
          await batchWriteToFirestore(`events/${eventId}/divisions`, divisions.map(d => ({ id: String(d.id), data: d })));
        }

        // 3. Process each division (Rankings & Matches)
        for (const division of divisions) {
          const divId = division.id;
          
          // Rankings
          const rankings = await scrapeEventRankings(eventId, divId);
          if (rankings.length > 0) {
            await batchWriteToFirestore(`events/${eventId}/divisions/${divId}/rankings`, rankings.map(r => ({
              id: String(r.rank || `team_${r.team?.id}`),
              data: r
            })));
          }

          // Finalist Rankings
          const finalists = await scrapeEventFinalistRankings(eventId, divId);
          if (finalists.length > 0) {
            await batchWriteToFirestore(`events/${eventId}/divisions/${divId}/finalistRankings`, finalists.map(f => ({
              id: String(f.rank || `team_${f.team?.id}`),
              data: f
            })));
          }

          // Matches (includes scores/results)
          const matches = await scrapeEventMatches(eventId, divId);
          if (matches.length > 0) {
            await batchWriteToFirestore(`events/${eventId}/divisions/${divId}/matches`, matches.map(m => ({
              id: String(m.id || m.matchnum),
              data: m
            })));
          }
        }

        // 4. Teams at event
        const teams = await scrapeEventTeams(eventId);
        if (teams.length > 0) {
          await batchWriteToFirestore(`events/${eventId}/teams`, teams.map(t => ({ id: String(t.id || t.number), data: t })));
        }

        // 5. Skills results
        const skills = await scrapeEventSkills(eventId);
        if (skills.length > 0) {
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

