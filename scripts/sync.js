import { initializeFirebase, getTargetSeasonId, getFirestore } from './config.js';
import { scrapeEvents } from './scrapers/events-scraper.js';
import { scrapeEventDetails, extractDivisions } from './scrapers/event-details-scraper.js';
import { scrapeEventTeams } from './scrapers/event-teams-scraper.js';
import { scrapeEventMatches } from './scrapers/event-matches-scraper.js';
import { scrapeEventRankings } from './scrapers/event-rankings-scraper.js';
import { scrapeEventFinalistRankings } from './scrapers/event-finalist-rankings-scraper.js';
import { scrapeEventSkills } from './scrapers/event-skills-scraper.js';
import { batchWriteToFirestore, updateRealtimeDB, updateSyncProgress } from './utils/firebase-helpers.js';

// Deep comparison helper for the in-memory cache
function isDataEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Main sync function
 * @param {Object} options - mode and cache
 */
export async function sync(options = {}) {
  const mode = options.mode || (process.argv.includes('--live') ? 'live' : process.argv.includes('--new') ? 'new' : 'full');
  const cache = options.cache || {}; // In-memory cache to prevent redundant writes

  console.log(`Starting RobotEvents Firebase Sync [MODE: ${mode.toUpperCase()}]...`);
  
  const { db } = initializeFirebase();
  const targetSeasonId = getTargetSeasonId();
  if (!targetSeasonId) throw new Error('TARGET_SEASON_ID not set');

  try {
    console.log(`Fetching events for season ${targetSeasonId}...`);
    let events = await scrapeEvents(targetSeasonId);
    
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    if (mode === 'live') {
      events = events.filter(event => {
        const start = event.start ? new Date(event.start).toISOString().split('T')[0] : '';
        const end = event.end ? new Date(event.end).toISOString().split('T')[0] : '';
        return todayStr >= start && todayStr <= end;
      });
      console.log(`📍 Found ${events.length} events happening today.`);
    }

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const eventId = String(event.id || event.sku);
      
      console.log(`\n[${i + 1}/${events.length}] Checking event ${eventId}: ${event.name}`);

      // Skip logic for past events in non-live modes
      if (mode !== 'live') {
        const doc = await db.collection('events').doc(eventId).get();
        if (doc.exists) {
          if (mode === 'new') continue;
          const eventEndDate = event.end ? new Date(event.end) : null;
          if (eventEndDate && (now.getTime() - eventEndDate.getTime() > 24 * 60 * 60 * 1000)) {
            const matchCheck = await db.collection(`events/${eventId}/divisions/1/matches`).limit(1).get();
            if (!matchCheck.empty) continue;
          }
        }
      }

      try {
        if (mode === 'full' || mode === 'new') {
          await batchWriteToFirestore('events', [{ id: eventId, data: event }]);
        }

        const eventDetails = await scrapeEventDetails(eventId);
        const divisions = extractDivisions(eventDetails);

        if (divisions.length > 0 && mode !== 'live') {
          await batchWriteToFirestore(`events/${eventId}/divisions`, divisions.map(d => ({ id: String(d.id), data: d })));
        }

        for (const division of divisions) {
          const divId = division.id;
          
          // Rankings
          const rankings = await scrapeEventRankings(eventId, divId);
          if (rankings.length > 0) {
            const rankingDocs = rankings.map(r => ({ id: String(r.id || `team_${r.team?.id || r.team}`), data: r }));
            
            if (mode !== 'live') {
              await batchWriteToFirestore(`events/${eventId}/divisions/${divId}/rankings`, rankingDocs);
            }
            
            if (mode === 'live') {
              const cacheKey = `rankings_${eventId}_${divId}`;
              if (!isDataEqual(cache[cacheKey], rankingDocs)) {
                await updateRealtimeDB(`live/${eventId}/${divId}/rankings`, rankingDocs);
                cache[cacheKey] = JSON.parse(JSON.stringify(rankingDocs));
              } else {
                console.log(`    📊 Rankings unchanged (cached)`);
              }
            }
          }

          // Matches
          const matches = await scrapeEventMatches(eventId, divId);
          if (matches.length > 0) {
            const matchDocs = matches.map(m => ({ id: String(m.id || m.matchnum), data: m }));
            
            if (mode !== 'live') {
              await batchWriteToFirestore(`events/${eventId}/divisions/${divId}/matches`, matchDocs);
            }

            if (mode === 'live') {
              const cacheKey = `matches_${eventId}_${divId}`;
              if (!isDataEqual(cache[cacheKey], matchDocs)) {
                await updateRealtimeDB(`live/${eventId}/${divId}/matches`, matchDocs);
                cache[cacheKey] = JSON.parse(JSON.stringify(matchDocs));
              } else {
                console.log(`    ⚔️  Matches unchanged (cached)`);
              }
            }
          }
        }

        if (mode !== 'live') {
          const teams = await scrapeEventTeams(eventId);
          if (teams.length > 0) await batchWriteToFirestore(`events/${eventId}/teams`, teams.map(t => ({ id: String(t.id || t.number), data: t })));
          const skills = await scrapeEventSkills(eventId);
          if (skills.length > 0) await batchWriteToFirestore(`events/${eventId}/skills`, skills.map(s => ({ id: String(s.id || `${s.team?.id}_${s.type}`), data: s })));
        }

        await updateSyncProgress({ mode, lastProcessedEvent: eventId, timestamp: new Date().toISOString() });
      } catch (error) {
        console.error(`Error processing event ${eventId}:`, error.message);
      }
    }

    console.log(`\n✅ ${mode.toUpperCase()} sync completed successfully!`);
  } catch (error) {
    console.error('❌ Sync failed:', error);
    throw error;
  }
}

// Run if called directly
if (process.argv[1].endsWith('sync.js')) {
  sync().catch(() => process.exit(1));
}
