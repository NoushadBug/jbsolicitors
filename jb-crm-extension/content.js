/**
 * Content Script for JB Solicitors CRM Automation
 * CRM: https://portal.redraincorp.com/enquiriesSummary
 *
 * This script handles all DOM interaction with the CRM portal including:
 * - Navigation to Key Opportunities
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
  defaultAreaOfLaw: 'Advice',
  timeouts: {
    elementLoad: 10000,
    pageLoad: 5000,
    formSubmit: 3000,
    dropdown: 500
  },
  delays: {
    afterClick: 200,
    afterInput: 100,
    betweenFields: 50
  }
};

// ============================================================================
// DOM SELECTORS (Multiple fallback strategies)
// ============================================================================

const SELECTORS = {
  // Navigation
  inquiriesSection: [
    'a[href*="inquiries"]',
    'a[href*="enquiries"]',
    '[data-testid*="inquiry"]',
    '[data-testid*="enquiry"]'
  ],

  // Key Opportunities Toggle (Material UI switch)
  keyOpportunitiesToggle: [
    'input[name="keyOpportunity"]',
    '[data-testid*="key-opportunity"]',
    '.MuiSwitch-input'
  ],

  // My Key Opportunities (Semantic UI checkbox)
  myKeyOpportunitiesCheckbox: [
    '.ui.checkbox input[type="checkbox"]',
    '[data-testid*="my-key-opportunity"]'
  ],

  // Apply Search button
  applySearchButton: [
    'button',
    '[role="button"]',
    '.MuiButton-root'
  ],

  // Filter button (menu icon)
  filterButton: [
    'button[aria-label*="filter" i]',
    'button[aria-label*="menu" i]',
    '.MuiIconButton-root',
    '[data-testid*="filter"]'
  ],

  // Assigned To dropdown
  assignedToInput: [
    '#assignedTo',
    'input[name="assignedTo"]',
    '[name="assignedTo"]',
    '[data-testid*="assigned-to"]'
  ],

  // Create/New Contact button
  createContactButton: [
    'button[aria-label*="create" i]',
    'button[aria-label*="add" i]',
    '[data-testid*="create-contact"]',
    '[data-testid*="add-contact"]'
  ],

  // Form Fields - Personal Information
  title: [
    'input[name="prefix"]',
    'input[name="title"]',
    '[name="prefix"]',
    '[name="title"]',
    '[data-testid*="title"]'
  ],

  givenName: [
    'input[name="firstName"]',
    'input[name="givenName"]',
    'input[name="givenname"]',
    '[name="firstName"]',
    '[name="givenName"]',
    '[data-testid*="first-name"]',
    '[data-testid*="given-name"]'
  ],

  lastName: [
    'input[name="lastName"]',
    'input[name="surname"]',
    '[name="lastName"]',
    '[name="surname"]',
    '[data-testid*="last-name"]',
    '[data-testid*="surname"]'
  ],

  email: [
    'input[name="email"]',
    'input[type="email"]',
    '[name="email"]',
    '[data-testid*="email"]'
  ],

  telephone: [
    'input[name="phone"]',
    'input[name="telephone"]',
    'input[name="telephoneNumber"]',
    '[name="phone"]',
    '[name="telephone"]',
    '[data-testid*="phone"]',
    '[data-testid*="telephone"]'
  ],

  mobile: [
    'input[name="mobile"]',
    'input[name="mobileNumber"]',
    '[name="mobile"]',
    '[name="mobileNumber"]',
    '[data-testid*="mobile"]'
  ],

  // Organization Details
  organizationName: [
    'input[name="organization"]',
    'input[name="organizationName"]',
    'input[name="company"]',
    '[name="organization"]',
    '[name="organizationName"]',
    '[name="company"]',
    '[data-testid*="organization"]',
    '[data-testid*="company"]'
  ],

  position: [
    'input[name="position"]',
    'input[name="jobTitle"]',
    '[name="position"]',
    '[name="jobTitle"]',
    '[data-testid*="position"]',
    '[data-testid*="job-title"]'
  ],

  // Dropdown Fields
  source: [
    'select[name="source"]',
    '[name="source"]',
    '[data-testid*="source"]'
  ],

  sourceNotes: [
    'textarea[name="sourceNotes"]',
    'textarea[name="sourceNotes"]',
    '[name="sourceNotes"]',
    '[data-testid*="source-notes"]'
  ],

  areaOfLaw: [
    'select[name="areaOfLaw"]',
    '[name="areaOfLaw"]',
    '[data-testid*="area-of-law"]'
  ],

  assignedTo: [
    'select[name="assignedTo"]',
    '[name="assignedTo"]',
    '[data-testid*="assigned-to"]'
  ],

  followUpDue: [
    'input[name="followUpDue"]',
    'input[name="followup"]',
    'input[type="date"]',
    '[name="followUpDue"]',
    '[data-testid*="follow-up"]'
  ],

  // Save/Submit buttons
  saveButton: [
    'button[type="submit"]',
    'button[aria-label*="save" i]',
    '[data-testid*="save"]',
    '.MuiButton-root'
  ],

  closeButton: [
    'button[aria-label*="close" i]',
    'button[aria-label*="cancel" i]',
    '[data-testid*="close"]'
  ]
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const state = {
  isInitialized: false,
  isProcessing: false,
  currentLead: null,
  retryCount: 0,
  maxRetries: 3
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
  sendMessage('info', 'Content script loaded and ready');
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

    case 'NAVIGATE_TO_OPPORTUNITIES':
      handleAsyncResponse(navigateToKeyOpportunities(), sendResponse);
      return true;

    case 'FILTER_BY_AUDREY':
      handleAsyncResponse(filterByAssignee(CRM_CONFIG.defaultAssignee), sendResponse);
      return true;

    case 'OPEN_NEW_CONTACT':
      handleAsyncResponse(openNewContactForm(), sendResponse);
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
// MAIN WORKFLOW FUNCTIONS
// ============================================================================

/**
 * Main workflow: Navigate, filter, create form, fill, and save
 */
