import { FieldValue } from 'firebase-admin/firestore';
import { getFirestore, getRealtimeDB } from '../config.js';

/**
 * Firebase write helpers
 * Implements batch writes for efficiency
 */

const BATCH_SIZE = 500; // Firestore batch limit

/**
 * Clean object for comparison (removes undefined, sorts keys)
 * Preserves nulls to match Firestore behavior (if needed) but JSON.stringify handles them.
 */
function cleanForComparison(obj) {
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
function stripNulls(obj) {
  if (Array.isArray(obj)) {
    return obj.map(v => stripNulls(v));
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      const val = stripNulls(obj[key]);
      // If value is null, skip adding it to the accumulator (effectively deleting the key)
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
function deepEqual(obj1, obj2) {
  // Direct equality check
  if (obj1 === obj2) return true;
  
  // Normalize null/undefined
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
  
  // Check if keys are same (ignoring order in list but count must match)
  // For strict object equality, keys length must match.
  // Note: cleanForComparison handles missing keys by making them undefined (removed) or null
  // But here we are comparing the "cleaned" objects.
  
  if (keys1.length !== keys2.length) return false;
  
  for (let i = 0; i < keys1.length; i++) {
    const key = keys1[i];
    if (key !== keys2[i]) return false; // Keys must match after sort
    
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
        if (existingData.lastUpdated) delete existingData.lastUpdated;
        
        // Clean data for comparison (handle undefined vs missing keys)
        const cleanExisting = cleanForComparison(existingData);
        const cleanNew = cleanForComparison(data);

        // Compare with new data
        if (deepEqual(cleanExisting, cleanNew)) {
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
    const snapshot = await rtdb.ref(path).once('value');
    const existingData = snapshot.val() || {};

    // DEBUG: Only log details for the first mismatch found
    let debugLogPrinted = false;

    for (const doc of documents) {
      const existingDoc = existingData[doc.id];
      let shouldUpdate = true;

      if (existingDoc) {
        // Strip lastUpdated for comparison
        const { lastUpdated, ...existingWithoutMeta } = existingDoc;
        
        // Clean both sides to ensure consistent JSON types (no undefined, etc.)
        const cleanExisting = cleanForComparison(existingWithoutMeta);
        const cleanNew = cleanForComparison(doc.data);

        if (deepEqual(cleanExisting, cleanNew)) {
          shouldUpdate = false;
        } else if (!debugLogPrinted) {
          // Debugging why we are updating
          console.log(`    🔍 [RTDB Debug] Diff found for ${doc.id}:`);
          // Helper to find diff
          const keys = new Set([...Object.keys(cleanExisting || {}), ...Object.keys(cleanNew || {})]);
          for (const k of keys) {
            const val1 = cleanExisting ? cleanExisting[k] : undefined;
            const val2 = cleanNew ? cleanNew[k] : undefined;
            if (JSON.stringify(val1) !== JSON.stringify(val2)) {
               // Only log if one isn't just null/undefined equivalent
               if (!((val1 === null || val1 === undefined) && (val2 === null || val2 === undefined))) {
                  console.log(`      Key "${k}": Old=${JSON.stringify(val1)} vs New=${JSON.stringify(val2)}`);
               }
            }
          }
          debugLogPrinted = true;
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
