import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Firebase Admin SDK
let db;
let rtdb;

export function initializeFirebase() {
  if (admin.apps.length === 0) {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID || 'robostemdb',
        privateKey: privateKey,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
      databaseURL: `https://${process.env.FIREBASE_PROJECT_ID || 'robostemdb'}-default-rtdb.firebaseio.com`,
    });
  }

  db = admin.firestore();
  rtdb = admin.database();
  
  return { db, rtdb };
}

export function getFirestore() {
  if (!db) {
    initializeFirebase();
  }
  return db;
}

export function getRealtimeDB() {
  if (!rtdb) {
    initializeFirebase();
  }
  return rtdb;
}

// RobotEvents API Configuration
export function getApiKeys() {
  const keys = process.env.ROBOTEVENTS_API_KEYS || '';
  return keys.split(',').map(k => k.trim()).filter(k => k.length > 0);
}

export function getTargetSeasonId() {
  return process.env.TARGET_SEASON_ID ? parseInt(process.env.TARGET_SEASON_ID) : null;
}

// RobotEvents API Base URL
export const ROBOTEVENTS_API_BASE = 'https://www.robotevents.com/api/v2';

