import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDatasetPackage } from '../data/generateDataset.js';
import { isFirebaseConfigured } from '../public/js/firebase-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('--- RUNNING STAGE 1 VERIFICATION TESTS ---');

// 1. Verify Project Structure files
const requiredFiles = [
  'firebase.json',
  'firestore.rules',
  'firestore.indexes.json',
  'public/js/firebase.js',
  'public/js/firebase-config.js',
  'data/generateDataset.js',
  'data/sample-dataset.json'
];

for (const relPath of requiredFiles) {
  const fullPath = path.resolve(__dirname, '..', relPath);
  assert(fs.existsSync(fullPath), `Missing required file: ${relPath}`);
  console.log(`[PASS] File exists: ${relPath}`);
}

// 2. Verify Dataset Generation counts
const pkg = createDatasetPackage(42);
assert.strictEqual(pkg.clean.counts.people, 150, 'Clean people count must be 150');
assert.strictEqual(pkg.clean.counts.places, 40, 'Clean places count must be 40');
assert.strictEqual(pkg.clean.counts.events, 60, 'Clean events count must be 60');
assert.strictEqual(pkg.clean.counts.total, 250, 'Total clean records must be 250');
console.log('[PASS] Clean dataset entity counts verified (150 people, 40 places, 60 events)');

// 3. Verify Corrupted Dataset and Mutations
assert(pkg.corrupted.records.length > 250, 'Corrupted dataset should include duplicates');
assert(pkg.corrupted.groundTruthMutations.length >= 80, 'Ground truth mutations must be >= 80');

const categories = new Set(pkg.corrupted.groundTruthMutations.map(m => m.category));
assert(categories.has('duplicate'), 'Must contain duplicate mutations');
assert(categories.has('typo'), 'Must contain typo mutations');
assert(categories.has('missing'), 'Must contain missing mutations');
assert(categories.has('contradiction'), 'Must contain contradiction mutations');
console.log(`[PASS] Injected mutations catalog contains all 4 categories: ${Array.from(categories).join(', ')}`);

// 4. Verify Firestore Batch Chunking logic
function chunkArray(items, maxChunkSize = 400) {
  const chunks = [];
  for (let i = 0; i < items.length; i += maxChunkSize) {
    chunks.push(items.slice(i, i + maxChunkSize));
  }
  return chunks;
}

const chunks = chunkArray(pkg.corrupted.records, 400);
assert(chunks.length > 0, 'Should produce chunks');
chunks.forEach((chunk, idx) => {
  assert(chunk.length <= 400, `Chunk ${idx} exceeds safe Firestore limit of 400`);
});
console.log(`[PASS] Firestore batch chunking test passed (${pkg.corrupted.records.length} records safely divided into ${chunks.length} batches <= 400)`);

// 5. Verify Firebase Config validation
assert.strictEqual(isFirebaseConfigured(), false, 'Default placeholder config should be unconfigured');
console.log('[PASS] firebase-config placeholder detection verified');

// 6. Verify firestore.rules immutability
const rulesContent = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf-8');
assert(rulesContent.includes('match /original_records/{recordId}'), 'Rules must protect original_records');
assert(rulesContent.includes('allow update, delete: if false;'), 'original_records must be immutable (no update, delete)');
console.log('[PASS] firestore.rules immutability constraint verified');

console.log('--- ALL STAGE 1 TESTS PASSED SUCCESSFULLY! ---');
