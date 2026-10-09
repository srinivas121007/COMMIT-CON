/**
 * Knowledge Repair Tool - Contradictions Inspector Page
 * 
 * Provides:
 * - Visual conflict explorer highlighting incompatible claims:
 *   - Chronological violations (Death before birth)
 *   - Biological impossibilities (Lifespan > 125 years)
 *   - Circular genealogical lineages (Graph cycles)
 *   - Spatiotemporal collisions (Same-day distant events)
 * - Source reliability consensus analysis
 * - Interactive resolution overrides allowing manual selection of truth
 */

import { state, subscribe, showToast } from '../state.js';
import { getSourceReliability } from '../pipeline/contradictions.js';
import { createChangeLogEntry } from '../pipeline/audit.js';

export function renderContradictions(container) {
  let ruleFilter = 'all';
  let resolvedMap = new Map(); // contraId -> { action: 'accepted'|'overridden', chosenValue: ... }

  function update() {
    const contradictions = state.contradictions || [];
    const filtered = contradictions.filter(c => {
      if (ruleFilter !== 'all' && c.rule !== ruleFilter) return false;
      return true;
    });

    const chronCount = contradictions.filter(c => c.rule === 'DEATH_BEFORE_BIRTH').length;
    const ageCount = contradictions.filter(c => c.rule === 'IMPOSSIBLE_AGE').length;
    const cycleCount = contradictions.filter(c => c.rule === 'CIRCULAR_PARENTAGE').length;
    const spatioCount = contradictions.filter(c => c.rule === 'SPATIOTEMPORAL_COLLISION').length;

    container.innerHTML = `
      <div class="contradictions-page">
        <!-- Page Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;">
          <div>
            <h1 style="font-size: 1.75rem; font-weight: 700; letter-spacing: -0.02em;">Domain Contradictions Inspector</h1>
            <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 4px;">
              Cross-record temporal logic, biological plausibility, and genealogical cycle verification
            </p>
          </div>

          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <span class="badge badge-critical">${chronCount} Chronological</span>
            <span class="badge badge-critical">${ageCount} Age Limit</span>
            <span class="badge badge-critical">${cycleCount} Cycles</span>
            <span class="badge badge-warning">${spatioCount} Spatiotemporal</span>
          </div>
        </div>

        <!-- Filter Bar -->
        <div class="card" style="padding: 16px; margin-bottom: 20px;">
          <div class="filter-bar" style="margin-bottom: 0;">
            <select id="filter-contra-rule" class="select-filter">
              <option value="all" ${ruleFilter === 'all' ? 'selected' : ''}>All Contradiction Types</option>
              <option value="DEATH_BEFORE_BIRTH" ${ruleFilter === 'DEATH_BEFORE_BIRTH' ? 'selected' : ''}>Death Before Birth</option>
              <option value="IMPOSSIBLE_AGE" ${ruleFilter === 'IMPOSSIBLE_AGE' ? 'selected' : ''}>Impossible Age (>125 yrs)</option>
              <option value="CIRCULAR_PARENTAGE" ${ruleFilter === 'CIRCULAR_PARENTAGE' ? 'selected' : ''}>Circular Parentage</option>
              <option value="SPATIOTEMPORAL_COLLISION" ${ruleFilter === 'SPATIOTEMPORAL_COLLISION' ? 'selected' : ''}>Spatiotemporal Collision</option>
            </select>

            <div style="margin-left: auto; font-size: 0.8125rem; color: var(--text-secondary);">
              Showing ${filtered.length} of ${contradictions.length} domain anomalies
            </div>
          </div>
        </div>

        <!-- Contradictions Cards List -->
        ${filtered.length === 0 ? `
          <div class="card" style="text-align: center; padding: 48px 20px; color: var(--text-muted);">
            ${contradictions.length === 0 ? 'No contradictions detected. Run the repair pipeline on the Dashboard first.' : 'No contradictions match the selected filter.'}
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 20px;">
            ${filtered.map(contra => {
              const resolution = resolvedMap.get(contra.contraId);
              const rec = state.records.find(r => r.id === contra.recordId) || {};
              const attrs = rec.attributes || {};
              const sourceName = rec.source || 'Unknown';
              const sourceRel = Math.round(getSourceReliability(sourceName) * 100);

              return `
                <div class="card" style="margin-bottom: 0; ${resolution ? 'border-color: rgba(16, 185, 129, 0.4); background: rgba(16, 185, 129, 0.02);' : ''}">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                      <span class="badge ${contra.severity === 'critical' ? 'badge-critical' : 'badge-warning'}">
                        ${contra.rule}
                      </span>
                      <span style="font-weight: 600; font-size: 0.9375rem;">
                        ${contra.description}
                      </span>
                    </div>

                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted);">
                        Record: ${contra.recordId}
                      </span>
                      ${resolution ? `
                        <span class="badge badge-success">RESOLVED</span>
                      ` : ''}
                    </div>
                  </div>

                  <!-- Conflict Evidence Explorer -->
                  <div style="background: rgba(0, 0, 0, 0.2); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                    <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 10px;">
                      Conflicting Claims & Source Reliability
                    </div>

                    ${contra.rule === 'DEATH_BEFORE_BIRTH' ? `
                      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 0.8125rem;">
                        <div style="padding: 10px; background: rgba(255, 255, 255, 0.02); border-radius: 6px;">
                          <div style="color: var(--text-secondary); margin-bottom: 4px;">Birth Date (Claim A)</div>
                          <div style="font-family: var(--font-mono); font-weight: 600; font-size: 1rem; color: #60a5fa;">
                            ${contra.conflictingValues?.birth_date}
                          </div>
                          <div style="font-size: 0.6875rem; color: var(--text-muted); margin-top: 4px;">
                            Source: ${sourceName} (${sourceRel}% reliability)
                          </div>
                        </div>

                        <div style="padding: 10px; background: rgba(239, 68, 68, 0.05); border-radius: 6px; border: 1px solid rgba(239, 68, 68, 0.2);">
                          <div style="color: var(--text-secondary); margin-bottom: 4px;">Death Date (Claim B)</div>
                          <div style="font-family: var(--font-mono); font-weight: 600; font-size: 1rem; color: #f87171;">
                            ${contra.conflictingValues?.death_date}
                          </div>
                          <div style="font-size: 0.6875rem; color: #f87171; margin-top: 4px;">
                            Chronologically precedes birth date by years
                          </div>
                        </div>
                      </div>
                    ` : contra.rule === 'IMPOSSIBLE_AGE' ? `
                      <div style="font-size: 0.8125rem; line-height: 1.6;">
                        <div>Born: <code style="color: #60a5fa;">${contra.conflictingValues?.birth_date}</code></div>
                        <div>Reported Death: <code style="color: #f87171;">${contra.conflictingValues?.death_date}</code></div>
                        <div style="margin-top: 6px; color: #fbbf24;">
                          Calculated lifespan is <strong>${contra.conflictingValues?.calculatedLifespan} years</strong>, violating verified human biological limits (&le;125 years).
                        </div>
                      </div>
                    ` : contra.rule === 'CIRCULAR_PARENTAGE' ? `
                      <div style="font-size: 0.8125rem;">
                        <div style="color: var(--text-secondary); margin-bottom: 6px;">Genealogical Cycle Path:</div>
                        <div style="display: flex; align-items: center; gap: 8px; font-family: var(--font-mono); font-size: 0.875rem; color: #f87171;">
                          <span>${contra.cyclePath?.join(' ──[parent_of]──► ') || contra.recordId}</span>
                        </div>
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 6px;">
                          Direct recursive lineage detected: Entity is recorded as both parent and child of descendant.
                        </div>
                      </div>
                    ` : `
                      <div style="font-size: 0.8125rem;">
                        <div>Simultaneous event attendance in: <strong>${contra.locations?.join(' and ')}</strong> on <code style="color: #fbbf24;">${contra.clashDate}</code></div>
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">
                          Same-day physical co-presence is geographically impossible across international cities.
                        </div>
                      </div>
                    `}
                  </div>

                  <!-- Resolution Controls -->
                  <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; padding-top: 8px;">
                    <div style="font-size: 0.8125rem; color: var(--text-secondary);">
                      <strong>Suggested Action:</strong> ${contra.rule === 'DEATH_BEFORE_BIRTH' ? 'Clear unverified death date (retain reliable birth date)' : contra.rule === 'CIRCULAR_PARENTAGE' ? 'Break contradictory parent_of directed edge' : 'Flag for historical archivist review'}
                    </div>

                    <div style="display: flex; gap: 8px;">
                      <button class="btn btn-secondary btn-sm btn-override" data-id="${contra.contraId}">
                        Manual Override...
                      </button>
                      <button class="btn btn-primary btn-sm btn-accept-res" data-id="${contra.contraId}" ${resolution ? 'disabled' : ''}>
                        Accept Resolution
                      </button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>

      <!-- Override Modal Container -->
      <div id="override-modal-wrap"></div>
    `;

    // Bind event listeners
    const ruleSelect = container.querySelector('#filter-contra-rule');
    if (ruleSelect) {
      ruleSelect.addEventListener('change', (e) => {
        ruleFilter = e.target.value;
        update();
      });
    }

    // Accept Resolution
    container.querySelectorAll('.btn-accept-res').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        resolvedMap.set(id, { action: 'accepted' });
        showToast(`Resolved contradiction ${id}`, 'success');
        update();
      });
    });

    // Manual Override Modal
    container.querySelectorAll('.btn-override').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const targetContra = contradictions.find(c => c.contraId === id);
        openOverrideModal(targetContra);
      });
    });
  }

  function openOverrideModal(contra) {
    const modalWrap = container.querySelector('#override-modal-wrap');
    if (!modalWrap || !contra) return;

    modalWrap.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-dialog">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3 style="font-size: 1.125rem; font-weight: 600;">Manual Contradiction Override</h3>
            <button id="modal-contra-close" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.25rem;">✕</button>
          </div>
          <p style="font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 20px;">
            Select desired resolution strategy for record <strong>${contra.recordId}</strong>:
          </p>

          <form id="override-form" style="display: flex; flex-direction: column; gap: 12px;">
            <label style="background: rgba(0, 0, 0, 0.2); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 12px; display: flex; gap: 10px; cursor: pointer;">
              <input type="radio" name="res_choice" value="clear_invalid" checked>
              <div>
                <div style="font-weight: 600; font-size: 0.875rem;">Clear Incompatible Field (Recommended)</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">Set conflicting value to null to prevent invalid assertions.</div>
              </div>
            </label>

            <label style="background: rgba(0, 0, 0, 0.2); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 12px; display: flex; gap: 10px; cursor: pointer;">
              <input type="radio" name="res_choice" value="keep_primary">
              <div>
                <div style="font-weight: 600; font-size: 0.875rem;">Prioritize Primary Source</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">Trust National Biographical Registry over County Census record.</div>
              </div>
            </label>

            <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;">
              <button type="button" id="modal-contra-cancel" class="btn btn-secondary btn-sm">Cancel</button>
              <button type="submit" class="btn btn-primary btn-sm">Apply Override</button>
            </div>
          </form>
        </div>
      </div>
    `;

    modalWrap.querySelector('#modal-contra-close').addEventListener('click', () => modalWrap.innerHTML = '');
    modalWrap.querySelector('#modal-contra-cancel').addEventListener('click', () => modalWrap.innerHTML = '');
    modalWrap.querySelector('#override-form').addEventListener('submit', (e) => {
      e.preventDefault();
      resolvedMap.set(contra.contraId, { action: 'overridden' });
      modalWrap.innerHTML = '';
      showToast(`Manual override applied for ${contra.contraId}`, 'success');
      update();
    });
  }

  const unsubscribe = subscribe(update);
  update();
  return unsubscribe;
}
