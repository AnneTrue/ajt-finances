// Functions for interacting with users, the input sheet, and maintaining the UI/persistent sheets

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('AJT Commands')
    .addItem('Submit Input', 'cmd_run_input')
    .addSeparator()
    .addItem('Clean Input', 'cmd_clean_input')
    .addItem('Maintain Records', 'cmd_maintain_record_sheets')
    .addItem('Export Records', 'cmd_export_records')
    .addSubMenu(ui.createMenu('Reports')
                .addItem('Monthly Report', 'cmd_monthly_report')
                .addItem('Monthly Report by Account Name', 'cmd_monthly_report_by_account_name')
                .addItem('Monthly-to-date Report', 'cmd_month_to_date_report')
                .addItem('Automatic Monthly Reports by Account Name', 'trigger_monthly_report_by_account_names')
               )
    .addToUi();
}

function cmd_maintain_record_sheets() {
  Logger.log('Maintaining record sheets');
  const expense_sheet = get_sheet(EXPENSE_SHEET_NAME);
  const income_sheet = get_sheet(INCOME_SHEET_NAME);
  const input_sheet = get_sheet(INPUT_SHEET_NAME);
  // Freeze header to prevent sort from moving them around
  expense_sheet.setFrozenRows(1);
  income_sheet.setFrozenRows(1);
  // Sort by date (first col), descending
  expense_sheet.sort(1, false);
  income_sheet.sort(1, false);
  // Resize columns A,B,C, and E. Do not resize Notes column (D)
  expense_sheet.autoResizeColumns(1,3);
  expense_sheet.autoResizeColumn(5);
  income_sheet.autoResizeColumns(1,3);
  income_sheet.autoResizeColumn(5);
  // Ensure data validations for categories
  const financial_validation = SpreadsheetApp.newDataValidation().requireNumberGreaterThan(0).build();
  const expense_category_validation = get_expense_category_data_validation(false);
  const income_category_validation = get_income_category_data_validation(false);
  const input_expense_range = input_sheet.getRange(INPUT_SHEET_EXPENSE_RANGE);
  const input_expense_rules = input_expense_range.getDataValidations();
  for (let r = 0; r < input_expense_rules.length; r++) {
    input_expense_rules[r][1] = financial_validation; // amount
    input_expense_rules[r][2] = expense_category_validation; // category
  }
  input_expense_range.setDataValidations(input_expense_rules);
  const input_income_range = input_sheet.getRange(INPUT_SHEET_INCOME_RANGE);
  const input_income_rules = input_income_range.getDataValidations();
  for (let r = 0; r < input_income_rules.length; r++) {
    input_income_rules[r][1] = financial_validation; // amount
    input_income_rules[r][2] = income_category_validation; // category
  }
  input_income_range.setDataValidations(input_income_rules);
  // Data validation for account names
  const account_validation = SpreadsheetApp.newDataValidation()
    .requireValueInList(Object.getOwnPropertyNames(ACCOUNT_NAMES), true)
    .setAllowInvalid(false)
    .build();
  input_sheet.getRange(INPUT_SHEET_ACCOUNT_CELL).setDataValidation(account_validation);
  Logger.log('Done maintaining record sheets');
}

function cmd_run_input() {
  Logger.log('Processing input sheet');
  const input_sheet = get_sheet(INPUT_SHEET_NAME);
  const expense_sheet = get_sheet(EXPENSE_SHEET_NAME);
  const income_sheet = get_sheet(INCOME_SHEET_NAME);
  const account = input_sheet.getRange(INPUT_SHEET_ACCOUNT_CELL).getValue();
  if (!account) {
    Logger.log('Missing account name for processing input. Exiting...');
    throw new Error('Missing account name. Please enter your name and re-run the script.');
  }
  const expense_range = input_sheet.getRange(INPUT_SHEET_EXPENSE_RANGE).getValues();
  const income_range = input_sheet.getRange(INPUT_SHEET_INCOME_RANGE).getValues();
  Logger.log('Processing expense input records');
  const expense_len = expense_range.length;
  for (let i = 0; i < expense_len; i++) {
    const expense_record = get_expense_from_input_row(account, expense_range[i]);
    if (expense_record) { expense_sheet.appendRow(expense_record.to_array()); }
  }
  Logger.log('Processing income input records');
  const income_len = income_range.length;
  for (let i = 0; i < income_len; i++) {
    const income_record = get_income_from_input_row(account, income_range[i]);
    if (income_record) { income_sheet.appendRow(income_record.to_array()); }
  }
  Logger.log('Finished processing input sheet');
  cmd_clean_input();
}

function cmd_clean_input() {
  Logger.log('Cleaning input sheet');
  const sheet = get_sheet(INPUT_SHEET_NAME);
  const expense_range = sheet.getRange(INPUT_SHEET_EXPENSE_RANGE);
  const income_range = sheet.getRange(INPUT_SHEET_INCOME_RANGE);
  const account_cell = sheet.getRange(INPUT_SHEET_ACCOUNT_CELL);
  expense_range.clearContent();
  income_range.clearContent();
  account_cell.clearContent();
  Logger.log('Finished cleaning input sheet');
}

