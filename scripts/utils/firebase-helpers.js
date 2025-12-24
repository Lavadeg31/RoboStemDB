import { FieldValue } from 'firebase-admin/firestore';
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

  console.log(`    💾 [FIRESTORE] Building batch for ${documents.length} docs to "${collectionPath}"...`);

  for (const doc of documents) {
    const { id, data } = doc;
    const docRef = db.collection(collectionPath).doc(id);
    
    currentBatch.set(docRef, {
      ...data,
      lastUpdated: FieldValue.serverTimestamp(),
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
  for (let i = 0; i < batches.length; i++) {
    try {
      const timeout = 10000;
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Firestore commit timed out after ${timeout/1000}s`)), timeout)
      );

      await Promise.race([batches[i].commit(), timeoutPromise]);
    } catch (err) {
      console.error(`    ❌ [FIRESTORE] Failed: ${err.message}`);
      throw err; 
    }
  }

  console.log(`    ✅ [FIRESTORE] Done.`);
  return documents.length;
}

/**
 * Updates Realtime Database for ultra-low latency live data
 * Path is the RTDB path, documents is an array of {id, data}
 */
export async function updateRealtimeDB(path, documents) {
  const rtdb = getRealtimeDB();
  const updates = {};
  
  for (const doc of documents) {
    updates[`${path}/${doc.id}`] = {
      ...doc.data,
      lastUpdated: new Date().toISOString()
    };
  }

  try {
    await rtdb.ref().update(updates);
    console.log(`    ⚡ [RTDB] Updated ${documents.length} records at "${path}"`);
  } catch (err) {
    console.error(`    ❌ [RTDB] Failed: ${err.message}`);
  }
}

export async function updateSyncProgress(progress) {
  const db = getFirestore();
  await db.collection('sync').doc('progress').set({
    ...progress,
    lastUpdated: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function getSyncProgress() {
  const db = getFirestore();
  const doc = await db.collection('sync').doc('progress').get();
  return doc.exists ? doc.data() : null;
}

