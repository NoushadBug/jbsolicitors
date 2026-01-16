/**
 * Content Script for JB Solicitors CRM Automation
 * CRM: https://portal.redraincorp.com/enquiriesSummary
 *
 * This script handles all DOM interaction with the CRM portal including:
 * - Closing sidebar
 * - Navigating to Key Opportunities
 * - Filtering by assigned user (Audrey)
 * - Creating new contact forms
 * - Filling form fields with lead data
 * - Saving forms
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const CRM_CONFIG = {
  baseUrl: 'https://portal.redraincorp.com',
  defaultAssignee: 'Audrey',
  defaultSource: 'Other',
  defaultAreaOfLaw: 'Advice'
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const state = {
  isInitialized: false,
  isProcessing: false
};

// ============================================================================
// INITIALIZATION
// ============================================================================

function init() {
  if (state.isInitialized) return;
  state.isInitialized = true;

  // Set up message listener
  chrome.runtime.onMessage.addListener(handleMessage);

  // Inject visual styles
  injectStyles();

  // Notify that content script is ready
  console.log('[JB Solicitors CRM] Content script initialized');
  sendMessage('info', 'Ready to automate');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

function handleMessage(request, sender, sendResponse) {
  console.log('[JB Solicitors CRM] Received message:', request.type);

  switch (request.type) {
    case 'FILL_FORM':
      handleAsyncResponse(fillForm(request.lead), sendResponse);
      return true;

    case 'INITIALIZE_CRM':
      handleAsyncResponse(initializeCrm(), sendResponse);
      return true;

    case 'PING':
      sendResponse({ success: true, message: 'PONG' });
      return true;

    default:
      console.warn('[JB Solicitors CRM] Unknown message type:', request.type);
      sendResponse({ success: false, error: 'Unknown message type' });
  }
}

function handleAsyncResponse(promise, sendResponse) {
  promise
    .then(result => sendResponse({ success: true, result }))
    .catch(error => sendResponse({ success: false, error: error.message }));
}

// ============================================================================
// HELPER FUNCTIONS (From Workflow Document)
// ============================================================================

/**
 * Selects an option in a MUI Autocomplete using a CSS selector
 * @param {string} inputSelector - CSS selector for the autocomplete input
 * @param {Array<string>} substrings - Text fragments to match option text
 * @param {Function} [callback] - Optional callback after selection
 */
function selectMUIAutocompleteBySelector(inputSelector, substrings, callback) {
  return new Promise((resolve, reject) => {
    // Step 0: Find input
    const input = document.querySelector(inputSelector);
    if (!input) {
      reject(new Error('Input not found: ' + inputSelector));
      return;
    }

    // Step 1: Find the autocomplete root container
    const container = input.closest('.MuiAutocomplete-inputRoot');
    if (!container) {
      reject(new Error('Autocomplete container not found'));
      return;
    }

    // Step 2: Click popup indicator (arrow)
    const popupButton = container.querySelector('.MuiAutocomplete-popupIndicator');
    if (!popupButton) {
      reject(new Error('Popup indicator not found'));
      return;
    }
    popupButton.click();

    // Step 3: Focus and type (triggers fetch/filter)
    input.focus();
    input.value = substrings[0] || '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    // Step 4: Observe dropdown options
    const observer = new MutationObserver(() => {
      const options = [...document.querySelectorAll('li[role="option"]')];

      const match = options.find(opt =>
        substrings.some(sub => opt.textContent.includes(sub))
      );

      if (match) {
        match.click();          // updates React state
        observer.disconnect();  // stop observing
        console.log('Selected option containing: ' + substrings.join(' or '));
        if (callback) callback(match);
        resolve(match);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Timeout after 5 seconds
    setTimeout(() => {
      observer.disconnect();
      reject(new Error('Timeout waiting for dropdown options'));
    }, 5000);
  });
}

/**
 * Sets value in a React / MUI controlled text input using a selector
 * @param {string} selector - CSS selector for the input
 * @param {string} value - Text to insert
 */
function setMUITextBySelector(selector, value) {
  const input = document.querySelector(selector);
  if (!input) {
    throw new Error('Input not found: ' + selector);
  }

  input.focus();

  // Use native setter so React detects the change
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set;

  setter.call(input, value);

  // Fire events React actually listens to
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));

  console.log('Set input (' + selector + ') -> "' + value + '"');
}

/**
 * Wait for an element to appear in the DOM
 * @param {string} selector - CSS selector
 * @param {number} timeout - Maximum time to wait in ms
 * @returns {Promise<Element>} The found element
 */
function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error('Element not found: ' + selector));
    }, timeout);
  });
}

