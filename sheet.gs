// Functions for interacting with users, the input sheet, and maintaining the UI/persistent sheets

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('AJT Commands')
    .addItem('Submit Input', 'cmd_run_input')
    .addSeparator()
    .addItem('Clean Input', 'cmd_clean_input')
    .addItem('Maintain Records', 'cmd_maintain_record_sheets')
    .addItem('Export Records', 'cmd_export_records')
    .addSubMenu(ui.createMenu('Reports')
      .addItem('Monthly Report', 'cmd_monthly_report')
      .addItem('Monthly Report by Account Name', 'cmd_monthly_report_by_account_name')
      .addItem('Monthly-to-date Report', 'cmd_month_to_date_report'))
    .addToUi();
}

function cmd_maintain_record_sheets() {
  Logger.log('Maintaining record sheets');
  var expense_sheet = get_sheet(EXPENSE_SHEET_NAME);
  var income_sheet = get_sheet(INCOME_SHEET_NAME);
  var input_sheet = get_sheet(INPUT_SHEET_NAME);
  // Freeze header to prevent sort from moving them around
  expense_sheet.setFrozenRows(1);
  income_sheet.setFrozenRows(1);
  // Sort by date (first col)
  expense_sheet.sort(1);
  income_sheet.sort(1);
  // Resize columns A,B,C, and E. Do not resize Notes column (D)
  expense_sheet.autoResizeColumns(1,3);
  expense_sheet.autoResizeColumn(5);
  income_sheet.autoResizeColumns(1,3);
  income_sheet.autoResizeColumn(5);
  // Ensure data validations for categories
  var financial_validation = SpreadsheetApp.newDataValidation().requireNumberGreaterThan(0).build();
  var expense_category_validation = get_expense_category_data_validation(false);
  var income_category_validation = get_income_category_data_validation(false);
  var input_expense_range = input_sheet.getRange(INPUT_SHEET_EXPENSE_RANGE);
  var input_expense_rules = input_expense_range.getDataValidations();
  for (var r = 0; r < input_expense_rules.length; r++) {
    input_expense_rules[r][1] = financial_validation; // amount
    input_expense_rules[r][2] = expense_category_validation; // category
  }
  input_expense_range.setDataValidations(input_expense_rules);
  var input_income_range = input_sheet.getRange(INPUT_SHEET_INCOME_RANGE);
  var input_income_rules = input_income_range.getDataValidations();
  for (var r = 0; r < input_income_rules.length; r++) {
    input_income_rules[r][1] = financial_validation; // amount
    input_income_rules[r][2] = income_category_validation; // category
  }
  input_income_range.setDataValidations(input_income_rules);
  // Data validation for account names
  var account_validation = SpreadsheetApp.newDataValidation()
    .requireValueInList(Object.getOwnPropertyNames(ACCOUNT_NAMES), true)
    .setAllowInvalid(false)
    .build();
  input_sheet.getRange(INPUT_SHEET_ACCOUNT_CELL).setDataValidation(account_validation);
  Logger.log('Done maintaining record sheets');
}

function cmd_run_input() {
  Logger.log('Processing input sheet');
  var input_sheet = get_sheet(INPUT_SHEET_NAME);
  var expense_sheet = get_sheet(EXPENSE_SHEET_NAME);
  var income_sheet = get_sheet(INCOME_SHEET_NAME);
  var account = input_sheet.getRange(INPUT_SHEET_ACCOUNT_CELL).getValue();
  if (!account) {
    Logger.log('Missing account name for processing input. Exiting...');
    throw new Error('Missing account name. Please enter your name and re-run the script.');
  }
  var expense_range = input_sheet.getRange(INPUT_SHEET_EXPENSE_RANGE).getValues();
  var income_range = input_sheet.getRange(INPUT_SHEET_INCOME_RANGE).getValues();
  Logger.log('Processing expense input records');
  var i, len = expense_range.length, expense_record;
  for (i = 0; i < len; i++) {
    expense_record = get_expense_from_input_row(account, expense_range[i]);
    if (expense_record) { expense_sheet.appendRow(expense_record.to_array()); }
  }
  Logger.log('Processing income input records');
  var len = income_range.length, income_record;
  for (i = 0; i < len; i++) {
    income_record = get_income_from_input_row(account, income_range[i]);
    if (income_record) { income_sheet.appendRow(income_record.to_array()); }
  }
  Logger.log('Finished processing input sheet');
  cmd_clean_input();
}

function cmd_clean_input() {
  Logger.log('Cleaning input sheet');
  var sheet = get_sheet(INPUT_SHEET_NAME);
  var expense_range = sheet.getRange(INPUT_SHEET_EXPENSE_RANGE);
  var income_range = sheet.getRange(INPUT_SHEET_INCOME_RANGE);
  var account_cell = sheet.getRange(INPUT_SHEET_ACCOUNT_CELL);
  expense_range.clearContent();
  income_range.clearContent();
  account_cell.clearContent();
  Logger.log('Finished cleaning input sheet');
}

