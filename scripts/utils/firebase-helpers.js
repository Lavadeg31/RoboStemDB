import { FieldValue } from 'firebase-admin/firestore';
import { getFirestore } from '../config.js';

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

  console.log(`    💾 [DB WRITE] Building batch for ${documents.length} docs...`);

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

  console.log(`    💾 [DB WRITE] Executing commit for ${batches.length} batch(es)...`);

  // Execute all batches
  for (let i = 0; i < batches.length; i++) {
    try {
      // 10 second timeout - let's fail fast if there's an issue
      const timeout = 10000;
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Firestore commit timed out after ${timeout/1000}s`)), timeout)
      );

      await Promise.race([batches[i].commit(), timeoutPromise]);
      
      if (batches.length > 1) {
        console.log(`    ✅ [DB WRITE] Committed batch ${i + 1}/${batches.length}`);
      }
    } catch (err) {
      console.error(`    ❌ [DB WRITE] Failed: ${err.message}`);
      throw err; 
    }
  }

  console.log(`    ✅ [DB WRITE] Done.`);
  return documents.length;
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

