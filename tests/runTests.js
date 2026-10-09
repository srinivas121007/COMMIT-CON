/**
 * Knowledge Repair Tool - Automated Unit & Integration Test Suite
 * 
 * Verifies all Stage 2 pipeline modules:
 * - Profiler
 * - Normalizer
 * - Duplicate Detection (Levenshtein, Jaro-Winkler, Nicknames, Scoring)
 * - Contradiction Detection (Chronology, Cycles, Spatiotemporal)
 * - Repair Engine (Canonical Merging, Imputation, Cycle Breaking)
 * - Quality Scoring & Ground Truth Precision / Recall
 * - Audit Trail & 1-Click Field Reversion
 * - End-to-End Pipeline Performance (< 1000ms)
 */

import assert from 'assert';
import { createDatasetPackage } from '../data/generateDataset.js';
import { profileDataset } from '../public/js/pipeline/profiler.js';
import {
  normalizeDataset,
  titleCaseName,
  normalizeIsoDate,
  standardizePlaceName
} from '../public/js/pipeline/normalizer.js';
import {
  levenshteinDistance,
  levenshteinSimilarity,
  jaroWinklerSimilarity,
  computeNameSimilarity,
  detectDuplicates
} from '../public/js/pipeline/duplicates.js';
import { detectContradictions } from '../public/js/pipeline/contradictions.js';
import { repairDataset } from '../public/js/pipeline/repair.js';
import { calculateQualityScore, evaluateBenchmark } from '../public/js/pipeline/scoring.js';
import {
  createChangeLogEntry,
  revertChangeOnRecord,
  reapplyChangeOnRecord,
  getRecordProvenance
} from '../public/js/pipeline/audit.js';
import { executePipeline } from '../public/js/pipeline/worker.js';

let totalTests = 0;
let passedTests = 0;

function test(description, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${description}`);
  } catch (err) {
    console.error(`  [FAIL] ${description}`);
    console.error(`         ${err.message}`);
    throw err;
  }
}

async function testAsync(description, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  [PASS] ${description}`);
  } catch (err) {
    console.error(`  [FAIL] ${description}`);
    console.error(`         ${err.message}`);
    throw err;
  }
}

console.log('====================================================');
console.log('--- STAGE 2: KNOWLEDGE REPAIR PIPELINE TEST SUITE ---');
console.log('====================================================\n');

// ----------------------------------------------------
// Suite 1: Normalizer Tests
// ----------------------------------------------------
console.log('Test Suite 1: Data Normalization Rules');

test('titleCaseName converts uppercase to Title Case', () => {
  assert.strictEqual(titleCaseName('ALAN TURING'), 'Alan Turing');
  assert.strictEqual(titleCaseName('grace hopper'), 'Grace Hopper');
});

test('titleCaseName preserves initials and particles', () => {
  assert.strictEqual(titleCaseName('J. R. TOLKIEN'), 'J. R. Tolkien');
  assert.strictEqual(titleCaseName('JOHN VON NEUMANN'), 'John von Neumann');
});

test('normalizeIsoDate handles YYYY/MM/DD and DD-MM-YYYY', () => {
  assert.strictEqual(normalizeIsoDate('1982/04/15'), '1982-04-15');
  assert.strictEqual(normalizeIsoDate('15-04-1982'), '1982-04-15');
  assert.strictEqual(normalizeIsoDate('1982-04-15'), '1982-04-15');
});

test('standardizePlaceName resolves common aliases', () => {
  assert.strictEqual(standardizePlaceName('NYC'), 'New York');
  assert.strictEqual(standardizePlaceName('Lon, UK'), 'London');
  assert.strictEqual(standardizePlaceName('Wien'), 'Vienna');
  assert.strictEqual(standardizePlaceName('Tokyo-to'), 'Tokyo');
});

test('normalizeDataset standardizes records and generates audit entries', () => {
  const sample = [
    {
      id: 'p1',
      type: 'person',
      attributes: {
        name: '   ada lovelace   ',
        birth_date: '1815/12/10',
        birth_place: 'Lon, UK'
      }
    }
  ];

  const result = normalizeDataset(sample);
  assert.strictEqual(result.normalizedCount, 1);
  const rec = result.normalizedRecords[0];
  assert.strictEqual(rec.attributes.name, 'Ada Lovelace');
  assert.strictEqual(rec.attributes.birth_date, '1815-12-10');
  assert.strictEqual(rec.attributes.birth_place, 'London');
  assert(result.changes.length >= 3, 'Should have logged changes for whitespace, case, date, and place');
  assert(result.changes.some(c => c.rule === 'TRIM_WHITESPACE'));
  assert(result.changes.some(c => c.rule === 'NORMALIZE_CASE'));
  assert(result.changes.some(c => c.rule === 'ISO_DATE_FORMAT'));
  assert(result.changes.some(c => c.rule === 'STANDARDIZE_PLACE_NAME'));
});

