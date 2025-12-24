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

  console.log(`    💾 [DB WRITE] Initializing batch write for ${documents.length} docs to "${collectionPath}"...`);

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
    await batches[i].commit();
    if (batches.length > 1) {
      console.log(`    ✅ [DB WRITE] Committed batch ${i + 1}/${batches.length}`);
    }
  }

  console.log(`    ✅ [DB WRITE] Successfully saved ${documents.length} docs to "${collectionPath}"`);
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