async function fillForm(lead) {
  if (state.isProcessing) {
    throw new Error('Already processing a form');
  }

  state.isProcessing = true;
  state.currentLead = lead;

  try {
    sendMessage('info', `Starting automation for: ${lead.givenName} ${lead.lastName}`);

    // Step 1: Navigate to Key Opportunities
    await navigateToKeyOpportunities();

    // Step 2: Filter by assignee (Audrey)
    await filterByAssignee(CRM_CONFIG.defaultAssignee);

    // Step 3: Open new contact form
    await openNewContactForm();

    // Step 4: Wait for form to be ready
    await waitForFormReady();

    // Step 5: Fill all form fields
    await fillContactForm(lead);

    // Step 6: Save the form
    await saveForm();

    sendMessage('success', `Successfully processed: ${lead.givenName} ${lead.lastName}`);
    return { success: true, lead };
  } catch (error) {
    sendMessage('error', `Failed to process lead: ${error.message}`);
    throw error;
  } finally {
    state.isProcessing = false;
    state.currentLead = null;
  }
}

// ============================================================================
// NAVIGATION FUNCTIONS
// ============================================================================

/**
 * Navigate to the Key Opportunities section
 */
async function navigateToKeyOpportunities() {
  sendMessage('info', 'Navigating to Key Opportunities...');

  // First, try to find and click Inquiries link
  const inquiriesLink = await findElement(SELECTORS.inquiriesSection, { textContent: ['Inquiries', 'Enquiries', 'Opportunities'] });
  if (inquiriesLink && !window.location.href.includes('enquiriesSummary')) {
    await clickElement(inquiriesLink);
    await delay(CRM_CONFIG.timeouts.pageLoad);
  }

  // Toggle Key Opportunities switch
  const keyOppToggle = await findElement(SELECTORS.keyOpportunitiesToggle);
  if (keyOppToggle) {
    const needsToggle = !keyOppToggle.checked;
    if (needsToggle) {
      await clickElement(keyOppToggle);
      await delay(CRM_CONFIG.delays.afterClick);
    }
  }

  // Uncheck "My Key Opportunities" if checked
  const myKeyOppCheckbox = document.querySelector('.ui.checked.checkbox input');
  if (myKeyOppCheckbox && myKeyOppCheckbox.checked) {
    await clickElement(myKeyOppCheckbox);
    await delay(CRM_CONFIG.delays.afterClick);
  }

  // Click Apply Search button
  const applyButton = await findApplyButton();
  if (applyButton) {
    await clickElement(applyButton);
    await delay(CRM_CONFIG.timeouts.pageLoad);
  }

  sendMessage('success', 'Navigated to Key Opportunities');
}

