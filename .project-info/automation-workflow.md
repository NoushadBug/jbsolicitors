# JB Solicitors CRM Automation - Step-by-Step Workflow

## Project Overview
Automate the creation of CRM contacts from a Google Sheets "Lead Generation" source. The automation processes approximately 70-200 entries per day.

## Data Source
- **File**: Google Sheet named "Lead Generation [Month] [Year]" (e.g., "Lead Generation December 2025")
- **Fields Available**: Title, Name, Last Name, Email, Mobile, Telephone, organisation, Source Notes

---

## Part 1: Initial Setup & Navigation

### Step 0: Close Sidebar
First, close any open sidebar before starting:

```javascript
document.querySelector('.x').click();
```

### Step 1: Access the CRM
1. Log in to the CRM system (credentials provided separately)
2. Navigate to the **Inquiries** section

### Step 2: Configure Key Opportunities Filter
1. Locate and enable the **"Key Opportunities"** toggle/checkbox
2. **UNCHECK** "My Key Opportunities" if it is checked
3. Ensure "Include Open" is checked
4. Leave "Include Closed" unchecked

**HTML Reference**:
```html
<!-- Key Opportunities Toggle -->
<label class="MuiFormControlLabel-root">
  <span class="MuiSwitch-root">...</span>
  <span class="MuiTypography-root MuiFormControlLabel-label">Key Opportunities</span>
</label>
```

**JavaScript Implementation**:
```javascript
// Toggle Key Opportunities
document.querySelector(".MuiSwitch-root").click();

// Check if successfully enabled (looks for Mui-checked class)
const switchRoot = document.querySelector(".MuiSwitch-root");
if (switchRoot.classList.contains("Mui-checked")) {
    console.log("Key Opportunities enabled");
} else {
    // Click again if not enabled
    switchRoot.click();
}

// Wait 1 second, then handle "My Enquiries" checkbox
setTimeout(() => {
    // Find all checkboxes to locate "My Enquiries"
    document.querySelectorAll('.ui.checkbox').forEach(function(e) {
        const label = e.textContent.trim();
        console.log(label);
        // Possible outputs:
        // "Search Open and Closed Enquiries"
        // "My Enquiries"
        // "Include Open"
        // "Include Closed"
        // "My View Only"
        // "Firm Default"

        if (label === "My Enquiries") {
            // Uncheck "My Enquiries"
            const checkbox = e.querySelector('input[type="checkbox"]');
            if (checkbox && checkbox.checked) {
                checkbox.click();
                console.log("My Enquiries unchecked");
            }
        }
    });
}, 1000);
```

### Step 3: Open Filter Menu
1. Click the **three green lines** icon (filter menu) next to "Apply Search"

**JavaScript Implementation**:
```javascript
// Click the Advanced Filter button (three green lines)
document.querySelectorAll('button.MuiButtonBase-root.MuiIconButton-root[aria-label="Advanced Filter"]')[0].click();
```

2. Locate the **"Assigned To"** autocomplete field
3. Select **"Audrey"** from the dropdown

**Helper Function for MUI Autocomplete**:
```javascript
/**
 * Selects an option in a MUI Autocomplete using a CSS selector
 *
 * @param {string} inputSelector - CSS selector for the autocomplete input
 * @param {Array<string>} substrings - Text fragments to match option text
 * @param {Function} [callback] - Optional callback after selection
 */
function selectMUIAutocompleteBySelector(inputSelector, substrings, callback) {
    // Step 0: Find input
    const input = document.querySelector(inputSelector);
    if (!input) return console.error('Input not found:', inputSelector);

    // Step 1: Find the autocomplete root container
    const container = input.closest('.MuiAutocomplete-inputRoot');
    if (!container) return console.error('Autocomplete container not found');

    // Step 2: Click popup indicator (arrow)
    const popupButton = container.querySelector('.MuiAutocomplete-popupIndicator');
    if (!popupButton) return console.error('Popup indicator not found');
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
            console.log(
                `Selected option containing: ${substrings.join(' or ')}`
            );
            if (callback) callback(match);
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}
```

**Example Usage**:
```javascript
selectMUIAutocompleteBySelector(
    'input[aria-label="Assigned To"]',
    ['Audrey', 'Marketing Admin']
);
```

### Step 4: Apply Search
1. Click **"Apply Search"** button (only once, after setting the filter)

