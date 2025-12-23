import axios from 'axios';
import { ROBOTEVENTS_API_BASE, getApiKeys } from '../config.js';
import { handleRateLimit, sleep, getNextApiKey } from '../utils/rate-limiter.js';
import { fetchAllPages } from '../utils/pagination.js';

/**
 * Scrape events for a given season
 */
export async function scrapeEvents(seasonId) {
  const apiKeys = getApiKeys();
  const apiKey = getNextApiKey(apiKeys);
  
  const endpoint = `${ROBOTEVENTS_API_BASE}/seasons/${seasonId}/events`;
  
  const fetchPage = async (params) => {
    let retryCount = 0;
    while (true) {
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