/**
 * Filter records by assigned user
 */
async function filterByAssignee(assignee) {
  sendMessage('info', `Filtering by ${assignee}...`);

  // Look for and click filter button
  const filterButton = await findFilterButton();
  if (filterButton) {
    await clickElement(filterButton);
    await delay(CRM_CONFIG.delays.afterClick);
  }

  // Find and populate the Assigned To field
  const assignedToInput = await findElement(SELECTORS.assignedToInput);
  if (assignedToInput) {
    await fillInput(assignedToInput, assignee);
    await delay(CRM_CONFIG.timeouts.dropdown);

    // Look for and click the dropdown option
    const option = await findDropdownOption(assignee);
    if (option) {
      await clickElement(option);
      await delay(CRM_CONFIG.delays.afterClick);
    }
  }

  // Apply the filter
  const applyButton = await findApplyButton();
  if (applyButton) {
    await clickElement(applyButton);
    await delay(CRM_CONFIG.timeouts.pageLoad);
  }

  sendMessage('success', `Filtered by ${assignee}`);
}

/**
 * Open the new contact form
 */
async function openNewContactForm() {
  sendMessage('info', 'Opening new contact form...');

  const createButton = await findCreateButton();
  if (!createButton) {
    throw new Error('Could not find create contact button');
  }

  await clickElement(createButton);
  await delay(CRM_CONFIG.timeouts.pageLoad);

  sendMessage('success', 'New contact form opened');
}

// ============================================================================
// FORM FILLING FUNCTIONS
// ============================================================================

/**
 * Wait for the contact form to be ready
 */
async function waitForFormReady() {
  await findElement(SELECTORS.givenName, { timeout: CRM_CONFIG.timeouts.elementLoad });
  await delay(CRM_CONFIG.delays.afterClick);
}

/**
 * Fill all contact form fields
 */
async function fillContactForm(lead) {
  sendMessage('info', `Filling form for: ${lead.givenName} ${lead.lastName}`);

  // Personal Information
  await fillField(SELECTORS.title, lead.title);
  await fillField(SELECTORS.givenName, lead.givenName);
  await fillField(SELECTORS.lastName, lead.lastName);
  await fillField(SELECTORS.email, lead.email);
  await fillField(SELECTORS.telephone, lead.telephone);
  await fillField(SELECTORS.mobile, lead.mobile);

  // Organization Details
  await fillField(SELECTORS.organizationName, lead.organizationName);
  await fillField(SELECTORS.position, lead.position);

  // Dropdown Fields
  await selectOption(SELECTORS.source, CRM_CONFIG.defaultSource);
  await selectOption(SELECTORS.areaOfLaw, CRM_CONFIG.defaultAreaOfLaw);
  await fillField(SELECTORS.sourceNotes, lead.sourceNotes);
  await selectOption(SELECTORS.assignedTo, CRM_CONFIG.defaultAssignee);

  // Follow Up Date
  const followUpDate = lead.followUpDue || formatDate(new Date());
  await fillField(SELECTORS.followUpDue, followUpDate);

  sendMessage('info', 'All fields filled');
}

/**
 * Save the form
 */
