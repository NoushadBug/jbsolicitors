/**
 * Options Page Script for JB Solicitors CRM Automation
 */

// Default configuration
const DEFAULT_CONFIG = {
  // General
  defaultAssignedTo: 'Audrey',
  defaultAssignedBy: 'Audrey',
  defaultSource: 'Other',
  defaultAreaOfLaw: 'Advice',

  // API
  apiUrl: '',

  // Automation
  batchDelay: 2000,
  batchSize: 10,
  autoStart: false,
  autoSave: true,
  markProcessed: true,

  // Advanced
  retryAttempts: 3,
  timeout: 30000,
  debugMode: false,
  highlightFields: true
};

// DOM Elements
const elements = {};

// Initialize
document.addEventListener('DOMContentLoaded', init);

function init() {
  // Cache DOM elements
  cacheElements();

  // Load current settings
  loadSettings();

  // Setup event listeners
  setupEventListeners();
}

function cacheElements() {
  // Tabs
  elements.tabs = document.querySelectorAll('.tab');
  elements.tabContents = document.querySelectorAll('.tab-content');

  // General
  elements.defaultAssignedTo = document.getElementById('defaultAssignedTo');
  elements.defaultAssignedBy = document.getElementById('defaultAssignedBy');
  elements.defaultSource = document.getElementById('defaultSource');
  elements.defaultAreaOfLaw = document.getElementById('defaultAreaOfLaw');

  // API
  elements.apiUrl = document.getElementById('apiUrl');
  elements.testConnectionBtn = document.getElementById('testConnectionBtn');
  elements.connectionResult = document.getElementById('connectionResult');

  // Automation
  elements.batchDelay = document.getElementById('batchDelay');
  elements.batchSize = document.getElementById('batchSize');
  elements.autoStart = document.getElementById('autoStart');
  elements.autoSave = document.getElementById('autoSave');
  elements.markProcessed = document.getElementById('markProcessed');

  // Advanced
  elements.retryAttempts = document.getElementById('retryAttempts');
  elements.timeout = document.getElementById('timeout');
  elements.debugMode = document.getElementById('debugMode');
  elements.highlightFields = document.getElementById('highlightFields');

  // Danger zone
  elements.clearLogsBtn = document.getElementById('clearLogsBtn');
  elements.resetSettingsBtn = document.getElementById('resetSettingsBtn');

  // Footer
  elements.saveBtn = document.getElementById('saveBtn');
  elements.saveStatus = document.getElementById('saveStatus');
}

