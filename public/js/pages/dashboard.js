/**
 * Knowledge Repair Tool - Dashboard Page
 * 
 * Provides:
 * - Dataset ingestion controls (One-click corrupted/clean sample, custom JSON/CSV upload)
 * - Executive metrics (Total records, issues count, 4-dimension quality score)
 * - Interactive "Run Knowledge Repair Pipeline" CTA with real-time multi-stage progress
 * - Quick jump cards to Issues and Duplicates
 */

import { state, subscribe, loadDataset, runPipeline, showToast } from '../state.js';
import { parseJsonUpload, parseCsvUpload } from '../utils.js';
import { createDatasetPackage } from '../../data/generateDataset.js';

export function renderDashboard(container) {
  function update() {
    const isAnalyzed = state.isAnalyzed;
    const isAnalyzing = state.isAnalyzing;
    const records = state.records;
    const totalRecords = records.length;
    
    // Type counts
    const peopleCount = records.filter(r => r.type === 'person').length;
    const placesCount = records.filter(r => r.type === 'place').length;
    const eventsCount = records.filter(r => r.type === 'event').length;

    // Issues count
    const totalIssues = state.issues.length;
    const criticalIssues = state.issues.filter(i => i.severity === 'critical' && i.status === 'open').length;
    const warningIssues = state.issues.filter(i => i.severity === 'warning' && i.status === 'open').length;

    // Quality metrics
    const quality = state.qualityAfter || state.qualityBefore || {
      percentages: { overall: 0, completeness: 0, uniqueness: 0, validity: 0, consistency: 0 }
    };

    container.innerHTML = `
      <div class="dashboard-page">
        <!-- Top Action & Ingestion Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;">
          <div>
            <h1 style="font-size: 1.75rem; font-weight: 700; letter-spacing: -0.02em;">Data Quality Dashboard</h1>
            <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 4px;">
              Explainable entity resolution, anomaly detection, and automated repair workbench
            </p>
          </div>

          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button id="btn-load-corrupted" class="btn btn-secondary btn-sm" ${isAnalyzing ? 'disabled' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Load Sample Corrupted (268 Records)
            </button>

            <button id="btn-load-clean" class="btn btn-secondary btn-sm" ${isAnalyzing ? 'disabled' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              Load Clean Ground Truth (250)
            </button>

            <label class="btn btn-secondary btn-sm" style="cursor: pointer; margin-bottom: 0;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path>
                <path d="M12 12v9"></path>
                <path d="m16 16-4-4-4 4"></path>
              </svg>
              Upload JSON/CSV
              <input type="file" id="file-uploader" accept=".json,.csv" style="display: none;">
            </label>
          </div>
        </div>

        <!-- Pipeline Progress Modal / Card -->
        ${isAnalyzing ? `
          <div class="card" style="border-color: var(--accent-primary); background: rgba(59, 130, 246, 0.08); margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-weight: 600; font-size: 0.875rem; color: #93c5fd; display: flex; align-items: center; gap: 8px;">
                <span class="status-dot"></span>
                Web Worker Pipeline Running...
              </span>
              <span style="font-family: var(--font-mono); font-size: 0.875rem; font-weight: 600; color: #93c5fd;">
                ${state.pipelineProgress?.progress || 10}%
              </span>
            </div>
            <div class="progress-container">
              <div class="progress-bar-fill" style="width: ${state.pipelineProgress?.progress || 10}%;"></div>
            </div>
            <div style="font-size: 0.8125rem; color: var(--text-secondary); font-style: italic;">
              ${state.pipelineProgress?.message || 'Processing dataset off-thread...'}
            </div>
          </div>
        ` : ''}

        <!-- Metric Stat Cards -->
        <div class="metrics-row">
          <div class="metric-card">
            <div class="metric-header">
              <span class="metric-title">Ingested Records</span>
              <div class="metric-icon-wrap">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
              </div>
            </div>
            <div class="metric-value">${totalRecords}</div>
            <div class="metric-delta">
              ${totalRecords > 0 ? `${peopleCount} people · ${placesCount} places · ${eventsCount} events` : 'No dataset active'}
            </div>
          </div>

          <div class="metric-card ${criticalIssues > 0 ? 'danger' : 'success'}">
            <div class="metric-header">
              <span class="metric-title">Flagged Inconsistencies</span>
              <div class="metric-icon-wrap">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
              </div>
            </div>
            <div class="metric-value">${totalIssues}</div>
            <div class="metric-delta ${criticalIssues > 0 ? 'negative' : 'positive'}">
              ${isAnalyzed ? `${criticalIssues} critical · ${warningIssues} warnings` : 'Run pipeline to analyze'}
            </div>
          </div>

          <div class="metric-card ${quality.percentages.overall >= 90 ? 'success' : 'warning'}">
            <div class="metric-header">
              <span class="metric-title">Quality Health Score</span>
              <div class="metric-icon-wrap">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
                </svg>
              </div>
            </div>
            <div class="metric-value">${isAnalyzed ? `${quality.percentages.overall}%` : '--'}</div>
            <div class="metric-delta">
              ${isAnalyzed && state.qualityBefore ? `Baseline was ${state.qualityBefore.percentages.overall}%` : '4-dimension scoring'}
            </div>
          </div>

          <div class="metric-card success">
            <div class="metric-header">
              <span class="metric-title">Repairs Staged</span>
              <div class="metric-icon-wrap">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
            </div>
            <div class="metric-value">${isAnalyzed ? state.changes.length : '0'}</div>
            <div class="metric-delta positive">
              ${isAnalyzed ? `${state.duplicatePairs.length} duplicates · 100% traceable` : 'Awaiting repair run'}
            </div>
          </div>
        </div>

        <!-- Main Action CTA Card -->
        <div class="card" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 20px; background: linear-gradient(135deg, rgba(17, 24, 39, 0.9) 0%, rgba(30, 58, 138, 0.25) 100%);">
          <div style="max-width: 650px;">
            <div class="card-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="m12 14 4-4"></path>
                <path d="M3.34 19a10 10 0 1 1 17.32 0"></path>
              </svg>
              Client-Side Knowledge Repair Pipeline
            </div>
            <div style="font-size: 0.875rem; color: var(--text-secondary); line-height: 1.6;">
              Runs field profiling, string & ISO date normalization, blocking-key fuzzy duplicate resolution (Levenshtein + Jaro-Winkler), genealogical cycle breaking, and evidence-based missing field imputation off the main UI thread.
            </div>
          </div>

          <div style="display: flex; gap: 12px; align-items: center;">
            <button id="btn-run-pipeline" class="btn btn-primary" style="padding: 12px 24px; font-size: 0.9375rem;" ${totalRecords === 0 || isAnalyzing ? 'disabled' : ''}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              ${isAnalyzed ? 'Re-run Repair Pipeline' : 'Run Knowledge Repair Pipeline'}
            </button>
          </div>
        </div>

        <!-- Two Column Detailed Insights Section -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px;">
          <!-- Left Column: 4-Dimension Quality Health -->
          <div class="card">
            <div class="card-title">
              Quality Dimension Breakdown
            </div>
            <div class="card-subtitle">
              Quantified across 4 foundational dimensions with zero subjective guessing
            </div>

            <div class="dimension-bars">
              <div class="dimension-item">
                <div class="dimension-labels">
                  <span class="dim-name">Completeness (Required Attributes)</span>
                  <span class="dim-score">${quality.percentages.completeness}%</span>
                </div>
                <div class="progress-container">
                  <div class="progress-bar-fill" style="width: ${quality.percentages.completeness}%; background: #3b82f6;"></div>
                </div>
              </div>

              <div class="dimension-item">
                <div class="dimension-labels">
                  <span class="dim-name">Uniqueness (Canonical Entity Deduplication)</span>
                  <span class="dim-score">${quality.percentages.uniqueness}%</span>
                </div>
                <div class="progress-container">
                  <div class="progress-bar-fill" style="width: ${quality.percentages.uniqueness}%; background: #10b981;"></div>
                </div>
              </div>

              <div class="dimension-item">
                <div class="dimension-labels">
                  <span class="dim-name">Validity (ISO Dates, Clean Formats)</span>
                  <span class="dim-score">${quality.percentages.validity}%</span>
                </div>
                <div class="progress-container">
                  <div class="progress-bar-fill" style="width: ${quality.percentages.validity}%; background: #f59e0b;"></div>
                </div>
              </div>

              <div class="dimension-item">
                <div class="dimension-labels">
                  <span class="dim-name">Consistency (Domain Rules & Acyclic Graph)</span>
                  <span class="dim-score">${quality.percentages.consistency}%</span>
                </div>
                <div class="progress-container">
                  <div class="progress-bar-fill" style="width: ${quality.percentages.consistency}%; background: #8b5cf6;"></div>
                </div>
              </div>
            </div>

            ${state.benchmark ? `
              <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border-subtle); display: flex; justify-content: space-between; font-size: 0.8125rem;">
                <div><strong>Precision:</strong> ${(state.benchmark.precision * 100).toFixed(1)}%</div>
                <div><strong>Recall:</strong> ${(state.benchmark.recall * 100).toFixed(1)}%</div>
                <div><strong>F1-Score:</strong> ${(state.benchmark.f1 * 100).toFixed(1)}%</div>
              </div>
            ` : ''}
          </div>

          <!-- Right Column: Quick Issues Snapshot -->
          <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <div class="card-title" style="margin-bottom: 0;">Identified Issues</div>
              <a href="#issues" style="color: var(--accent-primary); font-size: 0.8125rem; text-decoration: none; font-weight: 500;">
                View All (${totalIssues}) →
              </a>
            </div>
            <div class="card-subtitle">
              Prioritized anomalies requiring inspection or verification
            </div>

            ${totalIssues === 0 ? `
              <div style="text-align: center; padding: 40px 20px; color: var(--text-muted); font-size: 0.875rem;">
                ${totalRecords === 0 ? 'No dataset loaded. Click "Load Sample Corrupted" above.' : 'No open issues detected or pipeline has not been executed yet.'}
              </div>
            ` : `
              <div style="display: flex; flex-direction: column; gap: 10px;">
                ${state.issues.slice(0, 5).map(issue => `
                  <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 10px 12px; display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
                      <span class="badge ${issue.severity === 'critical' ? 'badge-critical' : 'badge-warning'}">
                        ${issue.severity}
                      </span>
                      <span style="font-size: 0.8125rem; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 340px;">
                        ${issue.description}
                      </span>
                    </div>
                    <a href="${issue.type === 'duplicate' ? '#duplicates' : '#issues'}" class="btn btn-secondary btn-sm" style="font-size: 0.75rem; padding: 3px 8px;">
                      Inspect
                    </a>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>
      </div>
    `;

    // Bind event handlers
    const btnLoadCorrupted = container.querySelector('#btn-load-corrupted');
    const btnLoadClean = container.querySelector('#btn-load-clean');
    const btnRunPipeline = container.querySelector('#btn-run-pipeline');
    const fileUploader = container.querySelector('#file-uploader');

    if (btnLoadCorrupted) {
      btnLoadCorrupted.addEventListener('click', async () => {
        try {
          const pkg = createDatasetPackage(42);
          await loadDataset({
            datasetId: `sample_corrupted_${Date.now()}`,
            datasetName: 'Corrupted Historical Dataset',
            records: pkg.corrupted.records,
            groundTruthMutations: pkg.corrupted.groundTruthMutations
          });
        } catch (e) {
          showToast(`Failed to load dataset: ${e.message}`, 'danger');
        }
      });
    }

    if (btnLoadClean) {
      btnLoadClean.addEventListener('click', async () => {
        try {
          const pkg = createDatasetPackage(42);
          await loadDataset({
            datasetId: `sample_clean_${Date.now()}`,
            datasetName: 'Clean Benchmark Dataset',
            records: pkg.clean.records,
            groundTruthMutations: []
          });
        } catch (e) {
          showToast(`Failed to load clean dataset: ${e.message}`, 'danger');
        }
      });
    }

    if (btnRunPipeline) {
      btnRunPipeline.addEventListener('click', () => {
        runPipeline();
      });
    }

    if (fileUploader) {
      fileUploader.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
          let records = [];
          if (file.name.endsWith('.json')) {
            const parsed = await parseJsonUpload(file);
            records = Array.isArray(parsed) ? parsed : (parsed.records || []);
          } else if (file.name.endsWith('.csv')) {
            records = await parseCsvUpload(file);
          }

          if (records.length === 0) {
            showToast('Uploaded file contained no valid records', 'warning');
            return;
          }

          await loadDataset({
            datasetId: `upload_${Date.now()}`,
            datasetName: file.name,
            records,
            groundTruthMutations: []
          });
        } catch (err) {
          showToast(`Upload failed: ${err.message}`, 'danger');
        }
      });
    }
  }

  // Subscribe for reactive updates
  const unsubscribe = subscribe(update);
  update();

  return unsubscribe;
}
