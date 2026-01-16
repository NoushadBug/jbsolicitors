/**
 * Background Service Worker for JB Solicitors CRM Automation
 * CRM: https://portal.redraincorp.com/enquiriesSummary
 *
 * Designed for Manifest V3 service worker lifecycle:
 * - State persisted to chrome.storage for restart survival
 * - Automation broken into alarm-based steps
 * - Keep-alive mechanism during active processing
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const CRM_CONFIG = {
  url: 'https://portal.redraincorp.com',
  path: '/enquiriesSummary',
  defaultAssignee: 'Audrey',
  defaultSource: 'Other',
  defaultAreaOfLaw: 'Advice'
};

const STORAGE_KEYS = {
  STATE: 'automationState',
  CONFIG: 'automationConfig',
  LEADS: 'automationLeads',
  LOGS: 'automationLogs'
};

const ALARM_NAMES = {
  PROCESS_NEXT_LEAD: 'processNextLead',
  KEEP_ALIVE: 'keepAlive'
};

// ============================================================================
// INITIALIZATION
// ============================================================================

// Enable side panel toggle on extension icon click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

chrome.runtime.onInstalled.addListener(async () => {
  console.log('[JB CRM] Extension installed/updated');

  // Clear any stale state from previous installations
  await chrome.storage.local.clear();
  console.log('[JB CRM] Cleared all local storage');

  // Enable side panel toggle
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // Initialize default config
  const { config } = await chrome.storage.sync.get({ config: {} });
  const defaultConfig = {
    apiUrl: '',
    batchDelay: 2000,
    autoStart: false,
    retryAttempts: 3
  };
  await chrome.storage.sync.set({ config: { ...defaultConfig, ...config } });

  // Create context menu
  chrome.contextMenus.create({
    id: 'fillCurrentForm',
    title: 'Fill CRM Form from Next Lead',
    contexts: ['page', 'selection']
  });
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[JB CRM] Extension started');

  // Clear stale state on browser startup
  await chrome.storage.local.clear();
  console.log('[JB CRM] Cleared stale state on startup');

  // Ensure side panel toggle is enabled
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // Load config
  await loadConfig();
});

// ============================================================================
// STORAGE HELPERS
// ============================================================================

async function getState() {
  const { automationState } = await chrome.storage.local.get({ automationState: createInitialState() });
  return automationState;
}

async function setState(updates) {
  const currentState = await getState();
  const newState = { ...currentState, ...updates };
  await chrome.storage.local.set({ automationState: newState });
  return newState;
}

async function getLeads() {
  const { automationLeads } = await chrome.storage.local.get({ automationLeads: [] });
  return automationLeads;
}

async function setLeads(leads) {
  await chrome.storage.local.set({ automationLeads: leads });
}

async function getConfig() {
  const { config } = await chrome.storage.sync.get({ config: createDefaultConfig() });
  return config;
}

async function setConfig(updates) {
  const currentConfig = await getConfig();
  const newConfig = { ...currentConfig, ...updates };
  await chrome.storage.sync.set({ config: newConfig });
  return newConfig;
}

function createInitialState() {
  return {
    isProcessing: false,
    currentLeadIndex: 0,
    totalLeads: 0,
    processedCount: 0,
    failedCount: 0,
    crmTabId: null,
    startTime: null,
    lastActivityTime: null
  };
}

function createDefaultConfig() {
  return {
    apiUrl: '',
    batchDelay: 2000,
    autoStart: false,
    retryAttempts: 3
  };
}

async function loadConfig() {
  const { config } = await chrome.storage.sync.get({ config: createDefaultConfig() });
  return config;
}

// ============================================================================
// CONTEXT MENU
// ============================================================================

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'fillCurrentForm') {
    const crmTab = await getOrCreateCrmTab();
    if (crmTab) {
      chrome.tabs.sendMessage(crmTab.id, { type: 'GET_NEXT_LEAD' });
    }
  }
});

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[JB CRM] Message:', request.type);

  switch (request.type) {
    case 'CLOSE_SIDEBAR':
      handleCloseSidebar(sendResponse);
      return true;

    case 'START_AUTOMATION':
      handleStartAutomation(request.leads, sendResponse);
      return true;

    case 'STOP_AUTOMATION':
      handleStopAutomation(sendResponse);
      return true;

    case 'PAUSE_AUTOMATION':
      handlePauseAutomation(sendResponse);
      return true;

    case 'RESUME_AUTOMATION':
      handleResumeAutomation(sendResponse);
      return true;

    case 'RESET_AUTOMATION':
      handleResetAutomation(sendResponse);
      return true;

    case 'GET_STATE':
      getState().then(state => sendResponse({ state }));
      return true;

    case 'GET_CONFIG':
      getConfig().then(config => sendResponse({ config }));
      return true;

    case 'UPDATE_CONFIG':
      setConfig(request.config).then(config => sendResponse({ success: true, config }));
      return true;

    case 'LOG':
      handleLog(request);
      sendResponse({ success: true });
      return true;

    case 'PING':
      sendResponse({ success: true, message: 'PONG' });
      return true;

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
});

async function handleCloseSidebar(sendResponse) {
  await chrome.sidePanel.setOptions({ enabled: false });
  await delay(100);
  await chrome.sidePanel.setOptions({ enabled: true });
  sendResponse({ success: true });
}

async function handleStartAutomation(leads, sendResponse) {
  try {
    const state = await getState();

    // Check if there's stale state from a previous session
    if (state.isProcessing) {
      // Verify the CRM tab still exists
      let crmTabExists = false;
      if (state.crmTabId) {
        try {
          await chrome.tabs.get(state.crmTabId);
          crmTabExists = true;
        } catch (e) {
          // Tab doesn't exist, clear the stale state
          crmTabExists = false;
        }
      }

      // If CRM tab doesn't exist or state is old (> 1 hour), clear it
      const stateAge = Date.now() - (state.lastActivityTime || 0);
      const isStale = stateAge > 3600000; // 1 hour

      if (!crmTabExists || isStale) {
        console.log('[JB CRM] Clearing stale automation state');
        await setState({
          isProcessing: false,
          currentLeadIndex: 0,
          totalLeads: 0
        });
      } else {
        sendResponse({ success: false, error: 'Automation already in progress' });
        return;
      }
    }

    if (!leads || leads.length === 0) {
      sendResponse({ success: false, error: 'No leads to process' });
      return;
    }

    // Initialize automation state
    await setState({
      isProcessing: true,
      currentLeadIndex: 0,
      totalLeads: leads.length,
      processedCount: 0,
      failedCount: 0,
      startTime: Date.now(),
      lastActivityTime: Date.now()
    });

    // Store leads
    await setLeads(leads);

    // Get or create CRM tab and switch to it
    const crmTab = await getOrCreateCrmTab();
    if (!crmTab) {
      await setState({ isProcessing: false });
      sendResponse({ success: false, error: 'Could not open CRM tab' });
      return;
    }

    await setState({ crmTabId: crmTab.id });

    log('info', `Starting automation for ${leads.length} leads`);
    broadcastToSidebar({ type: 'AUTOMATION_STARTED', totalLeads: leads.length });

    // Initialize CRM first (navigate to key opportunities, set filters)
    await initializeCrmTab(crmTab.id);

    // Start processing leads
    await scheduleNextLead();

    sendResponse({ success: true });
  } catch (error) {
    log('error', `Failed to start automation: ${error.message}`);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleStopAutomation(sendResponse) {
  await stopAutomation('Stopped by user');
  sendResponse({ success: true });
}

async function handlePauseAutomation(sendResponse) {
  const state = await getState();

  if (!state.isProcessing) {
    sendResponse({ success: false, error: 'No automation in progress' });
    return;
  }

  // Clear alarms to pause processing
  await chrome.alarms.clear(ALARM_NAMES.PROCESS_NEXT_LEAD);

  // Update state to indicate paused
  await setState({ isPaused: true });

  log('info', 'Automation paused');
  sendResponse({ success: true });
}

async function handleResumeAutomation(sendResponse) {
  const state = await getState();

  if (!state.isProcessing || !state.isPaused) {
    sendResponse({ success: false, error: 'No paused automation to resume' });
    return;
  }

  // Update state to indicate not paused
  await setState({ isPaused: false });

  // Resume processing
  await scheduleNextLead();

  log('info', 'Automation resumed');
  sendResponse({ success: true });
}

async function handleResetAutomation(sendResponse) {
  // Clear all alarms
  await chrome.alarms.clear(ALARM_NAMES.PROCESS_NEXT_LEAD);
  await chrome.alarms.clear(ALARM_NAMES.KEEP_ALIVE);

  // Reset state completely
  await setState({
    isProcessing: false,
    isPaused: false,
    currentLeadIndex: 0,
    totalLeads: 0,
    processedCount: 0,
    failedCount: 0,
    startTime: null,
    lastActivityTime: null
  });

  // Clear leads from storage
  await setLeads([]);

  log('info', 'Automation reset');
  broadcastToSidebar({ type: 'AUTOMATION_STOPPED', reason: 'Reset by user' });

  sendResponse({ success: true });
}

function handleLog(request) {
  addLog(request.level, request.message);
  broadcastToSidebar(request);
}

// ============================================================================
// AUTOMATION WORKFLOW (Alarm-based)
// ============================================================================

/**
 * Schedule the next lead for processing using chrome.alarms
 * This breaks the long-running loop into individual steps
 */
