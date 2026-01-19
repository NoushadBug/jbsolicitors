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
 * @param {number} [maxRetries] - Maximum number of retries if input not found
 */
function selectMUIAutocompleteBySelector(inputSelector, substrings, callback, maxRetries = 10) {
  return new Promise((resolve, reject) => {
    let retryCount = 0;

    const tryFindInput = () => {
      // Step 0: Find input
      const input = document.querySelector(inputSelector);
      if (!input) {
        retryCount++;
        if (retryCount < maxRetries) {
          console.log('[JB CRM] Input not found, retrying (' + retryCount + '/' + maxRetries + '): ' + inputSelector);
          setTimeout(tryFindInput, 500);
          return;
        }
        reject(new Error('Input not found after ' + maxRetries + ' retries: ' + inputSelector));
        return;
      }

      // Step 1: Find the autocomplete root container
      const container = input.closest('.MuiAutocomplete-inputRoot');
      if (!container) {
        reject(new Error('Autocomplete container not found'));
        return;
      }

      // Step 2: Click popup indicator (arrow) to open dropdown
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

      let matchFound = false;

      // Step 4: Observe dropdown options
      const observer = new MutationObserver(() => {
        const options = [...document.querySelectorAll('li[role="option"]')];

        const match = options.find(opt =>
          substrings.some(sub => opt.textContent.includes(sub))
        );

        if (match) {
          match.click();
          matchFound = true;
          observer.disconnect();
          console.log('[JB CRM] Selected option containing: ' + substrings.join(' or '));
          if (callback) callback(match);
          resolve(match);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      // Timeout after 5 seconds - close dropdown if value not found
      setTimeout(() => {
        observer.disconnect();

        if (!matchFound) {
          // Value not found - close the dropdown
          popupButton.click();
          console.log('[JB CRM] Dropdown closed - value not found: ' + substrings.join(', '));
          reject(new Error('Option not found: ' + substrings.join(', ')));
        }
      }, 5000);
    };

    // Start trying to find the input
    tryFindInput();
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
  // Handle both input and textarea elements
  const prototype = input.tagName === 'TEXTAREA'
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;

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
  try {
    const closeBtn = await waitForElement('.x', 5000);
    closeBtn.click();
    await delay(300);
  } catch (e) {
    // Sidebar might not be open, continue
  }

  // Step 1: Toggle Key Opportunities
  try {
    const switchRoot = await waitForElement('.MuiSwitch-root', 10000);
    switchRoot.click();

    // Wait for the toggle to complete (check for class change)
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check if successfully enabled
    const isChecked = switchRoot.classList.contains('Mui-checked');
    sendMessage('info', isChecked ? 'Filtering active opportunities...' : 'Toggling opportunities filter...');
  } catch (error) {
    sendMessage('warning', 'Key Opportunities switch not found: ' + error.message);
  }

  // Step 2: Uncheck "My Enquiries" if checked
  try {
    await waitForElement('.ui.checkbox', 10000);
    document.querySelectorAll('.ui.checkbox').forEach(function(e) {
      const label = e.textContent.trim();
      if (label === 'My Enquiries') {
        const checkbox = e.querySelector('input[type="checkbox"]');
        if (checkbox && checkbox.checked) {
          checkbox.click();
        }
      }
    });
    await delay(500);
  } catch (error) {
    sendMessage('warning', 'My Enquiries checkbox not found: ' + error.message);
  }

  // Step 3: Open filter menu
  try {
    const filterButton = await waitForElement('button.MuiButtonBase-root.MuiIconButton-root[aria-label="Advanced Filter"]', 10000);
    filterButton.click();
    // Wait for filter menu to render
    await delay(500);
  } catch (error) {
    sendMessage('warning', 'Filter button not found: ' + error.message);
  }

  // Step 4: Select Audrey in Assigned To dropdown with retry
  try {
    sendMessage('info', 'Setting filter to Audrey...');
    await selectMUIAutocompleteBySelector('#assignedTo', ['Audrey'], null, 15);
    sendMessage('success', 'Filter set to Audrey');
    await delay(500);
  } catch (error) {
    sendMessage('error', 'Could not set filter to Audrey: ' + error.message);
    throw error;
  }

  // Step 5: Click Apply Search (only once, at the end)
  try {
    sendMessage('info', 'Applying search filters...');
    await waitForElement('.MuiButton-label', 10000);
    const applyButtons = document.querySelectorAll('.MuiButton-label');
    let applyClicked = false;
    applyButtons.forEach(function(e) {
      const text = e.textContent.toLowerCase().trim();
      if (text === 'apply search' && !applyClicked) {
        e.closest('button').click();
        applyClicked = true;
      }
    });

    if (!applyClicked) {
      sendMessage('warning', 'Apply Search button not found');
    }
  } catch (error) {
    sendMessage('warning', 'Apply Search button not found: ' + error.message);
  }

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

    // Step 5: Set fixed values (Source, Area of Law, Source Notes)
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
        await selectMUIAutocompleteBySelector(drawerPrefix + 'input[aria-autocomplete="list"]', [lead.title], null, 15);
        await delay(300);
      }
    } catch (e) {
      // Silently skip if title fails
      console.log('[JB CRM] Could not set Title: ' + e.message);
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
    // Find all autocomplete containers in the drawer (MuiAutocomplete-root)
    const autocompleteContainers = document.querySelectorAll(drawerPrefix + '.MuiAutocomplete-root');
    for (const container of autocompleteContainers) {
      const label = container.querySelector('label');
      // Use textContent for matching (works with "Source", "Source *", "Source *", etc.)
      if (label && label.textContent.includes('Source')) {
        // Find the input within this container
        const input = container.querySelector('input[aria-autocomplete="list"]');
        if (input && input.id) {
          // Use the ID directly (dynamic ID like mui-autocomplete-18603)
          await selectMUIAutocompleteBySelector('#' + input.id, ['Other'], null, 15);
          await delay(300);
          break;
        }
      }
    }
  } catch (e) {
    // Silently skip
    console.log('[JB CRM] Could not set Source: ' + e.message);
  }

  // Area of Law = "Advice" (autocomplete)
  try {
    // Find all autocomplete containers in the drawer (MuiAutocomplete-root)
    const autocompleteContainers = document.querySelectorAll(drawerPrefix + '.MuiAutocomplete-root');
    for (const container of autocompleteContainers) {
      const label = container.querySelector('label');
      // Use textContent for matching (works with "Area of Law", "Area of Law *", "Area of Law *", etc.)
      if (label && label.textContent.includes('Area')) {
        const input = container.querySelector('input[aria-autocomplete="list"]');
        if (input && input.id) {
          await selectMUIAutocompleteBySelector('#' + input.id, ['Advice'], null, 15);
          await delay(300);
          break;
        }
      }
    }
  } catch (e) {
    // Silently skip
    console.log('[JB CRM] Could not set Area of Law: ' + e.message);
  }

  // Source Notes (from sheet)
  if (lead.sourceNotes) {
    const labels = document.querySelectorAll(drawerPrefix + 'label');
    for (const label of labels) {
      if (label.textContent.includes('Source Notes')) {
        const input = label.closest('.MuiFormControl-root')?.querySelector('input[name="sourceNotes"], textarea[name="sourceNotes"]');
        if (input) {
          input.focus();
          const prototype = input.tagName === 'TEXTAREA'
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
          setter.call(input, lead.sourceNotes);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          console.log('[JB CRM] Set Source Notes -> "' + lead.sourceNotes + '"');
          await delay(100);
          break;
        }
      }
    }
  }
}

/**
 * Configure assignment (Assigned To = Audrey, Assigned By = Audrey)
 */
async function configureAssignment() {
  const drawerPrefix = '.MuiDrawer-paper ';

  // Assigned To = Audrey (always)
  try {
    const assignedToInput = document.querySelector(drawerPrefix + '[name="assignedTo"]');
    if (assignedToInput && assignedToInput.id) {
      await selectMUIAutocompleteBySelector('#' + assignedToInput.id, ['Audrey'], null, 15);
      await delay(300);
    }
  } catch (e) {
    // Silently skip
    console.log('[JB CRM] Could not set Assigned To: ' + e.message);
  }

  // Assigned By = Audrey (downshift-2-input)
  try {
    const assignedByInput = document.querySelector('#downshift-2-input');
    if (assignedByInput) {
      await selectMUIAutocompleteBySelector('#downshift-2-input', ['Audrey'], null, 15);
      await delay(300);
    }
  } catch (e) {
    // Silently skip
    console.log('[JB CRM] Could not set Assigned By: ' + e.message);
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