async function saveForm() {
  sendMessage('info', 'Saving form...');

  const saveButton = await findSaveButton();
  if (!saveButton) {
    throw new Error('Could not find save button');
  }

  await clickElement(saveButton);
  await delay(CRM_CONFIG.timeouts.formSubmit);

  // Look for and click close button if present
  const closeButton = await findElement(SELECTORS.closeButton);
  if (closeButton) {
    await clickElement(closeButton);
    await delay(CRM_CONFIG.delays.afterClick);
  }

  sendMessage('success', 'Form saved successfully');
}

// ============================================================================
// FIELD FILLING HELPERS
// ============================================================================

/**
 * Fill a single form field
 */
async function fillField(selectors, value) {
  if (!value) return;

  const element = await findElement(selectors);
  if (!element) {
    console.warn(`[JB Solicitors CRM] Field not found, skipping:`, selectors);
    return;
  }

  highlightElement(element);

  if (element.tagName === 'TEXTAREA') {
    await fillTextarea(element, value);
  } else if (element.tagName === 'SELECT') {
    await selectSelectOption(element, value);
  } else {
    await fillInput(element, value);
  }

  await delay(CRM_CONFIG.delays.betweenFields);
}

/**
 * Fill an input field
 */
async function fillInput(element, value) {
  element.focus();
  element.click();

  // Clear existing value
  element.value = '';
  element.dispatchEvent(new Event('input', { bubbles: true }));

  // Set new value
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));

  element.blur();
  await delay(CRM_CONFIG.delays.afterInput);
}

/**
 * Fill a textarea
 */
async function fillTextarea(element, value) {
  element.focus();
  element.click();

  element.value = '';
  element.textContent = '';
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));

  element.blur();
  await delay(CRM_CONFIG.delays.afterInput);
}

/**
 * Select an option from a dropdown
 */
async function selectOption(selectors, value) {
  const element = await findElement(selectors);
  if (!element) {
    console.warn(`[JB Solicitors CRM] Dropdown not found:`, selectors);
    return;
  }

  highlightElement(element);

  if (element.tagName === 'SELECT') {
    await selectSelectOption(element, value);
  } else {
    // Material UI or custom dropdown
    await clickElement(element);
    await delay(CRM_CONFIG.delays.afterClick);

    const option = await findDropdownOption(value);
    if (option) {
      await clickElement(option);
    }
  }

  await delay(CRM_CONFIG.delays.afterInput);
}

/**
 * Select option from native select element
 */
async function selectSelectOption(selectElement, value) {
  // Try exact match first
  let option = Array.from(selectElement.options).find(opt => opt.value === value || opt.textContent === value);

  // Try partial match
  if (!option) {
    option = Array.from(selectElement.options).find(opt =>
      opt.value.toLowerCase().includes(value.toLowerCase()) ||
      opt.textContent.toLowerCase().includes(value.toLowerCase())
    );
  }

  if (option) {
    selectElement.value = option.value;
    selectElement.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    console.warn(`[JB Solicitors CRM] Option not found: ${value}`);
  }
}

// ============================================================================
// ELEMENT FINDING FUNCTIONS
// ============================================================================

/**
 * Find an element using multiple selector strategies
 */
async function findElement(selectors, options = {}) {
  const { timeout = CRM_CONFIG.timeouts.elementLoad, textContent = null } = options;

  // Try each selector
  for (const selector of selectors) {
    const element = await waitForSelector(selector, timeout, textContent);
    if (element) {
      return element;
    }
  }

  return null;
}

/**
 * Wait for a selector to match an element
 */
async function waitForSelector(selector, timeout, textContent = null) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const elements = document.querySelectorAll(selector);

    for (const element of elements) {
      if (textContent) {
        const elementText = element.textContent || '';
        const matches = textContent.some(text =>
          elementText.toLowerCase().includes(text.toLowerCase())
        );
        if (!matches) continue;
      }

      // Check if element is visible
      if (isElementVisible(element)) {
        return element;
      }
    }

    await delay(100);
  }

  return null;
}