/**
 * Wait for search results to load (checks for role="row" in results container)
 * @returns {Promise<void>}
 */
function waitForSearchResults() {
  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(() => {
      const containers = document.querySelectorAll('.hideGroupPanel [ref="eCenterContainer"]');
      for (const container of containers) {
        if (container.querySelector('[role="row"]')) {
          clearInterval(checkInterval);
          console.log('Search results loaded');
          resolve();
          return;
        }
      }
    }, 200);

    setTimeout(() => {
      clearInterval(checkInterval);
      reject(new Error('Search results did not load in time'));
    }, 30000);
  });
}

/**
 * Delay helper
 * @param {number} ms - Milliseconds to delay
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Send message to background script
 */
function sendMessage(level, message) {
  chrome.runtime.sendMessage({
    type: 'LOG',
    level,
    message
  }).catch(() => {
    console.log('[JB Solicitors CRM] [' + level.toUpperCase() + '] ' + message);
  });
}

// ============================================================================
// MAIN WORKFLOW FUNCTIONS
// ============================================================================

/**
 * Initialize CRM: Close sidebar, navigate to key opportunities, set up filters
 * This is called once at the beginning of automation
 */
async function initializeCrm() {
  sendMessage('info', 'Setting up filters...');

  // Step 0: Close sidebar if open
  const closeBtn = document.querySelector('.x');
  if (closeBtn) {
    closeBtn.click();
    await delay(500);
  }

  // Step 1: Toggle Key Opportunities
  const switchRoot = document.querySelector('.MuiSwitch-root');
  if (switchRoot) {
    switchRoot.click();
    await delay(1000);

    // Check if successfully enabled
    const isChecked = switchRoot.classList.contains('Mui-checked');
    sendMessage('info', isChecked ? 'Filtering active opportunities...' : 'Toggling opportunities filter...');
  }

  // Step 2: Uncheck "My Enquiries" if checked
  await delay(500);
  document.querySelectorAll('.ui.checkbox').forEach(function(e) {
    const label = e.textContent.trim();
    if (label === 'My Enquiries') {
      const checkbox = e.querySelector('input[type="checkbox"]');
      if (checkbox && checkbox.checked) {
        checkbox.click();
      }
    }
  });

  await delay(1000);

  // Step 3: Open filter menu (skip first Apply Search)
  const filterButtons = document.querySelectorAll('button.MuiButtonBase-root.MuiIconButton-root[aria-label="Advanced Filter"]');
  if (filterButtons.length > 0) {
    filterButtons[0].click();
    await delay(500);
  }

  // Step 4: Select Audrey in Assigned To dropdown
  try {
    await selectMUIAutocompleteBySelector('#assignedTo', ['Audrey']);
    sendMessage('success', 'Filter set to Audrey');
  } catch (error) {
    sendMessage('warning', 'Could not set filter: ' + error.message);
  }

  await delay(500);

  // Step 5: Click Apply Search (only once, at the end)
  document.querySelectorAll('.MuiButton-label').forEach(function(e) {
    const text = e.textContent.trim();
    if (text === 'Apply Search') {
      e.closest('button').click();
    }
  });

  // Step 6: Wait for search results
  await waitForSearchResults();
  sendMessage('success', 'Ready to process leads');
}

