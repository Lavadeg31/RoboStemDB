import axios from 'axios';
import { initializeFirebase } from './config.js';
import { batchWriteToFirestore } from './utils/firebase-helpers.js';
import dotenv from 'dotenv';

dotenv.config();

const GITHUB_JSON_URL = 'https://raw.githubusercontent.com/Lavadeg31/TeamList/main/lib/data/master_team_list.json';

async function syncMasterTeams() {
  console.log('🚀 Starting Master Team List Sync...');
  
  const token = process.env.TEAMLIST_TOKEN;
  if (!token) {
    console.error('❌ TEAMLIST_TOKEN is missing from environment variables.');
    process.exit(1);
  }

  const { db } = initializeFirebase();

  try {
    console.log('📡 Fetching master team list from GitHub...');
    const response = await axios.get(GITHUB_JSON_URL, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3.raw'
      }
    });

    const teams = response.data;
    if (!Array.isArray(teams)) {
      console.error('❌ Unexpected data format: Expected an array of teams.');
      process.exit(1);
    }

    console.log(`📦 Found ${teams.length} teams in master list.`);

    // Prepare for Firestore: use team number or ID as document ID
    // We'll try to find 'number', 'team_number', or 'id'
    const formattedTeams = teams.map(team => {
      const id = String(team.number || team.team_number || team.id);
      return {
        id: id,
        data: {
          ...team,
          isMasterList: true,
          lastMasterUpdate: new Date().toISOString()
        }
      };
    }).filter(t => t.id && t.id !== 'undefined');

    console.log(`💾 Writing ${formattedTeams.length} teams to master "teams" collection...`);
    
    // We'll use a larger batch size for this one-time/weekly sync
    const totalWritten = await batchWriteToFirestore('teams', formattedTeams);
    
    console.log(`\n✅ Successfully synced ${totalWritten} teams to the master database!`);

  } catch (error) {
    console.error('❌ Sync failed:', error.message);
    if (error.response?.status === 404) {
      console.error('   Hint: Check if the file path or branch name "main" is correct.');
    }
    process.exit(1);
  }
}

syncMasterTeams();