function cmd_export_records() {
  const mailer = new ReportMailer(
    {'to': MAIL_TO, 'cc': MAIL_CC, 'bcc': MAIL_BCC, 'subject': MAIL_BASE_SUBJECT + 'Record Export', 'reply_to': MAIL_REPLY_TO}
  );
  Logger.log('Getting all expense records and converting to arrays...');
  const all_expenses_array = get_expense_records().map(function(record) { return record.to_array(); });
  Logger.log('Getting all income records and converting to arrays...');
  const all_incomes_array = get_income_records().map(function(record) { return record.to_array(); });
  const files = [];
  Logger.log('Creating JSON blobs...');
  files.push(Utilities.newBlob(JSON.stringify(all_expenses_array), 'text/plain', 'expense.json'));
  files.push(Utilities.newBlob(JSON.stringify(all_incomes_array), 'text/plain', 'income.json'));
  mailer.attachments = files;
  mailer.add_body_chunk('<p>Here is the current records for the Finances System.<br />Format is <b>JSON</b> in a text file.</p>', {});
  mailer.send_mail();
}

function cmd_monthly_report() {
  const month_date = new Date().getMonth()+1 + '/' + new Date().getFullYear();
  const mailer = new ReportMailer(
    {'to': MAIL_TO, 'cc': MAIL_CC, 'bcc': MAIL_BCC, 'subject': MAIL_BASE_SUBJECT + 'Monthly ' + month_date, 'reply_to': MAIL_REPLY_TO}
  );
  const report_components = DEFAULT_REPORT_COMPONENTS;
  const component_kwargs = {
    'all_expense_records': get_expense_records(),
    'all_income_records': get_income_records(),
    'timeframe_start': get_month_year(get_relative_month(MONTHLY_REPORT_WINDOW_IN_MONTHS)),
    'timeframe_end': get_month_year(new Date()),
  }
  send_report(mailer, report_components, component_kwargs);
}

function send_monthly_report_by_account_names(account_names, mailer) {
  Logger.log('Generating monthly report for accounts: %s', account_names);
  const account_filter = get_record_filter({'accounts': account_names})
  const all_account_expense_records = get_expense_records().filter(account_filter);
  const all_account_income_records = get_income_records().filter(account_filter);
  const report_components = DEFAULT_REPORT_COMPONENTS;
  const component_kwargs = {
    'all_expense_records': all_account_expense_records,
    'all_income_records': all_account_income_records,
    'timeframe_start': get_month_year(get_relative_month(MONTHLY_REPORT_WINDOW_IN_MONTHS)),
    'timeframe_end': get_month_year(new Date()),
  }
  send_report(mailer, report_components, component_kwargs);
}

function cmd_monthly_report_by_account_name() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.prompt(
    'Monthy Report by Account Name',
    'Please enter a comma-separated list of account names to use in the report:',
    ui.ButtonSet.OK_CANCEL
  );
  // Process the user's response.
  const button = result.getSelectedButton();
  const text = result.getResponseText();
  if (button == ui.Button.OK) {
    // fixme
    const account_names = text.split(',');
    for (let i = 0; i < account_names.length; i++) {
      if (!account_names[i] in ACCOUNT_NAMES) {
        throw new Error('Invalid account name, check capitalisation: ' + account_names[i]);
      }
    }
    const mailer = new ReportMailer(
      {'to': MAIL_TO, 'cc': MAIL_CC, 'bcc': MAIL_BCC, 'subject': MAIL_BASE_SUBJECT + 'Monthly Report by Account Name', 'reply_to': MAIL_REPLY_TO}
    );
    send_monthly_report_by_account_names(account_names, mailer);
  } else {
    Logger.log('No input, exiting cmd_monthly_report_by_account_name');
  }
}

function trigger_monthly_report_by_account_names() {
  for (target_email in ADDRESS_TO_ACCOUNT_MAPPING) {
    if (!ADDRESS_TO_ACCOUNT_MAPPING.hasOwnProperty(target_email)) { continue; }
    if (!ADDRESS_TO_ACCOUNT_MAPPING[target_email]) { continue; }
    const mailer = new ReportMailer(
      {'to': target_email, 'cc': null, 'bcc': null, 'subject': MAIL_BASE_SUBJECT + 'Monthly Report by Account Name', 'reply_to': MAIL_REPLY_TO}
    );
    Logger.log('Sending report to target email %s with accounts %s', target_email, ADDRESS_TO_ACCOUNT_MAPPING[target_email]);
    send_monthly_report_by_account_names(ADDRESS_TO_ACCOUNT_MAPPING[target_email], mailer);
    Logger.clear();
  }
}

function cmd_month_to_date_report() {
  const mailer = new ReportMailer(
    {'to': MAIL_TO, 'cc': MAIL_CC, 'bcc': MAIL_BCC, 'subject': MAIL_BASE_SUBJECT + 'Month-to-Date Report', 'reply_to': MAIL_REPLY_TO}
  );
  const report_components = DEFAULT_REPORT_COMPONENTS;
  const component_kwargs = {
    'all_expense_records': get_expense_records(),
    'all_income_records': get_income_records(),
    'timeframe_start': get_month_year(get_relative_month(MONTHLY_REPORT_WINDOW_IN_MONTHS)),
    'timeframe_end': new Date(),
  }
  send_report(mailer, report_components, component_kwargs);
}

function get_expense_records() {
  // gets all records in the expense record sheet, and filters out null values from the array
  const expense_sheet = get_sheet(EXPENSE_SHEET_NAME);
  const data = expense_sheet.getDataRange().getValues();
  return data.map(get_expense_record_from_array).filter(record => record !== null);
}

function get_income_records() {
  // gets all records in the income record sheet, and filters out null values from the array
  const income_sheet = get_sheet(INCOME_SHEET_NAME);
  const data = income_sheet.getDataRange().getValues();
  return data.map(get_income_record_from_array).filter(record => record !== null);
}

function get_expense_from_input_row(account, row) {
  const [date, amount, category, note] = row;
  return get_expense_record(account, date, amount, category, note);
}

function get_income_from_input_row(account, row) {
  const [date, amount, category, note] = row;
  return get_income_record(account, date, amount, category, note);
}
