import { scrapeEvents } from './events-scraper.js';

/**
 * Scrape all events for a season
 * This is a wrapper around events-scraper for consistency
 */
export async function scrapeSeasonEvents(seasonId) {
  return await scrapeEvents(seasonId);
}

