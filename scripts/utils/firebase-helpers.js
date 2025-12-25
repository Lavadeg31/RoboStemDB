import { FieldValue } from 'firebase-admin/firestore';
import { getFirestore, getRealtimeDB } from '../config.js';

/**
 * Firebase write helpers
 * Implements batch writes for efficiency
 */

const BATCH_SIZE = 500; // Firestore batch limit

/**
 * Deep comparison helper
 * Returns true if objects are effectively equal
 */
function deepEqual(obj1, obj2) {
  if (obj1 === obj2) return true;
  
  // Handle Firestore Timestamp (has toDate)
  if (obj1 && typeof obj1.toDate === 'function') obj1 = obj1.toDate();
  if (obj2 && typeof obj2.toDate === 'function') obj2 = obj2.toDate();
  
  // Handle Date objects
  if (obj1 instanceof Date && obj2 instanceof Date) {
    return obj1.getTime() === obj2.getTime();
  }
  
  // Primitives
  if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) {
    return false;
  }
  
  // Arrays
  if (Array.isArray(obj1) !== Array.isArray(obj2)) return false;
  
  // Objects
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) return false;
  
  for (const key of keys1) {
    if (!keys2.includes(key)) return false;
    if (!deepEqual(obj1[key], obj2[key])) return false;
  }
  
  return true;
}

export async function batchWriteToFirestore(collectionPath, documents, merge = true) {
  const db = getFirestore();
  let totalUpdated = 0;
  let totalSkipped = 0;

  console.log(`    💾 [FIRESTORE] Processing ${documents.length} docs for "${collectionPath}"...`);

  // Process in chunks to respect batch limits and memory
  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    const chunk = documents.slice(i, i + BATCH_SIZE);
    const docRefs = chunk.map(doc => db.collection(collectionPath).doc(doc.id));
    
    // 1. Fetch existing documents to compare
    let snapshots = [];
    try {
      if (docRefs.length > 0) {
        // Use getAll for efficient read
        snapshots = await db.getAll(...docRefs);
      }
    } catch (err) {
      console.warn(`    ⚠️ [FIRESTORE] Failed to fetch existing docs for comparison: ${err.message}. Proceeding with writes.`);
      snapshots = new Array(chunk.length).fill({ exists: false });
    }

    const batch = db.batch();
    let batchCount = 0;

    chunk.forEach((doc, index) => {
      const { id, data } = doc;
      const snapshot = snapshots[index];
      let shouldWrite = true;

      if (snapshot && snapshot.exists) {
        const existingData = snapshot.data();
        // Ignore lastUpdated for comparison as it changes on every write
        if (existingData.lastUpdated) delete existingData.lastUpdated;
        
        // Compare with new data
        if (deepEqual(existingData, data)) {
          shouldWrite = false;
        }
      }

      if (shouldWrite) {
        const docRef = db.collection(collectionPath).doc(id);
        batch.set(docRef, {
          ...data,
          lastUpdated: FieldValue.serverTimestamp(),
        }, { merge });
        batchCount++;
      }
    });

    if (batchCount > 0) {
      try {
        const timeout = 10000;
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Firestore commit timed out after ${timeout/1000}s`)), timeout)
        );
        await Promise.race([batch.commit(), timeoutPromise]);
        totalUpdated += batchCount;
      } catch (err) {
        console.error(`    ❌ [FIRESTORE] Batch failed: ${err.message}`);
        throw err;
      }
    }
    totalSkipped += (chunk.length - batchCount);
  }

  if (totalUpdated > 0 || totalSkipped > 0) {
    console.log(`    Outcome: ${totalUpdated} updated, ${totalSkipped} unchanged.`);
  }

  return totalUpdated;
}

/**
 * Updates Realtime Database for ultra-low latency live data
 * Path is the RTDB path, documents is an array of {id, data}
 */
export async function updateRealtimeDB(path, documents) {
  const rtdb = getRealtimeDB();
  const updates = {};
  let totalUpdates = 0;
  
  try {
    // 1. Fetch existing data for comparison (RTDB is fast, one-shot read is okay for reasonable sizes)
    // Note: If 'path' contains many thousands of records, this might be heavy.
    // However, live events usually have < 500 matches/rankings per division.
    const snapshot = await rtdb.ref(path).once('value');
    const existingData = snapshot.val() || {};

    for (const doc of documents) {
      const existingDoc = existingData[doc.id];
      let shouldUpdate = true;

      if (existingDoc) {
        // Strip lastUpdated for comparison
        const { lastUpdated, ...cleanExisting } = existingDoc;
        if (deepEqual(cleanExisting, doc.data)) {
          shouldUpdate = false;
        }
      }

      if (shouldUpdate) {
        updates[`${path}/${doc.id}`] = {
          ...doc.data,
          lastUpdated: new Date().toISOString()
        };
        totalUpdates++;
      }
    }

    if (totalUpdates > 0) {
      await rtdb.ref().update(updates);
      console.log(`    ⚡ [RTDB] Updated ${totalUpdates} records at "${path}"`);
    } else {
      console.log(`    ⚡ [RTDB] No changes for "${path}"`);
    }

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
