import axios from 'axios';
import { getApiKeys } from '../config.js';
import { handleRateLimit, getNextApiKey } from './rate-limiter.js';

const blacklistedKeys = new Set();

/**
 * Perform an authenticated GET request to the RobotEvents API.
 * Handles:
 * 1. Automatic 401 (Unauthorized) retry with a different API key.
 * 2. Key blacklisting (stops using a key if it returns 401).
 * 3. Automatic 429 (Rate Limit) retry with exponential backoff.
 */
export async function apiGet(endpoint, params = {}) {
  const apiKeys = getApiKeys();
  let retryCount = 0;
  let authRetryCount = 0;

  while (true) {
    // Filter out blacklisted keys
    const validKeys = apiKeys.filter(k => !blacklistedKeys.has(k));
    
    if (validKeys.length === 0) {
      throw new Error('All provided RobotEvents API keys are failing with 401 Unauthorized.');
    }

    const apiKey = getNextApiKey(validKeys);

    try {
      const response = await axios.get(endpoint, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        },
        params: params,
        timeout: 30000, // 30 second timeout
      });
      return response;
    } catch (error) {
      // Handle 401 Unauthorized
      if (error.response?.status === 401) {
        console.warn(`API Key failed (401). Blacklisting key and trying next...`);
        blacklistedKeys.add(apiKey);
        authRetryCount++;
        
        // If we've tried too many times without success, throw
        if (authRetryCount > apiKeys.length) {
          throw new Error('Failed to find a working API key after checking all available keys.');
        }
        continue;
      }

      // Handle 429 Rate Limit
      const shouldRetry = await handleRateLimit(error, retryCount);
      if (shouldRetry) {
        retryCount++;
        continue;
      }

      // Re-throw other errors
      throw error;
    }
  }
}

