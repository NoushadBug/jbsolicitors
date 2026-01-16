/**
 * JB Solicitors Lead Generation API
 *
 * API Endpoints:
 * - getLeads: Get all leads from the sheet
 * - getLead: Get a specific lead by row index
 * - markLeadProcessed: Mark a lead as processed
 * - getUnprocessedLeads: Get all unprocessed leads
 * - addLead: Add a new lead to the sheet
 */

/**
 * Main GET request handler
 * @param {Object} request - The request object with parameters
 * @returns {ContentService.TextOutput} JSON response
 */
function doGet(request) {
  return handleRequest(request);
}

/**
 * Main POST request handler
 * @param {Object} request - The request object with parameters
 * @returns {ContentService.TextOutput} JSON response
 */
function doPost(request) {
  var requestData = JSON.parse(request.postData.contents);
  return handleRequest({ parameter: requestData });
}

/**
 * Main request router
 * @param {Object} request - The request object
 * @returns {ContentService.TextOutput} JSON response
 */
function handleRequest(request) {
  var action = request.parameter.action;
  var result;

  try {
    switch (action) {
      case 'getLeads':
        result = getLeadsAPIController();
        break;

      case 'getLead':
        var rowIndex = parseInt(request.parameter.rowIndex);
        result = getLeadAPIController(rowIndex);
        break;

      case 'markLeadProcessed':
        var rowIndex = parseInt(request.parameter.rowIndex);
        result = markLeadProcessedAPIController(rowIndex);
        break;

      case 'getUnprocessedLeads':
        result = getUnprocessedLeadsAPIController();
        break;

      case 'addLead':
        result = addLeadAPIController(request.parameter);
        break;

      case 'getSheetData':
        result = getSheetDataAPIController();
        break;

      default:
        return createJSONResponse({ error: 'Unknown action: ' + action });
    }

    return createJSONResponse(result);
  } catch (error) {
    Logger.log('Error in handleRequest: ' + error.toString());
    return createJSONResponse({ error: error.toString() });
  }
}

/**
 * Get all leads from the sheet
 * @returns {Object} Response with all leads
 */
function getLeadsAPIController() {
  var sheet = getSheet();
  if (!sheet) {
    return { error: 'Sheet not found' };
  }

  var data = sheet.getDataRange().getValues();
  var leads = parseLeadsFromData(data);

  return {
    success: true,
    count: leads.length,
    leads: leads
  };
}

/**
 * Get a specific lead by row index
 * @param {number} rowIndex - The row index (1-based, excluding header)
 * @returns {Object} Response with the lead data
 */
function getLeadAPIController(rowIndex) {
  var sheet = getSheet();
  if (!sheet) {
    return { error: 'Sheet not found' };
  }

  var lastRow = sheet.getLastRow();
  if (rowIndex < 1 || rowIndex > lastRow - 1) {
    return { error: 'Invalid row index' };
  }

  var leadData = sheet.getRange(rowIndex + 1, 1, 1, 14).getValues()[0];
  var lead = parseLeadFromRow(leadData, rowIndex);

  return {
    success: true,
    lead: lead
  };
}

/**
 * Mark a lead as processed (adds a timestamp)
 * @param {number} rowIndex - The row index (1-based, excluding header)
 * @returns {Object} Response indicating success/failure
 */
function markLeadProcessedAPIController(rowIndex) {
  var sheet = getSheet();
  if (!sheet) {
    return { error: 'Sheet not found' };
  }

  var lastRow = sheet.getLastRow();
  if (rowIndex < 1 || rowIndex > lastRow - 1) {
    return { error: 'Invalid row index' };
  }

  // Check if column O exists for processed timestamp, if not add it
  var headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var processedColIndex = headerRow.indexOf('Processed');

  if (processedColIndex === -1) {
    // Add the Processed column header
    sheet.getRange(1, sheet.getLastColumn() + 1).setValue('Processed');
    processedColIndex = sheet.getLastColumn() - 1;
  } else {
    processedColIndex++;
  }

  // Set the processed timestamp
  sheet.getRange(rowIndex + 1, processedColIndex + 1).setValue(new Date().toISOString());

  return {
    success: true,
    message: 'Lead marked as processed'
  };
}

/**
 * Get all unprocessed leads (no timestamp in Processed column)
 * @returns {Object} Response with unprocessed leads
 */
