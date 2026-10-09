/**
 * Knowledge Repair Tool - Interactive Relationship Graph
 * 
 * Implements:
 * - Vis-network interactive physics canvas visualizing People, Places, and Events
 * - Distinct visual typography and styling per entity category:
 *   - People: Blue circular nodes
 *   - Places: Emerald green diamond nodes
 *   - Events: Violet box/hexagon nodes
 * - Glowing gold highlight for merged canonical entities
 * - Interactive side drawer displaying entity details, relationships, and provenance on click
 * - Filter controls: Entity category filters, Merged-only filter, Search by name
 */

import { state, subscribe } from '../state.js';

let networkInstance = null;

export function renderGraph(container) {
  let activeTypeFilter = 'all'; // 'all' | 'person' | 'place' | 'event'
  let highlightMerged = true;
  let searchFilter = '';
  let selectedNodeData = null;

  function update() {
    container.innerHTML = `
      <div class="graph-page" style="display: flex; flex-direction: column; height: calc(100vh - 128px);">
        <!-- Page Header & Filter Controls -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h1 style="font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em;">Knowledge Relationship Graph</h1>
            <p style="color: var(--text-secondary); font-size: 0.8125rem;">
              Interactive entity-relationship graph connecting People, Places, and Events
            </p>
          </div>

          <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
            <div class="search-input-wrap" style="min-width: 180px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input type="text" id="graph-search" class="search-input" placeholder="Search node name..." value="${searchFilter}">
            </div>

            <select id="filter-graph-type" class="select-filter">
              <option value="all" ${activeTypeFilter === 'all' ? 'selected' : ''}>All Entities</option>
              <option value="person" ${activeTypeFilter === 'person' ? 'selected' : ''}>People Only</option>
              <option value="place" ${activeTypeFilter === 'place' ? 'selected' : ''}>Places Only</option>
              <option value="event" ${activeTypeFilter === 'event' ? 'selected' : ''}>Events Only</option>
            </select>

            <label style="display: flex; align-items: center; gap: 6px; font-size: 0.8125rem; color: var(--text-secondary); cursor: pointer;">
              <input type="checkbox" id="check-highlight-merged" ${highlightMerged ? 'checked' : ''}>
              <span>Highlight Merged</span>
            </label>

            <button id="btn-fit-graph" class="btn btn-secondary btn-sm" title="Fit graph view">
              Fit View
            </button>
          </div>
        </div>

        <!-- Graph Layout Container (Canvas + Details Drawer) -->
        <div style="display: flex; gap: 16px; flex: 1; position: relative; min-height: 480px;">
          <!-- Graph Canvas Card -->
          <div class="card" style="flex: 1; padding: 0; overflow: hidden; position: relative; margin-bottom: 0; background: #070a12; border: 1px solid var(--border-subtle);">
            <div id="vis-network-canvas" style="width: 100%; height: 100%; position: absolute; top: 0; left: 0;"></div>

            <!-- Legend Overlay -->
            <div style="position: absolute; bottom: 16px; left: 16px; background: rgba(17, 24, 39, 0.85); backdrop-filter: blur(8px); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 10px 14px; font-size: 0.75rem; display: flex; gap: 16px; pointer-events: none; z-index: 10;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="width: 10px; height: 10px; border-radius: 50%; background: #3b82f6;"></span>
                <span>Person</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="width: 10px; height: 10px; background: #10b981; transform: rotate(45deg);"></span>
                <span>Place</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="width: 10px; height: 10px; border-radius: 3px; background: #8b5cf6;"></span>
                <span>Event</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="width: 12px; height: 12px; border-radius: 50%; border: 2px solid #fbbf24; background: #3b82f6;"></span>
                <span>Merged Canonical</span>
              </div>
            </div>
          </div>

          <!-- Entity Details Drawer -->
          <div id="graph-details-drawer" class="card" style="width: 320px; margin-bottom: 0; overflow-y: auto; display: ${selectedNodeData ? 'block' : 'none'};">
            ${renderNodeDetails(selectedNodeData)}
          </div>
        </div>
      </div>
    `;

    // Initialize Network Canvas
    buildVisNetwork();

    // Event Bindings
    const searchInput = container.querySelector('#graph-search');
    const typeSelect = container.querySelector('#filter-graph-type');
    const checkMerged = container.querySelector('#check-highlight-merged');
    const btnFit = container.querySelector('#btn-fit-graph');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchFilter = e.target.value;
        buildVisNetwork();
      });
    }

    if (typeSelect) {
      typeSelect.addEventListener('change', (e) => {
        activeTypeFilter = e.target.value;
        buildVisNetwork();
      });
    }

    if (checkMerged) {
      checkMerged.addEventListener('change', (e) => {
        highlightMerged = e.target.checked;
        buildVisNetwork();
      });
    }

    if (btnFit) {
      btnFit.addEventListener('click', () => {
        if (networkInstance) networkInstance.fit({ animation: true });
      });
    }
  }

  function renderNodeDetails(node) {
    if (!node) return '<div style="color: var(--text-muted); font-size: 0.8125rem;">Select an entity to inspect</div>';

    const attrs = node.attributes || {};
    const rels = node.relationships || [];
    const isMerged = (node.sourceIds && node.sourceIds.length > 1);

    return `
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <span class="badge ${node.type === 'person' ? 'badge-info' : node.type === 'place' ? 'badge-success' : 'badge-warning'}">
            ${node.type?.toUpperCase()}
          </span>
          <button id="btn-close-drawer" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.125rem;">✕</button>
        </div>

        <h3 style="font-size: 1.125rem; font-weight: 700; margin-bottom: 4px;">
          ${attrs.name || node.id}
        </h3>
        <div style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 14px;">
          ID: ${node.id}
        </div>

        ${isMerged ? `
          <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 6px; padding: 8px 10px; margin-bottom: 14px; font-size: 0.75rem;">
            <div style="font-weight: 600; color: #fbbf24; margin-bottom: 2px;">Merged Canonical Entity</div>
            <div style="color: var(--text-secondary);">Synthesized from: ${(node.sourceIds || []).join(', ')}</div>
          </div>
        ` : ''}

        <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 6px;">
          Attributes
        </div>
        <div style="background: rgba(0, 0, 0, 0.2); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 10px; margin-bottom: 14px; font-size: 0.8125rem;">
          ${Object.entries(attrs).map(([k, v]) => `
            <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.04);">
              <span style="color: var(--text-secondary);">${k}:</span>
              <span style="font-family: var(--font-mono);">${v || 'null'}</span>
            </div>
          `).join('')}
        </div>

        <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 6px;">
          Relationships (${rels.length})
        </div>
        ${rels.length === 0 ? `
          <div style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;">No outward relationships.</div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 4px; font-size: 0.75rem;">
            ${rels.map(r => `
              <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 6px 8px; display: flex; justify-content: space-between;">
                <span class="badge badge-neutral" style="font-size: 0.625rem;">${r.type}</span>
                <span style="font-family: var(--font-mono); color: #60a5fa;">${r.targetId}</span>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  }

  function buildVisNetwork() {
    const canvasContainer = container.querySelector('#vis-network-canvas');
    if (!canvasContainer || typeof window.vis === 'undefined') return;

    // Use repaired canonical records if pipeline has run, otherwise original records
    const rawRecords = (state.repairedRecords && state.repairedRecords.length > 0)
      ? state.repairedRecords
      : state.records;

    if (!rawRecords || rawRecords.length === 0) return;

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

    // Limit display subset for snappy 60fps graph performance (up to 120 nodes)
    const displaySubset = filteredRecords.slice(0, 120);
    const displayedIdSet = new Set(displaySubset.map(r => r.id));

    // Build Nodes
    const nodes = displaySubset.map(rec => {
      const isPerson = rec.type === 'person';
      const isPlace = rec.type === 'place';
      const isEvent = rec.type === 'event';
      const isMerged = highlightMerged && (rec.sourceIds && rec.sourceIds.length > 1);

      let colorBg = isPerson ? '#1e3a8a' : isPlace ? '#065f46' : '#581c87';
      let colorBorder = isPerson ? '#3b82f6' : isPlace ? '#10b981' : '#8b5cf6';
      let shape = isPerson ? 'dot' : isPlace ? 'diamond' : 'box';
      let size = isPerson ? 16 : isPlace ? 20 : 18;

      if (isMerged) {
        colorBorder = '#fbbf24';
        size = 22;
      }

      return {
        id: rec.id,
        label: rec.attributes?.name || rec.id,
        shape,
        size,
        color: {
          background: colorBg,
          border: colorBorder,
          highlight: {
            background: colorBorder,
            border: '#ffffff'
          }
        },
        borderWidth: isMerged ? 3 : 1.5,
        font: {
          color: '#e2e8f0',
          size: 11,
          face: 'Inter'
        },
        title: `${rec.type.toUpperCase()}: ${rec.attributes?.name || rec.id}`
      };
    });

    // Build Edges
    const edges = [];
    let edgeIdCounter = 1;

    for (const rec of displaySubset) {
      const rels = rec.relationships || [];
      for (const rel of rels) {
        if (displayedIdSet.has(rel.targetId)) {
          edges.push({
            id: `e_${edgeIdCounter++}`,
            from: rec.id,
            to: rel.targetId,
            arrows: 'to',
            label: rel.type,
            font: { color: '#64748b', size: 9, align: 'middle' },
            color: { color: 'rgba(255, 255, 255, 0.15)', highlight: '#3b82f6' },
            smooth: { type: 'continuous' }
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
        solver: 'forceAtlas2Based',
        forceAtlas2Based: {
          gravitationalConstant: -35,
          centralGravity: 0.008,
          springLength: 85,
          springConstant: 0.18
        },
        stabilization: { iterations: 100 }
      },
      interaction: {
        hover: true,
        tooltipDelay: 100,
        zoomView: true
      }
    };

    if (networkInstance) {
      networkInstance.destroy();
    }

    networkInstance = new window.vis.Network(canvasContainer, data, options);

    // Node click interaction
    networkInstance.on('click', (params) => {
      if (params.nodes && params.nodes.length > 0) {
        const clickedId = params.nodes[0];
        const record = rawRecords.find(r => r.id === clickedId);
        selectedNodeData = record || null;

        const drawer = container.querySelector('#graph-details-drawer');
        if (drawer) {
          drawer.innerHTML = renderNodeDetails(selectedNodeData);
          drawer.style.display = 'block';

          const btnClose = drawer.querySelector('#btn-close-drawer');
          if (btnClose) {
            btnClose.addEventListener('click', () => {
              selectedNodeData = null;
              drawer.style.display = 'none';
            });
          }
        }
      }
    });
  }

  const unsubscribe = subscribe(update);
  update();
  return unsubscribe;
}
