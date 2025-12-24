import axios from 'axios';
import { getApiKeys } from '../config.js';
import { handleRateLimit, getNextApiKey, sleep } from './rate-limiter.js';

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
  let retryCount = 0;
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
      const waitTime = 5000;
      console.log(`All API keys are either invalid or rate-limited. Waiting ${waitTime/1000}s...`);
      await sleep(waitTime);
      retryCount++;
      if (retryCount > 10) throw new Error('RobotEvents API sync stopped: All keys are persistently rate-limited or invalid.');
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
      return response;
    } catch (error) {
      // Handle 401 Unauthorized
      if (error.response?.status === 401) {
        console.warn(`API Key failed (401). Blacklisting key and trying next...`);
        blacklistedKeys.add(apiKey);
        authRetryCount++;
        if (authRetryCount > allApiKeys.length) {
          throw new Error('Failed to find a working API key after checking all available keys.');
        }
        continue;
      }

      // Handle 429 Rate Limit
      if (error.response?.status === 429) {
        const cooldownTime = Math.pow(2, retryCount) * 2000; // 2s, 4s, 8s...
        console.warn(`API Key rate limited (429). Putting key on ${cooldownTime/1000}s cooldown and rotating...`);
        rateLimitedKeys.set(apiKey, now + cooldownTime);
        retryCount++;
        continue; // Try again immediately with a different key
      }

      // Re-throw other errors
      throw error;
    }
  }
}
