/**
 * Knowledge Repair Tool - Single Page Application Router & Shell Controller
 * 
 * Manages:
 * - Hash-based client routing (#/dashboard, #/issues, #/duplicates, #/contradictions, #/audit, #/quality, #/graph)
 * - Theme switching with accessible contrast and localStorage persistence
 * - Mobile responsive drawer & sidebar navigation
 * - Navigation links active state & badge indicators
 * - Topbar dataset indicator and persistence status
 * - Connection status monitoring with user-facing alerts
 */

import { state, subscribe, runPipeline, loadDataset, showToast } from './state.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderIssues } from './pages/issues.js';
import { renderDuplicates } from './pages/duplicates.js';
import { renderContradictions } from './pages/contradictions.js';
import { renderAuditTrail } from './pages/auditTrail.js';
import { renderQualityReport } from './pages/quality.js';
import { renderGraph } from './pages/graph.js';
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
  '#/graph': renderGraph
};

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

function updateThemeToggleIcon(theme) {
  const themeToggle = document.getElementById('theme-toggle');
  if (!themeToggle) return;

  if (theme === 'dark') {
    themeToggle.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
      </svg>
    `;
    themeToggle.title = 'Switch to Light Theme';
  } else {
    themeToggle.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
      </svg>
    `;
    themeToggle.title = 'Switch to Dark Theme';
  }
}

function initTheme() {
  const savedTheme = localStorage.getItem('kr_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeToggleIcon(savedTheme);

  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('kr_theme', next);
      updateThemeToggleIcon(next);
      showToast(`Switched to ${next} theme`, 'info', 2000);
    });
  }
}

function initMobileSidebar() {
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('app-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');

  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', () => {
      const isOpen = sidebar.classList.toggle('open');
      if (backdrop) backdrop.classList.toggle('active', isOpen);
    });
  }

  if (backdrop && sidebar) {
    backdrop.addEventListener('click', () => {
      sidebar.classList.remove('open');
      backdrop.classList.remove('active');
    });
  }

  // Auto-close sidebar on mobile after clicking navigation links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        if (backdrop) backdrop.classList.remove('active');
      }
    });
  });
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
    initMobileSidebar();
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
