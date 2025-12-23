import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID || 'robostemdb',
      privateKey: privateKey,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });
}

const db = admin.firestore();

async function test() {
  try {
    const res = await db.collection('test').add({
      message: 'Hello from sync script',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('Success! Document ID:', res.id);
  } catch (err) {
    console.error('Error writing to Firestore:', err);
  }
}

test();

