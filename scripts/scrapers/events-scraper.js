import axios from 'axios';
import { ROBOTEVENTS_API_BASE, getApiKeys } from '../config.js';
import { handleRateLimit, sleep, getNextApiKey } from '../utils/rate-limiter.js';
import { fetchAllPages } from '../utils/pagination.js';

/**
 * Scrape events for a given season
 */
export async function scrapeEvents(seasonId) {
  const apiKeys = getApiKeys();
  const endpoint = `${ROBOTEVENTS_API_BASE}/seasons/${seasonId}/events`;
  
  const fetchPage = async (params) => {
    let retryCount = 0;
    while (true) {
      const apiKey = getNextApiKey(apiKeys);
      try {
        const response = await axios.get(endpoint, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json',
          },
          params: params,
        });
        return response;
      } catch (error) {
        // If unauthorized, try the next key immediately
        if (error.response?.status === 401 && apiKeys.length > 1) {
          console.warn(`API Key failed (401). Trying next key...`);
          continue; 
        }

        const shouldRetry = await handleRateLimit(error, retryCount);
        if (shouldRetry) {
          retryCount++;
          continue;
        }
        throw error;
      }
    }
  };

  const events = await fetchAllPages(fetchPage);
  return events;
}

