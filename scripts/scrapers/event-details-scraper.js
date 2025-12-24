import { ROBOTEVENTS_API_BASE } from '../config.js';
import { apiGet } from '../utils/api-client.js';

/**
 * Scrape event details including divisions
 */
export async function scrapeEventDetails(eventId) {
  const endpoint = `${ROBOTEVENTS_API_BASE}/events/${eventId}`;
  const response = await apiGet(endpoint);
  return response.data;
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
