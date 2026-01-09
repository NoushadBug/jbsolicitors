/**
 * Content Script for JB Solicitors CRM Automation
 * CRM: https://portal.redraincorp.com/enquiriesSummary
 * Interacts with the CRM interface to fill forms and submit data
 */

// CRM URL
const CRM_URL = 'https://portal.redraincorp.com';

// CRM-specific selectors based on meeting transcript
const CRM_SELECTORS = {
  // Key Opportunities Toggle (Material UI switch)
  keyOpportunitiesToggle: 'input[name="keyOpportunity"]',

  // My Key Opportunities checkbox (semantic UI)
  myKeyOpportunitiesCheckbox: '.ui.checkbox input[type="checkbox"]',

  // Apply Search button (Material UI)
  applySearchButton: 'button.MuiButton-outlined:has(.MuiButton-label:contains("Apply Search"))',

  // Filter button (three green lines/menu icon)
  filterButton: 'button.MuiIconButton-root',

  // Assignment filter autocomplete
  assignedToInput: '#assignedTo',
  assignedToChip: '.MuiChip-root:has(.MuiChip-label:contains("Audrey"))',

  // Create contact button (+ button)
  createContactButton: 'button:has(svg:contains("+"))',

  // Form fields
  title: 'input[name="prefix"]',
  givenName: 'input[name="firstName"]',
  lastName: 'input[name="lastName"]',
  email: 'input[name="email"]',
  telephone: 'input[name="phone"]',
  mobile: 'input[name="mobile"]',
  source: '[name="source"]',
  sourceNotes: 'textarea[name="sourceNotes"]',
  organizationName: 'input[name="organization"]',
  position: 'input[name="position"]',
  areaOfLaw: '[name="areaOfLaw"]',
  assignedTo: '[name="assignedTo"]',
  followUpDue: 'input[name="followUpDue"]',

  // Save button
  saveButton: 'button:has(.MuiButton-label:contains("Save"))'
};

// State
let isInitialized = false;
let currentLead = null;

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init() {
  if (isInitialized) return;
  isInitialized = true;

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener(handleMessage);

  // Inject custom styles
  injectStyles();

  console.log('[JB Solicitors] Content script initialized');
}

