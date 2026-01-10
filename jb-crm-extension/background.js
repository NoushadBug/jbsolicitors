/**
 * Background Service Worker for JB Solicitors CRM Automation
 * CRM: https://portal.redraincorp.com/enquiriesSummary
 * Manages automation workflow and API communication
 */

// CRM Configuration
const CRM_URL = 'https://portal.redraincorp.com';
const CRM_REQUIRED_PATH = '/enquiriesSummary';

// State
let isProcessing = false;
let currentLeads = [];
let processedLeads = [];
let failedLeads = [];

// Configuration
let config = {
  apiUrl: '',
  batchDelay: 2000,
  autoStart: false,
  retryAttempts: 3
};

// Enable side panel toggle on extension icon click
// This must be called at the top level to ensure it's set immediately
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// Initialize on install/startup
chrome.runtime.onInstalled.addListener(() => {
  console.log('[JB Solicitors] Extension installed');

  // Enable side panel toggle when clicking the extension icon
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  chrome.storage.sync.get({
    apiUrl: '',
    batchDelay: 2000,
    autoStart: false,
    retryAttempts: 3
  }, (result) => {
    config = { ...config, ...result };
  });

  chrome.contextMenus.create({
    id: 'fillCurrentForm',
    title: 'Fill CRM Form from Next Lead',
    contexts: ['page', 'selection']
  });
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[JB Solicitors] Extension started');

  // Ensure side panel toggle is enabled on startup
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  chrome.storage.sync.get({
    apiUrl: '',
    batchDelay: 2000,
    autoStart: false,
    retryAttempts: 3
  }, (result) => {
    config = { ...config, ...result };
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'fillCurrentForm') {
    chrome.tabs.sendMessage(tab.id, { type: 'GET_NEXT_LEAD' });
  }
});

// Handle all messages from sidebar, content scripts, etc.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'CLOSE_SIDEBAR') {
    chrome.sidePanel.setOptions({ enabled: false }).then(() => {
      setTimeout(() => {
        chrome.sidePanel.setOptions({ enabled: true });
      }, 100);
    });
    sendResponse({ success: true });
    return true;
  }

  if (request.type === 'START_AUTOMATION') {
    startAutomation(request.leads)
      .then(result => sendResponse({ type: 'COMPLETE', success: true }))
      .catch(error => sendResponse({ type: 'COMPLETE', success: false, error: error.message }));
    return true;
  }

  if (request.type === 'STOP_AUTOMATION') {
    stopAutomation();
    sendResponse({ success: true });
    return true;
  }

  if (request.type === 'GET_CONFIG') {
    sendResponse({ config });
    return true;
  }

  if (request.type === 'UPDATE_CONFIG') {
    config = { ...config, ...request.config };
    chrome.storage.sync.set(request.config);
    sendResponse({ success: true });
    return true;
  }

  if (request.type === 'LOG') {
    broadcastToSidebar(request);
    return true;
  }
});

// Automation functions
async function startAutomation(leads) {
  if (isProcessing) {
    throw new Error('Automation already in progress');
  }

  isProcessing = true;
  currentLeads = leads;
  processedLeads = [];
  failedLeads = [];

  log('info', `Starting automation for ${leads.length} leads`);

  // Look for existing CRM tab
  const tabs = await chrome.tabs.query({ url: `${CRM_URL}/*` });

  if (tabs.length > 0) {
    // Found existing CRM tab, navigate to enquiriesSummary
    const crmTab = tabs[0];
    log('info', `Found existing CRM tab, navigating to: ${CRM_URL}${CRM_REQUIRED_PATH}`);

    await chrome.tabs.update(crmTab.id, {
      url: `${CRM_URL}${CRM_REQUIRED_PATH}`,
      active: true
    });

    await delay(2000);
    return processLeadsInTab(crmTab.id, leads);
  }

  // No CRM tab found, create new one
  log('info', `No CRM tab found, opening: ${CRM_URL}${CRM_REQUIRED_PATH}`);
  const newTab = await chrome.tabs.create({
    url: `${CRM_URL}${CRM_REQUIRED_PATH}`,
    active: true
  });

  await delay(2000);
  return processLeadsInTab(newTab.id, leads);
}

