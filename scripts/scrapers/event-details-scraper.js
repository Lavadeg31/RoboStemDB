import axios from 'axios';
import { ROBOTEVENTS_API_BASE, getApiKeys, getNextApiKey } from '../config.js';
import { handleRateLimit } from '../utils/rate-limiter.js';

/**
 * Scrape event details including divisions
 */
export async function scrapeEventDetails(eventId) {
  const apiKeys = getApiKeys();
  const apiKey = getNextApiKey(apiKeys);
  
  const endpoint = `${ROBOTEVENTS_API_BASE}/events/${eventId}`;
  
  let retryCount = 0;
  while (true) {
    try {
      const response = await axios.get(endpoint, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        },
      });
      return response.data;
    } catch (error) {
      const shouldRetry = await handleRateLimit(error, retryCount);
      if (shouldRetry) {
        retryCount++;
        continue;
      }
      throw error;
    }
  }
}

/**
 * Extract divisions from event details
 */
export function extractDivisions(eventDetails) {
  if (!eventDetails || !eventDetails.divisions) {
    return [];
  }
  
  return eventDetails.divisions.map(div => ({
    id: div.id,
    name: div.name,
    order: div.order,
  }));
}

