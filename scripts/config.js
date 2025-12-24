import admin from 'firebase-admin';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getDatabase as getAdminDatabase } from 'firebase-admin/database';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Firebase Admin SDK
let db;
let rtdb;

export function initializeFirebase() {
  if (admin.apps.length === 0) {
    const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const projectId = process.env.FIREBASE_PROJECT_ID || 'robostemdb';

    if (!rawPrivateKey || !clientEmail) {
      console.error('Missing Firebase credentials!');
      if (!rawPrivateKey) console.error('- FIREBASE_PRIVATE_KEY is missing');
      if (!clientEmail) console.error('- FIREBASE_CLIENT_EMAIL is missing');
      throw new Error('Firebase credentials (private key or client email) are missing from environment variables.');
    }

    const privateKey = rawPrivateKey.replace(/\\n/g, '\n');
    
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: projectId,
        privateKey: privateKey,
        clientEmail: clientEmail,
      }),
      databaseURL: `https://${projectId}-default-rtdb.firebaseio.com`,
    });
  }

  // In firebase-admin v12, we use getFirestore and getDatabase
  // We explicitly target the 'default' database ID
  db = getAdminFirestore('default');
  rtdb = getAdminDatabase();
  
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
  // Split by comma or newline, trim whitespace, strip quotes, and filter for JWTs
  return keys.split(/[\n,]+/)
    .map(k => k.trim().replace(/^['"]|['"]$/g, ''))
    .filter(k => k.length > 0 && k.startsWith('eyJ'));
}

export function getTargetSeasonId() {
  return process.env.TARGET_SEASON_ID ? parseInt(process.env.TARGET_SEASON_ID) : null;
}

// RobotEvents API Base URL
export const ROBOTEVENTS_API_BASE = 'https://www.robotevents.com/api/v2';