function handleMessage(request, sender, sendResponse) {
  if (request.type === 'FILL_FORM') {
    fillForm(request.lead)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }

  if (request.type === 'NAVIGATE_TO_OPPORTUNITIES') {
    navigateToKeyOpportunities()
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.type === 'FILTER_BY_AUDREY') {
    filterByAudrey()
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.type === 'OPEN_NEW_CONTACT') {
    openNewContactForm()
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
}

// Navigation functions
async function navigateToKeyOpportunities() {
  log('info', 'Navigating to Key Opportunities...');

  // Find and click on Inquiries
  const inquiriesLink = findElement(CRM_SELECTORS.inquiriesSection);
  if (!inquiriesLink) {
    // Try to find by text content
    const links = Array.from(document.querySelectorAll('a'));
    const inquiriesLinkByContent = links.find(a =>
      a.textContent.includes('Inquiries') || a.textContent.includes('Opportunities')
    );

    if (inquiriesLinkByContent) {
      await clickElement(inquiriesLinkByContent);
      await sleep(1000);
    }
  }

  // Find and toggle Key Opportunities switch
  await sleep(500);
  const keyOppToggle = document.querySelector(CRM_SELECTORS.keyOpportunitiesToggle);
  if (keyOppToggle) {
    // Make sure it's checked/unchecked as needed
    if (!keyOppToggle.checked) {
      await clickElement(keyOppToggle);
    }
  }

  // Uncheck "My Key Opportunities" if checked
  await sleep(300);
  const myKeyOppCheckbox = document.querySelector('.ui.checked.checkbox input');
  if (myKeyOppCheckbox && myKeyOppCheckbox.checked) {
    await clickElement(myKeyOppCheckbox);
  }

  // Click Apply Search
  await sleep(300);
  const applyButton = findApplyButton();
  if (applyButton) {
    await clickElement(applyButton);
    await sleep(1000);
  }

  log('success', 'Navigated to Key Opportunities');
  return { success: true };
}

async function filterByAudrey() {
  log('info', 'Filtering by Audrey...');

  // Find the filter button (three green lines)
  const filterButton = findFilterButton();
  if (filterButton) {
    await clickElement(filterButton);
    await sleep(500);
  }

  // Find and set Assigned To dropdown
  const assignedToInput = document.querySelector(CRM_SELECTORS.assignedToInput);
  if (assignedToInput) {
    // Focus and type Audrey
    assignedToInput.focus();
    assignedToInput.value = 'Audrey';
    assignedToInput.dispatchEvent(new Event('input', { bubbles: true }));
    assignedToInput.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(500);
  }

  // Click Apply Search again
  const applyButton = findApplyButton();
  if (applyButton) {
    await clickElement(applyButton);
    await sleep(1000);
  }

  log('success', 'Filtered by Audrey');
  return { success: true };
}

async function openNewContactForm() {
  log('info', 'Opening new contact form...');

  // Find and click the + button
  const createButton = findCreateButton();
  if (createButton) {
    await clickElement(createButton);
    await sleep(1000);
    log('success', 'New contact form opened');
    return { success: true };
  }

  throw new Error('Could not find create contact button');
}

// Form filling function
async function fillForm(lead) {
  currentLead = lead;
  log('info', `Filling form for: ${lead.givenName} ${lead.lastName}`);

  try {
    // Navigate to opportunities and filter
    await navigateToKeyOpportunities();
    await filterByAudrey();

    // Open new contact form
    await openNewContactForm();

    // Wait for form to load
    await sleep(1000);

    // Fill in the fields
    await fillFormField(CRM_SELECTORS.title, lead.title);
    await fillFormField(CRM_SELECTORS.givenName, lead.givenName);
    await fillFormField(CRM_SELECTORS.lastName, lead.lastName);
    await fillFormField(CRM_SELECTORS.email, lead.email);
    await fillFormField(CRM_SELECTORS.telephone, lead.telephone);
    await fillFormField(CRM_SELECTORS.mobile, lead.mobile);

    // Organization details
    await fillFormField(CRM_SELECTORS.organizationName, lead.organizationName);
    await fillFormField(CRM_SELECTORS.position, lead.position);

    // Source (always "Other")
    await selectDropdownOption(CRM_SELECTORS.source, 'Other');

    // Area of Law (always "Advice")
    await selectDropdownOption(CRM_SELECTORS.areaOfLaw, 'Advice');

    // Source Notes
    await fillFormField(CRM_SELECTORS.sourceNotes, lead.sourceNotes);

    // Assignment
    await selectDropdownOption(CRM_SELECTORS.assignedTo, 'Audrey');

    // Follow Up Due (today's date or the date from sheet)
    await fillFormField(CRM_SELECTORS.followUpDue, lead.followUpDue || new Date().toLocaleDateString());

    // Wait a bit before saving
    await sleep(500);

    // Save and Close
    await saveForm();

    log('success', `Form filled and saved for: ${lead.givenName} ${lead.lastName}`);
    return { success: true, lead };
  } catch (error) {
    log('error', `Failed to fill form: ${error.message}`);
    throw error;
  }
}

async function saveForm() {
  const saveButton = findSaveButton();
  if (saveButton) {
    await clickElement(saveButton);
    await sleep(1000); // Wait for save to complete
  } else {
    throw new Error('Could not find save button');
  }
}

// Helper functions
async function fillFormField(selector, value) {
  if (!value) return;

  let element = document.querySelector(selector);

  // If not found by selector, try by name attribute
  if (!element) {
    element = document.querySelector(`[name="${selector.replace(/\[name="/, '').replace('"]', '')}"]`);
  }

  // If still not found, try by placeholder
  if (!element) {
    const inputs = document.querySelectorAll('input');
    for (const input of inputs) {
      const name = input.getAttribute('name') || '';
      const placeholder = input.getAttribute('placeholder') || '';
      if (name.toLowerCase().includes(selector.toLowerCase()) ||
          placeholder.toLowerCase().includes(selector.toLowerCase())) {
        element = input;
        break;
      }
    }
  }

  if (element) {
    element.focus();
    element.value = '';
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.blur();
    await sleep(100);
  } else {
    console.warn(`Could not find field: ${selector}`);
  }
}

async function selectDropdownOption(selector, value) {
  let element = document.querySelector(selector);

  // Try different selector patterns
  if (!element) {
    element = document.querySelector(`select[name="${selector}"]`) ||
              document.querySelector(`[name="${selector}"]`);
  }

  if (element) {
    if (element.tagName === 'SELECT') {
      element.value = value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      // Material UI or custom dropdown
      element.click();
      await sleep(200);

      // Find and click the option
      const options = document.querySelectorAll('li, [role="option"]');
      for (const option of options) {
        if (option.textContent.includes(value)) {
          option.click();
          break;
        }
      }
    }
    await sleep(100);
  } else {
    console.warn(`Could not find dropdown: ${selector}`);
  }
}

function findElement(selector) {
  return document.querySelector(selector);
}

function findApplyButton() {
  const buttons = document.querySelectorAll('button');
  for (const button of buttons) {
    if (button.textContent.includes('Apply Search')) {
      return button;
    }
  }
  return null;
}

function findFilterButton() {
  // Look for three-line icon button
  const buttons = document.querySelectorAll('button');
  for (const button of buttons) {
    const svg = button.querySelector('svg');
    if (svg && svg.querySelector('path[d*="M3"]')) {
      // Menu icon
      return button;
    }
  }
  return null;
}

function findCreateButton() {
  const buttons = document.querySelectorAll('button');
  for (const button of buttons) {
    if (button.textContent.includes('+') ||
        button.textContent.includes('Create') ||
        button.textContent.includes('New')) {
      return button;
    }
  }
  return null;
}

function findSaveButton() {
  const buttons = document.querySelectorAll('button');
  for (const button of buttons) {
    if (button.textContent.includes('Save')) {
      return button;
    }
  }
  return null;
}

async function clickElement(element) {
  element.click();
  await sleep(100);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(level, message) {
  chrome.runtime.sendMessage({
    type: 'LOG',
    level,
    message
  });
}

// Visual indicator for automation
function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .jb-automation-active {
      outline: 2px solid #4285F4 !important;
      outline-offset: 2px;
    }
    .jb-automation-processing {
      position: relative;
    }
    .jb-automation-processing::after {
      content: 'Processing...';
      position: absolute;
      top: -30px;
      left: 50%;
      transform: translateX(-50%);
      background: #4285F4;
      color: white;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 12px;
      white-space: nowrap;
      z-index: 9999;
    }
  `;
  document.head.appendChild(style);
}
