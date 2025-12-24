import { ROBOTEVENTS_API_BASE } from '../config.js';
import { fetchAllPages } from '../utils/pagination.js';
import { apiGet } from '../utils/api-client.js';

/**
 * Scrape events for a given season
 */
export async function scrapeEvents(seasonId) {
  const endpoint = `${ROBOTEVENTS_API_BASE}/seasons/${seasonId}/events`;
  
  const fetchPage = async (params) => {
    return await apiGet(endpoint, params);
  };

  const events = await fetchAllPages(fetchPage);
  return events;
}
