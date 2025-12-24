import { ROBOTEVENTS_API_BASE } from '../config.js';
import { fetchAllPages } from '../utils/pagination.js';
import { apiGet } from '../utils/api-client.js';

/**
 * Scrape matches for a given event and division
 */
export async function scrapeEventMatches(eventId, divisionId) {
  const endpoint = `${ROBOTEVENTS_API_BASE}/events/${eventId}/divisions/${divisionId}/matches`;
  
  const fetchPage = async (params) => {
    return await apiGet(endpoint, params);
  };

  const matches = await fetchAllPages(fetchPage);
  return matches;
}
