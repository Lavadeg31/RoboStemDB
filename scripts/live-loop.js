import { execSync } from 'child_process';

const LOOP_DURATION_MINS = 55; // Run for 55 minutes then stop (to let the next GH Action take over)
const INTERVAL_MS = 120000; // 2 minutes

async function runLoop() {
  const startTime = Date.now();
  const endTime = startTime + (LOOP_DURATION_MINS * 60 * 1000);

  console.log(`🚀 Starting Live Sync Loop for ${LOOP_DURATION_MINS} minutes...`);

  while (Date.now() < endTime) {
    const cycleStart = Date.now();
    
    try {
      console.log(`\n--- Cycle Start: ${new Date().toISOString()} ---`);
      // Execute the sync script with the --live flag
      execSync('node scripts/sync.js --live', { stdio: 'inherit' });
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

runLoop();