/**
 * Main workflow: Initialize (once), then for each lead create and fill form
 */
async function fillForm(lead) {
  if (state.isProcessing) {
    throw new Error('Already processing a form');
  }

  state.isProcessing = true;

  try {
    sendMessage('info', 'Processing: ' + lead.givenName + ' ' + lead.lastName);

    // Step 1: Click "+" button to create new contact
    const addButton = document.querySelector('[data-icon-name="Add"]');
    if (!addButton) {
      throw new Error('Could not find Add button');
    }
    addButton.click();
    await delay(1000);

    // Step 2: Wait for drawer to open
    await waitForElement('.MuiDrawer-paper', 5000);
    await delay(500);

    // Step 3: Fill contact details
    await fillContactDetails(lead);

    // Step 4: Fill organization details
    await fillOrganizationDetails(lead);

    // Step 5: Set fixed values (Source, Area of Law)
    await setFixedValues(lead);

    // Step 6: Configure assignment
    await configureAssignment();

    // Step 7: Save and close
    await saveAndClose();

    sendMessage('success', 'Saved: ' + lead.givenName + ' ' + lead.lastName);
    return { success: true, lead };
  } catch (error) {
    sendMessage('error', 'Could not save: ' + error.message);
    throw error;
  } finally {
    state.isProcessing = false;
  }
}

/**
 * Fill contact details in the form
 */
async function fillContactDetails(lead) {
  const drawerPrefix = '.MuiDrawer-paper ';

  // Title (autocomplete)
  if (lead.title) {
    try {
      const titleInput = document.querySelector(drawerPrefix + 'input[aria-autocomplete="list"]');
      if (titleInput) {
        await selectMUIAutocompleteBySelector(drawerPrefix + 'input[aria-autocomplete="list"]', [lead.title]);
        await delay(200);
      }
    } catch (e) {
      // Silently skip if title fails
    }
  }

  // Given Name
  if (lead.givenName) {
    setMUITextBySelector(drawerPrefix + 'input[name="firstName"]', lead.givenName);
    await delay(100);
  }

  // Last Name
  if (lead.lastName) {
    setMUITextBySelector(drawerPrefix + 'input[name="lastName"]', lead.lastName);
    await delay(100);
  }

  // Email
  if (lead.email) {
    setMUITextBySelector(drawerPrefix + 'input[name="email"]', lead.email);
    await delay(100);
  }

  // Mobile
  if (lead.mobile) {
    setMUITextBySelector(drawerPrefix + 'input[name="mobile"]', lead.mobile);
    await delay(100);
  }

  // Telephone (phone)
  if (lead.telephone) {
    setMUITextBySelector(drawerPrefix + 'input[name="phone"]', lead.telephone);
    await delay(100);
  }
}

/**
 * Fill organization details in the form
 */
async function fillOrganizationDetails(lead) {
  if (!lead.organizationName && !lead.position) {
    return;
  }

  const drawerPrefix = '.MuiDrawer-paper ';

  // Find and open Organisation accordion if closed
  const panels = document.querySelectorAll(drawerPrefix + '.MuiExpansionPanelSummary-root');
  for (const panel of panels) {
    const label = panel.textContent.trim();
    if (label.includes('Organisation') || label.includes('Organization')) {
      if (panel.getAttribute('aria-expanded') === 'false') {
        panel.click();
        await delay(300);
      }
      break;
    }
  }

  // Organization Name
  if (lead.organizationName) {
    setMUITextBySelector(drawerPrefix + 'input[name="organisation"]', lead.organizationName);
    await delay(100);
  }

  // Position Title
  if (lead.position) {
    setMUITextBySelector(drawerPrefix + 'input[name="positionAtOrganisation"]', lead.position);
    await delay(100);
  }
}

/**
 * Set fixed values (Source, Area of Law, Source Notes)
 */
