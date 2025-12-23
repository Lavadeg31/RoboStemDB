/**
 * Rate limiter utility for RobotEvents API
 * Implements exponential backoff for 429 errors
 */

let currentKeyIndex = 0;
let keyLastUsed = new Map();

export function getNextApiKey(apiKeys) {
  if (apiKeys.length === 0) {
    throw new Error('No API keys available');
  }

  // Rotate through keys
  const key = apiKeys[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
  
  return key;
}

export async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function handleRateLimit(error, retryCount = 0) {
  if (error.response?.status === 429) {
    const maxRetries = 5;
    if (retryCount >= maxRetries) {
      throw new Error(`Rate limit exceeded after ${maxRetries} retries`);
    }

    // Exponential backoff: 2^retryCount seconds
    const delay = Math.pow(2, retryCount) * 1000;
    console.log(`Rate limited. Waiting ${delay}ms before retry ${retryCount + 1}/${maxRetries}`);
    await sleep(delay);
    return true; // Indicates we should retry
  }
  
  return false; // Not a rate limit error
}

export function resetKeyRotation() {
  currentKeyIndex = 0;
  keyLastUsed.clear();
}

