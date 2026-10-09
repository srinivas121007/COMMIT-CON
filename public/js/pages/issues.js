/**
 * Knowledge Repair Tool - Issues Report Page
 * 
 * Provides:
 * - Filterable, sortable interactive issues inventory
 * - Categorization by type (Duplicate, Typo, Missing, Contradiction)
 * - Severity stratification (Critical, Warning, Info)
 * - Interactive inline issue resolution & status updates synced to Firestore
 */

import { state, subscribe, setIssueStatus } from '../state.js';

export function renderIssues(container) {
  let searchFilter = '';
  let typeFilter = 'all';
  let severityFilter = 'all';
  let statusFilter = 'all';

  function update() {
    const allIssues = state.issues || [];
    
    // Filter issues
    const filtered = allIssues.filter(issue => {
      if (typeFilter !== 'all' && issue.type !== typeFilter) return false;
      if (severityFilter !== 'all' && issue.severity !== severityFilter) return false;
      if (statusFilter !== 'all' && issue.status !== statusFilter) return false;
      if (searchFilter) {
        const query = searchFilter.toLowerCase();
        const descMatch = (issue.description || '').toLowerCase().includes(query);
        const idMatch = (issue.issueId || '').toLowerCase().includes(query);
        const recMatch = (issue.recordsInvolved || []).some(r => r.toLowerCase().includes(query));
        if (!descMatch && !idMatch && !recMatch) return false;
      }
      return true;
    });

    const criticalCount = allIssues.filter(i => i.severity === 'critical').length;
    const warningCount = allIssues.filter(i => i.severity === 'warning').length;
    const infoCount = allIssues.filter(i => i.severity === 'info').length;

    container.innerHTML = `
      <div class="issues-page">
        <!-- Page Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;">
          <div>
            <h1 style="font-size: 1.75rem; font-weight: 700; letter-spacing: -0.02em;">Inconsistency & Quality Issues</h1>
            <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 4px;">
              Granular inventory of anomalies, logical violations, and formatting discrepancies
            </p>
          </div>

          <div style="display: flex; gap: 10px; align-items: center;">
            <span class="badge badge-critical">${criticalCount} Critical</span>
            <span class="badge badge-warning">${warningCount} Warning</span>
            <span class="badge badge-info">${infoCount} Info</span>
          </div>
        </div>

        <!-- Filter Controls Bar -->
        <div class="card" style="padding: 16px; margin-bottom: 20px;">
          <div class="filter-bar" style="margin-bottom: 0;">
            <div class="search-input-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input type="text" id="issues-search" class="search-input" placeholder="Search by Record ID, Description..." value="${searchFilter}">
            </div>

            <select id="filter-type" class="select-filter">
              <option value="all" ${typeFilter === 'all' ? 'selected' : ''}>All Types</option>
              <option value="duplicate" ${typeFilter === 'duplicate' ? 'selected' : ''}>Duplicate</option>
              <option value="contradiction" ${typeFilter === 'contradiction' ? 'selected' : ''}>Contradiction</option>
              <option value="typo" ${typeFilter === 'typo' ? 'selected' : ''}>Typo / Format</option>
              <option value="missing" ${typeFilter === 'missing' ? 'selected' : ''}>Missing Value</option>
            </select>

            <select id="filter-severity" class="select-filter">
              <option value="all" ${severityFilter === 'all' ? 'selected' : ''}>All Severities</option>
              <option value="critical" ${severityFilter === 'critical' ? 'selected' : ''}>Critical</option>
              <option value="warning" ${severityFilter === 'warning' ? 'selected' : ''}>Warning</option>
              <option value="info" ${severityFilter === 'info' ? 'selected' : ''}>Info</option>
            </select>

            <select id="filter-status" class="select-filter">
              <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>All Statuses</option>
              <option value="open" ${statusFilter === 'open' ? 'selected' : ''}>Open</option>
              <option value="resolved" ${statusFilter === 'resolved' ? 'selected' : ''}>Resolved</option>
              <option value="ignored" ${statusFilter === 'ignored' ? 'selected' : ''}>Ignored</option>
            </select>

            <button id="btn-reset-filters" class="btn btn-secondary btn-sm">Reset</button>
          </div>
        </div>

        <!-- Issues Table Card -->
        <div class="card" style="padding: 0; overflow: hidden;">
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 120px;">Issue ID</th>
                  <th style="width: 100px;">Severity</th>
                  <th style="width: 110px;">Category</th>
                  <th>Description & Evidence</th>
                  <th style="width: 160px;">Records Involved</th>
                  <th style="width: 100px;">Status</th>
                  <th style="width: 170px; text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.length === 0 ? `
                  <tr>
                    <td colspan="7" style="text-align: center; padding: 48px 20px; color: var(--text-muted);">
                      ${allIssues.length === 0 ? 'No issues loaded. Run the repair pipeline on the Dashboard first.' : 'No issues match the selected filter criteria.'}
                    </td>
                  </tr>
                ` : filtered.map(issue => `
                  <tr>
                    <td style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-secondary);">
                      ${issue.issueId}
                    </td>
                    <td>
                      <span class="badge ${issue.severity === 'critical' ? 'badge-critical' : issue.severity === 'warning' ? 'badge-warning' : 'badge-info'}">
                        ${issue.severity}
                      </span>
                    </td>
                    <td>
                      <span class="badge badge-neutral">
                        ${issue.type}
                      </span>
                    </td>
                    <td>
                      <div style="font-weight: 500; color: var(--text-main);">
                        ${issue.description}
                      </div>
                      ${issue.reason ? `
                        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px; font-style: italic;">
                          Reason: ${issue.reason}
                        </div>
                      ` : ''}
                    </td>
                    <td>
                      <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                        ${(issue.recordsInvolved || []).map(rId => `
                          <span style="font-family: var(--font-mono); font-size: 0.6875rem; background: rgba(255, 255, 255, 0.05); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border-subtle);">
                            ${rId}
                          </span>
                        `).join('')}
                      </div>
                    </td>
                    <td>
                      <span class="badge ${issue.status === 'resolved' ? 'badge-success' : issue.status === 'ignored' ? 'badge-neutral' : 'badge-warning'}">
                        ${issue.status}
                      </span>
                    </td>
                    <td style="text-align: right;">
                      <div style="display: flex; gap: 6px; justify-content: flex-end;">
                        ${issue.type === 'duplicate' ? `
                          <a href="#duplicates" class="btn btn-secondary btn-sm" style="font-size: 0.6875rem; padding: 3px 6px;">
                            Review
                          </a>
                        ` : ''}
                        
                        ${issue.status === 'open' ? `
                          <button class="btn btn-secondary btn-sm btn-resolve" data-id="${issue.issueId}" style="font-size: 0.6875rem; padding: 3px 6px; color: var(--success);">
                            Resolve
                          </button>
                          <button class="btn btn-secondary btn-sm btn-ignore" data-id="${issue.issueId}" style="font-size: 0.6875rem; padding: 3px 6px; color: var(--text-muted);">
                            Ignore
                          </button>
                        ` : `
                          <button class="btn btn-secondary btn-sm btn-reopen" data-id="${issue.issueId}" style="font-size: 0.6875rem; padding: 3px 6px;">
                            Reopen
                          </button>
                        `}
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Bind event handlers
    const searchInput = container.querySelector('#issues-search');
    const selectType = container.querySelector('#filter-type');
    const selectSeverity = container.querySelector('#filter-severity');
    const selectStatus = container.querySelector('#filter-status');
    const btnReset = container.querySelector('#btn-reset-filters');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchFilter = e.target.value;
        update();
      });
    }

    if (selectType) {
      selectType.addEventListener('change', (e) => {
        typeFilter = e.target.value;
        update();
      });
    }

    if (selectSeverity) {
      selectSeverity.addEventListener('change', (e) => {
        severityFilter = e.target.value;
        update();
      });
    }

    if (selectStatus) {
      selectStatus.addEventListener('change', (e) => {
        statusFilter = e.target.value;
        update();
      });
    }

    if (btnReset) {
      btnReset.addEventListener('click', () => {
        searchFilter = '';
        typeFilter = 'all';
        severityFilter = 'all';
        statusFilter = 'all';
        update();
      });
    }

    // Resolve / Ignore action buttons
    container.querySelectorAll('.btn-resolve').forEach(btn => {
      btn.addEventListener('click', () => {
        setIssueStatus(btn.dataset.id, 'resolved');
      });
    });

    container.querySelectorAll('.btn-ignore').forEach(btn => {
      btn.addEventListener('click', () => {
        setIssueStatus(btn.dataset.id, 'ignored');
      });
    });

    container.querySelectorAll('.btn-reopen').forEach(btn => {
      btn.addEventListener('click', () => {
        setIssueStatus(btn.dataset.id, 'open');
      });
    });
  }

  const unsubscribe = subscribe(update);
  update();
  return unsubscribe;
}