**HTML Reference**:
```html
<!-- Filter Button (three green lines) -->
<button class="MuiButtonBase-root MuiIconButton-root">...</button>

<!-- Assigned To Field -->
<div class="MuiAutocomplete-root jss66" role="combobox" name="assignedTo">
  <label for="assignedTo" id="assignedTo-label">Assigned To</label>
  <input aria-autocomplete="list" id="assignedTo" type="text" />
</div>
```

**JavaScript Implementation**:
```javascript
// Find and click Apply Search button
document.querySelectorAll('.MuiButton-label').forEach(function(e) {
    const text = e.textContent.trim();
    if (text === "Apply Search") {
        e.closest('button').click();
        console.log("Apply Search clicked");
    }
});
```

5. Wait for search results to arrive

**Wait for Results**:
```javascript
// Wait until the searched output arrives
const checkResults = setInterval(() => {
    const containers = document.querySelectorAll('.hideGroupPanel [ref="eCenterContainer"]');
    for (const container of containers) {
        // Check if there's at least one role="row" child
        if (container.querySelector('[role="row"]')) {
            clearInterval(checkResults);
            console.log("Search results loaded");
            // Proceed to Part 2
            return true;
        }
    }
}, 200);
```

---

## Part 2: Contact Creation Loop (Repeat for Each Entry)

**IMPORTANT**: From here onward, all selectors should be prefixed with `.MuiDrawer-paper` since we're working inside the drawer.

### Step 5: Create New Contact
1. Click the **"+" (plus)** button to create a new contact

**HTML Reference**:
```html
<button data-icon-name="Add">...</button>
```

**JavaScript Implementation**:
```javascript
document.querySelector('[data-icon-name="Add"]').click();
```

2. Wait 1 second for the drawer to open

### Step 6: Fill Contact Details
For each entry from the Google Sheet, populate the following fields:

| Field | Value Source | Selector |
|-------|-------------|----------|
| **Title** | From Sheet | `.MuiDrawer-paper input[aria-autocomplete="list"]` (first autocomplete) |
| **Name** | From Sheet | `.MuiDrawer-paper input[name="firstName"]` |
| **Last Name** | From Sheet | `.MuiDrawer-paper input[name="lastName"]` |
| **Email** | From Sheet | `.MuiDrawer-paper input[name="email"]` |
| **Mobile** | From Sheet | `.MuiDrawer-paper input[name="mobile"]` |
| **Telephone** | From Sheet | `.MuiDrawer-paper input[name="phone"]` |

**HTML Reference**:
```html
<!-- Title (Autocomplete) -->
<input aria-invalid="false" autocomplete="off" type="text"
       class="MuiInputBase-input MuiInput-input MuiAutocomplete-input MuiAutocomplete-inputFocused MuiInputBase-inputAdornedEnd"
       aria-autocomplete="list" autocapitalize="none" spellcheck="false" value="" id="mui-autocomplete-53252">

<!-- Name -->
<input aria-invalid="false" autocomplete="abcd" name="firstName" required="" type="text"
       class="MuiInputBase-input MuiInput-input" value="">

<!-- Last Name -->
<input aria-invalid="false" autocomplete="abcd" name="lastName" required="" type="text"
       class="MuiInputBase-input MuiInput-input" value="">

<!-- Email -->
<input aria-invalid="false" autocomplete="abcd" name="email" required="" type="email"
       class="MuiInputBase-input MuiInput-input" value="">

<!-- Mobile -->
<input aria-invalid="false" autocomplete="abcd" name="mobile" required="" type="text"
       class="MuiInputBase-input MuiInput-input" value="">

<!-- Telephone -->
<input aria-invalid="false" autocomplete="abcd" name="phone" required="" type="text"
       class="MuiInputBase-input MuiInput-input" value="">
```

**Helper Function for Text Inputs**:
```javascript
/**
 * Sets value in a React / MUI controlled text input using a selector
 *
 * @param {string} selector - CSS selector for the input
 * @param {string} value - Text to insert
 */
function setMUITextBySelector(selector, value) {
    const input = document.querySelector(selector);
    if (!input) return console.error('Input not found:', selector);

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

    console.log(`Set input (${selector}) → "${value}"`);
}
```

### Step 6a: Fill Organisation Details
Inside the Organisation accordion, you need to open it first if closed.

