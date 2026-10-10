/**
 * Knowledge Repair Tool - Central Reactive State Store & Persistence Bridge
 * 
 * Coordinates:
 * - Active dataset, original records, repaired canonical records
 * - In-memory pipeline results (issues, duplicate pairs, contradictions, audit logs, quality scores)
 * - Automatic background syncing to Firebase Firestore / local IndexedDB
 * - Toast notification manager
 */

import {
  saveOriginalRecords,
  saveRepairedRecords,
  saveChangeLog,
  saveIssues,
  saveQualitySnapshot,
  updateIssueStatus,
  onConnectionStatusChange
} from './firebase.js';

import { executePipeline } from './pipeline/worker.js';

// Global application state
export const state = {
  datasetId: 'default_dataset',
  datasetName: 'No Dataset Loaded',
  records: [],
  groundTruthMutations: [],
  isAnalyzed: false,
  isAnalyzing: false,
  pipelineProgress: null,
  
  // Pipeline artifacts
  profileBefore: null,
  qualityBefore: null,
  qualityAfter: null,
  benchmark: null,
  duplicatePairs: [],
  autoMergeGroups: [],
  contradictions: [],
  repairedRecords: [],
  changes: [],
  issues: [],
  
  // Connection info
  connection: {
    isConfigured: false,
    isConnected: false,
    mode: 'local'
  }
};

const listeners = new Set();

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyStateChange() {
  for (const listener of listeners) {
    try {
      listener(state);
    } catch (e) {
      console.warn('State listener error:', e);
    }
  }
}

// Track connection status
onConnectionStatusChange((status) => {
  state.connection = {
    isConfigured: status.isConfigured,
    isConnected: status.isConnected,
    mode: status.isConnected ? 'firestore' : 'local'
  };
  if (status.error) {
    showToast(`Firestore Alert: ${status.error}. Operating in local storage mode.`, 'danger', 6000);
  }
  notifyStateChange();
});

/**
 * Toast Notification Dispatcher
 */
export function showToast(message, type = 'info', duration = 4000) {
  if (typeof document === 'undefined') {
    console.log(`[Toast ${type}] ${message}`);
    return;
  }
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">
      ${type === 'success' ? '✓' : type === 'danger' ? '✕' : 'ℹ'}
    </span>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Loads a dataset into memory and syncs to persistence
 */
export async function loadDataset({
  datasetId = `dataset_${Date.now()}`,
  datasetName = 'Custom Dataset',
  records = [],
  groundTruthMutations = []
}) {
  state.datasetId = datasetId;
  state.datasetName = datasetName;
  state.records = records;
  state.groundTruthMutations = groundTruthMutations;
  state.isAnalyzed = false;
  state.isAnalyzing = false;
  
  // Reset previous analysis artifacts
  state.profileBefore = null;
  state.qualityBefore = null;
  state.qualityAfter = null;
  state.benchmark = null;
  state.duplicatePairs = [];
  state.autoMergeGroups = [];
  state.contradictions = [];
  state.repairedRecords = [];
  state.changes = [];
  state.issues = [];

  notifyStateChange();

  // Background mirror to persistence
  try {
    await saveOriginalRecords(datasetId, records);
    showToast(`Loaded ${records.length} records into workspace`, 'success');
  } catch (err) {
    console.warn('Failed to save original records to store:', err);
  }
}

/**
 * Triggers the Knowledge Repair Web Worker Pipeline
 */
export async function runPipeline() {
  if (state.records.length === 0) {
    showToast('Please load a dataset before running the repair pipeline', 'warning');
    return;
  }

  state.isAnalyzing = true;
  state.pipelineProgress = { stage: 'init', progress: 5, message: 'Initializing pipeline...' };
  notifyStateChange();

  try {
    let result;

    // Check if browser Web Worker is supported and works
    if (typeof Worker !== 'undefined') {
      try {
        result = await new Promise((resolve, reject) => {
          const worker = new Worker(new URL('./pipeline/worker.js', import.meta.url), { type: 'module' });
          worker.onmessage = (e) => {
            const { type, stage, progress, message, result: workerResult, error } = e.data || {};
            if (type === 'PROGRESS') {
              state.pipelineProgress = { stage, progress, message };
              notifyStateChange();
            } else if (type === 'COMPLETE') {
              worker.terminate();
              resolve(workerResult);
            } else if (type === 'ERROR') {
              worker.terminate();
              reject(new Error(error));
            }
          };
          worker.onerror = (err) => {
            worker.terminate();
            reject(err);
          };
          worker.postMessage({
            type: 'RUN_PIPELINE',
            payload: {
              records: state.records,
              groundTruthMutations: state.groundTruthMutations
            }
          });
        });
      } catch (workerErr) {
        console.warn('Worker execution failed, falling back to direct main-thread run:', workerErr);
        result = await executePipeline({
          records: state.records,
          groundTruthMutations: state.groundTruthMutations
        }, (prog) => {
          state.pipelineProgress = prog;
          notifyStateChange();
        });
      }
    } else {
      result = await executePipeline({
        records: state.records,
        groundTruthMutations: state.groundTruthMutations
      }, (prog) => {
        state.pipelineProgress = prog;
        notifyStateChange();
      });
    }

    // Commit results to state
    state.profileBefore = result.profileBefore;
    state.qualityBefore = result.qualityBefore;
    state.qualityAfter = result.qualityAfter;
    state.benchmark = result.benchmark;
    state.duplicatePairs = result.duplicatePairs;
    state.autoMergeGroups = result.autoMergeGroups;
    state.contradictions = result.contradictions;
    state.repairedRecords = result.repairedRecords;
    state.changes = result.changes;
    state.issues = result.issues;
    state.isAnalyzed = true;
    state.isAnalyzing = false;
    state.pipelineProgress = null;

    notifyStateChange();

    // Background sync to Firestore / local IndexedDB
    try {
      await Promise.all([
        saveRepairedRecords(state.datasetId, state.repairedRecords),
        saveChangeLog(state.datasetId, state.changes),
        saveIssues(state.datasetId, state.issues),
        saveQualitySnapshot(state.datasetId, 'before', state.qualityBefore),
        saveQualitySnapshot(state.datasetId, 'after', state.qualityAfter)
      ]);
    } catch (e) {
      console.warn('Persistence sync error after pipeline:', e);
    }

    showToast(`Repair complete! Quality score improved to ${state.qualityAfter.percentages.overall}%`, 'success');
  } catch (err) {
    state.isAnalyzing = false;
    state.pipelineProgress = null;
    notifyStateChange();
    showToast(`Pipeline failed: ${err.message}`, 'danger');
    console.error('Pipeline execution error:', err);
  }
}

/**
 * Resolves or ignores an issue
 */
export async function setIssueStatus(issueId, newStatus) {
  const issue = state.issues.find(i => i.issueId === issueId);
  if (!issue) return;

  issue.status = newStatus;
  notifyStateChange();

  try {
    await updateIssueStatus(state.datasetId, issueId, newStatus);
    showToast(`Issue ${issueId} marked as ${newStatus}`, 'info');
  } catch (e) {
    console.warn('Error updating issue status:', e);
  }
}