async function scheduleNextLead() {
  // Clear any existing alarms
  await chrome.alarms.clear(ALARM_NAMES.PROCESS_NEXT_LEAD);

  // Schedule immediate processing of next lead
  chrome.alarms.create(ALARM_NAMES.PROCESS_NEXT_LEAD, { delayInMinutes: 0.01 });

  // Set up keep-alive to prevent service worker termination
  await setupKeepAlive();
}

/**
 * Process a single lead when alarm fires
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAMES.PROCESS_NEXT_LEAD) {
    await processNextLead();
  } else if (alarm.name === ALARM_NAMES.KEEP_ALIVE) {
    // Keep-alive alarm - just touch storage to keep service worker alive
    const state = await getState();
    if (state.isProcessing) {
      await setState({ lastActivityTime: Date.now() });
    }
  }
});

async function processNextLead() {
  const state = await getState();
  const leads = await getLeads();
  const config = await getConfig();

  if (!state.isProcessing || state.isPaused) {
    await cleanupKeepAlive();
    return;
  }

  // Check if we've processed all leads
  if (state.currentLeadIndex >= leads.length) {
    await completeAutomation();
    return;
  }

  const lead = leads[state.currentLeadIndex];

  log('info', `Processing lead ${state.currentLeadIndex + 1}/${state.totalLeads}: ${lead.givenName} ${lead.lastName}`);
  broadcastToSidebar({
    type: 'PROGRESS',
    current: state.currentLeadIndex + 1,
    total: state.totalLeads,
    lead: lead
  });

  try {
    // Get CRM tab
    let crmTab = state.crmTabId ? await chrome.tabs.get(state.crmTabId).catch(() => null) : null;

    if (!crmTab || crmTab.status !== 'complete') {
      // Tab is closed or not ready, get or create new one
      crmTab = await getOrCreateCrmTab();
      if (!crmTab) {
        throw new Error('Could not access CRM tab');
      }
      await setState({ crmTabId: crmTab.id });
    }

    // Switch to CRM tab
    await chrome.tabs.update(crmTab.id, { active: true });

    // Process the lead
    const result = await fillLeadInTab(crmTab.id, lead);

    if (result.success) {
      // Mark as processed in the sheet
      await markLeadProcessed(lead.rowIndex);

      // Update state
      const newState = await setState({
        currentLeadIndex: state.currentLeadIndex + 1,
        processedCount: state.processedCount + 1,
        lastActivityTime: Date.now()
      });

      log('success', `Successfully processed: ${lead.givenName} ${lead.lastName}`);
      broadcastToSidebar({
        type: 'LEAD_PROCESSED',
        success: true,
        lead: lead,
        progress: { current: newState.currentLeadIndex, total: newState.totalLeads }
      });

      // Schedule next lead with delay
      const delayMs = newState.currentLeadIndex < newState.totalLeads ? config.batchDelay : 0;
      setTimeout(() => scheduleNextLead(), delayMs);
    } else {
      throw new Error(result.error || 'Failed to fill form');
    }
  } catch (error) {
    log('error', `Failed to process ${lead.givenName} ${lead.lastName}: ${error.message}`);

    const newState = await setState({
      currentLeadIndex: state.currentLeadIndex + 1,
      failedCount: state.failedCount + 1,
      lastActivityTime: Date.now()
    });

    broadcastToSidebar({
      type: 'LEAD_PROCESSED',
      success: false,
      lead: lead,
      error: error.message,
      progress: { current: newState.currentLeadIndex, total: newState.totalLeads }
    });

    // Continue with next lead
    setTimeout(() => scheduleNextLead(), config.batchDelay);
  }
}

async function fillLeadInTab(tabId, lead) {
  return new Promise((resolve, reject) => {
    let completed = false;

    chrome.tabs.sendMessage(tabId, {
      type: 'FILL_FORM',
      lead: lead
    }, (response) => {
      if (completed) return;
      completed = true;

      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (response && response.success) {
        resolve(response);
      } else {
        reject(new Error(response?.error || 'Failed to fill form'));
      }
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (completed) return;
      completed = true;
      reject(new Error('Timeout: Form filling took too long (30s)'));
    }, 30000);
  });
}

async function completeAutomation() {
  const state = await getState();
  const duration = Date.now() - state.startTime;

  await setState({
    isProcessing: false,
    currentLeadIndex: 0,
    totalLeads: 0,
    startTime: null
  });

  await cleanupKeepAlive();

  log('info', `Automation complete: ${state.processedCount} succeeded, ${state.failedCount} failed in ${Math.round(duration / 1000)}s`);
  broadcastToSidebar({
    type: 'AUTOMATION_COMPLETE',
    processed: state.processedCount,
    failed: state.failedCount,
    duration: duration
  });

  // Clear leads from storage
  await setLeads([]);

  // Show notification
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'JB Solicitors - Automation Complete',
    message: `Processed ${state.processedCount} leads successfully. ${state.failedCount} failed.`
  });
}

async function stopAutomation(reason) {
  const state = await getState();

  await setState({
    isProcessing: false,
    currentLeadIndex: 0,
    totalLeads: 0
  });

  await cleanupKeepAlive();

  log('info', `Automation stopped: ${reason}`);
  broadcastToSidebar({ type: 'AUTOMATION_STOPPED', reason });
}

// ============================================================================
// KEEP-ALIVE MECHANISM
// ============================================================================

/**
 * Set up keep-alive alarm to prevent service worker termination
 * during active automation
 */