**HTML Reference**:
```html
<div class="MuiButtonBase-root MuiExpansionPanelSummary-root jss153" tabindex="0" role="button"
     aria-disabled="false" aria-expanded="false" aria-controls="panel1a-content" id="panel1a-header">
  <div class="MuiExpansionPanelSummary-content">
    <p class="MuiTypography-root jss142 MuiTypography-body1">Organisation</p>
    <div class="jss154">
      <div class="col">
        <div class="value"></div>
      </div>
    </div>
  </div>
  <div class="MuiButtonBase-root MuiIconButton-root MuiExpansionPanelSummary-expandIcon MuiIconButton-edgeEnd"
       aria-disabled="false" aria-hidden="true">
    <span class="MuiIconButton-label">
      <svg class="MuiSvgIcon-root" focusable="false" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"></path>
      </svg>
    </span>
  </div>
</div>
```

**JavaScript Implementation**:
```javascript
// Find and open Organisation accordion if closed
document.querySelectorAll('.MuiDrawer-paper .MuiExpansionPanelSummary-root').forEach(function(panel) {
    const label = panel.textContent.trim();
    if (label.includes('Organisation')) {
        if (panel.getAttribute('aria-expanded') === 'false') {
            panel.click();
            console.log("Organisation accordion opened");
        }
    }
});
```

| Field | Value Source | Selector |
|-------|-------------|----------|
| **Organisation Name** | From Sheet | `.MuiDrawer-paper input[name="organisation"]` |
| **Position Title** | From Sheet | `.MuiDrawer-paper input[name="positionAtOrganisation"]` |

**HTML Reference**:
```html
<!-- Organisation Name -->
<input aria-invalid="false" autocomplete="off" name="organisation" type="text"
       class="MuiInputBase-input MuiInput-input" value="">

<!-- Position Title -->
<input aria-invalid="false" autocomplete="abcd" name="positionAtOrganisation" type="text"
       class="MuiInputBase-input MuiInput-input" value="">
```

### Step 7: Set Fixed Values

| Field | Value | Selector |
|-------|-------|----------|
| **Source** | "Other" | `.MuiDrawer-paper input[aria-describedby*="autocomplete"]` (find by context) |
| **Area of Law** | "Advice" | `.MuiDrawer-paper input[aria-describedby*="autocomplete"]` (find by context) |
| **Source Notes** | From Sheet | `.MuiDrawer-paper input` (near "Source Notes" label) |

**HTML Reference**:
```html
<!-- Source (Autocomplete) -->
<input aria-invalid="true" autocomplete="off" required="" type="text"
       class="MuiInputBase-input MuiInput-input MuiAutocomplete-input MuiAutocomplete-inputFocused MuiInputBase-inputAdornedEnd"
       aria-autocomplete="list" autocapitalize="none" spellcheck="false" value=""
       id="mui-autocomplete-49089" aria-describedby="mui-autocomplete-49089-helper-text">

<!-- Area of Law (Autocomplete) -->
<input aria-invalid="true" autocomplete="off" required="" type="text"
       class="MuiInputBase-input MuiInput-input MuiAutocomplete-input MuiAutocomplete-inputFocused MuiInputBase-inputAdornedEnd"
       aria-autocomplete="list" autocapitalize="none" spellcheck="false" value=""
       id="mui-autocomplete-48211" aria-describedby="mui-autocomplete-48211-helper-text">

<!-- Source Notes -->
<label class="MuiFormLabel-root MuiInputLabel-root MuiInputLabel-formControl MuiInputLabel-animated"
       data-shrink="false">Source Notes</label>
```

### Step 8: Configure Assignment

| Field | Value | Selector |
|-------|-------|----------|
| **Assigned To** | "Audrey" | `.MuiDrawer-paper [name="assignedTo"]` |
| **Assigned By** | Auto-filled | Defaults to logged-in user |

**HTML Reference**:
```html
<input aria-invalid="false" autocomplete="off" id="downshift-0-input" name="assignedTo" type="text"
       class="MuiInputBase-input MuiInput-input MuiInputBase-inputAdornedEnd" value="">
```

**JavaScript Implementation**:
```javascript
// Use the helper function to select Audrey
selectMUIAutocompleteBySelector(
    '.MuiDrawer-paper [name="assignedTo"]',
    ['Audrey']
);
```

### Step 9: Follow-up / Reminders
- **Action**: Leave as default
- **Behavior**: Automatically sets to current day (the day data is entered)

### Step 10: Save and Repeat
1. Click **"Save and Close"**

**HTML Reference**:
```html
<button class="MuiButtonBase-root MuiButton-root MuiButton-contained jss145" tabindex="0" type="submit">
  <span class="MuiButton-label">Save and Close</span>
  <span class="MuiTouchRipple-root"></span>
</button>
```

