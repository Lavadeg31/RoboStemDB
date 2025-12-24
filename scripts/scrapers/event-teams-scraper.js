import { ROBOTEVENTS_API_BASE } from '../config.js';
import { fetchAllPages } from '../utils/pagination.js';
import { apiGet } from '../utils/api-client.js';

/**
 * Scrape teams for a given event
 */
export async function scrapeEventTeams(eventId) {
  const endpoint = `${ROBOTEVENTS_API_BASE}/events/${eventId}/teams`;
  
  const fetchPage = async (params) => {
    return await apiGet(endpoint, params);
  };

  const teams = await fetchAllPages(fetchPage);
  return teams;
}
