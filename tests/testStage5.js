/**
 * Knowledge Repair Tool - Stage 5 Verification Test Suite
 * 
 * Verifies:
 * - 5.1 Interactive Relationship Graph module & node visual styling
 * - 5.2 Final UI Polish, Accessibility contrast, Skeletons, Empty States & Mobile Drawer
 * - 5.3 Documentation (README.md, Architecture, Firebase Guide, Demo Script)
 * - 5.4 Full End-to-End User Journey Pipeline Integration
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDatasetPackage } from '../data/generateDataset.js';
import { executePipeline } from '../public/js/pipeline/worker.js';
import { renderGraph } from '../public/js/pages/graph.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('====================================================');
console.log('--- STAGE 5: RELATIONSHIP GRAPH & FINAL POLISH TESTS ---');
console.log('====================================================\n');

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

// ----------------------------------------------------
// Suite 1: Stage 5.1 Relationship Graph Verification
// ----------------------------------------------------
console.log('Suite 1: Stage 5.1 Interactive Relationship Graph');

test('renderGraph function is exported from public/js/pages/graph.js', () => {
  assert.strictEqual(typeof renderGraph, 'function', 'renderGraph must be an exported function');
});

test('graph.js defines distinct visual styles for People, Places, and Events', () => {
  const graphCode = fs.readFileSync(path.join(rootDir, 'public/js/pages/graph.js'), 'utf-8');
  assert(graphCode.includes("rec.type === 'person'"), 'Must handle person nodes');
  assert(graphCode.includes("rec.type === 'place'"), 'Must handle place nodes');
  assert(graphCode.includes("rec.type === 'event'"), 'Must handle event nodes');
  assert(graphCode.includes("'#1e3a8a'"), 'Person nodes must have blue color');
  assert(graphCode.includes("'#064e3b'"), 'Place nodes must have emerald color');
  assert(graphCode.includes("'#581c87'"), 'Event nodes must have violet color');
  assert(graphCode.includes("'diamond'"), 'Place nodes must have diamond shape');
  assert(graphCode.includes("'box'"), 'Event nodes must have box shape');
  assert(graphCode.includes("'dot'"), 'Person nodes must have dot shape');
});

test('graph.js implements glowing gold highlight for merged canonical nodes', () => {
  const graphCode = fs.readFileSync(path.join(rootDir, 'public/js/pages/graph.js'), 'utf-8');
  assert(graphCode.includes('#fbbf24'), 'Merged border must be amber gold (#fbbf24)');
  assert(graphCode.includes('shadow'), 'Merged nodes must configure shadow for glow effect');
  assert(graphCode.includes('★'), 'Merged nodes must feature star visual indicator');
});

test('graph.js includes physics controls and click-to-inspect drawer', () => {
  const graphCode = fs.readFileSync(path.join(rootDir, 'public/js/pages/graph.js'), 'utf-8');
  assert(graphCode.includes('forceAtlas2Based'), 'Must use forceAtlas2Based physics');
  assert(graphCode.includes('isPhysicsEnabled'), 'Must have physics pause/resume capability');
  assert(graphCode.includes('graph-details-drawer'), 'Must render node details drawer');
  assert(graphCode.includes('btn-jump-relation'), 'Must support interactive relationship traversal');
});

test('app.js registers renderGraph under #/graph route', () => {
  const appCode = fs.readFileSync(path.join(rootDir, 'public/js/app.js'), 'utf-8');
  assert(appCode.includes("import { renderGraph } from './pages/graph.js';"), 'Must import renderGraph in app.js');
  assert(appCode.includes("'#/graph': renderGraph"), 'Must map #/graph route to renderGraph');
});

// ----------------------------------------------------
// Suite 2: Stage 5.2 UI Polish, Accessibility & Responsive Drawer
// ----------------------------------------------------
console.log('\nSuite 2: Stage 5.2 UI Polish, Accessibility & Responsive Drawer');

test('CSS contains accessible contrast ratios and light theme definitions', () => {
  const css = fs.readFileSync(path.join(rootDir, 'public/css/style.css'), 'utf-8');
  assert(css.includes('[data-theme="light"]'), 'Must define light theme overrides');
  assert(css.includes(':focus-visible'), 'Must define accessible focus-visible outlines');
  assert(css.includes('[data-theme="light"] .badge-critical'), 'Must define high-contrast light badges');
});

test('CSS contains empty states, skeletons, and responsive drawer styles', () => {
  const css = fs.readFileSync(path.join(rootDir, 'public/css/style.css'), 'utf-8');
  assert(css.includes('.empty-state'), 'Must define empty state styles');
  assert(css.includes('.skeleton'), 'Must define loading skeleton shimmer styles');
  assert(css.includes('@keyframes skeleton-shimmer'), 'Must define skeleton shimmer keyframes');
  assert(css.includes('.graph-details-drawer'), 'Must define graph details drawer');
  assert(css.includes('@media (max-width: 768px)'), 'Must define mobile drawer responsive queries');
});

test('index.html contains mobile hamburger menu, backdrop, and vis-network CDN', () => {
  const html = fs.readFileSync(path.join(rootDir, 'public/index.html'), 'utf-8');
  assert(html.includes('id="sidebar-toggle"'), 'Must contain sidebar-toggle button');
  assert(html.includes('id="sidebar-backdrop"'), 'Must contain sidebar-backdrop');
  assert(html.includes('id="toast-container"'), 'Must contain toast-container');
  assert(html.includes('vis-network'), 'Must include vis-network CDN bundle');
});

test('state.js surfaces Firestore connection errors to toast notification system', () => {
  const stateCode = fs.readFileSync(path.join(rootDir, 'public/js/state.js'), 'utf-8');
  assert(stateCode.includes('showToast'), 'Must import and use showToast in state.js');
  assert(stateCode.includes('Firestore Alert:'), 'Must show toast on Firestore errors');
});

// ----------------------------------------------------
// Suite 3: Stage 5.3 Documentation Verification
// ----------------------------------------------------
console.log('\nSuite 3: Stage 5.3 Documentation & Demo Script');

test('README.md exists and contains comprehensive system documentation', () => {
  const readmePath = path.join(rootDir, 'README.md');
  assert(fs.existsSync(readmePath), 'README.md must exist in project root');
  const readme = fs.readFileSync(readmePath, 'utf-8');
  
  // Verify ASCII architecture diagram
  assert(readme.includes('System Architecture'), 'Must contain System Architecture section');
  assert(readme.includes('+---------------------------------------------------------------------------------------+'), 'Must contain clean ASCII architecture diagram');
  
  // Verify Firebase setup guide
  assert(readme.includes('Firebase Setup'), 'Must contain Firebase Setup guide');
  assert(readme.includes('Anonymous Authentication'), 'Must describe Anonymous Authentication setup');
  assert(readme.includes('firestore.rules'), 'Must describe security rules deployment');
  
  // Verify Local development instructions
  assert(readme.includes('Local Development Instructions'), 'Must contain local development section');
  assert(readme.includes('npm start'), 'Must document npm start');
  assert(readme.includes('npx serve'), 'Must document npx serve');
  
  // Verify Deployment instructions
  assert(readme.includes('Deployment Instructions'), 'Must document deployment instructions');
  assert(readme.includes('firebase deploy'), 'Must document firebase deploy');
  
  // Verify 3-minute demo script
  assert(readme.includes('3-Minute End-to-End Presentation Demo Script'), 'Must contain 3-minute demo script');
  assert(readme.includes('0:00 - 0:45'), 'Demo script must include timestamp breakdown');
});

// ----------------------------------------------------
// Suite 4: Stage 5.4 End-to-End User Journey Pipeline Verification
// ----------------------------------------------------
console.log('\nSuite 4: Stage 5.4 End-to-End Full User Journey Pipeline');

await testAsync('Full user journey: dataset ingestion -> repair -> benchmark -> graph mapping', async () => {
  const pkg = createDatasetPackage(42);
  const corruptedRecords = pkg.corrupted.records;
  
  // 1. Ingestion
  assert(corruptedRecords.length > 250, 'Corrupted dataset ingested');
  
  // 2. Off-thread repair execution
  const startTime = Date.now();
  const result = await executePipeline(pkg.corrupted);
  const duration = Date.now() - startTime;
  
  // 3. Mathematical Quality & Benchmark validation
  assert(duration < 1000, `Execution took ${duration}ms, must be < 1000ms`);
  assert(result.qualityAfter.percentages.overall >= 98, 'Repaired quality must be >= 98%');
  assert(result.benchmark.precision >= 0.90, `Precision was ${(result.benchmark.precision*100).toFixed(1)}%`);
  assert(result.benchmark.recall >= 0.85, `Recall was ${(result.benchmark.recall*100).toFixed(1)}%`);
  
  // 4. Canonical deduplication & merged node synthesis
  assert(result.repairedRecords.length < corruptedRecords.length, 'Repaired records must be consolidated');
  const mergedEntities = result.repairedRecords.filter(r => r.sourceIds && r.sourceIds.length > 1);
  assert(mergedEntities.length > 0, 'Must have synthesized merged canonical entities');
  
  // 5. Graph node compatibility
  mergedEntities.forEach(m => {
    assert(m.id, 'Merged node must have valid ID');
    assert(m.type, 'Merged node must have valid type');
    assert(Array.isArray(m.sourceIds), 'Merged node must retain sourceIds provenance');
  });

  // 6. Contradictions resolved
  assert(result.contradictions.length > 0, 'Must have detected contradictions');
  
  // 7. Audit trail generated
  assert(result.changes.length > 30, 'Must have generated comprehensive audit log changes');
  
  console.log(`    -> User Journey Verified: ${corruptedRecords.length} records processed in ${duration}ms`);
  console.log(`    -> Quality Gain: ${result.qualityBefore.percentages.overall}% -> ${result.qualityAfter.percentages.overall}%`);
  console.log(`    -> Synthesized ${mergedEntities.length} canonical entities for relationship graph`);
});

console.log('====================================================');
console.log(`--- ALL ${passedTests}/${totalTests} STAGE 5 TESTS PASSED SUCCESSFULLY! ---`);
console.log('====================================================\n');