function cmd_export_records() {
  var mailer = new ReportMailer(
    {'to': MAIL_TO, 'cc': MAIL_CC, 'bcc': MAIL_BCC, 'subject': MAIL_BASE_SUBJECT + 'Record Export', 'reply_to': MAIL_REPLY_TO}
  );
  Logger.log('Getting all expense records and converting to arrays...');
  var all_expenses_array = get_expense_records().map(function(record) { return record.to_array(); });
  Logger.log('Getting all income records and converting to arrays...');
  var all_incomes_array = get_income_records().map(function(record) { return record.to_array(); });
  var files = [];
  Logger.log('Creating JSON blobs...');
  files.push(Utilities.newBlob(JSON.stringify(all_expenses_array), 'text/plain', 'expense.json'));
  files.push(Utilities.newBlob(JSON.stringify(all_incomes_array), 'text/plain', 'income.json'));
  mailer.attachments = files;
  mailer.add_body_chunk('<p>Here is the current records for the Finances System.<br />Format is <b>JSON</b> in a text file.</p>', {});
  mailer.send_mail();
}

function cmd_monthly_report() {
  var month_date = new Date().getMonth()+1 + '/' + new Date().getFullYear();
  var mailer = new ReportMailer(
    {'to': MAIL_TO, 'cc': MAIL_CC, 'bcc': MAIL_BCC, 'subject': MAIL_BASE_SUBJECT + 'Monthly ' + month_date, 'reply_to': MAIL_REPLY_TO}
  );
  var report_components = DEFAULT_REPORT_COMPONENTS;
  var component_kwargs = {
    'all_expense_records': get_expense_records(),
    'all_income_records': get_income_records(),
    'timeframe_start': get_month_year(get_relative_month(MONTHLY_REPORT_WINDOW_IN_MONTHS)),
    'timeframe_end': get_month_year(new Date()),
  }
  send_report(mailer, report_components, component_kwargs);
}

function cmd_monthly_report_by_account_name() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt(
    'Monthy Report by Account Name',
    'Please enter a comma-separated list of account names to use in the report:',
    ui.ButtonSet.OK_CANCEL
  );
  // Process the user's response.
  var button = result.getSelectedButton();
  var text = result.getResponseText();
  if (button == ui.Button.OK) {
    // fixme
    var account_names = text.split(',');
    for (var i = 0; i < account_names.length; i++) {
      if (!account_names[i] in ACCOUNT_NAMES) {
        throw new Error('Invalid account name, check capitalisation: ' + account_names[i]);
      }
    }
    Logger.log('Generating monthly report for accounts: %s', account_names);
    var account_filter = get_record_filter({'accounts': account_names})
    var all_account_expense_records = get_expense_records().filter(account_filter);
    var all_account_income_records = get_income_records().filter(account_filter);
    var mailer = new ReportMailer(
      {'to': MAIL_TO, 'cc': MAIL_CC, 'bcc': MAIL_BCC, 'subject': MAIL_BASE_SUBJECT + 'Monthly Report by Account Name', 'reply_to': MAIL_REPLY_TO}
    );
    var report_components = DEFAULT_REPORT_COMPONENTS;
    var component_kwargs = {
      'all_expense_records': all_account_expense_records,
      'all_income_records': all_account_income_records,
      'timeframe_start': get_month_year(get_relative_month(MONTHLY_REPORT_WINDOW_IN_MONTHS)),
      'timeframe_end': get_month_year(new Date()),
    }
    send_report(mailer, report_components, component_kwargs);
  } else {
    Logger.log('No input, exiting cmd_monthly_report_by_account_name');
  }
}

function cmd_month_to_date_report() {
  var mailer = new ReportMailer(
    {'to': MAIL_TO, 'cc': MAIL_CC, 'bcc': MAIL_BCC, 'subject': MAIL_BASE_SUBJECT + 'Monthly Report', 'reply_to': MAIL_REPLY_TO}
  );
  var report_components = DEFAULT_REPORT_COMPONENTS;
  var component_kwargs = {
    'all_expense_records': get_expense_records(),
    'all_income_records': get_income_records(),
    'timeframe_start': get_month_year(get_relative_month(MONTHLY_REPORT_WINDOW_IN_MONTHS)),
    'timeframe_end': new Date(),
  }
  send_report(mailer, report_components, component_kwargs);
}

function get_expense_records() {
  // gets all records in the expense record sheet, and filters out null values from the array
  var expense_sheet = get_sheet(EXPENSE_SHEET_NAME);
  var data = expense_sheet.getDataRange().getValues();
  return data.map(get_expense_record_from_array).filter(function(record) { return record !== null; });
}

function get_income_records() {
  // gets all records in the income record sheet, and filters out null values from the array
  var income_sheet = get_sheet(INCOME_SHEET_NAME);
  var data = income_sheet.getDataRange().getValues();
  return data.map(get_income_record_from_array).filter(function(record) { return record !== null; });
}

function get_expense_from_input_row(account, row) {
  var date = row[0];
  var amount = row[1];
  var category = row[2];
  var note = row[3];
  return get_expense_record(account, date, amount, category, note);
}

function get_income_from_input_row(account, row) {
  var date = row[0];
  var amount = row[1];
  var category = row[2];
  var note = row[3];
  return get_income_record(account, date, amount, category, note);
}