function getUnprocessedLeadsAPIController() {
  var sheet = getSheet();
  if (!sheet) {
    return { error: 'Sheet not found' };
  }

  var data = sheet.getDataRange().getValues();
  var headerRow = data[0];
  var processedColIndex = headerRow.indexOf('Processed');

  var leads = [];

  // Skip first TWO rows (indices 0 and 1) - they contain column headers
  // Start from index 2 which is the first data row
  for (var i = 2; i < data.length; i++) {
    var isProcessed = false;

    // Check if Processed column exists and has a value
    if (processedColIndex !== -1 && processedColIndex < data[i].length) {
      var processedValue = data[i][processedColIndex];
      if (processedValue && processedValue !== '') {
        isProcessed = true;
      }
    }

    if (!isProcessed) {
      var lead = parseLeadFromRow(data[i], i);
      leads.push(lead);
    }
  }

  return {
    success: true,
    count: leads.length,
    leads: leads
  };
}

/**
 * Add a new lead to the sheet
 * @param {Object} leadData - The lead data to add
 * @returns {Object} Response indicating success/failure
 */
function addLeadAPIController(leadData) {
  var sheet = getSheet();
  if (!sheet) {
    return { error: 'Sheet not found' };
  }

  var newRow = [
    leadData.title || '',
    leadData.givenName || '',
    leadData.lastName || '',
    leadData.email || '',
    leadData.telephone || '',
    leadData.mobile || '',
    leadData.source || 'Other',
    leadData.sourceNotes || '',
    leadData.organizationName || '',
    leadData.position || '',
    leadData.areaOfLaw || 'Advice',
    leadData.assignedTo || 'Audrey',
    leadData.followUpDue || new Date().toLocaleDateString('en-US'),
    leadData.assignedBy || 'Audrey'
  ];

  sheet.appendRow(newRow);

  return {
    success: true,
    message: 'Lead added successfully',
    rowIndex: sheet.getLastRow() - 1
  };
}

/**
 * Get raw sheet data for debugging
 * @returns {Object} Response with sheet data
 */
function getSheetDataAPIController() {
  var sheet = getSheet();
  if (!sheet) {
    return { error: 'Sheet not found' };
  }

  var data = sheet.getDataRange().getValues();

  return {
    success: true,
    sheetName: sheet.getName(),
    lastRow: sheet.getLastRow(),
    lastColumn: sheet.getLastColumn(),
    data: data
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get the active sheet (named "Data")
 * @returns {Sheet} The sheet object
 */
function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Data');

  if (!sheet) {
    sheet = ss.insertSheet('Data');
    // Add headers
    sheet.appendRow([
      'Title', 'Given Name(s)', 'Last Name', 'Email', 'Telephone', 'Mobile',
      'Source', 'Source Notes', 'Organization Name', 'Position/Title',
      'Area of Law', 'Assigned To', 'Follow Up Due', 'Assigned By'
    ]);
  }

  return sheet;
}

/**
 * Parse leads from raw data array
 * @param {Array} data - Raw data from sheet (first TWO rows are headers, skipped)
 * @returns {Array} Array of lead objects
 */
function parseLeadsFromData(data) {
  var leads = [];

  // Skip first TWO rows (indices 0 and 1) - they contain column headers
  // Start from index 2 which is the first data row
  for (var i = 2; i < data.length; i++) {
    var lead = parseLeadFromRow(data[i], i);
    leads.push(lead);
  }

  return leads;
}

/**
 * Parse a single lead from a row
 * @param {Array} row - Single row of data
 * @param {number} rowIndex - Row index (for reference)
 * @returns {Object} Parsed lead object
 */
function parseLeadFromRow(row, rowIndex) {
  return {
    rowIndex: rowIndex,
    title: safeGet(row, 0),
    givenName: safeGet(row, 1),
    lastName: safeGet(row, 2),
    email: safeGet(row, 3),
    telephone: safeGet(row, 4),
    mobile: safeGet(row, 5),
    source: safeGet(row, 6),
    sourceNotes: safeGet(row, 7),
    organizationName: safeGet(row, 8),
    position: safeGet(row, 9),
    areaOfLaw: safeGet(row, 10),
    assignedTo: safeGet(row, 11),
    followUpDue: safeGet(row, 12),
    assignedBy: safeGet(row, 13),
    processed: safeGet(row, 14) // Column O if exists
  };
}

/**
 * Safely get value from array index
 * @param {Array} arr - The array
 * @param {number} index - The index
 * @returns {*} The value or empty string
 */
function safeGet(arr, index) {
  return (arr && index < arr.length) ? arr[index] : '';
}

/**
 * Create JSON response
 * @param {Object} data - Data to return
 * @returns {ContentService.TextOutput} JSON output
 */
function createJSONResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
