/**
 * Knowledge Repair Tool - Audit Trail & Provenance Page
 * 
 * Provides:
 * - Comprehensive chronological change log table
 * - 1-Click instant field reversion (Rollback) & re-application
 * - Dynamic recalculation of quality metrics on reversion
 * - Lineage Modal: Inspect canonical records to trace source origins and transformation chains
 */

import { state, subscribe, showToast } from '../state.js';
import {
  revertChangeOnRecord,
  reapplyChangeOnRecord,
  getRecordProvenance
} from '../pipeline/audit.js';
import { calculateQualityScore } from '../pipeline/scoring.js';
import { updateChangeLogStatus } from '../firebase.js';

export function renderAuditTrail(container) {
  let searchFilter = '';
  let statusFilter = 'all'; // 'all' | 'applied' | 'reverted'
  let ruleFilter = 'all';

  function update() {
    const changes = state.changes || [];

    const filtered = changes.filter(c => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (ruleFilter !== 'all' && c.rule !== ruleFilter) return false;
      if (searchFilter) {
        const query = searchFilter.toLowerCase();
        const idMatch = (c.changeId || '').toLowerCase().includes(query);
        const recMatch = (c.recordId || '').toLowerCase().includes(query);
        const fieldMatch = (c.targetField || '').toLowerCase().includes(query);
        const ruleMatch = (c.rule || '').toLowerCase().includes(query);
        if (!idMatch && !recMatch && !fieldMatch && !ruleMatch) return false;
      }
      return true;
    });

    const appliedCount = changes.filter(c => c.status === 'applied').length;
    const revertedCount = changes.filter(c => c.status === 'reverted').length;
    const rulesList = Array.from(new Set(changes.map(c => c.rule))).sort();

    container.innerHTML = `
      <div class="audit-page">
        <!-- Page Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;">
          <div>
            <h1 style="font-size: 1.75rem; font-weight: 700; letter-spacing: -0.02em;">Audit Trail & Provenance</h1>
            <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 4px;">
              Immutable change ledger, verifiable source record ancestry, and 1-click field rollback
            </p>
          </div>

          <div style="display: flex; gap: 10px; align-items: center;">
            <span class="badge badge-success">${appliedCount} Applied Transformations</span>
            <span class="badge ${revertedCount > 0 ? 'badge-warning' : 'badge-neutral'}">${revertedCount} Reverted</span>
          </div>
        </div>

        <!-- Filter Controls -->
        <div class="card" style="padding: 16px; margin-bottom: 20px;">
          <div class="filter-bar" style="margin-bottom: 0;">
            <div class="search-input-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input type="text" id="audit-search" class="search-input" placeholder="Search by Record ID, Change ID, Rule, Field..." value="${searchFilter}">
            </div>

            <select id="filter-audit-status" class="select-filter">
              <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>All Statuses</option>
              <option value="applied" ${statusFilter === 'applied' ? 'selected' : ''}>Applied Only</option>
              <option value="reverted" ${statusFilter === 'reverted' ? 'selected' : ''}>Reverted Only</option>
            </select>

            <select id="filter-audit-rule" class="select-filter">
              <option value="all" ${ruleFilter === 'all' ? 'selected' : ''}>All Rules</option>
              ${rulesList.map(r => `
                <option value="${r}" ${ruleFilter === r ? 'selected' : ''}>${r}</option>
              `).join('')}
            </select>

            <button id="btn-reset-audit" class="btn btn-secondary btn-sm">Reset</button>
          </div>
        </div>

        <!-- Audit Table -->
        <div class="card" style="padding: 0; overflow: hidden;">
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 140px;">Change ID</th>
                  <th style="width: 120px;">Record ID</th>
                  <th style="width: 140px;">Target Field</th>
                  <th>Transformation (Old → New)</th>
                  <th style="width: 160px;">Rule & Confidence</th>
                  <th style="width: 120px;">Sources</th>
                  <th style="width: 90px;">Status</th>
                  <th style="width: 100px; text-align: right;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.length === 0 ? `
                  <tr>
                    <td colspan="8" style="text-align: center; padding: 48px 20px; color: var(--text-muted);">
                      ${changes.length === 0 ? 'No audit trail entries found. Run the repair pipeline on the Dashboard first.' : 'No audit entries match the active filters.'}
                    </td>
                  </tr>
                ` : filtered.map(c => {
                  const isApplied = c.status === 'applied';
                  const oldFormatted = c.oldValue === null ? 'null' : String(c.oldValue);
                  const newFormatted = c.newValue === null ? 'null' : String(c.newValue);

                  return `
                    <tr style="${!isApplied ? 'opacity: 0.6; background: rgba(239, 68, 68, 0.03);' : ''}">
                      <td style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-secondary);">
                        ${c.changeId}
                      </td>
                      <td>
                        <button class="btn btn-secondary btn-sm btn-inspect-lineage" data-rec="${c.recordId}" style="font-family: var(--font-mono); font-size: 0.75rem; padding: 2px 6px;">
                          ${c.recordId}
                        </button>
                      </td>
                      <td style="font-family: var(--font-mono); font-size: 0.75rem;">
                        ${c.targetField}
                      </td>
                      <td>
                        <div style="font-size: 0.8125rem; display: flex; align-items: center; gap: 8px;">
                          <span style="color: #f87171; text-decoration: line-through; font-family: var(--font-mono);">
                            ${oldFormatted}
                          </span>
                          <span style="color: var(--text-muted);">→</span>
                          <span style="color: #34d399; font-weight: 600; font-family: var(--font-mono);">
                            ${newFormatted}
                          </span>
                        </div>
                        ${c.description ? `
                          <div style="font-size: 0.6875rem; color: var(--text-muted); margin-top: 2px;">
                            ${c.description}
                          </div>
                        ` : ''}
                      </td>
                      <td>
                        <div>
                          <span class="badge badge-neutral" style="font-size: 0.625rem;">
                            ${c.rule}
                          </span>
                          <div style="font-size: 0.6875rem; color: var(--text-secondary); margin-top: 2px;">
                            ${Math.round((c.confidence || 1.0) * 100)}% conf
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style="display: flex; gap: 3px; flex-wrap: wrap;">
                          ${(c.sourceIds || []).map(s => `
                            <span style="font-family: var(--font-mono); font-size: 0.625rem; background: rgba(255, 255, 255, 0.05); padding: 1px 4px; border-radius: 3px;">
                              ${s}
                            </span>
                          `).join('')}
                        </div>
                      </td>
                      <td>
                        <span class="badge ${isApplied ? 'badge-success' : 'badge-neutral'}">
                          ${c.status}
                        </span>
                      </td>
                      <td style="text-align: right;">
                        <button class="btn btn-sm ${isApplied ? 'btn-outline-danger' : 'btn-primary'} btn-toggle-revert" data-id="${c.changeId}">
                          ${isApplied ? 'Revert' : 'Re-apply'}
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Lineage Modal Wrap -->
      <div id="lineage-modal-wrap"></div>
    `;

    // Filter event bindings
    const searchInput = container.querySelector('#audit-search');
    const statusSelect = container.querySelector('#filter-audit-status');
    const ruleSelect = container.querySelector('#filter-audit-rule');
    const btnReset = container.querySelector('#btn-reset-audit');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchFilter = e.target.value;
        update();
      });
    }

    if (statusSelect) {
      statusSelect.addEventListener('change', (e) => {
        statusFilter = e.target.value;
        update();
      });
    }

    if (ruleSelect) {
      ruleSelect.addEventListener('change', (e) => {
        ruleFilter = e.target.value;
        update();
      });
    }

    if (btnReset) {
      btnReset.addEventListener('click', () => {
        searchFilter = '';
        statusFilter = 'all';
        ruleFilter = 'all';
        update();
      });
    }

    // 1-Click Revert / Re-apply handler
    container.querySelectorAll('.btn-toggle-revert').forEach(btn => {
      btn.addEventListener('click', async () => {
        const changeId = btn.dataset.id;
        const targetChange = state.changes.find(c => c.changeId === changeId);
        if (!targetChange) return;

        const targetRecord = state.repairedRecords.find(r => (r.canonicalId || r.id) === targetChange.recordId);

        if (targetChange.status === 'applied') {
          // Revert change
          if (targetRecord) {
            revertChangeOnRecord(targetRecord, targetChange);
          } else {
            targetChange.status = 'reverted';
          }
          await updateChangeLogStatus(state.datasetId, changeId, 'reverted');
          showToast(`Reverted change ${changeId} on ${targetChange.targetField}`, 'info');
        } else {
          // Re-apply change
          if (targetRecord) {
            reapplyChangeOnRecord(targetRecord, targetChange);
          } else {
            targetChange.status = 'applied';
          }
          await updateChangeLogStatus(state.datasetId, changeId, 'applied');
          showToast(`Re-applied change ${changeId}`, 'success');
        }

        // Dynamically recalculate quality score after reversion
        state.qualityAfter = calculateQualityScore(state.repairedRecords);
        update();
      });
    });

    // Inspect Lineage modal button
    container.querySelectorAll('.btn-inspect-lineage').forEach(btn => {
      btn.addEventListener('click', () => {
        const recId = btn.dataset.rec;
        const repRecord = state.repairedRecords.find(r => (r.canonicalId || r.id) === recId)
          || state.records.find(r => r.id === recId)
          || { id: recId, attributes: {} };
        openLineageModal(repRecord);
      });
    });
  }

  function openLineageModal(record) {
    const modalWrap = container.querySelector('#lineage-modal-wrap');
    if (!modalWrap) return;

    const provenance = getRecordProvenance(record, state.records, state.changes);

    modalWrap.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-dialog" style="max-width: 640px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <h3 style="font-size: 1.125rem; font-weight: 600;">Entity Lineage & Ancestry</h3>
              <span class="match-score-pill">${record.canonicalId || record.id}</span>
            </div>
            <button id="modal-lineage-close" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.25rem;">✕</button>
          </div>

          <!-- Section 1: Canonical State -->
          <div style="background: rgba(0, 0, 0, 0.2); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 14px; margin-bottom: 16px;">
            <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 8px;">
              Repaired Canonical Entity
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.8125rem;">
              <div><strong>Name:</strong> <code>${record.attributes?.name || 'N/A'}</code></div>
              <div><strong>Birth Date:</strong> <code>${record.attributes?.birth_date || 'N/A'}</code></div>
              <div><strong>Place:</strong> <code>${record.attributes?.birth_place || 'N/A'}</code></div>
              <div><strong>Occupation:</strong> <code>${record.attributes?.occupation || 'N/A'}</code></div>
            </div>
          </div>

          <!-- Section 2: Raw Source Records -->
          <div style="margin-bottom: 16px;">
            <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 8px;">
              Original Source Records (${provenance.sourceRecords.length})
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${provenance.sourceRecords.map(s => `
                <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 8px 12px; font-size: 0.75rem;">
                  <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <span style="font-family: var(--font-mono); font-weight: 600; color: #60a5fa;">${s.id}</span>
                    <span style="color: var(--text-muted);">${s.source || 'Original Import'}</span>
                  </div>
                  <div style="color: var(--text-secondary);">
                    Raw Name: "${s.attributes?.name}" | DOB: "${s.attributes?.birth_date}" | Place: "${s.attributes?.birth_place}"
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Section 3: Transformations Chain -->
          <div>
            <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 8px;">
              Transformation Chain (${provenance.transformations.length})
            </div>
            ${provenance.transformations.length === 0 ? `
              <div style="font-size: 0.8125rem; color: var(--text-muted); font-style: italic;">No transformations applied to this entity.</div>
            ` : `
              <div style="display: flex; flex-direction: column; gap: 6px; max-height: 180px; overflow-y: auto;">
                ${provenance.transformations.map(t => `
                  <div style="background: rgba(0, 0, 0, 0.2); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 6px 10px; font-size: 0.75rem; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                      <span class="badge badge-neutral" style="font-size: 0.625rem;">${t.rule}</span>
                      <span style="font-family: var(--font-mono); margin-left: 6px;">${t.targetField}:</span>
                      <span style="color: #f87171; text-decoration: line-through;">${t.oldValue}</span> →
                      <span style="color: #34d399;">${t.newValue}</span>
                    </div>
                    <span class="badge ${t.status === 'applied' ? 'badge-success' : 'badge-neutral'}">${t.status}</span>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

          <div style="display: flex; justify-content: flex-end; margin-top: 20px;">
            <button id="modal-lineage-ok" class="btn btn-secondary btn-sm">Close</button>
          </div>
        </div>
      </div>
    `;

    modalWrap.querySelector('#modal-lineage-close').addEventListener('click', () => modalWrap.innerHTML = '');
    modalWrap.querySelector('#modal-lineage-ok').addEventListener('click', () => modalWrap.innerHTML = '');
  }

  const unsubscribe = subscribe(update);
  update();
  return unsubscribe;
}