async function processLeadsInTab(tabId, leads) {
  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const progress = {
      current: i + 1,
      total: leads.length,
      lead: lead
    };

    broadcastToSidebar({ type: 'PROGRESS', ...progress });
    log('info', `Processing lead ${i + 1}/${leads.length}: ${lead.givenName} ${lead.lastName}`);

    try {
      const result = await fillLeadInTab(tabId, lead);

      if (result.success) {
        await markLeadProcessed(lead.rowIndex);
        processedLeads.push(lead);
        log('success', `Successfully processed: ${lead.givenName} ${lead.lastName}`);
      } else {
        throw new Error(result.error || 'Failed to fill form');
      }
    } catch (error) {
      failedLeads.push({ lead, error: error.message });
      log('error', `Failed to process ${lead.givenName} ${lead.lastName}: ${error.message}`);
    }

    if (i < leads.length - 1) {
      await delay(config.batchDelay);
    }
  }

  isProcessing = false;
  log('info', `Automation complete: ${processedLeads.length} succeeded, ${failedLeads.length} failed`);

  if (failedLeads.length > 0) {
    log('warning', `Failed leads: ${failedLeads.map(f => f.lead.givenName + ' ' + f.lead.lastName).join(', ')}`);
  }
}

async function stopAutomation() {
  isProcessing = false;
  log('info', 'Automation stopped by user');
}

async function fillLeadInTab(tabId, lead) {
  return new Promise((resolve, reject) => {
    const listener = (request, sender) => {
      if (request.type === 'FORM_COMPLETE') {
        chrome.runtime.onMessage.removeListener(listener);
        if (request.success) {
          resolve(request);
        } else {
          reject(new Error(request.error));
        }
      }
    };

    chrome.runtime.onMessage.addListener(listener);

    chrome.tabs.sendMessage(tabId, {
      type: 'FILL_FORM',
      lead: lead
    });

    setTimeout(() => {
      chrome.runtime.onMessage.removeListener(listener);
      reject(new Error('Timeout: Form filling took too long'));
    }, 30000);
  });
}

async function markLeadProcessed(rowIndex) {
  try {
    const response = await fetch(
      `${config.apiUrl}?action=markLeadProcessed&rowIndex=${rowIndex}`
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to mark lead as processed');
    }
  } catch (error) {
    console.error('Failed to mark lead as processed:', error);
  }
}

// Helper functions
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(level, message) {
  console.log(`[JB Solicitors] [${level.toUpperCase()}] ${message}`);

  chrome.storage.local.get({ logs: [] }, (result) => {
    const logs = result.logs || [];
    logs.push({
      level,
      message,
      timestamp: Date.now()
    });

    if (logs.length > 100) {
      logs.shift();
    }

    chrome.storage.local.set({ logs });
  });
}

function broadcastToSidebar(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Sidebar not open, ignore
  });
}

// Alarm for periodic sync
chrome.alarms.create('syncLeads', { periodInMinutes: 30 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'syncLeads' && config.autoStart) {
    log('info', 'Auto-sync triggered');

    try {
      const response = await fetch(`${config.apiUrl}?action=getUnprocessedLeads`);
      const data = await response.json();

      if (data.success && data.leads && data.leads.length > 0) {
        log('info', `Found ${data.leads.length} new leads`);
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'JB Solicitors - New Leads',
          message: `${data.leads.length} unprocessed leads available`,
          buttons: [{ title: 'Process Now' }]
        });
      }
    } catch (error) {
      log('error', `Auto-sync failed: ${error.message}`);
    }
  }
});

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (buttonIndex === 0) {
    chrome.sidePanel.open();
  }
  chrome.notifications.clear(notificationId);
});