function setupEventListeners() {
  // Tab switching
  elements.tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Save button
  elements.saveBtn.addEventListener('click', saveSettings);

  // Test connection
  elements.testConnectionBtn.addEventListener('click', testConnection);

  // Clear logs
  elements.clearLogsBtn.addEventListener('click', clearLogs);

  // Reset settings
  elements.resetSettingsBtn.addEventListener('click', resetSettings);

  // Show unsaved changes warning
  window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

function switchTab(tabName) {
  // Update tab buttons
  elements.tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  // Update tab content
  elements.tabContents.forEach(content => {
    content.classList.toggle('active', content.id === tabName);
  });
}

async function loadSettings() {
  const config = await chrome.storage.sync.get(DEFAULT_CONFIG);

  // Apply to form fields
  elements.defaultAssignedTo.value = config.defaultAssignedTo || DEFAULT_CONFIG.defaultAssignedTo;
  elements.defaultAssignedBy.value = config.defaultAssignedBy || DEFAULT_CONFIG.defaultAssignedBy;
  elements.defaultSource.value = config.defaultSource || DEFAULT_CONFIG.defaultSource;
  elements.defaultAreaOfLaw.value = config.defaultAreaOfLaw || DEFAULT_CONFIG.defaultAreaOfLaw;

  elements.apiUrl.value = config.apiUrl || '';

  elements.batchDelay.value = config.batchDelay || DEFAULT_CONFIG.batchDelay;
  elements.batchSize.value = config.batchSize || DEFAULT_CONFIG.batchSize;
  elements.autoStart.checked = config.autoStart || false;
  elements.autoSave.checked = config.autoSave !== false;
  elements.markProcessed.checked = config.markProcessed !== false;

  elements.retryAttempts.value = config.retryAttempts || DEFAULT_CONFIG.retryAttempts;
  elements.timeout.value = config.timeout || DEFAULT_CONFIG.timeout;
  elements.debugMode.checked = config.debugMode || false;
  elements.highlightFields.checked = config.highlightFields !== false;

  // Store original values for change detection
  elements.originalValues = getFormValues();
}

function getFormValues() {
  return {
    defaultAssignedTo: elements.defaultAssignedTo.value,
    defaultAssignedBy: elements.defaultAssignedBy.value,
    defaultSource: elements.defaultSource.value,
    defaultAreaOfLaw: elements.defaultAreaOfLaw.value,
    apiUrl: elements.apiUrl.value,
    batchDelay: elements.batchDelay.value,
    batchSize: elements.batchSize.value,
    autoStart: elements.autoStart.checked,
    autoSave: elements.autoSave.checked,
    markProcessed: elements.markProcessed.checked,
    retryAttempts: elements.retryAttempts.value,
    timeout: elements.timeout.value,
    debugMode: elements.debugMode.checked,
    highlightFields: elements.highlightFields.checked
  };
}

function hasUnsavedChanges() {
  const currentValues = getFormValues();

  for (const key in currentValues) {
    if (currentValues[key] !== elements.originalValues[key]) {
      return true;
    }
  }

  return false;
}

async function saveSettings() {
  const config = getFormValues();

  // Convert numeric values
  config.batchDelay = parseInt(config.batchDelay);
  config.batchSize = parseInt(config.batchSize);
  config.retryAttempts = parseInt(config.retryAttempts);
  config.timeout = parseInt(config.timeout);

  // Show saving status
  showSaveStatus('saving');

  try {
    await chrome.storage.sync.set(config);

    // Update original values
    elements.originalValues = config;

    showSaveStatus('saved');

    // Notify background script
    chrome.runtime.sendMessage({
      type: 'UPDATE_CONFIG',
      config: config
    });

    setTimeout(() => {
      elements.saveStatus.textContent = '';
    }, 2000);
  } catch (error) {
    showSaveStatus('error', error.message);
  }
}

function showSaveStatus(status, message) {
  elements.saveStatus.className = 'status ' + status;

  switch (status) {
    case 'saving':
      elements.saveStatus.textContent = 'Saving...';
      break;
    case 'saved':
      elements.saveStatus.textContent = 'Settings saved successfully!';
      break;
    case 'error':
      elements.saveStatus.textContent = 'Error: ' + message;
      break;
  }
}

async function testConnection() {
  const apiUrl = elements.apiUrl.value.trim();

  if (!apiUrl) {
    showConnectionResult('error', 'Please enter an API URL first');
    return;
  }

  // Validate URL format
  try {
    new URL(apiUrl);
  } catch {
    showConnectionResult('error', 'Invalid URL format');
    return;
  }

  // Disable button and show loading
  elements.testConnectionBtn.disabled = true;
  elements.testConnectionBtn.textContent = 'Testing...';
  elements.connectionResult.style.display = 'none';

  try {
    const testUrl = apiUrl.includes('?') ? apiUrl + '&action=getSheetData' : apiUrl + '?action=getSheetData';

    const response = await fetch(testUrl);

    if (response.ok) {
      const data = await response.json();

      if (data.success) {
        showConnectionResult('success', `Connected! Found ${data.lastRow - 1} leads in the sheet.`);
      } else {
        showConnectionResult('error', 'API Error: ' + (data.error || 'Unknown error'));
      }
    } else {
      showConnectionResult('error', `HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    showConnectionResult('error', 'Connection failed: ' + error.message);
  } finally {
    elements.testConnectionBtn.disabled = false;
    elements.testConnectionBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      Test Connection
    `;
  }
}

function showConnectionResult(type, message) {
  elements.connectionResult.className = 'connection-result ' + type;
  elements.connectionResult.textContent = message;
  elements.connectionResult.style.display = 'block';
}

async function clearLogs() {
  if (confirm('Are you sure you want to clear all logs?')) {
    await chrome.storage.local.set({ logs: [] });
    alert('Logs cleared successfully');
  }
}

async function resetSettings() {
  if (confirm('Are you sure you want to reset all settings to default? This cannot be undone.')) {
    await chrome.storage.sync.clear();

    // Set default values
    await chrome.storage.sync.set(DEFAULT_CONFIG);

    // Reload the page
    location.reload();
  }
}