async function setFixedValues(lead) {
  const drawerPrefix = '.MuiDrawer-paper ';

  // Source = "Other" (autocomplete)
  try {
    const sourceInputs = document.querySelectorAll(drawerPrefix + 'input[aria-autocomplete="list"]');
    for (const input of sourceInputs) {
      const ariaDescribedBy = input.getAttribute('aria-describedby') || '';
      if (ariaDescribedBy.includes('autocomplete')) {
        const label = input.closest('.MuiFormControl-root')?.querySelector('label');
        if (label && label.textContent.includes('Source')) {
          await selectMUIAutocompleteBySelector(drawerPrefix + 'input[aria-autocomplete="list"]', ['Other']);
          await delay(200);
          break;
        }
      }
    }
  } catch (e) {
    // Silently skip
  }

  // Area of Law = "Advice" (autocomplete)
  try {
    const areaInputs = document.querySelectorAll(drawerPrefix + 'input[aria-autocomplete="list"]');
    for (const input of areaInputs) {
      const ariaDescribedBy = input.getAttribute('aria-describedby') || '';
      if (ariaDescribedBy.includes('autocomplete')) {
        const label = input.closest('.MuiFormControl-root')?.querySelector('label');
        if (label && label.textContent.includes('Area')) {
          await selectMUIAutocompleteBySelector(drawerPrefix + 'input[aria-autocomplete="list"]', ['Advice']);
          await delay(200);
          break;
        }
      }
    }
  } catch (e) {
    // Silently skip
  }

  // Source Notes (from sheet)
  if (lead.sourceNotes) {
    const labels = document.querySelectorAll(drawerPrefix + 'label');
    for (const label of labels) {
      if (label.textContent.includes('Source Notes')) {
        const input = label.closest('.MuiFormControl-root')?.querySelector('input, textarea');
        if (input) {
          setMUITextBySelector(drawerPrefix + 'input, textarea', lead.sourceNotes);
          await delay(100);
          break;
        }
      }
    }
  }
}

/**
 * Configure assignment (Assigned To = Audrey)
 */
async function configureAssignment() {
  const drawerPrefix = '.MuiDrawer-paper ';

  // Assigned To = Audrey (always)
  try {
    // Find the input with name="assignedTo" inside the drawer
    const assignedToInput = document.querySelector(drawerPrefix + '[name="assignedTo"]');
    if (assignedToInput) {
      // Use the ID directly if it has one, otherwise use the name selector with drawer prefix
      const inputId = assignedToInput.id ? '#' + assignedToInput.id : drawerPrefix + '[name="assignedTo"]';
      await selectMUIAutocompleteBySelector(inputId, ['Audrey']);
      await delay(200);
    }
  } catch (e) {
    // Silently skip
  }
}

/**
 * Save the form and close it
 */
async function saveAndClose() {
  const drawerPrefix = '.MuiDrawer-paper ';

  // Click Save and Close button
  const saveButton = document.querySelector(drawerPrefix + 'button[type="submit"]');
  if (!saveButton) {
    throw new Error('Could not find Save button');
  }

  saveButton.click();
  await delay(2000);
}

// ============================================================================
// STYLE INJECTION
// ============================================================================

function injectStyles() {
  const styleId = 'jb-crm-content-styles';

  if (document.getElementById(styleId)) {
    return;
  }

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /* Highlight animation for elements being interacted with */
    .jb-crm-highlight {
      outline: 3px solid #4285f4 !important;
      outline-offset: 2px;
      animation: jb-crm-pulse 0.5s ease-in-out;
    }

    @keyframes jb-crm-pulse {
      0%, 100% {
        outline-color: #4285f4;
        outline-width: 3px;
      }
      50% {
        outline-color: #34a853;
        outline-width: 5px;
      }
    }

    /* Processing indicator */
    .jb-crm-processing {
      position: relative;
    }

    .jb-crm-processing::after {
      content: 'Processing...';
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4285f4;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 999999;
      animation: jb-crm-fadein 0.3s ease-in-out;
    }

    @keyframes jb-crm-fadein {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;

  document.head.appendChild(style);
}