/**
 * Find and wait for a dropdown option
 */
async function findDropdownOption(value) {
  const startTime = Date.now();
  const timeout = CRM_CONFIG.timeouts.dropdown;

  while (Date.now() - startTime < timeout) {
    // Look in various dropdown containers
    const optionSelectors = [
      `li[role="option"]`,
      `.MuiMenuItem-root`,
      `[role="option"]`,
      `.option`,
      `li`
    ];

    for (const selector of optionSelectors) {
      const options = document.querySelectorAll(selector);
      for (const option of options) {
        if (option.textContent.includes(value) && isElementVisible(option)) {
          return option;
        }
      }
    }

    await delay(50);
  }

  return null;
}

/**
 * Find the Apply Search button
 */
async function findApplyButton() {
  const buttons = document.querySelectorAll('button, [role="button"]');
  for (const button of buttons) {
    const text = button.textContent || '';
    if (text.includes('Apply Search') || text.includes('Apply')) {
      return button;
    }
  }
  return null;
}

/**
 * Find the filter/menu button
 */
async function findFilterButton() {
  const buttons = document.querySelectorAll('button, [role="button"]');
  for (const button of buttons) {
    // Check for menu icon (three lines)
    const svg = button.querySelector('svg');
    if (svg) {
      const paths = svg.querySelectorAll('path');
      for (const path of paths) {
        const d = path.getAttribute('d') || '';
        // Check for menu icon path patterns
        if (d.includes('M3 18h18v2H3V0z') || d.includes('M3 6h18v2H3V0z') || d.startsWith('M3 ')) {
          return button;
        }
      }
    }

    // Check aria-label
    const label = button.getAttribute('aria-label') || '';
    if (label.includes('filter') || label.includes('menu') || label.includes('Filter') || label.includes('Menu')) {
      return button;
    }
  }
  return null;
}

/**
 * Find the create contact button
 */
async function findCreateButton() {
  const buttons = document.querySelectorAll('button, [role="button"]');
  for (const button of buttons) {
    const text = button.textContent || '';
    const ariaLabel = button.getAttribute('aria-label') || '';
    const dataTestId = button.getAttribute('data-testid') || '';

    if (
      text.includes('+') ||
      text.includes('Create') ||
      text.includes('New') ||
      text.includes('Add') ||
      ariaLabel.includes('create') ||
      ariaLabel.includes('add') ||
      dataTestId.includes('create') ||
      dataTestId.includes('add')
    ) {
      return button;
    }
  }
  return null;
}

/**
 * Find the save button
 */
async function findSaveButton() {
  const buttons = document.querySelectorAll('button, [role="button"], [type="submit"]');
  for (const button of buttons) {
    const text = button.textContent || '';
    const ariaLabel = button.getAttribute('aria-label') || '';
    const type = button.getAttribute('type') || '';

    if (
      text.includes('Save') ||
      text.includes('Submit') ||
      ariaLabel.includes('save') ||
      type === 'submit'
    ) {
      return button;
    }
  }
  return null;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if element is visible
 */
function isElementVisible(element) {
  if (!element) return false;

  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0'
  );
}

/**
 * Click an element
 */
async function clickElement(element) {
  highlightElement(element);

  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await delay(CRM_CONFIG.delays.afterClick);

  element.click();
}

/**
 * Highlight an element visually
 */
function highlightElement(element) {
  element.classList.add('jb-crm-highlight');
  setTimeout(() => {
    element.classList.remove('jb-crm-highlight');
  }, 500);
}

/**
 * Format date for input
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Delay helper
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
    // Background not available, log to console
    console.log(`[JB Solicitors CRM] [${level.toUpperCase()}] ${message}`);
  });
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

    /* Success indicator */
    .jb-crm-success::after {
      content: 'Saved successfully!';
      background: #34a853;
    }

    /* Error indicator */
    .jb-crm-error::after {
      content: 'Error occurred';
      background: #ea4335;
    }
  `;

  document.head.appendChild(style);
}
