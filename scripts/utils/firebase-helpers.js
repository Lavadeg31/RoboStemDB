import admin from 'firebase-admin';
import { getFirestore, getRealtimeDB } from '../config.js';

/**
 * Firebase write helpers
 * Implements batch writes for efficiency
 */

const BATCH_SIZE = 500; // Firestore batch limit

export async function batchWriteToFirestore(collectionPath, documents, merge = true) {
  const db = getFirestore();
  const batches = [];
  let currentBatch = db.batch();
  let count = 0;

  for (const doc of documents) {
    const { id, data } = doc;
    const docRef = db.collection(collectionPath).doc(id);
    
    currentBatch.set(docRef, {
      ...data,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge });

    count++;

    if (count >= BATCH_SIZE) {
      batches.push(currentBatch);
      currentBatch = db.batch();
      count = 0;
    }
  }

  if (count > 0) {
    batches.push(currentBatch);
  }

  // Execute all batches
  for (const batch of batches) {
    await batch.commit();
  }

  return documents.length;
}

export async function writeToRealtimeDB(path, data) {
  const rtdb = getRealtimeDB();
  const ref = rtdb.ref(path);
  await ref.set({
    ...data,
    lastUpdated: Date.now(),
  });
}

export async function updateSyncProgress(progress) {
  const db = getFirestore();
  await db.collection('sync').doc('progress').set({
    ...progress,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function getSyncProgress() {
  const db = getFirestore();
  const doc = await db.collection('sync').doc('progress').get();
  return doc.exists ? doc.data() : null;
}