**JavaScript Implementation**:
```javascript
document.querySelector('.MuiDrawer-paper button[type="submit"]').click();
```

2. Wait for drawer to close (confirmation)
3. Return to Step 5 for next entry
4. Continue until all sheet entries are processed

---

## Part 3: Fields to IGNORE

Do NOT populate or modify these fields:
- Internal Notes
- Any fields in the lower section not explicitly mentioned above
- "Include Closed" checkbox (should remain unchecked)

---

## Part 4: Technical Requirements

### Operational Environment
- **Browser**: Must remain open during automation
- **System**: PC must stay awake (no sleep mode)
- **Schedule**: Run once daily (configurable timing)

### Volume & Performance
- **Daily Entries**: 70-200 contacts
- **Processing Time**: Needs to complete within reasonable window
- **Error Handling**: Skip/flag entries with missing required data

### Access Requirements
- Google Sheets API access (or ability to read sheet data)
- CRM login credentials (stored securely)
- Chrome extension with appropriate permissions

---

## Part 5: Chrome Extension Technical Specification

### Required Permissions
```json
{
  "permissions": [
    "tabs",
    "activeTab",
    "storage",
    "scripting"
  ],
  "host_permissions": [
    "<crm-domain>/*",
    "https://docs.google.com/spreadsheets/*"
  ]
}
```

### Extension UI Components (Side Panel)
1. **Connect Button**: Link to Google Sheet
2. **Start Button**: Begin automation
3. **Progress Indicator**: X/Y entries processed
4. **Log Display**: Real-time status updates
5. **Stop/Pause Button**: Emergency halt

### Content Script Functions
- `findAndClickElement(selector)` - Click by CSS selector
- `fillInput(selector, value)` - Populate text fields
- `selectDropdown(selector, value)` - Handle dropdowns
- `waitForElement(selector)` - Wait for dynamic content
- `scrollToElement(selector)` - Handle off-screen elements

---

## Part 6: Testing Protocol

### Pre-Production Testing
1. Use test account credentials
2. Process 5-10 sample entries
3. Verify all fields populate correctly
4. Confirm "Save and Close" works each time
5. Check Audrey is always assigned

### Validation Checklist
- [ ] Key Opportunities enabled
- [ ] My Key Opportunities unchecked
- [ ] Filter set to Audrey
- [ ] All contact fields filled
- [ ] Source = "Other"
- [ ] Area of Law = "Advice"
- [ ] Assigned To = "Audrey"
- [ ] No duplicate contacts created
- [ ] Error handling for missing data

---

## Part 7: Edge Cases & Handling

| Scenario | Handling |
|----------|----------|
| Missing required field | Log error, skip entry, continue |
| CRM session timeout | Re-authenticate, resume from last entry |
| Sheet access denied | Notify user, halt automation |
| Duplicate detection | Check existing, skip if duplicate |
| Network failure | Retry 3x, then halt and notify |

---

## Part 8: Success Criteria

1. **Accuracy**: 100% of required fields correctly populated
2. **Volume**: Can process 200 entries in under 2 hours
3. **Reliability**: Runs unattended without crashes
4. **Recovery**: Can resume from last successful entry
5. **Logging**: Complete audit trail of all actions

---

## Summary Flowchart

```
START
  ↓
Close Sidebar (.x)
  ↓
Login to CRM
  ↓
Navigate to Inquiries → Key Opportunities
  ↓
[ ] Key Opportunities = ON
[ ] My Key Opportunities = OFF
  ↓
Open Filter Menu (three green lines)
  ↓
Set Filter: Assigned To = "Audrey"
  ↓
Apply Search (only once)
  ↓
Wait for Results (role="row" appears)
  ↓
FETCH Google Sheet Data
  ↓
FOR EACH row in sheet:
  ↓
  Click "+" (New Contact) [data-icon-name="Add"]
  ↓
  Wait 1 second for drawer
  ↓
  Fill: Title, Name, Last Name, Email, Mobile, Telephone, organisation
  ↓
  Open Organisation accordion if closed
  ↓
  Fill: Organisation Name, Position Title
  ↓
  Set: Source = "Other", Area of Law = "Advice"
  ↓
  Fill: Source Notes (from sheet)
  ↓
  Set: Assigned To = "Audrey"
  ↓
  Click "Save and Close"
  ↓
  Wait for confirmation
  ↓
  Log success
  ↓
END FOR
  ↓
COMPLETE - Show summary
```

---

*Document generated from meeting transcript dated January 07, 2026*
