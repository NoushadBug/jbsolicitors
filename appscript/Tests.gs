/**
 * Test Functions for JB Solicitors Lead Generation API
 * Run these from the Apps Script editor
 */

/**
 * Test initializeDataSheet function
 */
function test_initializeDataSheet() {
  var sheet = initializeDataSheet();
  Logger.log('Sheet name: ' + sheet.getName());
  Logger.log('Last row: ' + sheet.getLastRow());
  Logger.log('Headers: ' + sheet.getRange(1, 1, 1, 15).getValues()[0].join(', '));
}

/**
 * Test getLeads endpoint
 */
function test_getLeads() {
  var result = getLeadsAPIController();
  Logger.log(JSON.stringify(result, null, 2));
}

/**
 * Test getLead endpoint
 */
function test_getLead() {
  var result = getLeadAPIController(1); // Get first lead
  Logger.log(JSON.stringify(result, null, 2));
}

/**
 * Test getUnprocessedLeads endpoint
 */
function test_getUnprocessedLeads() {
  var result = getUnprocessedLeadsAPIController();
  Logger.log(JSON.stringify(result, null, 2));
}

/**
 * Test markLeadProcessed endpoint
 */
function test_markLeadProcessed() {
  var result = markLeadProcessedAPIController(1); // Mark first lead as processed
  Logger.log(JSON.stringify(result, null, 2));
}

/**
 * Test addLead endpoint
 */
function test_addLead() {
  var testLead = {
    title: 'Test Company',
    givenName: 'John',
    lastName: 'Doe',
    email: 'john@test.com',
    telephone: '02 1234 5678',
    mobile: '0412 345 678',
    source: 'Other',
    sourceNotes: 'Test source notes',
    organizationName: 'Test Company Pty Ltd',
    position: 'Test Manager',
    areaOfLaw: 'Advice',
    assignedTo: 'Audrey',
    followUpDue: '15/01/26',
    assignedBy: 'Audrey'
  };

  var result = addLeadAPIController(testLead);
  Logger.log(JSON.stringify(result, null, 2));
}

/**
 * Test getSheetData endpoint
 */
function test_getSheetData() {
  var result = getSheetDataAPIController();
  Logger.log(JSON.stringify(result, null, 2));
}

/**
 * Test formatDateShort function
 */
function test_formatDateShort() {
  Logger.log(formatDateShort(new Date())); // Should print today's date in DD/MM/YY
  Logger.log(formatDateShort('2025-01-15')); // Should print 15/01/25
}

/**
 * Test isValidEmail function
 */
function test_isValidEmail() {
  Logger.log('Valid email test (test@example.com): ' + isValidEmail('test@example.com'));
  Logger.log('Invalid email test (invalid): ' + isValidEmail('invalid'));
  Logger.log('Empty email test: ' + isValidEmail(''));
}

/**
 * Test isValidPhone function
 */
function test_isValidPhone() {
  Logger.log('Valid phone test (0412345678): ' + isValidPhone('0412345678'));
  Logger.log('Valid phone test (02 1234 5678): ' + isValidPhone('02 1234 5678'));
  Logger.log('Valid phone test (+61 2 1234 5678): ' + isValidPhone('+61 2 1234 5678'));
  Logger.log('Invalid phone test (123): ' + isValidPhone('123'));
}

/**
 * Test getConfig function
 */
function test_getConfig() {
  var config = getConfig();
  Logger.log(JSON.stringify(config, null, 2));
}

/**
 * Test exportToCSV function
 */
function test_exportToCSV() {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  var csv = exportToCSV(data);
  Logger.log(csv);
}

/**
 * Run all tests
 */
function runAllTests() {
  Logger.log('=== Running All Tests ===\n');

  Logger.log('--- Test: initializeDataSheet ---');
  test_initializeDataSheet();
  Logger.log('');

  Logger.log('--- Test: formatDateShort ---');
  test_formatDateShort();
  Logger.log('');

  Logger.log('--- Test: isValidEmail ---');
  test_isValidEmail();
  Logger.log('');

  Logger.log('--- Test: isValidPhone ---');
  test_isValidPhone();
  Logger.log('');

  Logger.log('--- Test: getLeads ---');
  test_getLeads();
  Logger.log('');

  Logger.log('--- Test: getLead ---');
  test_getLead();
  Logger.log('');

  Logger.log('--- Test: getUnprocessedLeads ---');
  test_getUnprocessedLeads();
  Logger.log('');

  Logger.log('--- Test: getConfig ---');
  test_getConfig();
  Logger.log('');

  Logger.log('=== All Tests Complete ===');
}

/**
 * Setup function to initialize the spreadsheet
 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Initialize Data sheet
  var dataSheet = initializeDataSheet();

  // Initialize Config sheet
  var configSheet = getOrCreateSheet('Config');
  if (configSheet.getLastRow() === 0) {
    configSheet.appendRow(['Key', 'Value']);
    configSheet.appendRow(['DEFAULT_ASSIGNED_TO', 'Audrey']);
    configSheet.appendRow(['DEFAULT_ASSIGNED_BY', 'Audrey']);
    configSheet.appendRow(['DEFAULT_SOURCE', 'Other']);
    configSheet.appendRow(['DEFAULT_AREA_OF_LAW', 'Advice']);
    configSheet.appendRow(['BATCH_SIZE', '50']);
    configSheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#EA4335').setFontColor('#FFFFFF');
  }

  // Create Log sheet
  var logSheet = getOrCreateSheet('Log');
  if (logSheet.getLastRow() === 0) {
    logSheet.appendRow(['Timestamp', 'Context', 'Message']);
    logSheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#34A853').setFontColor('#FFFFFF');
  }

  // Create Stats sheet
  var statsSheet = getOrCreateSheet('Stats');
  if (statsSheet.getLastRow() === 0) {
    statsSheet.appendRow(['Metric', 'Value']);
    statsSheet.appendRow(['Total Leads', '=COUNTA(Data!A:A)-1']);
    statsSheet.appendRow(['Processed Leads', '=COUNTA(Data!O:O)-1']);
    statsSheet.appendRow(['Unprocessed Leads', '=B2-B3']);
    statsSheet.appendRow(['Last Updated', '=NOW()']);
    statsSheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#FBBC04').setFontColor('#000000');
  }

  Logger.log('Setup complete! Spreadsheet initialized with all required sheets.');
}
