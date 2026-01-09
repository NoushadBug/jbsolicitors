/**
 * Utility Functions for JB Solicitors Lead Generation API
 */

/**
 * Get the spreadsheet by URL or ID
 * @param {string} url - Optional spreadsheet URL
 * @returns {Spreadsheet} The spreadsheet object
 */
function getSpreadsheet(url) {
  if (url) {
    return SpreadsheetApp.openByUrl(url);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Get or create a sheet by name
 * @param {string} sheetName - The name of the sheet
 * @returns {Sheet} The sheet object
 */
function getOrCreateSheet(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  return sheet;
}

/**
 * Initialize the Data sheet with headers
 */
function initializeDataSheet() {
  var sheet = getOrCreateSheet('Data');

  // Only add headers if sheet is empty
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Title', 'Given Name(s)', 'Last Name', 'Email', 'Telephone', 'Mobile',
      'Source', 'Source Notes', 'Organization Name', 'Position/Title',
      'Area of Law', 'Assigned To', 'Follow Up Due', 'Assigned By', 'Processed'
    ]);

    // Format the header row
    sheet.getRange(1, 1, 1, 15).setFontWeight('bold').setBackground('#4285F4').setFontColor('#FFFFFF');

    // Freeze the header row
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * Format a date to DD/MM/YY format
 * @param {Date} date - The date to format
 * @returns {string} Formatted date string
 */
function formatDateShort(date) {
  if (!date) return '';
  var d = new Date(date);
  var day = String(d.getDate()).padStart(2, '0');
  var month = String(d.getMonth() + 1).padStart(2, '0');
  var year = String(d.getFullYear()).slice(-2);
  return day + '/' + month + '/' + year;
}

/**
 * Parse a date string to Date object
 * @param {string} dateStr - The date string
 * @returns {Date} Date object
 */
function parseDate(dateStr) {
  if (!dateStr) return null;

  // Try parsing as is
  var date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date;
  }

  // Try DD/MM/YY format
  var parts = dateStr.split('/');
  if (parts.length === 3) {
    return new Date(2000 + parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }

  return null;
}

/**
 * Validate email format
 * @param {string} email - The email to validate
 * @returns {boolean} True if valid
 */
function isValidEmail(email) {
  if (!email) return false;
  var pattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return pattern.test(email);
}

/**
 * Validate phone number (Australian format)
 * @param {string} phone - The phone number to validate
 * @returns {boolean} True if valid
 */
function isValidPhone(phone) {
  if (!phone) return false;
  // Remove spaces, dashes, parentheses
  var cleaned = phone.replace(/[\s\-\(\)]/g, '');
  // Check for Australian format (starts with 04, 02, 03, 07, 08, or 61)
  var pattern = /^(?:\+?61|0)[2-8]\d{8}$/;
  return pattern.test(cleaned);
}

/**
 * Sanitize a string for safe output
 * @param {string} str - The string to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeString(str) {
  if (!str) return '';
  return String(str)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Log message to both Logger and spreadsheet log sheet
 * @param {string} message - The message to log
 * @param {string} context - The context/function name
 */
function logMessage(message, context) {
  var timestamp = new Date().toISOString();
  var logEntry = '[' + timestamp + '] [' + (context || 'Unknown') + '] ' + message;

  Logger.log(logEntry);

  // Also log to a Log sheet if it exists
  try {
    var logSheet = getOrCreateSheet('Log');
    logSheet.appendRow([timestamp, context || '', message]);
  } catch (e) {
    // Ignore errors writing to log sheet
  }
}

/**
 * Create an error response object
 * @param {string} message - Error message
 * @param {string} code - Error code
 * @returns {Object} Error response
 */
function createErrorResponse(message, code) {
  return {
    success: false,
    error: {
      message: message,
      code: code || 'ERROR',
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Create a success response object
 * @param {Object} data - Response data
 * @returns {Object} Success response
 */
function createSuccessResponse(data) {
  var response = {
    success: true,
    timestamp: new Date().toISOString()
  };

  // Merge data into response
  for (var key in data) {
    response[key] = data[key];
  }

  return response;
}

/**
 * Get configuration values
 * @returns {Object} Configuration object
 */
function getConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var configSheet = ss.getSheetByName('Config');

  if (!configSheet) {
    // Create default config sheet
    configSheet = ss.insertSheet('Config');
    configSheet.appendRow(['Key', 'Value']);
    configSheet.appendRow(['DEFAULT_ASSIGNED_TO', 'Audrey']);
    configSheet.appendRow(['DEFAULT_ASSIGNED_BY', 'Audrey']);
    configSheet.appendRow(['DEFAULT_SOURCE', 'Other']);
    configSheet.appendRow(['DEFAULT_AREA_OF_LAW', 'Advice']);
    configSheet.appendRow(['BATCH_SIZE', '50']);
  }

  var config = {};
  var data = configSheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    config[data[i][0]] = data[i][1];
  }

  return config;
}

/**
 * Export data as CSV
 * @param {Array} data - 2D array of data
 * @returns {string} CSV string
 */
function exportToCSV(data) {
  var csv = [];

  for (var i = 0; i < data.length; i++) {
    var row = [];
    for (var j = 0; j < data[i].length; j++) {
      var value = data[i][j];
      // Escape quotes and wrap in quotes if contains comma
      if (typeof value === 'string' && (value.indexOf(',') > -1 || value.indexOf('"') > -1)) {
        value = '"' + value.replace(/"/g, '""') + '"';
      }
      row.push(value);
    }
    csv.push(row.join(','));
  }

  return csv.join('\n');
}
