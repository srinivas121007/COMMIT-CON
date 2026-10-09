/**
 * Knowledge Repair Tool - Single Page Application Router & Shell Controller
 * 
 * Manages:
 * - Hash-based client routing (#/dashboard, #/issues, #/duplicates, etc.)
 * - Theme switching (Dark/Light mode persistence in localStorage)
 * - Navigation links active state
 * - Topbar dataset indicator and persistence status
 */

import { state, subscribe, runPipeline, loadDataset, showToast } from './state.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderIssues } from './pages/issues.js';
import { renderDuplicates } from './pages/duplicates.js';
import { renderContradictions } from './pages/contradictions.js';
import { renderAuditTrail } from './pages/auditTrail.js';
import { renderQualityReport } from './pages/quality.js';
import { createDatasetPackage } from '../data/generateDataset.js';

let activeUnsubscribe = null;

// Routing registry
const routes = {
  '#/dashboard': renderDashboard,
  '#/issues': renderIssues,
  '#/duplicates': renderDuplicates,
  '#/contradictions': renderContradictions,
  '#/audit': renderAuditTrail,
  '#/quality': renderQualityReport,
  '#/graph': (container) => renderPlaceholderPage(container, 'Entity Relationship Graph', 'Stage 5: Interactive Vis-network knowledge graph visualizing interconnected People, Places, and Events.')
};

function renderPlaceholderPage(container, title, description) {
  container.innerHTML = `
    <div style="padding: 20px;">
      <h1 style="font-size: 1.75rem; font-weight: 700; margin-bottom: 8px;">${title}</h1>
      <p style="color: var(--text-secondary); margin-bottom: 24px;">${description}</p>
      
      <div class="card" style="text-align: center; padding: 60px 20px;">
        <div style="width: 56px; height: 56px; border-radius: 12px; background: rgba(59, 130, 246, 0.1); color: #60a5fa; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
            <polyline points="2 17 12 22 22 17"></polyline>
            <polyline points="2 12 12 17 22 12"></polyline>
          </svg>
        </div>
        <h3 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 8px;">Scheduled for Next Stage</h3>
        <p style="color: var(--text-muted); font-size: 0.875rem; max-width: 480px; margin: 0 auto 20px;">
          This module is part of the staged roadmap. Return to the Dashboard to run pipeline analysis or explore the Issues and Duplicates pages.
        </p>
        <a href="#/dashboard" class="btn btn-primary btn-sm">Return to Dashboard</a>
      </div>
    </div>
  `;
  return () => {};
}

function handleNavigation() {
  const hash = window.location.hash || '#/dashboard';
  const cleanHash = hash.split('?')[0];
  const renderFn = routes[cleanHash] || routes['#/dashboard'];

  // Clean up previous page subscription
  if (typeof activeUnsubscribe === 'function') {
    activeUnsubscribe();
    activeUnsubscribe = null;
  }

  // Update navigation link active class
  document.querySelectorAll('.nav-link').forEach(link => {
    if (link.getAttribute('href') === cleanHash) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  const appView = document.getElementById('app-view');
  if (appView) {
    activeUnsubscribe = renderFn(appView);
    window.scrollTo(0, 0);
  }
}

function initTheme() {
  const savedTheme = localStorage.getItem('kr_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('kr_theme', next);
    });
  }
}

function updateHeader() {
  const dsBadge = document.getElementById('header-dataset-name');
  if (dsBadge) {
    dsBadge.textContent = state.records.length > 0
      ? `${state.datasetName} (${state.records.length} records)`
      : 'No Dataset Loaded';
  }

  const persistIndicator = document.getElementById('persistence-status');
  if (persistIndicator) {
    const isFirestore = state.connection.isConnected;
    persistIndicator.innerHTML = `
      <span class="status-dot ${isFirestore ? '' : 'local'}"></span>
      <span>${isFirestore ? 'Firestore Online' : 'Local Storage (IndexedDB)'}</span>
    `;
  }

  // Update badge counters on nav links
  const issuesBadge = document.getElementById('nav-issues-count');
  if (issuesBadge) {
    const count = state.issues.filter(i => i.status === 'open').length;
    issuesBadge.textContent = count;
    issuesBadge.style.display = count > 0 ? 'inline-block' : 'none';
  }

  const dupsBadge = document.getElementById('nav-dups-count');
  if (dupsBadge) {
    const count = state.duplicatePairs.length;
    dupsBadge.textContent = count;
    dupsBadge.style.display = count > 0 ? 'inline-block' : 'none';
  }
}

// Global initialization
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    subscribe(updateHeader);

    window.addEventListener('hashchange', handleNavigation);

    // Auto-load sample corrupted dataset on initial boot so workspace is immediately ready
    if (state.records.length === 0) {
      try {
        const pkg = createDatasetPackage(42);
        await loadDataset({
          datasetId: `init_${Date.now()}`,
          datasetName: 'Corrupted Historical Dataset',
          records: pkg.corrupted.records,
          groundTruthMutations: pkg.corrupted.groundTruthMutations
        });
      } catch (e) {
        console.warn('Initial dataset auto-load error:', e);
      }
    }

    // Navigate to current hash
    if (!window.location.hash) {
      window.location.hash = '#/dashboard';
    } else {
      handleNavigation();
    }
  });
}
