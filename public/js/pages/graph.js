/**
 * Knowledge Repair Tool - Interactive Relationship Graph (Stage 5.1)
 * 
 * Implements:
 * - Vis-network canvas visualizing People, Places, Events, and Relationships
 * - Distinct node visual styling per entity type:
 *   - People: Blue circular nodes
 *   - Places: Emerald green diamond nodes
 *   - Events: Violet rounded box nodes
 * - Glowing gold halo highlight for merged/repaired canonical entities
 * - Interactive physics-based layout with toggleable simulation and stabilization indicator
 * - Live search and filter by entity type (Person, Place, Event, or All)
 * - Source topology switcher: Repaired Canonical vs. Original Corrupted graph
 * - Responsive click-to-inspect node details drawer with clickable related entity links
 * - Empty states & loading skeletons
 */

import { state, subscribe, showToast, loadDataset } from '../state.js';
import { createDatasetPackage } from '../../data/generateDataset.js';

let networkInstance = null;

export function renderGraph(container) {
  let activeTypeFilter = 'all'; // 'all' | 'person' | 'place' | 'event'
  let highlightMerged = true;
  let searchFilter = '';
  let dataSource = 'repaired'; // 'repaired' | 'original'
  let isPhysicsEnabled = true;
  let selectedNodeData = null;
  let isStabilizing = true;

  function update() {
    const rawRecords = dataSource === 'repaired'
      ? ((state.repairedRecords && state.repairedRecords.length > 0) ? state.repairedRecords : state.records)
      : state.records;

    const hasRecords = rawRecords && rawRecords.length > 0;

    if (!hasRecords) {
      container.innerHTML = `
        <div class="graph-page" style="display: flex; flex-direction: column; min-height: 500px;">
          <div style="margin-bottom: 24px;">
            <h1 style="font-size: 1.75rem; font-weight: 700; letter-spacing: -0.02em;">Knowledge Relationship Graph</h1>
            <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 4px;">
              Interactive topological entity-relationship graph connecting People, Places, and Events
            </p>
          </div>

          <div class="empty-state">
            <div class="empty-state-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
              </svg>
            </div>
            <div class="empty-state-title">No Dataset Loaded</div>
            <p class="empty-state-desc">
              Load a dataset or run the knowledge repair pipeline to visualize interconnected entities, resolved duplicates, and repaired graph links.
            </p>
            <button id="btn-load-sample-graph" class="btn btn-primary btn-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Load Sample Corrupted Dataset
            </button>
          </div>
        </div>
      `;

      const btnLoad = container.querySelector('#btn-load-sample-graph');
      if (btnLoad) {
        btnLoad.addEventListener('click', async () => {
          try {
            const pkg = createDatasetPackage(42);
            await loadDataset({
              datasetId: `ds_${Date.now()}`,
              datasetName: 'Corrupted Historical Dataset',
              records: pkg.corrupted.records,
              groundTruthMutations: pkg.corrupted.groundTruthMutations
            });
          } catch (e) {
            showToast(`Failed to load dataset: ${e.message}`, 'danger');
          }
        });
      }
      return;
    }

    container.innerHTML = `
      <div class="graph-page" style="display: flex; flex-direction: column; height: calc(100vh - 120px); position: relative;">
        <!-- Top Toolbar & Filter Bar -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 12px;">
          <div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <h1 style="font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em;">Knowledge Relationship Graph</h1>
              <span id="graph-counts-badge" class="badge badge-info" style="font-size: 0.6875rem;">Loading...</span>
            </div>
            <p style="color: var(--text-secondary); font-size: 0.8125rem; margin-top: 2px;">
              Force-directed physics visualization across People, Places, and Events
            </p>
          </div>

          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <!-- Source Topology Switcher -->
            <select id="select-graph-source" class="select-filter" style="padding: 6px 10px; font-size: 0.8125rem;">
              <option value="repaired" ${dataSource === 'repaired' ? 'selected' : ''}>
                Repaired Canonical Graph (${state.isAnalyzed ? 'Optimized' : 'Draft'})
              </option>
              <option value="original" ${dataSource === 'original' ? 'selected' : ''}>
                Original Raw Graph (${state.records.length} nodes)
              </option>
            </select>

            <!-- Search Filter -->
            <div class="search-input-wrap" style="min-width: 170px; max-width: 220px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input type="text" id="graph-search" class="search-input" style="padding: 6px 10px 6px 32px; font-size: 0.8125rem;" placeholder="Search entity name..." value="${searchFilter}">
            </div>

            <!-- Type Filter -->
            <select id="filter-graph-type" class="select-filter" style="padding: 6px 10px; font-size: 0.8125rem;">
              <option value="all" ${activeTypeFilter === 'all' ? 'selected' : ''}>All Categories</option>
              <option value="person" ${activeTypeFilter === 'person' ? 'selected' : ''}>People Only</option>
              <option value="place" ${activeTypeFilter === 'place' ? 'selected' : ''}>Places Only</option>
              <option value="event" ${activeTypeFilter === 'event' ? 'selected' : ''}>Events Only</option>
            </select>

            <!-- Merged Highlight Toggle -->
            <label style="display: flex; align-items: center; gap: 6px; font-size: 0.8125rem; color: var(--text-secondary); cursor: pointer; user-select: none;">
              <input type="checkbox" id="check-highlight-merged" ${highlightMerged ? 'checked' : ''}>
              <span>Highlight Merged</span>
            </label>

            <!-- Physics Controls -->
            <button id="btn-toggle-physics" class="btn btn-secondary btn-sm" title="Toggle force simulation physics">
              ${isPhysicsEnabled ? 'Pause Physics' : 'Resume Physics'}
            </button>

            <!-- View Controls -->
            <button id="btn-fit-graph" class="btn btn-secondary btn-sm" title="Fit graph view to screen">
              Fit View
            </button>
            <button id="btn-zoom-in" class="btn btn-secondary btn-sm" title="Zoom in">+</button>
            <button id="btn-zoom-out" class="btn btn-secondary btn-sm" title="Zoom out">-</button>
          </div>
        </div>

        <!-- Graph Canvas Area + Side Drawer -->
        <div style="display: flex; gap: 16px; flex: 1; position: relative; min-height: 480px; overflow: hidden; border-radius: 12px;">
          <!-- Vis Network Container -->
          <div class="card" style="flex: 1; padding: 0; overflow: hidden; position: relative; margin-bottom: 0; background: #070a14; border: 1px solid var(--border-subtle); border-radius: 12px;">
            <div id="vis-network-canvas" style="width: 100%; height: 100%; position: absolute; top: 0; left: 0;"></div>

            <!-- Stabilization Progress Overlay -->
            <div id="graph-stabilize-overlay" style="position: absolute; top: 16px; left: 50%; transform: translateX(-50%); background: rgba(17, 24, 39, 0.85); backdrop-filter: blur(8px); border: 1px solid var(--border-subtle); border-radius: 9999px; padding: 6px 16px; font-size: 0.75rem; color: var(--text-secondary); display: none; align-items: center; gap: 8px; z-index: 15; pointer-events: none;">
              <span class="status-dot"></span>
              <span id="stabilize-text">Stabilizing graph physics...</span>
            </div>

            <!-- Interactive Legend Overlay -->
            <div style="position: absolute; bottom: 16px; left: 16px; background: rgba(15, 23, 42, 0.88); backdrop-filter: blur(10px); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 10px 14px; font-size: 0.75rem; display: flex; gap: 16px; z-index: 10; pointer-events: none;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="width: 12px; height: 12px; border-radius: 50%; background: #1e3a8a; border: 2px solid #3b82f6;"></span>
                <span>Person</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="width: 11px; height: 11px; background: #064e3b; border: 2px solid #10b981; transform: rotate(45deg);"></span>
                <span>Place</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="width: 12px; height: 10px; border-radius: 3px; background: #581c87; border: 2px solid #a855f7;"></span>
                <span>Event</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="width: 14px; height: 14px; border-radius: 50%; border: 2px solid #fbbf24; background: #1e3a8a; box-shadow: 0 0 8px #f59e0b;"></span>
                <span style="color: #fbbf24; font-weight: 600;">Merged Canonical</span>
              </div>
            </div>
          </div>

          <!-- Entity Details Drawer -->
          <div id="graph-details-drawer" class="card graph-details-drawer" style="width: 360px; margin-bottom: 0; overflow-y: auto; display: ${selectedNodeData ? 'block' : 'none'};">
            ${renderNodeDetails(selectedNodeData, rawRecords)}
          </div>
        </div>
      </div>
    `;

    // Initialize Network Graph
    buildVisNetwork(rawRecords);

    // Event Bindings
    const searchInput = container.querySelector('#graph-search');
    const typeSelect = container.querySelector('#filter-graph-type');
    const sourceSelect = container.querySelector('#select-graph-source');
    const checkMerged = container.querySelector('#check-highlight-merged');
    const btnTogglePhysics = container.querySelector('#btn-toggle-physics');
    const btnFit = container.querySelector('#btn-fit-graph');
    const btnZoomIn = container.querySelector('#btn-zoom-in');
    const btnZoomOut = container.querySelector('#btn-zoom-out');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchFilter = e.target.value;
        buildVisNetwork(rawRecords);
      });
    }

    if (typeSelect) {
      typeSelect.addEventListener('change', (e) => {
        activeTypeFilter = e.target.value;
        buildVisNetwork(rawRecords);
      });
    }

    if (sourceSelect) {
      sourceSelect.addEventListener('change', (e) => {
        dataSource = e.target.value;
        selectedNodeData = null;
        update();
      });
    }

    if (checkMerged) {
      checkMerged.addEventListener('change', (e) => {
        highlightMerged = e.target.checked;
        buildVisNetwork(rawRecords);
      });
    }

    if (btnTogglePhysics) {
      btnTogglePhysics.addEventListener('click', () => {
        isPhysicsEnabled = !isPhysicsEnabled;
        if (networkInstance) {
          networkInstance.setOptions({ physics: { enabled: isPhysicsEnabled } });
        }
        btnTogglePhysics.textContent = isPhysicsEnabled ? 'Pause Physics' : 'Resume Physics';
        showToast(isPhysicsEnabled ? 'Physics simulation resumed' : 'Physics frozen', 'info', 1500);
      });
    }

    if (btnFit) {
      btnFit.addEventListener('click', () => {
        if (networkInstance) {
          networkInstance.fit({ animation: { duration: 500, easingFunction: 'easeInOutQuad' } });
        }
      });
    }

    if (btnZoomIn) {
      btnZoomIn.addEventListener('click', () => {
        if (networkInstance) {
          const scale = networkInstance.getScale();
          networkInstance.moveTo({ scale: scale * 1.3, animation: true });
        }
      });
    }

    if (btnZoomOut) {
      btnZoomOut.addEventListener('click', () => {
        if (networkInstance) {
          const scale = networkInstance.getScale();
          networkInstance.moveTo({ scale: scale * 0.7, animation: true });
        }
      });
    }

    bindDrawerEvents(rawRecords);
  }

  function bindDrawerEvents(records) {
    const drawer = container.querySelector('#graph-details-drawer');
    if (!drawer) return;

    const btnClose = drawer.querySelector('#btn-close-drawer');
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        selectedNodeData = null;
        drawer.style.display = 'none';
        if (networkInstance) {
          networkInstance.unselectAll();
        }
      });
    }

    // Clickable relationship navigation links
    drawer.querySelectorAll('.btn-jump-relation').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.targetId;
        focusAndSelectNode(targetId, records);
      });
    });

    // Focus on canvas button
    const btnFocusCanvas = drawer.querySelector('#btn-focus-node-canvas');
    if (btnFocusCanvas && selectedNodeData) {
      btnFocusCanvas.addEventListener('click', () => {
        if (networkInstance) {
          networkInstance.focus(selectedNodeData.id, {
            scale: 1.4,
            animation: { duration: 600, easingFunction: 'easeInOutQuad' }
          });
        }
      });
    }
  }

  function focusAndSelectNode(nodeId, records) {
    const targetRecord = records.find(r => r.id === nodeId);
    if (!targetRecord) {
      showToast(`Entity ${nodeId} not found in active graph view`, 'warning');
      return;
    }

    selectedNodeData = targetRecord;
    const drawer = container.querySelector('#graph-details-drawer');
    if (drawer) {
      drawer.innerHTML = renderNodeDetails(selectedNodeData, records);
      drawer.style.display = 'block';
      bindDrawerEvents(records);
    }

    if (networkInstance) {
      networkInstance.selectNodes([nodeId]);
      networkInstance.focus(nodeId, {
        scale: 1.4,
        animation: { duration: 600, easingFunction: 'easeInOutQuad' }
      });
    }
  }

  function renderNodeDetails(node, allRecords) {
    if (!node) return '<div style="color: var(--text-muted); font-size: 0.8125rem;">Select an entity to inspect</div>';

    const attrs = node.attributes || {};
    const outwardRels = node.relationships || [];
    const isMerged = (node.sourceIds && node.sourceIds.length > 1);

    // Compute inward relationships from other records
    const inwardRels = [];
    for (const other of allRecords) {
      if (other.id === node.id) continue;
      for (const rel of (other.relationships || [])) {
        if (rel.targetId === node.id) {
          inwardRels.push({
            fromId: other.id,
            fromName: other.attributes?.name || other.id,
            fromType: other.type,
            type: rel.type
          });
        }
      }
    }

    return `
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="badge ${node.type === 'person' ? 'badge-info' : node.type === 'place' ? 'badge-success' : 'badge-warning'}">
              ${node.type?.toUpperCase()}
            </span>
            ${isMerged ? '<span class="badge" style="background: rgba(251, 191, 36, 0.15); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.4);">MERGED</span>' : ''}
          </div>
          <button id="btn-close-drawer" class="btn-icon" style="width: 28px; height: 28px; font-size: 1rem; border: none;" title="Close drawer">✕</button>
        </div>

        <h3 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 4px; line-height: 1.3;">
          ${attrs.name || node.id}
        </h3>
        <div style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
          <span>ID: <code>${node.id}</code></span>
          <button id="btn-focus-node-canvas" class="btn btn-secondary btn-sm" style="padding: 2px 8px; font-size: 0.6875rem;">
            Focus View
          </button>
        </div>

        ${isMerged ? `
          <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 8px; padding: 10px 12px; margin-bottom: 16px; font-size: 0.75rem;">
            <div style="font-weight: 600; color: #fbbf24; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
              </svg>
              Canonical Synthesized Entity
            </div>
            <div style="color: var(--text-secondary); line-height: 1.4;">
              Consolidated from ${node.sourceIds.length} duplicate variations:
              <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px;">
                ${node.sourceIds.map(sid => `
                  <span style="font-family: var(--font-mono); background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; color: #fde68a;">
                    ${sid}
                  </span>
                `).join('')}
              </div>
            </div>
          </div>
        ` : ''}

        <!-- Entity Attributes -->
        <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 8px;">
          Attributes
        </div>
        <div style="background: rgba(0, 0, 0, 0.25); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 10px 12px; margin-bottom: 16px; font-size: 0.8125rem;">
          ${Object.entries(attrs).length === 0 ? '<span style="color: var(--text-muted); font-size: 0.75rem;">No attributes recorded.</span>' :
            Object.entries(attrs).map(([k, v]) => `
              <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.04); gap: 10px;">
                <span style="color: var(--text-secondary);">${k}:</span>
                <span style="font-family: var(--font-mono); text-align: right; word-break: break-all; color: ${v === null ? '#f87171' : 'var(--text-main)'};">
                  ${v !== null ? v : '<em style="color: #94a3b8;">null</em>'}
                </span>
              </div>
            `).join('')}
        </div>

        <!-- Outward Relationships -->
        <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 8px; display: flex; justify-content: space-between;">
          <span>Outward Links</span>
          <span style="font-family: var(--font-mono);">${outwardRels.length}</span>
        </div>
        ${outwardRels.length === 0 ? `
          <div style="font-size: 0.75rem; color: var(--text-muted); font-style: italic; margin-bottom: 16px;">No outward relationships.</div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 6px; font-size: 0.75rem; margin-bottom: 16px;">
            ${outwardRels.map(r => `
              <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 6px 10px; display: flex; justify-content: space-between; align-items: center;">
                <span class="badge badge-neutral" style="font-size: 0.625rem;">${r.type}</span>
                <button class="btn-jump-relation" data-target-id="${r.targetId}" style="background: none; border: none; font-family: var(--font-mono); color: #60a5fa; cursor: pointer; text-decoration: underline; font-size: 0.75rem;">
                  ${r.targetId} →
                </button>
              </div>
            `).join('')}
          </div>
        `}

        <!-- Inward Relationships -->
        <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 8px; display: flex; justify-content: space-between;">
          <span>Referenced By (Inward)</span>
          <span style="font-family: var(--font-mono);">${inwardRels.length}</span>
        </div>
        ${inwardRels.length === 0 ? `
          <div style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;">No inward references.</div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 6px; font-size: 0.75rem;">
            ${inwardRels.map(r => `
              <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 6px 10px; display: flex; justify-content: space-between; align-items: center;">
                <button class="btn-jump-relation" data-target-id="${r.fromId}" style="background: none; border: none; font-family: var(--font-mono); color: #93c5fd; cursor: pointer; text-decoration: underline; font-size: 0.75rem;">
                  ← ${r.fromId}
                </button>
                <span class="badge badge-neutral" style="font-size: 0.625rem;">${r.type}</span>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  }

  function buildVisNetwork(rawRecords) {
    const canvasContainer = container.querySelector('#vis-network-canvas');
    if (!canvasContainer || typeof window.vis === 'undefined') return;

    // Filter nodes
    let filteredRecords = rawRecords;
    if (activeTypeFilter !== 'all') {
      filteredRecords = filteredRecords.filter(r => r.type === activeTypeFilter);
    }
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      filteredRecords = filteredRecords.filter(r => 
        (r.attributes?.name || '').toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
      );
    }

    // Limit display subset for snappy 60fps graph performance (up to 140 nodes)
    const displaySubset = filteredRecords.slice(0, 140);
    const displayedIdSet = new Set(displaySubset.map(r => r.id));

    // Update count badge
    const badge = container.querySelector('#graph-counts-badge');
    if (badge) {
      badge.textContent = `${displaySubset.length} Entities (${rawRecords.length} total)`;
    }

    // Build Vis Nodes with distinct visual styling per category
    const nodes = displaySubset.map(rec => {
      const isPerson = rec.type === 'person';
      const isPlace = rec.type === 'place';
      const isEvent = rec.type === 'event';
      const isMerged = highlightMerged && (rec.sourceIds && rec.sourceIds.length > 1);

      let colorBg = isPerson ? '#1e3a8a' : isPlace ? '#064e3b' : '#581c87';
      let colorBorder = isPerson ? '#3b82f6' : isPlace ? '#10b981' : '#a855f7';
      let shape = isPerson ? 'dot' : isPlace ? 'diamond' : 'box';
      let size = isPerson ? 18 : isPlace ? 22 : 18;

      const shadow = isMerged ? {
        enabled: true,
        color: 'rgba(251, 191, 36, 0.85)',
        size: 16,
        x: 0,
        y: 0
      } : { enabled: false };

      if (isMerged) {
        colorBorder = '#fbbf24';
        size = isPerson ? 24 : 26;
      }

      const entityName = rec.attributes?.name || rec.id;
      const labelText = isMerged ? `★ ${entityName}` : entityName;

      return {
        id: rec.id,
        label: labelText,
        shape,
        size,
        shadow,
        color: {
          background: colorBg,
          border: colorBorder,
          highlight: {
            background: colorBorder,
            border: '#ffffff'
          },
          hover: {
            background: colorBorder,
            border: '#f8fafc'
          }
        },
        borderWidth: isMerged ? 3.5 : 1.5,
        font: {
          color: isMerged ? '#fde68a' : '#f1f5f9',
          size: 11,
          face: 'Inter, sans-serif',
          background: 'rgba(10, 14, 23, 0.75)',
          strokeWidth: 0
        },
        title: `${rec.type.toUpperCase()}: ${entityName} (ID: ${rec.id})${isMerged ? ' [Merged Canonical]' : ''}`
      };
    });

    // Build Vis Edges
    const edges = [];
    let edgeIdCounter = 1;

    for (const rec of displaySubset) {
      const rels = rec.relationships || [];
      for (const rel of rels) {
        if (displayedIdSet.has(rel.targetId)) {
          edges.push({
            id: `edge_${edgeIdCounter++}`,
            from: rec.id,
            to: rel.targetId,
            arrows: {
              to: { enabled: true, scaleFactor: 0.7 }
            },
            label: rel.type,
            font: {
              color: '#94a3b8',
              size: 9,
              align: 'middle',
              background: 'rgba(10, 14, 23, 0.65)'
            },
            color: {
              color: 'rgba(148, 163, 184, 0.28)',
              highlight: '#3b82f6',
              hover: '#60a5fa'
            },
            smooth: {
              type: 'continuous',
              roundness: 0.2
            }
          });
        }
      }
    }

    const data = {
      nodes: new window.vis.DataSet(nodes),
      edges: new window.vis.DataSet(edges)
    };

    const options = {
      physics: {
        enabled: isPhysicsEnabled,
        solver: 'forceAtlas2Based',
        forceAtlas2Based: {
          gravitationalConstant: -40,
          centralGravity: 0.009,
          springLength: 90,
          springConstant: 0.16,
          damping: 0.4
        },
        stabilization: {
          enabled: true,
          iterations: 120,
          updateInterval: 25
        }
      },
      interaction: {
        hover: true,
        tooltipDelay: 120,
        zoomView: true,
        dragView: true,
        navigationButtons: false
      }
    };

    if (networkInstance) {
      networkInstance.destroy();
      networkInstance = null;
    }

    networkInstance = new window.vis.Network(canvasContainer, data, options);

    // Stabilization progress UI indicator
    const overlay = container.querySelector('#graph-stabilize-overlay');
    const textEl = container.querySelector('#stabilize-text');

    networkInstance.on('stabilizationProgress', (params) => {
      if (overlay) {
        overlay.style.display = 'flex';
        const pct = Math.round((params.iterations / params.total) * 100);
        if (textEl) textEl.textContent = `Relaxing node physics layout (${pct}%)...`;
      }
    });

    networkInstance.on('stabilizationIterationsDone', () => {
      if (overlay) {
        overlay.style.display = 'none';
      }
    });

    // Node click interaction: open details drawer
    networkInstance.on('click', (params) => {
      if (params.nodes && params.nodes.length > 0) {
        const clickedId = params.nodes[0];
        const record = rawRecords.find(r => r.id === clickedId);
        selectedNodeData = record || null;

        const drawer = container.querySelector('#graph-details-drawer');
        if (drawer && selectedNodeData) {
          drawer.innerHTML = renderNodeDetails(selectedNodeData, rawRecords);
          drawer.style.display = 'block';
          bindDrawerEvents(rawRecords);
        }
      }
    });
  }

  const unsubscribe = subscribe(update);
  update();

  return () => {
    unsubscribe();
    if (networkInstance) {
      networkInstance.destroy();
      networkInstance = null;
    }
  };
}