async function setupKeepAlive() {
  // Create repeating alarm that fires every 20 seconds
  // Chrome service worker terminates after ~30 seconds of inactivity
  chrome.alarms.create(ALARM_NAMES.KEEP_ALIVE, { periodInMinutes: 0.33 });
}

/**
 * Clean up keep-alive alarm when automation is complete
 */
async function cleanupKeepAlive() {
  await chrome.alarms.clear(ALARM_NAMES.KEEP_ALIVE);
}

// ============================================================================
// TAB MANAGEMENT
// ============================================================================

/**
 * Find existing CRM tab or create a new one
 * Returns the CRM tab or null if failed
 */
async function getOrCreateCrmTab() {
  const crmUrl = `${CRM_CONFIG.url}${CRM_CONFIG.path}`;

  // First, look for existing CRM tab
  const tabs = await chrome.tabs.query({ url: `${CRM_CONFIG.url}/*` });

  if (tabs.length > 0) {
    // Found existing CRM tab - reload it for fresh state
    const crmTab = tabs.find(tab => tab.url.includes(CRM_CONFIG.path)) || tabs[0];

    // Reload the tab to get a fresh state
    await chrome.tabs.reload(crmTab.id);
    await delay(3000);

    // Make sure it's on the correct path
    if (!crmTab.url.includes(CRM_CONFIG.path)) {
      await chrome.tabs.update(crmTab.id, { url: crmUrl });
      await delay(3000);
    }

    return crmTab;
  }

  // No CRM tab found, create new one
  try {
    const newTab = await chrome.tabs.create({
      url: crmUrl,
      active: true
    });

    // Wait for tab to load (3 seconds as per requirements)
    await delay(3000);

    return newTab;
  } catch (error) {
    log('error', `Failed to create CRM tab: ${error.message}`);
    return null;
  }
}