// ----------------------------------------------------
// Suite 2: Duplicate Detection & String Similarity
// ----------------------------------------------------
console.log('\nTest Suite 2: Duplicate Detection & Similarity Algorithms');

test('Levenshtein distance & normalized similarity', () => {
  assert.strictEqual(levenshteinDistance('Smith', 'Smyth'), 1);
  assert.strictEqual(levenshteinDistance('Turing', 'Turing'), 0);
  assert(levenshteinSimilarity('Smith', 'Smyth') >= 0.80);
});

test('Jaro-Winkler gives high similarity for prefixes and transpositions', () => {
  const jw = jaroWinklerSimilarity('Oppenheimer', 'Openheimer');
  assert(jw > 0.90, `Expected Jaro-Winkler > 0.90, got ${jw}`);
});

test('computeNameSimilarity recognizes nickname synonyms', () => {
  const res1 = computeNameSimilarity('Robert Oppenheimer', 'Bob Oppenheimer');
  assert(res1.score >= 0.85, `Expected nickname score >= 0.85, got ${res1.score}`);
  assert(res1.reasonNote.includes('Nickname match'));

  const res2 = computeNameSimilarity('Alan Turing', 'Al Turing');
  assert(res2.score >= 0.85);
});

test('computeNameSimilarity recognizes initial variants', () => {
  const res = computeNameSimilarity('Alan Turing', 'A. Turing');
  assert(res.score >= 0.85);
});

test('detectDuplicates classifies pairs and forms auto-merge clusters', () => {
  const records = [
    {
      id: 'orig_1',
      type: 'person',
      attributes: { name: 'John Smith', birth_date: '1900-01-01', birth_place: 'London' }
    },
    {
      id: 'orig_1_dup',
      type: 'person',
      attributes: { name: 'Jon Smyth', birth_date: '1900-01-01', birth_place: 'London' }
    },
    {
      id: 'other',
      type: 'person',
      attributes: { name: 'Albert Einstein', birth_date: '1879-03-14', birth_place: 'Ulm' }
    }
  ];

  const dupRes = detectDuplicates(records);
  assert.strictEqual(dupRes.duplicatePairs.length, 1);
  assert.strictEqual(dupRes.duplicatePairs[0].category, 'auto_merge');
  assert(dupRes.duplicatePairs[0].score >= 0.90);
  assert.strictEqual(dupRes.autoMergeGroups.length, 1);
  assert.strictEqual(dupRes.autoMergeGroups[0].length, 2);
});

// ----------------------------------------------------
// Suite 3: Contradiction Detection
// ----------------------------------------------------
console.log('\nTest Suite 3: Contradiction & Logic Anomaly Detection');

test('detectContradictions flags DEATH_BEFORE_BIRTH', () => {
  const records = [
    {
      id: 'p_bad_death',
      type: 'person',
      attributes: { name: 'Test Person', birth_date: '1950-01-01', death_date: '1935-01-01' }
    }
  ];
  const res = detectContradictions(records);
  assert(res.contradictions.some(c => c.rule === 'DEATH_BEFORE_BIRTH'));
});

test('detectContradictions flags IMPOSSIBLE_AGE (> 125 years)', () => {
  const records = [
    {
      id: 'p_old',
      type: 'person',
      attributes: { name: 'Methuselah', birth_date: '1800-01-01', death_date: '1985-01-01' }
    }
  ];
  const res = detectContradictions(records);
  assert(res.contradictions.some(c => c.rule === 'IMPOSSIBLE_AGE'));
});

test('detectContradictions flags CIRCULAR_PARENTAGE graph cycle', () => {
  const records = [
    {
      id: 'p_parent',
      type: 'person',
      relationships: [{ type: 'parent_of', targetId: 'p_child' }]
    },
    {
      id: 'p_child',
      type: 'person',
      relationships: [{ type: 'parent_of', targetId: 'p_parent' }]
    }
  ];
  const res = detectContradictions(records);
  assert(res.contradictions.some(c => c.rule === 'CIRCULAR_PARENTAGE'));
});

