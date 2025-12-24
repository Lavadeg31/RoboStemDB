import { ROBOTEVENTS_API_BASE } from '../config.js';
import { fetchAllPages } from '../utils/pagination.js';
import { apiGet } from '../utils/api-client.js';

/**
 * Scrape skills results for a given event
 */
export async function scrapeEventSkills(eventId) {
  const endpoint = `${ROBOTEVENTS_API_BASE}/events/${eventId}/skills`;
  
  const fetchPage = async (params) => {
    return await apiGet(endpoint, params);
  };

  const skills = await fetchAllPages(fetchPage);
  return skills;
}
