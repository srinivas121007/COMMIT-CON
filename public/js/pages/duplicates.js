/**
 * Knowledge Repair Tool - Duplicates Resolution Page
 * 
 * Provides:
 * - Side-by-side comparative inspection of candidate duplicate entities
 * - Highlighting of matching vs discordant attributes
 * - Match confidence gauge & natural-language reasoning
 * - Interactive actions: Approve Merge, Reject Duplicate, Custom Field Merge
 */

import { state, subscribe, showToast } from '../state.js';
import { createChangeLogEntry } from '../pipeline/audit.js';

export function renderDuplicates(container) {
  let filterCategory = 'all'; // 'all' | 'auto_merge' | 'review'
  let filterStatus = 'all';   // 'all' | 'pending' | 'resolved'
  let pairDecisions = new Map(); // pairIndex -> 'approved' | 'rejected'

  function update() {
    const pairs = state.duplicatePairs || [];

    const filteredPairs = pairs.map((pair, idx) => ({ ...pair, originalIndex: idx })).filter(item => {
      const decision = pairDecisions.get(item.originalIndex);
      if (filterCategory !== 'all' && item.category !== filterCategory) return false;
      if (filterStatus === 'pending' && decision) return false;
      if (filterStatus === 'resolved' && !decision) return false;
      return true;
    });

    const autoMergeCount = pairs.filter(p => p.category === 'auto_merge').length;
    const reviewCount = pairs.filter(p => p.category === 'review').length;

    container.innerHTML = `
      <div class="duplicates-page">
        <!-- Page Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;">
          <div>
            <h1 style="font-size: 1.75rem; font-weight: 700; letter-spacing: -0.02em;">Duplicate Entity Resolution</h1>
            <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 4px;">
              Side-by-side comparative entity disambiguation with explainable evidence scoring
            </p>
          </div>

          <div style="display: flex; gap: 10px; align-items: center;">
            <span class="match-score-pill high">${autoMergeCount} Auto-Merge Eligible (&ge;90%)</span>
            <span class="match-score-pill">${reviewCount} Review Required (70-90%)</span>
          </div>
        </div>

        <!-- Filter Bar -->
        <div class="card" style="padding: 16px; margin-bottom: 20px;">
          <div class="filter-bar" style="margin-bottom: 0;">
            <select id="filter-dup-cat" class="select-filter">
              <option value="all" ${filterCategory === 'all' ? 'selected' : ''}>All Confidence Tiers</option>
              <option value="auto_merge" ${filterCategory === 'auto_merge' ? 'selected' : ''}>Auto-Merge (&ge;90%)</option>
              <option value="review" ${filterCategory === 'review' ? 'selected' : ''}>Manual Review (70-90%)</option>
            </select>

            <select id="filter-dup-status" class="select-filter">
              <option value="all" ${filterStatus === 'all' ? 'selected' : ''}>All Statuses</option>
              <option value="pending" ${filterStatus === 'pending' ? 'selected' : ''}>Pending Action</option>
              <option value="resolved" ${filterStatus === 'resolved' ? 'selected' : ''}>Decided / Merged</option>
            </select>

            <div style="margin-left: auto; display: flex; gap: 10px;">
              <button id="btn-approve-all-auto" class="btn btn-primary btn-sm" ${autoMergeCount === 0 ? 'disabled' : ''}>
                Approve All &ge;90% Candidates
              </button>
            </div>
          </div>
        </div>

        <!-- Duplicate Pair Cards Grid -->
        ${filteredPairs.length === 0 ? `
          <div class="card" style="text-align: center; padding: 48px 20px; color: var(--text-muted);">
            ${pairs.length === 0 ? 'No duplicate entities detected. Run the repair pipeline on the Dashboard first.' : 'No duplicate candidate pairs match the active filter.'}
          </div>
        ` : `
          <div class="duplicate-pair-grid">
            ${filteredPairs.map(item => {
              const recA = item.recordA;
              const recB = item.recordB;
              const decision = pairDecisions.get(item.originalIndex);
              const scorePct = Math.round(item.score * 100);

              const attrsA = recA.attributes || {};
              const attrsB = recB.attributes || {};

              const allKeys = Array.from(new Set([...Object.keys(attrsA), ...Object.keys(attrsB)]));

              return `
                <div class="duplicate-card" style="${decision === 'approved' ? 'border-color: rgba(16, 185, 129, 0.4); background: rgba(16, 185, 129, 0.03);' : decision === 'rejected' ? 'opacity: 0.6;' : ''}">
                  <div class="duplicate-header">
                    <div style="display: flex; align-items: center; gap: 12px;">
                      <span class="match-score-pill ${scorePct >= 90 ? 'high' : ''}">
                        ${scorePct}% Match
                      </span>
                      <span class="badge ${item.category === 'auto_merge' ? 'badge-critical' : 'badge-warning'}">
                        ${item.category === 'auto_merge' ? 'Auto-Merge Recommended' : 'Manual Review'}
                      </span>
                      ${decision ? `
                        <span class="badge ${decision === 'approved' ? 'badge-success' : 'badge-neutral'}">
                          ${decision.toUpperCase()}
                        </span>
                      ` : ''}
                    </div>

                    <div style="font-size: 0.75rem; font-family: var(--font-mono); color: var(--text-secondary);">
                      Comparing ${recA.id} ↔ ${recB.id}
                    </div>
                  </div>

                  <div class="duplicate-body">
                    <!-- Left Record A -->
                    <div class="record-box">
                      <div class="record-box-title">
                        <span>Record A: ${recA.id}</span>
                        <span style="font-size: 0.6875rem; color: var(--text-muted);">${recA.source || 'Primary'}</span>
                      </div>
                      ${allKeys.map(k => {
                        const vA = attrsA[k] !== undefined && attrsA[k] !== null ? String(attrsA[k]) : 'null';
                        const vB = attrsB[k] !== undefined && attrsB[k] !== null ? String(attrsB[k]) : 'null';
                        const isDiff = vA !== vB;
                        return `
                          <div class="attr-row">
                            <span class="attr-name">${k}</span>
                            <span class="attr-val ${isDiff ? 'highlight-diff' : ''}">${vA}</span>
                          </div>
                        `;
                      }).join('')}
                    </div>

                    <!-- Right Record B -->
                    <div class="record-box">
                      <div class="record-box-title">
                        <span>Record B: ${recB.id}</span>
                        <span style="font-size: 0.6875rem; color: var(--text-muted);">${recB.source || 'Secondary'}</span>
                      </div>
                      ${allKeys.map(k => {
                        const vA = attrsA[k] !== undefined && attrsA[k] !== null ? String(attrsA[k]) : 'null';
                        const vB = attrsB[k] !== undefined && attrsB[k] !== null ? String(attrsB[k]) : 'null';
                        const isDiff = vA !== vB;
                        return `
                          <div class="attr-row">
                            <span class="attr-name">${k}</span>
                            <span class="attr-val ${isDiff ? 'highlight-diff' : ''}">${vB}</span>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  </div>

                  <div class="duplicate-footer">
                    <div class="duplicate-reason-text">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                      </svg>
                      ${item.reason}
                    </div>

                    <div class="duplicate-actions">
                      <button class="btn btn-secondary btn-sm btn-custom-merge" data-idx="${item.originalIndex}">
                        Custom Merge...
                      </button>
                      <button class="btn btn-secondary btn-sm btn-reject-dup" data-idx="${item.originalIndex}" style="color: var(--danger);">
                        Keep Distinct
                      </button>
                      <button class="btn btn-primary btn-sm btn-approve-dup" data-idx="${item.originalIndex}">
                        Approve Merge
                      </button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>

      <!-- Custom Field Merge Modal Container -->
      <div id="custom-merge-modal-wrap"></div>
    `;

    // Bind event handlers
    const filterCat = container.querySelector('#filter-dup-cat');
    const filterStat = container.querySelector('#filter-dup-status');
    const btnApproveAll = container.querySelector('#btn-approve-all-auto');

    if (filterCat) {
      filterCat.addEventListener('change', (e) => {
        filterCategory = e.target.value;
        update();
      });
    }

    if (filterStat) {
      filterStat.addEventListener('change', (e) => {
        filterStatus = e.target.value;
        update();
      });
    }

    if (btnApproveAll) {
      btnApproveAll.addEventListener('click', () => {
        pairs.forEach((p, idx) => {
          if (p.category === 'auto_merge') {
            pairDecisions.set(idx, 'approved');
          }
        });
        showToast(`Approved all ${autoMergeCount} auto-merge candidate pairs`, 'success');
        update();
      });
    }

    // Approve merge
    container.querySelectorAll('.btn-approve-dup').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        pairDecisions.set(idx, 'approved');
        const p = pairs[idx];
        showToast(`Merged ${p.recordA.id} and ${p.recordB.id}`, 'success');
        update();
      });
    });

    // Reject duplicate
    container.querySelectorAll('.btn-reject-dup').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        pairDecisions.set(idx, 'rejected');
        const p = pairs[idx];
        showToast(`Marked ${p.recordA.id} and ${p.recordB.id} as distinct`, 'info');
        update();
      });
    });

    // Custom merge modal
    container.querySelectorAll('.btn-custom-merge').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        openCustomMergeModal(pairs[idx], idx);
      });
    });
  }

  function openCustomMergeModal(pair, idx) {
    const modalWrap = container.querySelector('#custom-merge-modal-wrap');
    if (!modalWrap) return;

    const recA = pair.recordA;
    const recB = pair.recordB;
    const attrsA = recA.attributes || {};
    const attrsB = recB.attributes || {};
    const keys = Array.from(new Set([...Object.keys(attrsA), ...Object.keys(attrsB)]));

    modalWrap.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-dialog">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3 style="font-size: 1.125rem; font-weight: 600;">Custom Field Merge</h3>
            <button id="modal-close" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.25rem;">✕</button>
          </div>
          <p style="font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 20px;">
            Select which attribute value to preserve in the canonical record for ${recA.id} and ${recB.id}:
          </p>

          <form id="custom-merge-form" style="display: flex; flex-direction: column; gap: 14px;">
            ${keys.map(k => {
              const valA = attrsA[k] !== undefined && attrsA[k] !== null ? String(attrsA[k]) : 'null';
              const valB = attrsB[k] !== undefined && attrsB[k] !== null ? String(attrsB[k]) : 'null';
              return `
                <div style="background: rgba(0, 0, 0, 0.2); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 10px 12px;">
                  <div style="font-weight: 600; font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 6px;">
                    ${k}
                  </div>
                  <div style="display: flex; gap: 16px; font-size: 0.8125rem;">
                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                      <input type="radio" name="attr_${k}" value="A" checked>
                      <span>A: <code>${valA}</code></span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                      <input type="radio" name="attr_${k}" value="B">
                      <span>B: <code>${valB}</code></span>
                    </label>
                  </div>
                </div>
              `;
            }).join('')}

            <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;">
              <button type="button" id="modal-cancel" class="btn btn-secondary btn-sm">Cancel</button>
              <button type="submit" class="btn btn-primary btn-sm">Save Custom Canonical</button>
            </div>
          </form>
        </div>
      </div>
    `;

    modalWrap.querySelector('#modal-close').addEventListener('click', () => modalWrap.innerHTML = '');
    modalWrap.querySelector('#modal-cancel').addEventListener('click', () => modalWrap.innerHTML = '');
    modalWrap.querySelector('#custom-merge-form').addEventListener('submit', (e) => {
      e.preventDefault();
      pairDecisions.set(idx, 'approved');
      modalWrap.innerHTML = '';
      showToast(`Custom canonical merge applied for ${recA.id}`, 'success');
      update();
    });
  }

  const unsubscribe = subscribe(update);
  update();
  return unsubscribe;
}
