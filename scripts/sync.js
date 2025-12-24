import { initializeFirebase, getTargetSeasonId, getApiKeys } from './config.js';
import { scrapeEvents } from './scrapers/events-scraper.js';
import { scrapeEventDetails, extractDivisions } from './scrapers/event-details-scraper.js';
import { scrapeEventTeams } from './scrapers/event-teams-scraper.js';
import { scrapeEventMatches } from './scrapers/event-matches-scraper.js';
import { scrapeEventRankings } from './scrapers/event-rankings-scraper.js';
import { scrapeEventFinalistRankings } from './scrapers/event-finalist-rankings-scraper.js';
import { scrapeEventSkills } from './scrapers/event-skills-scraper.js';
import { batchWriteToFirestore, writeToRealtimeDB, updateSyncProgress, getSyncProgress } from './utils/firebase-helpers.js';
import { sleep } from './utils/rate-limiter.js';

/**
 * Main sync orchestrator
 */
async function main() {
  console.log('Starting RobotEvents Firebase Sync...');
  
  // Initialize Firebase
  const { db, rtdb } = initializeFirebase();
  console.log('Firebase initialized');

  // Check for existing progress
  const progress = await getSyncProgress();
  const targetSeasonId = getTargetSeasonId();
  
  if (!targetSeasonId) {
    console.error('TARGET_SEASON_ID not set. Please set it in environment variables.');
    process.exit(1);
  }

  console.log(`Target season ID: ${targetSeasonId}`);

  try {
    // Fetch events for the season
    console.log(`Fetching events for season ${targetSeasonId}...`);
    const events = await scrapeEvents(targetSeasonId);
    console.log(`Found ${events.length} events`);

    // Update progress
    await updateSyncProgress({
      currentSeason: targetSeasonId,
      totalEvents: events.length,
      eventsProcessed: 0,
      startTime: new Date().toISOString(),
    });

    // Process each event
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const eventId = event.id || event.sku;
      
      console.log(`\n[${i + 1}/${events.length}] Processing event ${eventId}: ${event.name || 'Unknown'}`);

      try {
        // Store event in Firestore
        await batchWriteToFirestore('events', [{
          id: String(eventId),
          data: event,
        }]);

        // Store season-event reference
        await batchWriteToFirestore(`seasons/${targetSeasonId}/events`, [{
          id: String(eventId),
          data: {
            eventId: String(eventId),
            seasonId: targetSeasonId,
          },
        }]);

        // Fetch event details (includes divisions)
        const eventDetails = await scrapeEventDetails(eventId);
        const divisions = extractDivisions(eventDetails);

        // Store divisions
        if (divisions.length > 0) {
          const divisionDocs = divisions.map(div => ({
            id: String(div.id),
            data: div,
          }));
          await batchWriteToFirestore(`events/${eventId}/divisions`, divisionDocs);
        }

        // Process each division
        for (const division of divisions) {
          const divisionId = division.id;
          console.log(`  Processing division ${divisionId}: ${division.name}`);

          try {
            // Fetch and store rankings
            const rankings = await scrapeEventRankings(eventId, divisionId);
            if (rankings.length > 0) {
              const rankingDocs = rankings.map(rank => ({
                id: String(rank.rank || rank.id || `rank_${rank.team?.id || rank.team}`),
                data: rank,
              }));
              await batchWriteToFirestore(`events/${eventId}/divisions/${divisionId}/rankings`, rankingDocs);
              
              // Also store in Realtime DB for quick access
              await writeToRealtimeDB(`events/${eventId}/divisions/${divisionId}/rankings`, {
                data: rankings,
              });
            }

            // Fetch and store finalist rankings
            const finalistRankings = await scrapeEventFinalistRankings(eventId, divisionId);
            if (finalistRankings.length > 0) {
              const finalistDocs = finalistRankings.map(rank => ({
                id: String(rank.rank || rank.id || `rank_${rank.team?.id || rank.team}`),
                data: rank,
              }));
              await batchWriteToFirestore(`events/${eventId}/divisions/${divisionId}/finalistRankings`, finalistDocs);
            }

            // Fetch and store matches
            const matches = await scrapeEventMatches(eventId, divisionId);
            if (matches.length > 0) {
              const matchDocs = matches.map(match => ({
                id: String(match.id || match.matchnum || `match_${match.round}_${match.instance}`),
                data: match,
              }));
              await batchWriteToFirestore(`events/${eventId}/divisions/${divisionId}/matches`, matchDocs);
              
              // Also store in Realtime DB for quick access
              await writeToRealtimeDB(`events/${eventId}/divisions/${divisionId}/matches`, {
                data: matches,
              });
            }
          } catch (error) {
            console.error(`  Error processing division ${divisionId}:`, error.message);
            // Continue with next division
          }
        }

        // Fetch and store event teams
        const teams = await scrapeEventTeams(eventId);
        if (teams.length > 0) {
          const teamDocs = teams.map(team => ({
            id: String(team.id || team.number),
            data: team,
          }));
          await batchWriteToFirestore(`events/${eventId}/teams`, teamDocs);
        }

        // Fetch and store event skills
        const skills = await scrapeEventSkills(eventId);
        if (skills.length > 0) {
          const skillDocs = skills.map(skill => ({
            id: String(skill.id || `${skill.team?.id || skill.team}_${skill.type}`),
            data: skill,
          }));
          await batchWriteToFirestore(`events/${eventId}/skills`, skillDocs);
          
          // Also store in Realtime DB
          await writeToRealtimeDB(`events/${eventId}/skills`, {
            data: skills,
          });
        }

        // Update progress
        await updateSyncProgress({
          currentSeason: targetSeasonId,
          totalEvents: events.length,
          eventsProcessed: i + 1,
          currentEvent: eventId,
        });

      } catch (error) {
        console.error(`Error processing event ${eventId}:`, error.message);
        // Continue with next event
      }
    }

    // Final progress update
    await updateSyncProgress({
      currentSeason: targetSeasonId,
      totalEvents: events.length,
      eventsProcessed: events.length,
      completed: true,
      endTime: new Date().toISOString(),
    });

    console.log('\n✅ Sync completed successfully!');
  } catch (error) {
    console.error('❌ Sync failed:', error);
    await updateSyncProgress({
      error: error.message,
      errorTime: new Date().toISOString(),
    });
    process.exit(1);
  }
}

// Run the sync
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