test('detectContradictions flags SPATIOTEMPORAL_COLLISION', () => {
  const records = [
    {
      id: 'p_traveler',
      type: 'person',
      relationships: [
        { type: 'attended', targetId: 'ev_1' },
        { type: 'attended', targetId: 'ev_2' }
      ]
    },
    {
      id: 'ev_1',
      type: 'event',
      attributes: { name: 'Summit 1', date: '1927-10-24', location: 'London' }
    },
    {
      id: 'ev_2',
      type: 'event',
      attributes: { name: 'Summit 2', date: '1927-10-24', location: 'Tokyo' }
    }
  ];
  const res = detectContradictions(records);
  assert(res.contradictions.some(c => c.rule === 'SPATIOTEMPORAL_COLLISION'));
});

// ----------------------------------------------------
// Suite 4: Repair Engine & Evidence Imputation
// ----------------------------------------------------
console.log('\nTest Suite 4: Canonical Repair & Imputation Engine');

test('repairDataset merges duplicates and imputes missing fields from duplicate', () => {
  const records = [
    {
      id: 'person_01',
      type: 'person',
      attributes: { name: 'John Smith', birth_date: '1900-01-01', birth_place: 'London', occupation: null },
      relationships: [{ type: 'born_in', targetId: 'place_01' }]
    },
    {
      id: 'person_01_dup',
      type: 'person',
      attributes: { name: 'Jon Smyth', birth_date: '1900-01-01', birth_place: 'London', occupation: 'Mathematician' },
      relationships: [{ type: 'lived_in', targetId: 'place_02' }]
    }
  ];

  const autoMergeGroups = [[records[0], records[1]]];
  const res = repairDataset({ records, autoMergeGroups, contradictions: [] });

  assert.strictEqual(res.repairedRecords.length, 1, 'Duplicate was retired from repaired dataset');
  const canonical = res.repairedRecords[0];
  assert.strictEqual(canonical.id, 'person_01');
  assert.strictEqual(canonical.attributes.occupation, 'Mathematician', 'Missing occupation imputed from duplicate');
  assert(canonical.relationships.some(r => r.type === 'lived_in'), 'Relationships merged');
  assert(res.changes.some(c => c.rule === 'DUPLICATE_IMPUTATION'));
  assert(res.changes.some(c => c.rule === 'CANONICAL_ENTITY_MERGE'));
});

test('repairDataset breaks circular lineage and clears invalid death dates', () => {
  const records = [
    {
      id: 'pA',
      type: 'person',
      attributes: { birth_date: '1950-01-01', death_date: '1930-01-01' },
      relationships: [{ type: 'parent_of', targetId: 'pB' }]
    },
    {
      id: 'pB',
      type: 'person',
      attributes: { birth_date: '1975-01-01', death_date: null },
      relationships: [{ type: 'parent_of', targetId: 'pA' }]
    }
  ];

  const contradictions = [
    { rule: 'DEATH_BEFORE_BIRTH', recordId: 'pA' },
    { rule: 'CIRCULAR_PARENTAGE', recordId: 'pB', relatedRecordId: 'pA' }
  ];

  const res = repairDataset({ records, autoMergeGroups: [], contradictions });
  const repA = res.repairedRecords.find(r => r.id === 'pA');
  const repB = res.repairedRecords.find(r => r.id === 'pB');

  assert.strictEqual(repA.attributes.death_date, null, 'Invalid death date cleared');
  assert(!repB.relationships.some(r => r.targetId === 'pA'), 'Cycle edge broken');
});

// ----------------------------------------------------
// Suite 5: Quality Scoring & Evaluation
// ----------------------------------------------------
console.log('\nTest Suite 5: Quality Scoring & Benchmark Math');

test('calculateQualityScore computes all 4 dimensions accurately', () => {
  const records = [
    {
      id: 'p1',
      type: 'person',
      attributes: { name: 'Ada Lovelace', birth_date: '1815-12-10', birth_place: 'London', occupation: 'Mathematician' }
    }
  ];

  const score = calculateQualityScore(records, { duplicateCount: 0, contradictionCount: 0 });
  assert.strictEqual(score.completeness, 1.0);
  assert.strictEqual(score.uniqueness, 1.0);
  assert.strictEqual(score.validity, 1.0);
  assert.strictEqual(score.consistency, 1.0);
  assert.strictEqual(score.overall, 1.0);
});

