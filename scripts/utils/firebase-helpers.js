import { FieldValue } from 'firebase-admin/firestore';
import { getFirestore, getRealtimeDB } from '../config.js';

/**
 * Firebase write helpers
 * Implements batch writes for efficiency
 */

const BATCH_SIZE = 500; // Firestore batch limit

/**
 * Clean object for comparison (removes undefined, sorts keys)
 */
export function cleanForComparison(obj) {
  if (obj === undefined || obj === null) return null;
  const str = JSON.stringify(obj, (key, value) => {
    return value === undefined ? null : value;
  });
  return JSON.parse(str);
}

/**
 * Recursively remove keys with null values from an object.
 * This mimics RTDB behavior where null values mean "delete key".
 */
export function stripNulls(obj) {
  if (Array.isArray(obj)) {
    return obj.map(v => stripNulls(v));
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      const val = stripNulls(obj[key]);
      if (val !== null && val !== undefined) {
        acc[key] = val;
      }
      return acc;
    }, {});
  }
  return obj;
}

/**
 * Deep comparison helper
 * Returns true if objects are effectively equal
 */
export function deepEqual(obj1, obj2) {
  // Direct equality check
  if (obj1 === obj2) return true;
  
  // Normalize null/undefined (treat them as equal if both represent "no value")
  if ((obj1 === null || obj1 === undefined) && (obj2 === null || obj2 === undefined)) return true;

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
  const keys1 = Object.keys(obj1).sort();
  const keys2 = Object.keys(obj2).sort();
  
  if (keys1.length !== keys2.length) return false;
  
  for (let i = 0; i < keys1.length; i++) {
    const key = keys1[i];
    if (key !== keys2[i]) return false; // Keys must match after sort
    
    if (!deepEqual(obj1[key], obj2[key])) return false;
  }
  
  return true;
}

export async function batchWriteToFirestore(collectionPath, documents, merge = true, checkBeforeWrite = true) {
  const db = getFirestore();
  let totalUpdated = 0;
  let totalSkipped = 0;

  console.log(`    💾 [FIRESTORE] Processing ${documents.length} docs for "${collectionPath}"...`);

  // Process in chunks to respect batch limits and memory
  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    const chunk = documents.slice(i, i + BATCH_SIZE);
    
    // 1. Fetch existing documents to compare
    let snapshots = [];
    if (checkBeforeWrite) {
      const docRefs = chunk.map(doc => db.collection(collectionPath).doc(doc.id));
      try {
        if (docRefs.length > 0) {
          // Use getAll for efficient read
          snapshots = await db.getAll(...docRefs);
        }
      } catch (err) {
        console.warn(`    ⚠️ [FIRESTORE] Failed to fetch existing docs for comparison: ${err.message}. Proceeding with writes.`);
        snapshots = new Array(chunk.length).fill({ exists: false });
      }
    }

    const batch = db.batch();
    let batchCount = 0;

    chunk.forEach((doc, index) => {
      const { id, data } = doc;
      let shouldWrite = true;

      if (checkBeforeWrite) {
        const snapshot = snapshots[index];
        if (snapshot && snapshot.exists) {
          const existingData = snapshot.data();
          if (existingData.lastUpdated) delete existingData.lastUpdated;
          
          // Clean data for comparison (handle undefined vs missing keys)
          const cleanExisting = cleanForComparison(existingData);
          const cleanNew = cleanForComparison(data);

          // Compare with new data
          if (deepEqual(cleanExisting, cleanNew)) {
            shouldWrite = false;
          }
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
  
  // BLIND WRITE: We stop reading from RTDB to save "Download" bandwidth.
  // In RTDB, Uploads are free, but Downloads (Reading) cost money.
  // We will rely on the in-memory cache in sync.js to avoid redundant writes.
  for (const doc of documents) {
    updates[`${path}/${doc.id}`] = {
      ...doc.data,
      lastUpdated: new Date().toISOString()
    };
  }

  try {
    if (Object.keys(updates).length > 0) {
      await rtdb.ref().update(updates);
      console.log(`    ⚡ [RTDB] Blind update: ${documents.length} records at "${path}"`);
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
