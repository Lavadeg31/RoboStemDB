import { ROBOTEVENTS_API_BASE } from '../config.js';
import { fetchAllPages } from '../utils/pagination.js';
import { apiGet } from '../utils/api-client.js';

/**
 * Scrape finalist rankings for a given event and division
 */
export async function scrapeEventFinalistRankings(eventId, divisionId) {
  const endpoint = `${ROBOTEVENTS_API_BASE}/events/${eventId}/divisions/${divisionId}/finalistRankings`;
  
  const fetchPage = async (params) => {
    return await apiGet(endpoint, params);
  };

  const rankings = await fetchAllPages(fetchPage);
  return rankings;
}