// ----------------------------------------------------
// Suite 6: Audit Trail & Revert Mechanics
// ----------------------------------------------------
console.log('\nTest Suite 6: Audit Trail & 1-Click Field Rollback');

test('revertChangeOnRecord rolls back field to oldValue and updates status', () => {
  const record = {
    id: 'p1',
    attributes: { name: 'Alan Turing' }
  };

  const change = createChangeLogEntry({
    recordId: 'p1',
    targetField: 'attributes.name',
    oldValue: 'ALAN TURING',
    newValue: 'Alan Turing',
    rule: 'NORMALIZE_CASE'
  });

  assert.strictEqual(change.status, 'applied');

  // Revert change
  const reverted = revertChangeOnRecord(record, change);
  assert.strictEqual(reverted, true);
  assert.strictEqual(record.attributes.name, 'ALAN TURING');
  assert.strictEqual(change.status, 'reverted');

  // Re-apply change
  const reapplied = reapplyChangeOnRecord(record, change);
  assert.strictEqual(reapplied, true);
  assert.strictEqual(record.attributes.name, 'Alan Turing');
  assert.strictEqual(change.status, 'applied');
});

test('getRecordProvenance resolves origin records and transformations', () => {
  const canonical = {
    id: 'p1',
    canonicalId: 'p1',
    sourceIds: ['p1', 'p1_dup'],
    attributes: { name: 'Alan Turing' }
  };
  const originals = [
    { id: 'p1', attributes: { name: 'Alan Turing' } },
    { id: 'p1_dup', attributes: { name: 'Al Turing' } }
  ];
  const changes = [
    { changeId: 'c1', recordId: 'p1', rule: 'CANONICAL_ENTITY_MERGE', sourceIds: ['p1', 'p1_dup'] }
  ];

  const provenance = getRecordProvenance(canonical, originals, changes);
  assert.strictEqual(provenance.sourceRecords.length, 2);
  assert.strictEqual(provenance.transformations.length, 1);
});

// ----------------------------------------------------
// Suite 7: Full End-to-End Pipeline Execution
// ----------------------------------------------------
console.log('\nTest Suite 7: End-to-End Pipeline on Corrupted Dataset');

await testAsync('executePipeline finishes in < 1000ms with high precision and recall', async () => {
  const pkg = createDatasetPackage(42);
  const startTime = Date.now();

  const progressEvents = [];
  const result = await executePipeline(pkg.corrupted, (prog) => {
    progressEvents.push(prog.stage);
  });

  const durationMs = Date.now() - startTime;
  console.log(`    -> Execution Time: ${durationMs}ms`);
  console.log(`    -> Quality Score Before: ${result.qualityBefore.percentages.overall}%`);
  console.log(`    -> Quality Score After: ${result.qualityAfter.percentages.overall}%`);
  console.log(`    -> Precision: ${(result.benchmark.precision * 100).toFixed(1)}%`);
  console.log(`    -> Recall: ${(result.benchmark.recall * 100).toFixed(1)}%`);
  console.log(`    -> F1-Score: ${(result.benchmark.f1 * 100).toFixed(1)}%`);
  console.log(`    -> Duplicate Pairs Detected: ${result.duplicatePairs.length}`);
  console.log(`    -> Contradictions Detected: ${result.contradictions.length}`);
  console.log(`    -> Total Audit Changes Logged: ${result.changes.length}`);

  assert(durationMs < 1000, `Execution time (${durationMs}ms) must be under 1000ms for responsiveness`);
  assert(result.qualityAfter.overall > result.qualityBefore.overall, 'Quality score must improve after repair');
  assert(result.benchmark.precision >= 0.90, `Precision (${result.benchmark.precision}) should be >= 0.90`);
  assert(result.benchmark.recall >= 0.85, `Recall (${result.benchmark.recall}) should be >= 0.85`);
  assert(result.duplicatePairs.length >= 15, 'Should identify all injected duplicate pairs');
  assert(result.contradictions.length >= 10, 'Should identify injected domain contradictions');
  assert(progressEvents.includes('profiling'));
  assert(progressEvents.includes('normalizing'));
  assert(progressEvents.includes('deduplicating'));
  assert(progressEvents.includes('contradictions'));
  assert(progressEvents.includes('repairing'));
  assert(progressEvents.includes('scoring'));
});

console.log('\n====================================================');
console.log(`--- ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY! ---`);
console.log('====================================================\n');