/**
 * Ensure CRM tab is active (switch to it)
 */
async function switchToCrmTab() {
  const crmTab = await getOrCreateCrmTab();
  if (crmTab) {
    await chrome.tabs.update(crmTab.id, { active: true });
    await chrome.windows.update(crmTab.windowId, { focused: true });
  }
  return crmTab;
}

/**
 * Initialize CRM tab: Close sidebar, navigate to key opportunities, set filters
 * This is called once before processing any leads
 */
async function initializeCrmTab(tabId) {
  return new Promise((resolve, reject) => {
    let completed = false;

    chrome.tabs.sendMessage(tabId, {
      type: 'INITIALIZE_CRM'
    }, (response) => {
      if (completed) return;
      completed = true;

      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (response && response.success) {
        log('info', 'CRM initialized successfully');
        resolve(response);
      } else {
        reject(new Error(response?.error || 'Failed to initialize CRM'));
      }
    });

    // Timeout after 60 seconds (initialization can take longer)
    setTimeout(() => {
      if (completed) return;
      completed = true;
      reject(new Error('Timeout: CRM initialization took too long (60s)'));
    }, 60000);
  });
}

// ============================================================================
// API COMMUNICATION
// ============================================================================

async function markLeadProcessed(rowIndex) {
  try {
    const config = await getConfig();

    if (!config.apiUrl) {
      console.warn('[JB CRM] No API URL configured, skipping markLeadProcessed');
      return;
    }

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

    console.log('[JB CRM] Marked lead as processed:', rowIndex);
  } catch (error) {
    console.error('[JB CRM] Failed to mark lead as processed:', error);
  }
}

// ============================================================================
// LOGGING
// ============================================================================

function log(level, message) {
  console.log(`[JB CRM] [${level.toUpperCase()}] ${message}`);
  addLog(level, message);
}

function addLog(level, message) {
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

function broadcastToSidebar(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Sidebar not open, ignore
  });
}

// ============================================================================
// PERIODIC SYNC
// ============================================================================

chrome.alarms.create('syncLeads', { periodInMinutes: 30 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'syncLeads') {
    const config = await getConfig();

    if (!config.autoStart || !config.apiUrl) {
      return;
    }

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

// ============================================================================
// NOTIFICATIONS
// ============================================================================

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (buttonIndex === 0) {
    chrome.sidePanel.open();
  }
  chrome.notifications.clear(notificationId);
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
