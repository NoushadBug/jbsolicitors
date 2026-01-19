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
function selectMUIAutocompleteBySelector(inputSelector, substrings, callback, maxRetries = 20) {
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
 * Selects an option in a Downshift Autocomplete using a CSS selector
 * @param {string} inputSelector - CSS selector for the autocomplete input
 * @param {Array<string>} substrings - Text fragments to match option text
 * @param {number} [maxRetries] - Maximum number of retries if input not found
 */
function selectDownshiftAutocompleteBySelector(inputSelector, substrings, maxRetries = 20) {
  return new Promise((resolve, reject) => {
    let retryCount = 0;

    const tryFindInput = () => {
      // Step 0: Find input
      const input = document.querySelector(inputSelector);
      if (!input) {
        retryCount++;
        if (retryCount < maxRetries) {
          console.log('[JB CRM] Downshift input not found, retrying (' + retryCount + '/' + maxRetries + '): ' + inputSelector);
          setTimeout(tryFindInput, 500);
          return;
        }
        reject(new Error('Downshift input not found after ' + maxRetries + ' retries: ' + inputSelector));
        return;
      }

      // Step 1: Click input to open dropdown
      input.click();
      input.focus();

      // Wait 3 seconds for options to load
      setTimeout(() => {
        // Step 2: Type the value to filter options
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeInputValueSetter.call(input, substrings[0] || '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        // Helper function to find and click matching option
        const findAndClickOption = () => {
          const options = [...document.querySelectorAll('[role="option"], [data-item="true"], .downshift-item, li[data-option]')];
          console.log('[JB CRM] Found ' + options.length + ' dropdown options');

          const match = options.find(opt => {
            const text = opt.textContent || opt.innerText || '';
            return substrings.some(sub => text.toLowerCase().includes(sub.toLowerCase()));
          });

          if (match) {
            match.click();
            console.log('[JB CRM] Selected Downshift option containing: ' + substrings.join(' or '));
            resolve(match);
            return true;
          }
          return false;
        };

        // Step 3: Try to find options immediately (they might already be loaded)
        if (findAndClickOption()) {
          return; // Found and clicked, done
        }

        // If not found, wait a bit and try again
        let attempts = 0;
        const maxAttempts = 10;
        const checkInterval = setInterval(() => {
          attempts++;
          if (findAndClickOption()) {
            clearInterval(checkInterval);
            return;
          }

          if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            // Value not found - clear input
            nativeInputValueSetter.call(input, '');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            console.log('[JB CRM] Downshift option not found: ' + substrings.join(', '));
            reject(new Error('Downshift option not found: ' + substrings.join(', ')));
          }
        }, 500);
      }, 3000);
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

/**
 * Show error alert popup with problems and three action buttons
 * @param {string} title - Alert title
 * @param {Array<string>} problems - List of problems that occurred
 * @returns {Promise<string>} Resolves with the action: 'proceed', 'note', or 'stop'
 */
function showErrorAlert(title, problems) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: white;
      border-radius: 12px;
      padding: 24px;
      max-width: 500px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    const titleEl = document.createElement('h2');
    titleEl.style.cssText = `
      margin: 0 0 16px 0;
      color: #d32f2f;
      font-size: 20px;
      font-weight: 600;
    `;
    titleEl.textContent = title;

    const problemsList = document.createElement('ul');
    problemsList.style.cssText = `
      margin: 0 0 20px 0;
      padding-left: 20px;
      color: #333;
      font-size: 14px;
      line-height: 1.6;
    `;

    problems.forEach(problem => {
      const li = document.createElement('li');
      li.textContent = problem;
      problemsList.appendChild(li);
    });

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 10px;
      flex-direction: column;
    `;

    // Helper to create buttons
    const createButton = (text, color, action) => {
      const btn = document.createElement('button');
      btn.style.cssText = `
        background: ${color};
        color: white;
        border: none;
        border-radius: 6px;
        padding: 12px 20px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        width: 100%;
      `;
      btn.textContent = text;
      btn.onclick = () => {
        document.body.removeChild(overlay);
        resolve(action);
      };
      return btn;
    };

    // "It's Okay" button - proceed with save and close
    const proceedButton = createButton("It's Okay", '#4285f4', 'proceed');

    // "Note it and Continue" button - note errors and proceed
    const noteButton = createButton('Note it and Continue', '#f59e0b', 'note');

    // "Stop" button - stop automation
    const stopButton = createButton('Stop', '#d32f2f', 'stop');

    buttonContainer.appendChild(proceedButton);
    buttonContainer.appendChild(noteButton);
    buttonContainer.appendChild(stopButton);

    dialog.appendChild(titleEl);
    dialog.appendChild(problemsList);
    dialog.appendChild(buttonContainer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
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
 *
 * STEP-BY-STEP PROCESS:
 * ====================
 * 1. Click "+" button to create new contact
 * 2. Wait for drawer (form) to open
 * 3. Fill contact details (Title, Given Name, Last Name, Email, Mobile, Telephone)
 * 4. Fill organization details (Organization Name, Position)
 * 5. Set fixed values (Source="Other", Area of Law="Advice", Source Notes)
 * 6. Configure assignment (Assigned To="Audrey", Assigned By="Audrey" via downshift inputs)
 * 7. Save and close form
 */
async function fillForm(lead) {
  if (state.isProcessing) {
    throw new Error('Already processing a form');
  }

  state.isProcessing = true;
  const errors = [];

  try {
    sendMessage('info', 'Processing: ' + lead.givenName + ' ' + lead.lastName);
    console.log('[JB CRM] ========== FILL FORM START ==========');
    console.log('[JB CRM] Lead data:', JSON.stringify(lead, null, 2));

    // Step 1: Click "+" button to create new contact
    console.log('[JB CRM] Step 1: Clicking + button to create new contact');
    const addButton = document.querySelector('[data-icon-name="Add"]');
    if (!addButton) {
      errors.push('Could not find Add button');
      showErrorAlert('Form Fill Error', errors);
      throw new Error('Could not find Add button');
    }
    addButton.click();
    await delay(1000);
    console.log('[JB CRM] Step 1: + button clicked');

    // Step 2: Wait for drawer to open
    console.log('[JB CRM] Step 2: Waiting for drawer to open');
    await waitForElement('.MuiDrawer-paper', 5000);
    await delay(500);
    console.log('[JB CRM] Step 2: Drawer opened');

    // Step 3: Fill contact details
    console.log('[JB CRM] Step 3: Filling contact details');
    const contactErrors = await fillContactDetails(lead);
    errors.push(...contactErrors);
    console.log('[JB CRM] Step 3: Contact details filled (errors: ' + contactErrors.length + ')');

    // Step 4: Fill organization details
    console.log('[JB CRM] Step 4: Filling organization details');
    const orgErrors = await fillOrganizationDetails(lead);
    errors.push(...orgErrors);
    console.log('[JB CRM] Step 4: Organization details filled (errors: ' + orgErrors.length + ')');

    // Step 5: Set fixed values (Source, Area of Law, Source Notes)
    console.log('[JB CRM] Step 5: Setting fixed values (Source, Area of Law, Source Notes)');
    const fixedValuesErrors = await setFixedValues(lead);
    errors.push(...fixedValuesErrors);
    console.log('[JB CRM] Step 5: Fixed values set (errors: ' + fixedValuesErrors.length + ')');

    // Step 6: Configure assignment
    console.log('[JB CRM] Step 6: Configuring assignment (Assigned To/By = Audrey)');
    const assignmentErrors = await configureAssignment();
    errors.push(...assignmentErrors);
    console.log('[JB CRM] Step 6: Assignment configured (errors: ' + assignmentErrors.length + ')');

    // Check if there were any errors (excluding Title errors)
    const titleErrors = errors.filter(e => e.toLowerCase().includes('title'));
    const nonTitleErrors = errors.filter(e => !e.toLowerCase().includes('title'));

    if (nonTitleErrors.length > 0) {
      console.log('[JB CRM] Non-Title errors detected: ' + nonTitleErrors.length);
      console.log('[JB CRM] Title errors (logged but not shown in popup): ' + titleErrors.length);

      // Show alert with non-Title errors and wait for user action
      const action = await showErrorAlert('Form Fill Problems Detected', nonTitleErrors);

      if (action === 'stop') {
        // User clicked Stop - immediately stop automation
        sendMessage('error', 'Automation stopped by user. Errors noted: ' + nonTitleErrors.join('; '));
        throw new Error('Automation stopped by user due to errors: ' + nonTitleErrors.join('; '));
      } else if (action === 'note') {
        // User clicked Note it and Continue - log errors but proceed
        sendMessage('warning', 'Errors noted but continuing: ' + nonTitleErrors.join('; '));
      }
      // If action === 'proceed', just continue without any special logging
    }

    // Step 7: Save and close
    console.log('[JB CRM] Step 7: Saving and closing form');
    await saveAndClose();
    console.log('[JB CRM] Step 7: Form saved and closed');

    sendMessage('success', 'Saved: ' + lead.givenName + ' ' + lead.lastName);
    console.log('[JB CRM] ========== FILL FORM COMPLETE ==========');
    return { success: true, lead };
  } catch (error) {
    sendMessage('error', 'Could not save: ' + error.message);
    console.log('[JB CRM] ========== FILL FORM FAILED ==========');
    console.log('[JB CRM] Error:', error.message);
    throw error;
  } finally {
    state.isProcessing = false;
  }
}

/**
 * Fill contact details in the form
 * @returns {Promise<Array<string>>} Array of error messages
 */
async function fillContactDetails(lead) {
  const drawerPrefix = '.MuiDrawer-paper ';
  const errors = [];
  console.log('[JB CRM] fillContactDetails: Starting');

  // Title (autocomplete)
  if (lead.title) {
    try {
      console.log('[JB CRM] fillContactDetails: Setting Title = ' + lead.title);
      const titleInput = document.querySelector(drawerPrefix + 'input[aria-autocomplete="list"]');
      if (titleInput) {
        await selectMUIAutocompleteBySelector(drawerPrefix + 'input[aria-autocomplete="list"]', [lead.title], null, 15);
        await delay(300);
        console.log('[JB CRM] fillContactDetails: Title set');
      } else {
        const msg = 'Title input not found';
        console.log('[JB CRM] fillContactDetails: ' + msg);
        errors.push(msg);
      }
    } catch (e) {
      const msg = 'Could not set Title: ' + e.message;
      console.log('[JB CRM] fillContactDetails: ' + msg);
      errors.push(msg);
    }
  }

  // Given Name
  if (lead.givenName) {
    try {
      console.log('[JB CRM] fillContactDetails: Setting Given Name = ' + lead.givenName);
      setMUITextBySelector(drawerPrefix + 'input[name="firstName"]', lead.givenName);
      await delay(100);
    } catch (e) {
      const msg = 'Could not set Given Name: ' + e.message;
      console.log('[JB CRM] fillContactDetails: ' + msg);
      errors.push(msg);
    }
  }

  // Last Name
  if (lead.lastName) {
    try {
      console.log('[JB CRM] fillContactDetails: Setting Last Name = ' + lead.lastName);
      setMUITextBySelector(drawerPrefix + 'input[name="lastName"]', lead.lastName);
      await delay(100);
    } catch (e) {
      const msg = 'Could not set Last Name: ' + e.message;
      console.log('[JB CRM] fillContactDetails: ' + msg);
      errors.push(msg);
    }
  }

  // Email
  if (lead.email) {
    try {
      console.log('[JB CRM] fillContactDetails: Setting Email = ' + lead.email);
      setMUITextBySelector(drawerPrefix + 'input[name="email"]', lead.email);
      await delay(100);
    } catch (e) {
      const msg = 'Could not set Email: ' + e.message;
      console.log('[JB CRM] fillContactDetails: ' + msg);
      errors.push(msg);
    }
  }

  // Mobile
  if (lead.mobile) {
    try {
      console.log('[JB CRM] fillContactDetails: Setting Mobile = ' + lead.mobile);
      setMUITextBySelector(drawerPrefix + 'input[name="mobile"]', lead.mobile);
      await delay(100);
    } catch (e) {
      const msg = 'Could not set Mobile: ' + e.message;
      console.log('[JB CRM] fillContactDetails: ' + msg);
      errors.push(msg);
    }
  }

  // Telephone (phone)
  if (lead.telephone) {
    try {
      console.log('[JB CRM] fillContactDetails: Setting Telephone = ' + lead.telephone);
      setMUITextBySelector(drawerPrefix + 'input[name="phone"]', lead.telephone);
      await delay(100);
    } catch (e) {
      const msg = 'Could not set Telephone: ' + e.message;
      console.log('[JB CRM] fillContactDetails: ' + msg);
      errors.push(msg);
    }
  }

  console.log('[JB CRM] fillContactDetails: Complete (errors: ' + errors.length + ')');
  return errors;
}

/**
 * Fill organization details in the form
 * @returns {Promise<Array<string>>} Array of error messages
 */
async function fillOrganizationDetails(lead) {
  const errors = [];
  if (!lead.organizationName && !lead.position) {
    return errors;
  }

  const drawerPrefix = '.MuiDrawer-paper ';

  // Find and open Organisation accordion if closed
  try {
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
  } catch (e) {
    const msg = 'Could not open Organization accordion: ' + e.message;
    console.log('[JB CRM] fillOrganizationDetails: ' + msg);
    errors.push(msg);
  }

  // Organization Name
  if (lead.organizationName) {
    try {
      setMUITextBySelector(drawerPrefix + 'input[name="organisation"]', lead.organizationName);
      await delay(100);
    } catch (e) {
      const msg = 'Could not set Organization Name: ' + e.message;
      console.log('[JB CRM] fillOrganizationDetails: ' + msg);
      errors.push(msg);
    }
  }

  // Position Title
  if (lead.position) {
    try {
      setMUITextBySelector(drawerPrefix + 'input[name="positionAtOrganisation"]', lead.position);
      await delay(100);
    } catch (e) {
      const msg = 'Could not set Position: ' + e.message;
      console.log('[JB CRM] fillOrganizationDetails: ' + msg);
      errors.push(msg);
    }
  }

  return errors;
}

/**
 * Set fixed values (Source, Area of Law, Source Notes)
 * @returns {Promise<Array<string>>} Array of error messages
 */
async function setFixedValues(lead) {
  const drawerPrefix = '.MuiDrawer-paper ';
  const errors = [];
  console.log('[JB CRM] setFixedValues: Starting');
  console.log('[JB CRM] setFixedValues: lead.sourceNotes = "' + (lead.sourceNotes || '') + '"');

  // Source = "Other" (autocomplete)
  try {
    console.log('[JB CRM] setFixedValues: Setting Source = Other');
    // Find all autocomplete containers in the drawer (MuiAutocomplete-root)
    const autocompleteContainers = document.querySelectorAll(drawerPrefix + '.MuiAutocomplete-root');
    console.log('[JB CRM] setFixedValues: Found ' + autocompleteContainers.length + ' autocomplete containers');
    for (const container of autocompleteContainers) {
      const label = container.querySelector('label');
      // Use textContent for matching (works with "Source", "Source *", "Source *", etc.)
      if (label && label.textContent.includes('Source')) {
        // Find the input within this container
        const input = container.querySelector('input[aria-autocomplete="list"]');
        if (input && input.id) {
          // Use the ID directly (dynamic ID like mui-autocomplete-18603)
          console.log('[JB CRM] setFixedValues: Found Source input with id = ' + input.id);
          await selectMUIAutocompleteBySelector('#' + input.id, ['Other'], null, 15);
          console.log('[JB CRM] setFixedValues: Source set to Other');
          await delay(300);
          break;
        }
      }
    }
  } catch (e) {
    const msg = 'Could not set Source: ' + e.message;
    console.log('[JB CRM] setFixedValues: ' + msg);
    errors.push(msg);
  }

  // Area of Law = "Advice" (dropdown - use popup indicator approach)
  try {
    console.log('[JB CRM] setFixedValues: Setting Area of Law = Advice');
    // Find the label by textContent, then navigate to input
    const labels = document.querySelectorAll('#enquiryForm label');
    let areaOfLawInput = null;
    for (const label of labels) {
      if (label.textContent.includes('Area of Law')) {
        areaOfLawInput = label.parentElement.parentElement.parentElement.querySelector('input');
        break;
      }
    }

    if (areaOfLawInput) {
      console.log('[JB CRM] setFixedValues: Found Area of Law input');

      // Use the same approach as MUI autocomplete - find container and popup indicator
      const container = areaOfLawInput.closest('.MuiAutocomplete-inputRoot');
      if (container) {
        const popupButton = container.querySelector('.MuiAutocomplete-popupIndicator');
        if (popupButton) {
          console.log('[JB CRM] setFixedValues: Clicking popup indicator to open dropdown');
          popupButton.click();
          await delay(500);

          // Find and click the "Advice" option
          const options = document.querySelectorAll('[role="option"], li[data-option]');
          const adviceOption = [...options].find(opt => {
            const text = opt.textContent || opt.innerText || '';
            return text.toLowerCase().includes('advice');
          });

          if (adviceOption) {
            adviceOption.click();
            console.log('[JB CRM] setFixedValues: Area of Law set to Advice');
            await delay(300);
          } else {
            const msg = 'Advice option not found in dropdown';
            console.log('[JB CRM] setFixedValues: ' + msg);
            errors.push(msg);
            // Close dropdown if not found
            popupButton.click();
          }
        } else {
          const msg = 'Popup indicator not found for Area of Law';
          console.log('[JB CRM] setFixedValues: ' + msg);
          errors.push(msg);
        }
      } else {
        const msg = 'MuiAutocomplete-inputRoot container not found for Area of Law';
        console.log('[JB CRM] setFixedValues: ' + msg);
        errors.push(msg);
      }
    } else {
      const msg = 'Area of Law input not found via label search';
      console.log('[JB CRM] setFixedValues: ' + msg);
      errors.push(msg);
    }
  } catch (e) {
    const msg = 'Could not set Area of Law: ' + e.message;
    console.log('[JB CRM] setFixedValues: ' + msg);
    errors.push(msg);
  }

  // Source Notes (from sheet)
  if (lead.sourceNotes) {
    console.log('[JB CRM] setFixedValues: Setting Source Notes = "' + lead.sourceNotes + '"');
    const labels = document.querySelectorAll(drawerPrefix + 'label');
    console.log('[JB CRM] setFixedValues: Found ' + labels.length + ' labels');
    let found = false;
    for (const label of labels) {
      if (label.textContent.includes('Source Notes')) {
        const input = label.closest('.MuiFormControl-root')?.querySelector('input[name="sourceNotes"], textarea[name="sourceNotes"]');
        if (input) {
          console.log('[JB CRM] setFixedValues: Found Source Notes input (tagName=' + input.tagName + ', name=' + input.name + ')');
          input.focus();
          const prototype = input.tagName === 'TEXTAREA'
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
          setter.call(input, lead.sourceNotes);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          console.log('[JB CRM] setFixedValues: Source Notes set to "' + lead.sourceNotes + '"');
          await delay(100);
          found = true;
          break;
        }
      }
    }
    if (!found) {
      const msg = 'Source Notes input not found';
      console.log('[JB CRM] setFixedValues: WARNING - ' + msg);
      errors.push(msg);
    }
  } else {
    console.log('[JB CRM] setFixedValues: No sourceNotes value to set');
  }

  console.log('[JB CRM] setFixedValues: Complete (errors: ' + errors.length + ')');
  return errors;
}

/**
 * Configure assignment (Assigned To = Audrey)
 * @returns {Promise<Array<string>>} Array of error messages
 */
async function configureAssignment() {
  const errors = [];
  console.log('[JB CRM] configureAssignment: Starting');

  // Assigned To = Audrey ([name="assignedTo"][id^="downshift-"])
  try {
    console.log('[JB CRM] configureAssignment: Setting Assigned To ([name="assignedTo"][id^="downshift-"]) = Audrey');
    const assignedToInput = document.querySelector('[name="assignedTo"][id^="downshift-"]');
    if (assignedToInput) {
      console.log('[JB CRM] configureAssignment: Found assignedTo input with downshift id');
      await selectDownshiftAutocompleteBySelector('[name="assignedTo"][id^="downshift-"]', ['Audrey'], 15);
      console.log('[JB CRM] configureAssignment: Assigned To set to Audrey');
      await delay(300);
    } else {
      const msg = 'Assigned To input not found';
      console.log('[JB CRM] configureAssignment: ' + msg);
      errors.push(msg);
    }
  } catch (e) {
    const msg = 'Could not set Assigned To: ' + e.message;
    console.log('[JB CRM] configureAssignment: ' + msg);
    errors.push(msg);
  }

  console.log('[JB CRM] configureAssignment: Complete (errors: ' + errors.length + ')');
  return errors;
}

/**
 * Save the form and close it
 */
async function saveAndClose() {
  const drawerPrefix = '.MuiDrawer-paper ';
  console.log('[JB CRM] saveAndClose: Starting');

  // Wait before clicking save
  await delay(500);

  // Find Save and Close button by text content
  console.log('[JB CRM] saveAndClose: Looking for Save and Close button');
  const buttons = document.querySelectorAll(drawerPrefix + 'button');
  console.log('[JB CRM] saveAndClose: Found ' + buttons.length + ' buttons in drawer');

  let saveButton = null;
  for (const button of buttons) {
    const text = button.textContent.trim().toLowerCase();
    console.log('[JB CRM] saveAndClose: Button text = "' + text + '"');
    if (text === 'save and close' || text === 'save & close') {
      saveButton = button;
      break;
    }
  }

  if (!saveButton) {
    console.log('[JB CRM] saveAndClose: ERROR - Save and Close button not found!');
    throw new Error('Could not find Save and Close button');
  }

  console.log('[JB CRM] saveAndClose: Clicking Save and Close button');
  saveButton.click();
  console.log('[JB CRM] saveAndClose: Button clicked');

  // Wait after clicking save
  console.log('[JB CRM] saveAndClose: Waiting for form to save and close');
  await delay(2000);
  console.log('[JB CRM] saveAndClose: Complete');
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