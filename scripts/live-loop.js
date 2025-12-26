import { sync } from './sync.js';

const LOOP_DURATION_MINS = 55; // Run for 55 minutes then stop (to let the next GH Action take over)
const INTERVAL_MS = 120000; // 2 minutes

async function runLoop() {
  const startTime = Date.now();
  const endTime = startTime + (LOOP_DURATION_MINS * 60 * 1000);
  
  // This cache stays in memory for the full 55 minutes.
  // It prevents the script from pushing data to RTDB unless it actually changed.
  const sessionCache = {};

  console.log(`🚀 Starting Live Sync Loop for ${LOOP_DURATION_MINS} minutes...`);

  while (Date.now() < endTime) {
    const cycleStart = Date.now();
    
    try {
      console.log(`\n--- Cycle Start: ${new Date().toISOString()} ---`);
      
      // Call the sync function directly with our cache
      await sync({
        mode: 'live',
        cache: sessionCache
      });
      
      console.log(`--- Cycle Complete ---`);
    } catch (error) {
      console.error('❌ Cycle failed:', error.message);
    }

    const elapsed = Date.now() - cycleStart;
    const waitTime = Math.max(1000, INTERVAL_MS - elapsed);
    
    if (Date.now() + waitTime < endTime) {
      console.log(`Waiting ${Math.round(waitTime / 1000)}s for next cycle...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  console.log('🏁 Loop duration reached. Exiting gracefully.');
  process.exit(0);
}

runLoop().catch(err => {
  console.error('Fatal loop error:', err);
  process.exit(1);
});
