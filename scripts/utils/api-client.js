import axios from 'axios';
import { getApiKeys } from '../config.js';
import { getNextApiKey, sleep } from './rate-limiter.js';

const blacklistedKeys = new Set();
const rateLimitedKeys = new Map(); // key -> cooldown expiration time

/**
 * Perform an authenticated GET request to the RobotEvents API.
 * Handles:
 * 1. Automatic 401 (Unauthorized) retry with a different API key.
 * 2. Key blacklisting (stops using a key if it returns 401).
 * 3. Automatic 429 (Rate Limit) rotation to a different API key.
 * 4. Exponential backoff if ALL keys are rate limited.
 */
export async function apiGet(endpoint, params = {}) {
  const allApiKeys = getApiKeys();
  let retryCount = 0; // Number of times we've had to wait because NO keys were available
  let authRetryCount = 0;

  while (true) {
    const now = Date.now();
    
    // Filter out blacklisted keys and currently cooling-down rate-limited keys
    const availableKeys = allApiKeys.filter(k => {
      if (blacklistedKeys.has(k)) return false;
      const cooldown = rateLimitedKeys.get(k);
      if (cooldown && now < cooldown) return false;
      return true;
    });
    
    // If NO keys are available (all dead or all cooling down), wait a bit
    if (availableKeys.length === 0) {
      // Find the key that will expire soonest to wait just long enough
      const cooldowns = allApiKeys
        .map(k => rateLimitedKeys.get(k))
        .filter(c => c && c > now);
      
      const nextAvailableAt = cooldowns.length > 0 ? Math.min(...cooldowns) : now + 5000;
      const waitTime = Math.max(1000, Math.min(nextAvailableAt - now, 30000)); // Wait between 1s and 30s
      
      console.log(`⚠️ All API keys are cooling down. Waiting ${Math.round(waitTime/1000)}s...`);
      await sleep(waitTime);
      continue;
    }

    const apiKey = getNextApiKey(availableKeys);

    try {
      const response = await axios.get(endpoint, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        },
        params: params,
        timeout: 30000, 
      });
      
      // Success! Add a 500ms delay (gentle but efficient)
      await sleep(500);
      
      // Success! Reset retry count for this endpoint call
      retryCount = 0;
      return response;
    } catch (error) {
      // Handle 401 Unauthorized
      if (error.response?.status === 401) {
        console.warn(`❌ API Key failed (401). Blacklisting key...`);
        blacklistedKeys.add(apiKey);
        authRetryCount++;
        if (authRetryCount > allApiKeys.length) {
          throw new Error('All provided RobotEvents API keys are failing with 401 Unauthorized.');
        }
        continue;
      }

      // Handle 429 Rate Limit
      if (error.response?.status === 429) {
        // Put THIS specific key on a 60-second cooldown
        console.warn(`⏳ API Key rate limited (429). Rotating to another key...`);
        rateLimitedKeys.set(apiKey, now + 60000); // Fixed 60s cooldown for the specific key
        
        // If we have very few keys, don't spin too fast
        if (availableKeys.length <= 1) {
            await sleep(2000); 
        }
        continue; 
      }

      // Re-throw other errors
      throw error;
    }
  }
}
