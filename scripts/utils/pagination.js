/**
 * Pagination handler for RobotEvents API
 * RobotEvents API uses pagination with per_page and page parameters
 */

export async function fetchAllPages(fetchFunction, initialParams = {}) {
  const allData = [];
  let page = 1;
  let hasMore = true;
  const perPage = 250; // Maximum per page for RobotEvents API

  while (hasMore) {
    try {
      const params = {
        ...initialParams,
        per_page: perPage,
        page: page,
      };

      const response = await fetchFunction(params);
      const data = response.data || response;
      
      if (Array.isArray(data)) {
        allData.push(...data);
        // If we got fewer items than per_page, we've reached the end
        hasMore = data.length === perPage;
      } else if (data.data && Array.isArray(data.data)) {
        allData.push(...data.data);
        hasMore = data.data.length === perPage;
      } else {
        // Single object or unexpected format
        allData.push(data);
        hasMore = false;
      }

      page++;
      
      // Safety check to prevent infinite loops
      if (page > 1000) {
        console.warn('Reached maximum page limit (1000), stopping pagination');
        break;
      }
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error.message);
      throw error;
    }
  }

  return allData;
}

