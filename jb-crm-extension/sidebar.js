/**
 * Sidebar Script for JB Solicitors CRM Automation
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

// State
let currentLeads = [];
let isProcessing = false;

// DOM Elements
const elements = {
  // Main sidebar
  statusIndicator: document.getElementById('statusIndicator'),
  pendingCount: document.getElementById('pendingCount'),
  fetchLeadsBtn: document.getElementById('fetchLeadsBtn'),
  startAutomationBtn: document.getElementById('startAutomationBtn'),
  progressSection: document.getElementById('progressSection'),
  progressFill: document.getElementById('progressFill'),
  progressText: document.getElementById('progressText'),
  currentLead: document.getElementById('currentLead'),
  logContent: document.getElementById('logContent'),
  clearLogBtn: document.getElementById('clearLogBtn'),
  settingsBtn: document.getElementById('settingsBtn'),

  // Modal
  settingsModal: document.getElementById('settingsModal'),
  modalOverlay: document.getElementById('modalOverlay'),
  closeModalBtn: document.getElementById('closeModalBtn'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  saveStatus: document.getElementById('saveStatus'),
  connectionResult: document.getElementById('connectionResult'),

  // Tabs
  tabs: document.querySelectorAll('.tab'),
  tabContents: document.querySelectorAll('.tab-content'),

  // General settings
  defaultAssignedTo: document.getElementById('defaultAssignedTo'),
  defaultAssignedBy: document.getElementById('defaultAssignedBy'),
  defaultSource: document.getElementById('defaultSource'),
  defaultAreaOfLaw: document.getElementById('defaultAreaOfLaw'),

  // API settings
  apiUrl: document.getElementById('apiUrl'),
  testConnectionBtn: document.getElementById('testConnectionBtn'),

  // Automation settings
  batchDelay: document.getElementById('batchDelay'),
  batchSize: document.getElementById('batchSize'),
  autoStart: document.getElementById('autoStart'),
  autoSave: document.getElementById('autoSave'),
  markProcessed: document.getElementById('markProcessed'),

  // Advanced settings
  retryAttempts: document.getElementById('retryAttempts'),
  timeout: document.getElementById('timeout'),
  debugMode: document.getElementById('debugMode'),
  highlightFields: document.getElementById('highlightFields'),

  // Danger zone
  clearLogsBtn: document.getElementById('clearLogsBtn'),
  resetSettingsBtn: document.getElementById('resetSettingsBtn')
};

// Initialize
document.addEventListener('DOMContentLoaded', init);

function init() {
  loadLogs();
  loadCachedLeads();
  checkConfig();
  setupEventListeners();
  checkConnection();
  loadSettings();

  chrome.runtime.onMessage.addListener(handleMessage);
}

function setupEventListeners() {
  // Main sidebar
  elements.fetchLeadsBtn.addEventListener('click', fetchLeads);
  elements.startAutomationBtn.addEventListener('click', startAutomation);
  elements.clearLogBtn.addEventListener('click', clearLogs);
  elements.settingsBtn.addEventListener('click', openSettingsModal);

  // Modal
  elements.closeModalBtn.addEventListener('click', closeSettingsModal);
  elements.modalOverlay.addEventListener('click', closeSettingsModal);
  elements.saveSettingsBtn.addEventListener('click', saveSettings);

  // Tabs
  elements.tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Test connection
  elements.testConnectionBtn.addEventListener('click', testConnection);

  // Clear logs (danger zone)
  elements.clearLogsBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all logs?')) {
      clearLogs();
      addLog('info', 'All logs cleared');
    }
  });

  // Reset settings
  elements.resetSettingsBtn.addEventListener('click', resetSettings);

  // Close modal on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && elements.settingsModal.classList.contains('open')) {
      closeSettingsModal();
    }
  });
}

function handleMessage(message, sender, sendResponse) {
  if (message.type === 'LOG') {
    addLog(message.level, message.message);
  } else if (message.type === 'PROGRESS') {
    updateProgress(message.current, message.total, message.lead);
  } else if (message.type === 'COMPLETE') {
    automationComplete(message.success, message.error);
  }
  return true;
}

// ============================================
// MODAL FUNCTIONS
// ============================================

function openSettingsModal() {
  elements.settingsModal.classList.add('open');
  loadSettings();
}

function closeSettingsModal() {
  elements.settingsModal.classList.remove('open');
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
}

function getSettingsFormValues() {
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

async function saveSettings() {
  const config = getSettingsFormValues();

  // Convert numeric values
  config.batchDelay = parseInt(config.batchDelay);
  config.batchSize = parseInt(config.batchSize);
  config.retryAttempts = parseInt(config.retryAttempts);
  config.timeout = parseInt(config.timeout);

  // Show saving status
  showSaveStatus('saving');

  try {
    await chrome.storage.sync.set(config);

    showSaveStatus('saved');

    // Notify background script
    chrome.runtime.sendMessage({
      type: 'UPDATE_CONFIG',
      config: config
    });

    // Recheck connection with new settings
    await checkConnection();

    setTimeout(() => {
      elements.saveStatus.textContent = '';
      elements.saveStatus.className = 'status';
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
      elements.saveStatus.textContent = 'Settings saved!';
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
        showConnectionResult('success', `Connected! Found ${data.lastRow - 1} leads.`);
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
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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

async function resetSettings() {
  if (confirm('Are you sure you want to reset all settings to default? This cannot be undone.')) {
    await chrome.storage.sync.clear();

    // Set default values
    await chrome.storage.sync.set(DEFAULT_CONFIG);

    // Reload settings
    await loadSettings();

    addLog('info', 'Settings reset to defaults');
  }
}

// ============================================
// ORIGINAL SIDEBAR FUNCTIONS
// ============================================

// Configuration
async function checkConfig() {
  const config = await chrome.storage.sync.get({ apiUrl: '' });

  if (!config.apiUrl) {
    addLog('warning', 'Please configure the API URL in Settings');
    updateConnectionStatus('error');
    return false;
  }

  return true;
}

async function checkConnection() {
  const hasConfig = await checkConfig();
  if (!hasConfig) return;

  updateConnectionStatus('connecting');

  try {
    const config = await chrome.storage.sync.get({ apiUrl: '' });
    const response = await fetch(`${config.apiUrl}?action=getSheetData`);

    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        updateConnectionStatus('connected');
        elements.fetchLeadsBtn.disabled = false;
      } else {
        throw new Error(data.error || 'API error');
      }
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    updateConnectionStatus('error');
    // Only show error in log if not during initial load
    if (elements.logContent.children.length > 0) {
      addLog('error', `Connection failed: ${error.message}`);
    }
  }
}

function updateConnectionStatus(status) {
  elements.statusIndicator.className = 'status-indicator ' + status;
}

// Lead Management
async function loadCachedLeads() {
  const result = await chrome.storage.local.get({ cachedLeads: null, cachedLeadsTimestamp: 0 });
  const cachedLeads = result.cachedLeads;
  const timestamp = result.cachedLeadsTimestamp || 0;

  if (cachedLeads && cachedLeads.length > 0) {
    currentLeads = cachedLeads;
    elements.pendingCount.textContent = currentLeads.length;
    elements.startAutomationBtn.disabled = false;

    const cacheAge = Math.floor((Date.now() - timestamp) / 1000 / 60); // minutes ago
    addLog('info', `Loaded ${currentLeads.length} cached leads (${cacheAge} min ago)`);
  }
}

async function fetchLeads() {
  elements.fetchLeadsBtn.disabled = true;
  addLog('info', 'Fetching fresh leads...');

  try {
    const config = await chrome.storage.sync.get({ apiUrl: '' });
    const response = await fetch(`${config.apiUrl}?action=getUnprocessedLeads`);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();

    if (data.success) {
      currentLeads = data.leads || [];
      elements.pendingCount.textContent = currentLeads.length;

      // Cache the leads in storage
      await chrome.storage.local.set({
        cachedLeads: currentLeads,
        cachedLeadsTimestamp: Date.now()
      });

      if (currentLeads.length > 0) {
        addLog('success', `Found ${currentLeads.length} leads`);
        elements.startAutomationBtn.disabled = false;
      } else {
        addLog('info', 'No leads found');
        elements.startAutomationBtn.disabled = true;
      }
    } else {
      throw new Error(data.error || 'Failed to fetch');
    }
  } catch (error) {
    addLog('error', `Failed: ${error.message}`);
  } finally {
    elements.fetchLeadsBtn.disabled = false;
  }
}

async function startAutomation() {
  if (isProcessing) return;
  if (currentLeads.length === 0) {
    addLog('warning', 'No leads to process');
    return;
  }

  isProcessing = true;
  elements.progressSection.style.display = 'block';
  elements.startAutomationBtn.disabled = true;
  elements.fetchLeadsBtn.disabled = true;

  addLog('info', `Starting automation (${currentLeads.length} leads)`);

  chrome.runtime.sendMessage({
    type: 'START_AUTOMATION',
    leads: currentLeads
  }, (response) => {
    if (response) {
      automationComplete(response.success, response.error);
    }
  });
}

function updateProgress(current, total, lead) {
  const percentage = Math.round((current / total) * 100);
  elements.progressText.textContent = `${current} / ${total}`;
  elements.progressFill.style.width = `${percentage}%`;

  if (lead) {
    elements.currentLead.textContent = `Processing: ${lead.givenName} ${lead.lastName}`;
  }
}

function automationComplete(success, error) {
  isProcessing = false;
  elements.startAutomationBtn.disabled = false;
  elements.fetchLeadsBtn.disabled = false;

  if (success) {
    addLog('success', `Complete! Processed ${currentLeads.length} leads`);
    elements.currentLead.textContent = 'Complete!';

    // Clear cached leads after successful automation
    chrome.storage.local.remove(['cachedLeads', 'cachedLeadsTimestamp']);
    currentLeads = [];
    elements.pendingCount.textContent = '-';
    elements.startAutomationBtn.disabled = true;
  } else {
    addLog('error', `Failed: ${error}`);
    elements.currentLead.textContent = 'Failed';
  }

  setTimeout(() => checkConnection(), 2000);
}

// Logging
function addLog(level, message) {
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${level}`;
  logEntry.textContent = message;

  elements.logContent.appendChild(logEntry);
  elements.logContent.scrollTop = elements.logContent.scrollHeight;

  saveLog(level, message);
}

function saveLog(level, message) {
  chrome.storage.local.get({ logs: [] }, (result) => {
    const logs = result.logs || [];
    logs.push({ level, message, timestamp: Date.now() });

    if (logs.length > 100) logs.shift();

    chrome.storage.local.set({ logs });
  });
}

function loadLogs() {
  chrome.storage.local.get({ logs: [] }, (result) => {
    const logs = result.logs || [];
    logs.forEach(log => {
      const logEntry = document.createElement('div');
      logEntry.className = `log-entry ${log.level}`;
      logEntry.textContent = log.message;
      elements.logContent.appendChild(logEntry);
    });

    elements.logContent.scrollTop = elements.logContent.scrollHeight;
  });
}

function clearLogs() {
  elements.logContent.innerHTML = '';
  chrome.storage.local.set({ logs: [] });
}
