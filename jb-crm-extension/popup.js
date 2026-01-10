/**
 * Popup Script for JB Solicitors CRM Automation
 */

// State
let currentLeads = [];
let processedCount = 0;
let isProcessing = false;

// DOM Elements
const elements = {
  connectionStatus: document.getElementById('connectionStatus'),
  connectionText: document.getElementById('connectionText'),
  pendingCount: document.getElementById('pendingCount'),
  fetchLeadsBtn: document.getElementById('fetchLeadsBtn'),
  startAutomationBtn: document.getElementById('startAutomationBtn'),
  progressSection: document.getElementById('progressSection'),
  progressCount: document.getElementById('progressCount'),
  progressFill: document.getElementById('progressFill'),
  currentLead: document.getElementById('currentLead'),
  logContent: document.getElementById('logContent'),
  clearLogBtn: document.getElementById('clearLogBtn'),
  optionsBtn: document.getElementById('optionsBtn')
};

// Initialize
document.addEventListener('DOMContentLoaded', init);

function init() {
  // Load saved logs
  loadLogs();

  // Check configuration
  checkConfig();

  // Setup event listeners
  setupEventListeners();

  // Check connection
  checkConnection();

  // Listen for messages from background
  chrome.runtime.onMessage.addListener(handleMessage);
}

function setupEventListeners() {
  elements.fetchLeadsBtn.addEventListener('click', fetchLeads);
  elements.startAutomationBtn.addEventListener('click', startAutomation);
  elements.clearLogBtn.addEventListener('click', clearLogs);
  elements.optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
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

// Configuration
async function checkConfig() {
  const config = await chrome.storage.sync.get({
    apiUrl: '',
    batchDelay: 2000,
    autoStart: false
  });

  if (!config.apiUrl) {
    addLog('warning', 'Please configure the API URL in Settings');
    updateConnectionStatus('error', 'Not Configured');
    return false;
  }

  return true;
}

async function checkConnection() {
  const hasConfig = await checkConfig();
  if (!hasConfig) return;

  updateConnectionStatus('connecting', 'Checking...');

  try {
    const config = await chrome.storage.sync.get({ apiUrl: '' });
    const response = await fetch(`${config.apiUrl}?action=getSheetData`);

    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        updateConnectionStatus('connected', 'Connected');
        addLog('success', 'Connected to API successfully');
        elements.fetchLeadsBtn.disabled = false;
      } else {
        throw new Error(data.error || 'API returned error');
      }
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    updateConnectionStatus('error', 'Connection Failed');
    addLog('error', `Connection failed: ${error.message}`);
  }
}

function updateConnectionStatus(status, text) {
  const icon = elements.connectionStatus.querySelector('.status-icon');
  const statusText = elements.connectionText;

  icon.className = `status-icon ${status}`;

  if (status !== 'connecting') {
    icon.innerHTML = getStatusIcon(status);
  }

  statusText.textContent = text;
}

function getStatusIcon(status) {
  const icons = {
    connected: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3"/>
    </svg>`,
    error: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
    </svg>`,
    info: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>`
  };
  return icons[status] || icons.info;
}

// Lead Management
async function fetchLeads() {
  elements.fetchLeadsBtn.disabled = true;
  addLog('info', 'Fetching unprocessed leads...');

  try {
    const config = await chrome.storage.sync.get({ apiUrl: '' });
    const response = await fetch(`${config.apiUrl}?action=getUnprocessedLeads`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.success) {
      currentLeads = data.leads || [];
      elements.pendingCount.textContent = currentLeads.length;

      if (currentLeads.length > 0) {
        addLog('success', `Found ${currentLeads.length} unprocessed leads`);
        elements.startAutomationBtn.disabled = false;
      } else {
        addLog('info', 'No unprocessed leads found');
      }
    } else {
      throw new Error(data.error || 'Failed to fetch leads');
    }
  } catch (error) {
    addLog('error', `Failed to fetch leads: ${error.message}`);
  } finally {
    elements.fetchLeadsBtn.disabled = false;
  }
}

async function startAutomation() {
  if (isProcessing) return;
  if (currentLeads.length === 0) {
    addLog('warning', 'No leads to process. Fetch leads first.');
    return;
  }

  isProcessing = true;
  processedCount = 0;
  elements.progressSection.style.display = 'block';
  elements.startAutomationBtn.disabled = true;
  elements.fetchLeadsBtn.disabled = true;

  addLog('info', `Starting automation for ${currentLeads.length} leads`);

  // Send leads to background script for processing
  chrome.runtime.sendMessage({
    type: 'START_AUTOMATION',
    leads: currentLeads
  });
}

function updateProgress(current, total, lead) {
  const percentage = Math.round((current / total) * 100);
  elements.progressCount.textContent = `${current} / ${total}`;
  elements.progressFill.style.width = `${percentage}%`;

  if (lead) {
    elements.currentLead.textContent = `Processing: ${lead.givenName} ${lead.lastName} (${lead.organizationName})`;
  }
}

function automationComplete(success, error) {
  isProcessing = false;
  elements.startAutomationBtn.disabled = false;
  elements.fetchLeadsBtn.disabled = false;

  if (success) {
    addLog('success', `Automation complete! Processed ${currentLeads.length} leads`);
    elements.currentLead.textContent = 'Complete!';
  } else {
    addLog('error', `Automation failed: ${error}`);
    elements.currentLead.textContent = 'Failed';
  }

  // Refresh pending count
  setTimeout(() => {
    checkConnection();
  }, 2000);
}

// Logging
function addLog(level, message) {
  const time = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });

  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${level}`;
  logEntry.innerHTML = `
    <span class="log-time">${time}</span>
    <span class="log-message">${escapeHtml(message)}</span>
  `;

  elements.logContent.appendChild(logEntry);
  elements.logContent.scrollTop = elements.logContent.scrollHeight;

  // Save to storage
  saveLog(level, message);
}

function saveLog(level, message) {
  chrome.storage.local.get({ logs: [] }, (result) => {
    const logs = result.logs || [];
    logs.push({
      level,
      message,
      timestamp: Date.now()
    });

    // Keep only last 100 logs
    if (logs.length > 100) {
      logs.shift();
    }

    chrome.storage.local.set({ logs });
  });
}

function loadLogs() {
  chrome.storage.local.get({ logs: [] }, (result) => {
    const logs = result.logs || [];
    logs.forEach(log => {
      const time = new Date(log.timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });

      const logEntry = document.createElement('div');
      logEntry.className = `log-entry ${log.level}`;
      logEntry.innerHTML = `
        <span class="log-time">${time}</span>
        <span class="log-message">${escapeHtml(log.message)}</span>
      `;
      elements.logContent.appendChild(logEntry);
    });

    elements.logContent.scrollTop = elements.logContent.scrollHeight;
  });
}

function clearLogs() {
  elements.logContent.innerHTML = '';
  chrome.storage.local.set({ logs: [] });
  addLog('info', 'Logs cleared');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
