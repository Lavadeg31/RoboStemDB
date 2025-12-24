import axios from 'axios';
import { initializeFirebase } from './config.js';
import { batchWriteToFirestore } from './utils/firebase-helpers.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('🚀 Starting Master Team List Sync...');
  
  const token = process.env.TEAMLIST_TOKEN;
  if (!token) {
    console.error('❌ TEAMLIST_TOKEN is missing from environment variables.');
    process.exit(1);
  }

  initializeFirebase();

  try {
    // GitHub API URL for the raw content of the file
    // We use the 'Accept: application/vnd.github.v3.raw' header to get the actual file content
    const url = 'https://api.github.com/repos/Lavadeg31/TeamList/contents/lib/data/master_team_list.json';
    
    console.log(`📡 Fetching master team list from GitHub...`);
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3.raw'
      }
    });

    const data = response.data;
    if (!data.teams || !Array.isArray(data.teams)) {
      throw new Error('Invalid JSON format: "teams" array not found.');
    }

    console.log(`📦 Found ${data.teams.length} teams in master list.`);

    // Map teams to the format expected by batchWriteToFirestore
    const teamDocs = data.teams.map(team => ({
      id: String(team.id), // Use the unique numeric RobotEvents ID as the document ID
      data: team
    }));

    // Store in a top-level 'master_teams' collection to distinguish from event-specific teams
    console.log(`💾 Writing teams to Firestore...`);
    await batchWriteToFirestore('master_teams', teamDocs);

    // Also store metadata
    if (data.metadata) {
      console.log(`📝 Storing master list metadata...`);
      await batchWriteToFirestore('metadata', [{
        id: 'master_team_list',
        data: data.metadata
      }]);
    }

    console.log('✅ Master Team List sync completed successfully!');
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data:`, error.response.data);
    }
    process.exit(1);
  }
}

main();

