import axios from 'axios';
import { ROBOTEVENTS_API_BASE, getApiKeys, getNextApiKey } from '../config.js';
import { handleRateLimit } from '../utils/rate-limiter.js';
import { fetchAllPages } from '../utils/pagination.js';

/**
 * Scrape regular rankings for a given event and division
 */
export async function scrapeEventRankings(eventId, divisionId) {
  const apiKeys = getApiKeys();
  const apiKey = getNextApiKey(apiKeys);
  
  const endpoint = `${ROBOTEVENTS_API_BASE}/events/${eventId}/divisions/${divisionId}/rankings`;
  
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

  const rankings = await fetchAllPages(fetchPage);
  return rankings;
}

