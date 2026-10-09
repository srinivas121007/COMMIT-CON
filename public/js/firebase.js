/**
 * Firebase Client & Firestore Persistence Abstraction
 * 
 * Supports Firebase JS SDK v10+ (modular CDN) with Anonymous Authentication,
 * automatic batch chunking (<= 500 operations per batch), local caching to minimize reads,
 * and a seamless IndexedDB/in-memory fallback when credentials have not been configured yet.
 */

import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';

// CDN module URLs
const FIREBASE_APP_CDN = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
const FIREBASE_FIRESTORE_CDN = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
const FIREBASE_AUTH_CDN = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// Maximum batch size in Firestore is 500; use 400 for safety margin
const BATCH_CHUNK_SIZE = 400;

// Local read cache: datasetId -> collectionName -> Array of documents
const localCache = new Map();

// Local fallback database in browser IndexedDB for offline / unconfigured mode
const IDB_NAME = 'KnowledgeRepairDB';
const IDB_VERSION = 1;

let appInstance = null;
let firestoreInstance = null;
let authInstance = null;
let currentAuthUser = null;
let isConnectedToFirestore = false;
let initPromise = null;
let statusListeners = [];

export function onConnectionStatusChange(listener) {
  statusListeners.push(listener);
  listener({
    isConfigured: isFirebaseConfigured(),
    isConnected: isConnectedToFirestore,
    user: currentAuthUser
  });
  return () => {
    statusListeners = statusListeners.filter(l => l !== listener);
  };
}

function notifyStatus(error = null) {
  const status = {
    isConfigured: isFirebaseConfigured(),
    isConnected: isConnectedToFirestore,
    user: currentAuthUser,
    error: error ? error.message : null
  };
  for (const listener of statusListeners) {
    try {
      listener(status);
    } catch (e) {
      console.warn('Status listener error:', e);
    }
  }
}

/**
 * IndexedDB helper for fallback offline persistence
 */
function openLocalDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported in this environment'));
    }
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const stores = ['original_records', 'repaired_records', 'change_log', 'issues', 'quality_snapshots', 'metadata'];
      for (const store of stores) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'storageKey' });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbPutMany(storeName, items) {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const item of items) {
      store.put(item);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetAllByDataset(storeName, datasetId) {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => {
      const results = (request.result || [])
        .filter(entry => entry.datasetId === datasetId)
        .map(entry => entry.data);
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

async function idbPutOne(storeName, item) {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Initialize Firebase or Fallback Storage
 */
export async function initFirebase() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (!isFirebaseConfigured()) {
      console.info(
        '%c[Persistence] Firebase credentials are placeholder values. Operating in local storage mode (IndexedDB).',
        'color: #0284c7; font-weight: bold;'
      );
      isConnectedToFirestore = false;
      notifyStatus();
      return { isConnected: false, mode: 'local' };
    }

    try {
      // Dynamic ES module imports from CDN
      const [{ initializeApp }, { getFirestore }, { getAuth, signInAnonymously }] = await Promise.all([
        import(FIREBASE_APP_CDN),
        import(FIREBASE_FIRESTORE_CDN),
        import(FIREBASE_AUTH_CDN)
      ]);

      appInstance = initializeApp(firebaseConfig);
      firestoreInstance = getFirestore(appInstance);
      authInstance = getAuth(appInstance);

      // Authenticate anonymously
      const userCredential = await signInAnonymously(authInstance);
      currentAuthUser = userCredential.user;
      isConnectedToFirestore = true;
      console.info(
        '%c[Persistence] Successfully connected to Firebase Firestore with anonymous auth!',
        'color: #10b981; font-weight: bold;'
      );
      notifyStatus();
      return { isConnected: true, mode: 'firestore', user: currentAuthUser };
    } catch (err) {
      console.warn('[Persistence] Failed to connect to Firebase. Falling back to local storage:', err);
      isConnectedToFirestore = false;
      notifyStatus(err);
      return { isConnected: false, mode: 'local', error: err.message };
    }
  })();

  return initPromise;
}

/**
 * Helper to get cache entry
 */
function getCache(datasetId, collectionName) {
  if (!localCache.has(datasetId)) return null;
  const dsCache = localCache.get(datasetId);
  return dsCache.get(collectionName) || null;
}

function setCache(datasetId, collectionName, items) {
  if (!localCache.has(datasetId)) {
    localCache.set(datasetId, new Map());
  }
  localCache.get(datasetId).set(collectionName, items);
}

export function invalidateCache(datasetId, collectionName = null) {
  if (!localCache.has(datasetId)) return;
  if (collectionName) {
    localCache.get(datasetId).delete(collectionName);
  } else {
    localCache.delete(datasetId);
  }
}

/**
 * Save Original Records (Create-only, Immutable)
 * Uses batch chunking <= 400 records per Firestore batch write.
 */
export async function saveOriginalRecords(datasetId, records) {
  await initFirebase();
  const timestamp = Date.now();

  const prepared = records.map(rec => ({
    id: rec.id,
    type: rec.type,
    attributes: rec.attributes || {},
    source: rec.source || 'Original_Import',
    relationships: rec.relationships || [],
    createdAt: rec.createdAt || timestamp
  }));

  // Update memory cache
  setCache(datasetId, 'original_records', prepared);

  // If connected to Firestore, perform chunked batch writes
  if (isConnectedToFirestore && firestoreInstance) {
    const { doc, writeBatch } = await import(FIREBASE_FIRESTORE_CDN);
    for (let i = 0; i < prepared.length; i += BATCH_CHUNK_SIZE) {
      const chunk = prepared.slice(i, i + BATCH_CHUNK_SIZE);
      const batch = writeBatch(firestoreInstance);
      for (const rec of chunk) {
        const ref = doc(firestoreInstance, 'datasets', datasetId, 'original_records', rec.id);
        batch.set(ref, rec);
      }
      await batch.commit();
    }
  }

  // Always mirror to IndexedDB for offline resilience and fast loads
  try {
    const idbEntries = prepared.map(rec => ({
      storageKey: `${datasetId}::orig::${rec.id}`,
      datasetId,
      id: rec.id,
      data: rec
    }));
    await idbPutMany('original_records', idbEntries);
  } catch (e) {
    console.warn('[Persistence] IndexedDB backup error:', e);
  }

  return prepared;
}

/**
 * Fetch Original Records
 */
export async function getOriginalRecords(datasetId) {
  await initFirebase();
  const cached = getCache(datasetId, 'original_records');
  if (cached) return cached;

  if (isConnectedToFirestore && firestoreInstance) {
    try {
      const { collection, getDocs } = await import(FIREBASE_FIRESTORE_CDN);
      const colRef = collection(firestoreInstance, 'datasets', datasetId, 'original_records');
      const snap = await getDocs(colRef);
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setCache(datasetId, 'original_records', records);
      return records;
    } catch (e) {
      console.warn('[Persistence] Firestore read error, checking local store:', e);
    }
  }

  const local = await idbGetAllByDataset('original_records', datasetId);
  setCache(datasetId, 'original_records', local);
  return local;
}

/**
 * Save Repaired Records (Batch Chunked)
 */
export async function saveRepairedRecords(datasetId, records) {
  await initFirebase();
  setCache(datasetId, 'repaired_records', records);

  if (isConnectedToFirestore && firestoreInstance) {
    const { doc, writeBatch } = await import(FIREBASE_FIRESTORE_CDN);
    for (let i = 0; i < records.length; i += BATCH_CHUNK_SIZE) {
      const chunk = records.slice(i, i + BATCH_CHUNK_SIZE);
      const batch = writeBatch(firestoreInstance);
      for (const rec of chunk) {
        const docId = rec.canonicalId || rec.id;
        const ref = doc(firestoreInstance, 'datasets', datasetId, 'repaired_records', docId);
        batch.set(ref, rec);
      }
      await batch.commit();
    }
  }

  try {
    const idbEntries = records.map(rec => ({
      storageKey: `${datasetId}::rep::${rec.canonicalId || rec.id}`,
      datasetId,
      id: rec.canonicalId || rec.id,
      data: rec
    }));
    await idbPutMany('repaired_records', idbEntries);
  } catch (e) {
    console.warn('[Persistence] IndexedDB error:', e);
  }

  return records;
}

/**
 * Fetch Repaired Records
 */
export async function getRepairedRecords(datasetId) {
  await initFirebase();
  const cached = getCache(datasetId, 'repaired_records');
  if (cached) return cached;

  if (isConnectedToFirestore && firestoreInstance) {
    try {
      const { collection, getDocs } = await import(FIREBASE_FIRESTORE_CDN);
      const colRef = collection(firestoreInstance, 'datasets', datasetId, 'repaired_records');
      const snap = await getDocs(colRef);
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setCache(datasetId, 'repaired_records', records);
      return records;
    } catch (e) {
      console.warn('[Persistence] Firestore read error, checking local store:', e);
    }
  }

  const local = await idbGetAllByDataset('repaired_records', datasetId);
  setCache(datasetId, 'repaired_records', local);
  return local;
}

/**
 * Save Change Log entries (Batch Chunked)
 */
export async function saveChangeLog(datasetId, logs) {
  await initFirebase();
  setCache(datasetId, 'change_log', logs);

  if (isConnectedToFirestore && firestoreInstance) {
    const { doc, writeBatch } = await import(FIREBASE_FIRESTORE_CDN);
    for (let i = 0; i < logs.length; i += BATCH_CHUNK_SIZE) {
      const chunk = logs.slice(i, i + BATCH_CHUNK_SIZE);
      const batch = writeBatch(firestoreInstance);
      for (const log of chunk) {
        const ref = doc(firestoreInstance, 'datasets', datasetId, 'change_log', log.changeId);
        batch.set(ref, log);
      }
      await batch.commit();
    }
  }

  try {
    const idbEntries = logs.map(log => ({
      storageKey: `${datasetId}::chg::${log.changeId}`,
      datasetId,
      id: log.changeId,
      data: log
    }));
    await idbPutMany('change_log', idbEntries);
  } catch (e) {
    console.warn('[Persistence] IndexedDB error:', e);
  }

  return logs;
}

/**
 * Fetch Change Log entries
 */
export async function getChangeLog(datasetId) {
  await initFirebase();
  const cached = getCache(datasetId, 'change_log');
  if (cached) return cached;

  if (isConnectedToFirestore && firestoreInstance) {
    try {
      const { collection, getDocs } = await import(FIREBASE_FIRESTORE_CDN);
      const colRef = collection(firestoreInstance, 'datasets', datasetId, 'change_log');
      const snap = await getDocs(colRef);
      const logs = snap.docs.map(d => ({ changeId: d.id, ...d.data() }));
      setCache(datasetId, 'change_log', logs);
      return logs;
    } catch (e) {
      console.warn('[Persistence] Firestore read error, checking local store:', e);
    }
  }

  const local = await idbGetAllByDataset('change_log', datasetId);
  setCache(datasetId, 'change_log', local);
  return local;
}

/**
 * Save Issues (Batch Chunked)
 */
export async function saveIssues(datasetId, issues) {
  await initFirebase();
  setCache(datasetId, 'issues', issues);

  if (isConnectedToFirestore && firestoreInstance) {
    const { doc, writeBatch } = await import(FIREBASE_FIRESTORE_CDN);
    for (let i = 0; i < issues.length; i += BATCH_CHUNK_SIZE) {
      const chunk = issues.slice(i, i + BATCH_CHUNK_SIZE);
      const batch = writeBatch(firestoreInstance);
      for (const iss of chunk) {
        const ref = doc(firestoreInstance, 'datasets', datasetId, 'issues', iss.issueId);
        batch.set(ref, iss);
      }
      await batch.commit();
    }
  }

  try {
    const idbEntries = issues.map(iss => ({
      storageKey: `${datasetId}::iss::${iss.issueId}`,
      datasetId,
      id: iss.issueId,
      data: iss
    }));
    await idbPutMany('issues', idbEntries);
  } catch (e) {
    console.warn('[Persistence] IndexedDB error:', e);
  }

  return issues;
}

/**
 * Fetch Issues
 */
export async function getIssues(datasetId) {
  await initFirebase();
  const cached = getCache(datasetId, 'issues');
  if (cached) return cached;

  if (isConnectedToFirestore && firestoreInstance) {
    try {
      const { collection, getDocs } = await import(FIREBASE_FIRESTORE_CDN);
      const colRef = collection(firestoreInstance, 'datasets', datasetId, 'issues');
      const snap = await getDocs(colRef);
      const issues = snap.docs.map(d => ({ issueId: d.id, ...d.data() }));
      setCache(datasetId, 'issues', issues);
      return issues;
    } catch (e) {
      console.warn('[Persistence] Firestore read error, checking local store:', e);
    }
  }

  const local = await idbGetAllByDataset('issues', datasetId);
  setCache(datasetId, 'issues', local);
  return local;
}

/**
 * Save Quality Snapshot
 */
export async function saveQualitySnapshot(datasetId, stage, snapshot) {
  await initFirebase();
  const payload = {
    snapshotId: `snap_${stage}`,
    stage,
    timestamp: Date.now(),
    ...snapshot
  };

  const cached = getCache(datasetId, 'quality_snapshots') || [];
  const updatedCache = cached.filter(s => s.stage !== stage).concat(payload);
  setCache(datasetId, 'quality_snapshots', updatedCache);

  if (isConnectedToFirestore && firestoreInstance) {
    const { doc, setDoc } = await import(FIREBASE_FIRESTORE_CDN);
    const ref = doc(firestoreInstance, 'datasets', datasetId, 'quality_snapshots', payload.snapshotId);
    await setDoc(ref, payload);
  }

  try {
    await idbPutOne('quality_snapshots', {
      storageKey: `${datasetId}::snap::${stage}`,
      datasetId,
      stage,
      data: payload
    });
  } catch (e) {
    console.warn('[Persistence] IndexedDB error:', e);
  }

  return payload;
}

/**
 * Fetch Quality Snapshots
 */
export async function getQualitySnapshots(datasetId) {
  await initFirebase();
  const cached = getCache(datasetId, 'quality_snapshots');
  if (cached) return cached;

  if (isConnectedToFirestore && firestoreInstance) {
    try {
      const { collection, getDocs } = await import(FIREBASE_FIRESTORE_CDN);
      const colRef = collection(firestoreInstance, 'datasets', datasetId, 'quality_snapshots');
      const snap = await getDocs(colRef);
      const snapshots = snap.docs.map(d => ({ snapshotId: d.id, ...d.data() }));
      setCache(datasetId, 'quality_snapshots', snapshots);
      return snapshots;
    } catch (e) {
      console.warn('[Persistence] Firestore read error, checking local store:', e);
    }
  }

  const local = await idbGetAllByDataset('quality_snapshots', datasetId);
  setCache(datasetId, 'quality_snapshots', local);
  return local;
}

/**
 * Update Repaired Record Field (for manual edits & reversions)
 */
export async function updateRepairedRecord(datasetId, canonicalId, updatedRecord) {
  await initFirebase();
  
  // Update cache
  const cached = getCache(datasetId, 'repaired_records') || [];
  const index = cached.findIndex(r => (r.canonicalId || r.id) === canonicalId);
  if (index !== -1) {
    cached[index] = { ...cached[index], ...updatedRecord };
  } else {
    cached.push(updatedRecord);
  }
  setCache(datasetId, 'repaired_records', cached);

  if (isConnectedToFirestore && firestoreInstance) {
    const { doc, setDoc } = await import(FIREBASE_FIRESTORE_CDN);
    const ref = doc(firestoreInstance, 'datasets', datasetId, 'repaired_records', canonicalId);
    await setDoc(ref, updatedRecord, { merge: true });
  }

  try {
    await idbPutOne('repaired_records', {
      storageKey: `${datasetId}::rep::${canonicalId}`,
      datasetId,
      id: canonicalId,
      data: updatedRecord
    });
  } catch (e) {
    console.warn('[Persistence] IndexedDB error:', e);
  }

  return updatedRecord;
}

/**
 * Update Change Log Status (applied vs. reverted)
 */
export async function updateChangeLogStatus(datasetId, changeId, newStatus) {
  await initFirebase();

  const cached = getCache(datasetId, 'change_log') || [];
  const target = cached.find(c => c.changeId === changeId);
  if (target) {
    target.status = newStatus;
  }
  setCache(datasetId, 'change_log', cached);

  if (isConnectedToFirestore && firestoreInstance) {
    const { doc, updateDoc } = await import(FIREBASE_FIRESTORE_CDN);
    const ref = doc(firestoreInstance, 'datasets', datasetId, 'change_log', changeId);
    await updateDoc(ref, { status: newStatus });
  }

  if (target) {
    try {
      await idbPutOne('change_log', {
        storageKey: `${datasetId}::chg::${changeId}`,
        datasetId,
        id: changeId,
        data: target
      });
    } catch (e) {
      console.warn('[Persistence] IndexedDB error:', e);
    }
  }

  return target;
}

/**
 * Update Issue Status (open, resolved, ignored)
 */
export async function updateIssueStatus(datasetId, issueId, newStatus) {
  await initFirebase();

  const cached = getCache(datasetId, 'issues') || [];
  const target = cached.find(i => i.issueId === issueId);
  if (target) {
    target.status = newStatus;
  }
  setCache(datasetId, 'issues', cached);

  if (isConnectedToFirestore && firestoreInstance) {
    const { doc, updateDoc } = await import(FIREBASE_FIRESTORE_CDN);
    const ref = doc(firestoreInstance, 'datasets', datasetId, 'issues', issueId);
    await updateDoc(ref, { status: newStatus });
  }

  if (target) {
    try {
      await idbPutOne('issues', {
        storageKey: `${datasetId}::iss::${issueId}`,
        datasetId,
        id: issueId,
        data: target
      });
    } catch (e) {
      console.warn('[Persistence] IndexedDB error:', e);
    }
  }

  return target;
}
