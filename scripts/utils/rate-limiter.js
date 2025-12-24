/**
 * Rate limiter utility for RobotEvents API
 */

let currentKeyIndex = 0;

export function getNextApiKey(apiKeys) {
  if (!apiKeys || apiKeys.length === 0) {
    throw new Error('No API keys available');
  }

  // If index is out of bounds (due to changing list size), reset it
  if (currentKeyIndex >= apiKeys.length) {
    currentKeyIndex = 0;
  }

  // Rotate through keys
  const key = apiKeys[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
  
  return key;
}

export async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function resetKeyRotation() {
  currentKeyIndex = 0;
}
