/**
 * Sidebar Script for JB Solicitors CRM Automation
 * Side Panel version - stays open while working on the CRM
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
  leadPreview: document.getElementById('leadPreview'),
  leadName: document.getElementById('leadName'),
  leadEmail: document.getElementById('leadEmail'),
  leadCompany: document.getElementById('leadCompany'),
  logContent: document.getElementById('logContent'),
  clearLogBtn: document.getElementById('clearLogBtn'),
  optionsBtn: document.getElementById('optionsBtn'),
  refreshBtn: document.getElementById('refreshBtn')
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
  elements.refreshBtn.addEventListener('click', () => {
    checkConnection();
    addLog('info', 'Refreshing connection...');
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
    addLog('warning', 'Please configure the Web App URL in Settings');
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
  const indicator = elements.connectionStatus.querySelector('.status-indicator');
  const statusText = elements.connectionText;

  indicator.className = 'status-indicator ' + status;
  statusText.textContent = text;
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

        // Show first lead preview
        showLeadPreview(currentLeads[0]);
      } else {
        addLog('info', 'No unprocessed leads found');
        elements.leadPreview.style.display = 'none';
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

function showLeadPreview(lead) {
  if (!lead) return;

  elements.leadPreview.style.display = 'block';
  elements.leadName.textContent = `${lead.givenName} ${lead.lastName}`;
  elements.leadEmail.textContent = lead.email || 'N/A';
  elements.leadCompany.textContent = lead.organizationName || 'N/A';
}

function updateProgress(current, total, lead) {
  const percentage = Math.round((current / total) * 100);
  elements.progressCount.textContent = `${current} / ${total}`;
  elements.progressFill.style.width = `${percentage}%`;

  if (lead) {
    elements.currentLead.textContent = `Processing: ${lead.givenName} ${lead.lastName}`;
    showLeadPreview(lead);
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

  // Refresh pending count after a delay
  setTimeout(() => {
    checkConnection();
  }, 2000);
}

// Logging
function addLog(level, message) {
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${level}`;
  logEntry.innerHTML = `<span class="log-message">${escapeHtml(message)}</span>`;

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
      const logEntry = document.createElement('div');
      logEntry.className = `log-entry ${log.level}`;
      logEntry.innerHTML = `<span class="log-message">${escapeHtml(log.message)}</span>`;
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
