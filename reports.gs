const DEFAULT_REPORT_COMPONENTS = {
  'Expense Review (Reduced Categories)': build_expense_review_reduced_categories,
  'Cashflow Review': build_cashflow_review,
  'Key Performance Indicators': build_kpi,
  'Expense Category Forecast': build_budget_forecast, // null,
  'Expense Category Breakdown': null, // build_expense_category_breakdown
  'Expense Breakdown': build_expense_breakdown,
  'Income Breakdown': build_income_breakdown,
  'Discretionary Expense by Account': build_discretionary_expense_by_account,
  'Income by Account': null,
  'Does Not Trigger': null, // example of nullifying a component
}

function send_report(mailer, report_components, component_kwargs) {
  // mailer is new ReportMailer
  // report_components = {'human-readable component name': callable}
  // component kwargs = {all_expense_records, timeframe_start, timeframe_end}
  init_kpi_functions();
  init_forecast_functions();
  for (let component in report_components) {
    if (!report_components.hasOwnProperty(component) || !report_components[component]) { continue; }
    Logger.log('Running report component %s', component);
    try {
      report_components[component](mailer, component_kwargs);
    } catch (err) {
      if (FAIL_ON_COMPONENT_ERROR) { throw err; }
      Logger.log('Caught error in component %s: %s', component, err);
    }
  }
  //end of report building
  Logger.log('Done running report components');
  mailer.send_mail()
}

function ReportMailer(kwargs) {
  // kwargs = {'to', 'cc', 'bcc', 'subject', 'reply_to'}
  this.to = kwargs.to;
  this.cc = kwargs.cc;
  this.bcc = kwargs.bcc;
  this.subject = kwargs.subject;
  this.replyTo = kwargs.reply_to;
  this.htmlBody = ''; this.inlineImages = {};
  this.noReply = true;
  this.add_body_chunk = function(html, images) {
    // :type html: str
    // :type images: map
    if (this.htmlBody === '') {
      this.htmlBody += html;
    } else {
      // add horizontal rule to split between chunks
      this.htmlBody += '<hr />' + html;
    }
    for (let key in images) {
      if (!images.hasOwnProperty(key)) { continue; }
      this.inlineImages[key] = images[key];
    }
  }
  this.send_mail = function () {
    // append script log to email
    Logger.log('Trying to send email!');
    if (SEND_LOG_TRANSCRIPT) {
      let log = '<p><b>Script Log:</b><br />' + Logger.getLog(); // wrap this in html
      log = log.replace(/(?:\r\n|\r|\n)/g, '<br />'); // linebreaks
      log += '</p>';
      this.add_body_chunk(log, {});
    }
    MailApp.sendEmail(this);
  };
}

function build_expense_review_reduced_categories(mailer, kwargs) {
  // kwargs = {all_expense_records, timeframe_start, timeframe_end}
  Logger.log('Building expense review for reduced categories');
  if (!kwargs.all_expense_records) { throw new Error('Missing all_expense_records'); }
  if (!kwargs.timeframe_start) { throw new Error('Missing timeframe_start'); }
  if (!kwargs.timeframe_end) { throw new Error('Missing timeframe_end'); }
  // Create header and dynamically allocate categories/colours
  const header = ['Date'];
  const colours = [];
  for (let category_name in REDUCED_CATEGORIES) {
    if (!REDUCED_CATEGORIES.hasOwnProperty(category_name)) { continue; }
    if (category_name === 'Misc') { continue; } // exclude Misc
    header.push(category_name);
    colours.push(REDUCED_CATEGORIES[category_name]);
  }
  // Create 2-dimensional array for values of sheet
  const sheet_values = [header];
  const split_months = split_timeframe_into_months(kwargs.timeframe_start, kwargs.timeframe_end);
  for (let i = 1; i < split_months.length; i++) {
    const single_month_row = [split_months[i-1]]; // Date column
    const single_month_records = kwargs.all_expense_records.filter(
      get_record_filter({'start_date': split_months[i-1], 'end_date': split_months[i]})
    );
    for (let j = 1; j < header.length; j++) {
      const single_category_records = single_month_records.filter(
        get_record_filter({'reduced_categories': [header[j]]})
      );
      single_month_row.push(sum_records(single_category_records).value);
    }
    sheet_values.push(single_month_row);
  }

  // Build Review Chart
  Logger.log('Creating expense review chart');
  const sheet = ensure_new_sheet('_expense_review');
  const review_range = sheet.getRange(1, 1, sheet_values.length, header.length);
  review_range.setValues(sheet_values);
  const chart = sheet.newChart()
    .asAreaChart().addRange(review_range)
    .setOption('chartArea', {width:'95%', height:'95%'})
    .setOption('legend', {position:'in'})
    .setOption('titlePosition', 'in')
    .setOption('hAxis', {'title':'Date', 'gridlines':{'count': review_range.getHeight()-1}, 'textPosition':'in'})
    .setOption('vAxis', {'title':'Spending (USD)', 'textPosition':'in'})
    .setOption('height', 400).setOption('width', 900)
    .setOption('areaOpacity', 0.85)
    .setOption('lineWidth', 0)
    .setOption('colors', colours)
    .setStacked();
  chart.setOption('title', 'Expense Review (Reduced)');

  // Output html and chart image:
  mailer.add_body_chunk('<p text-align="center"><img src="cid:expense_review_chart"></p>', {'expense_review_chart':chart.build().getAs('image/png')});
  Logger.log('Cleaning up sheet');
  delete_sheet('_expense_review');
  Logger.log('Done building expense review for reduced categories');
}

function build_cashflow_review(mailer, kwargs) {
  // kwargs = {all_expense_records, all_income_records, timeframe_start, timeframe_end}
  if (!kwargs.all_expense_records) { throw new Error('Missing all_expense_records'); }
  if (!kwargs.all_income_records) { throw new Error('Missing all_income_records'); }
  if (!kwargs.timeframe_start) { throw new Error('Missing timeframe_start'); }
  if (!kwargs.timeframe_end) { throw new Error('Missing timeframe_end'); }
  const header = ['Date', 'Total Expenses', 'Mandatory', 'Discretionary', 'Assets', 'Income'];
  const colours = ['black', 'grey', 'orange', 'blue', 'green'];
  // Create 2-dimensional array for values of sheet
  const sheet_values = [header];
  const split_months = split_timeframe_into_months(kwargs.timeframe_start, kwargs.timeframe_end);
  for (let i = 1; i < split_months.length; i++) {
    const single_month_expense_records = kwargs.all_expense_records.filter(
      get_record_filter({'start_date': split_months[i-1], 'end_date': split_months[i]})
    );
    const single_month_income_records = kwargs.all_income_records.filter(
      get_record_filter({'start_date': split_months[i-1], 'end_date': split_months[i]})
    );
    const single_total = sum_records(
      single_month_expense_records.filter(get_record_filter({'reduced_categories': ALL_REDUCED_BUT_MISC}))
    );
    const single_income = sum_records(single_month_income_records);
    const single_mandatory = sum_records(
      single_month_expense_records.filter(get_record_filter({'reduced_categories': ['Mandatory', 'Debt']}))
    );
    const single_discretionary = sum_records(
      single_month_expense_records.filter(get_record_filter({'reduced_categories': ['Fun']}))
    );
    const single_assets = sum_records(
      single_month_expense_records.filter(get_record_filter({'reduced_categories': ['Asset']}))
    );
    // Date, Total, Mandatory, Discretionary, Assets, Income
    const single_month_row = [split_months[i-1], single_total.value, single_mandatory.value, single_discretionary.value, single_assets.value, single_income.value];
    sheet_values.push(single_month_row);
  }
  
  // Build Review Chart
  Logger.log('Creating cashflow review chart');
  const sheet = ensure_new_sheet('_cashflow_review');
  const review_range = sheet.getRange(1, 1, sheet_values.length, header.length);
  review_range.setValues(sheet_values);
  const chart = sheet.newChart()
    .asAreaChart().addRange(review_range)
    .setOption('chartArea', {width:'95%', height:'95%'})
    .setOption('legend', {position:'in'})
    .setOption('titlePosition', 'in')
    .setOption('hAxis', {'title':'Date', 'gridlines':{'count': review_range.getHeight()-1}, 'textPosition':'in'})
    .setOption('vAxis', {'title':'Cash Flow (USD)', 'textPosition':'in'})
    .setOption('height', 400).setOption('width', 900)
    .setOption('areaOpacity', 0.0)
    .setOption('lineWidth', 3)
    .setOption('colors', colours);
  chart.setOption('title', 'Cashflow Review');

  // Output html and chart image:
  mailer.add_body_chunk('<p text-align="center"><img src="cid:cashflow_review_chart"></p>', {'cashflow_review_chart': chart.build().getAs('image/png')});
  Logger.log('Cleaning up sheet');
  delete_sheet('_cashflow_review');
  Logger.log('Done building cashflow review');
}

function build_kpi_savings_rate(expense_records, income_records) {
  // savings percentage of period income
  const total_expense = sum_records(expense_records.filter(
    get_record_filter({'reduced_categories': REDUCED_EXPENSE_CATEGORIES})
  ));
  const total_income = sum_records(income_records);
  const savings = total_income.subtract(total_expense);
  if (total_income.to_literal() <= 0) { return 0; }
  return savings.to_literal() / total_income.to_literal();
}

function build_kpi_discretionary_rate(expense_records, income_records) {
  // discretionary spending as percentage of period expenses
  const total_expense = sum_records(expense_records.filter(
    get_record_filter({'reduced_categories': REDUCED_EXPENSE_CATEGORIES})
  ));
  const discretionary_records = expense_records.filter(
    get_record_filter({'reduced_categories': ['Fun']})
  );
  const total_discretionary = sum_records(discretionary_records);
  if (total_expense.to_literal() <= 0) { return 0; }
  return total_discretionary.to_literal() / total_expense.to_literal();
}

function validate_kpi_obj(kpi_obj) {
  if (!kpi_obj.hasOwnProperty('func')) { throw new Error('Missing `func` property'); }
  if (!kpi_obj.hasOwnProperty('colour')) { throw new Error('Missing `colour` property'); }
  if (!kpi_obj.hasOwnProperty('display_name')) { throw new Error('Missing `display_name` property'); }
  if (!kpi_obj.hasOwnProperty('enabled')) { throw new Error('Missing `enabled` property'); }
}

function build_kpi(mailer, kwargs) {
  // kwargs = {all_expense_records, all_income_records, timeframe_start, timeframe_end}
  if (!kwargs.all_expense_records) { throw new Error('Missing all_expense_records'); }
  if (!kwargs.all_income_records) { throw new Error('Missing all_income_records'); }
  if (!kwargs.timeframe_start) { throw new Error('Missing timeframe_start'); }
  if (!kwargs.timeframe_end) { throw new Error('Missing timeframe_end'); }
  const split_months = split_timeframe_into_months(kwargs.timeframe_start, kwargs.timeframe_end);
  const header = ['Date'];
  const colours = [];
  const rows = [];
  // build by columns, not rows
  for (let i = 0; i < split_months.length - 1; i++) {
    rows.push([split_months[i]]);
  }
  for (let kpi in KPI_FUNCTIONS) {
    if (!KPI_FUNCTIONS.hasOwnProperty(kpi)) { continue; }
    try {
      validate_kpi_obj(KPI_FUNCTIONS[kpi]);
    } catch (err) {
      Logger.log('KPI object %s failed validation: %s', kpi, err);
      continue;
    }
    if (!KPI_FUNCTIONS[kpi].enabled) { continue; }
    Logger.log('Building KPI %s', kpi);
    let kpi_col = [];
    try {
      // build column (all months) for individual KPI
      for (let i = 1; i < split_months.length; i++) {
        const month_expenses = kwargs.all_expense_records.filter(
          get_record_filter({'start_date': split_months[i-1], 'end_date': split_months[i]})
        );
        const month_incomes  = kwargs.all_income_records.filter(
          get_record_filter({'start_date': split_months[i-1], 'end_date': split_months[i]})
        );
        kpi_col.push(KPI_FUNCTIONS[kpi].func(month_expenses, month_incomes));
      }
    } catch (err) {
      Logger.log('build_kpi caught error in KPI %s: %s', kpi, err);
      continue;
    }
    // if all is successful, add individual KPI results
    header.push(KPI_FUNCTIONS[kpi].display_name);
    colours.push(KPI_FUNCTIONS[kpi].colour);
    for (let i = 0; i < kpi_col.length; i++) {
      rows[i].push(kpi_col[i]);
    }
  }
  rows.unshift(header); // insert at start of array
  
  // Build KPI Chart
  Logger.log('Creating KPI chart');
  const sheet = ensure_new_sheet('_kpis');
  const sheet_range = sheet.getRange(1, 1, rows.length, header.length);
  sheet_range.setValues(rows);
  const fixed_range_chart = sheet.newChart()
    .asAreaChart().addRange(sheet_range)
    .setOption('chartArea', {width:'95%', height:'95%'})
    .setOption('legend', {position:'in'})
    .setOption('titlePosition', 'in')
    // fixed to 100% to -25%
    .setOption('hAxis', {'title':'Date', 'gridlines':{'count': sheet_range.getHeight()-1}, 'textPosition':'in'})
    .setOption('vAxis', {'title':'Ratio', 'textPosition':'in', 'format': '#,###%', 'viewWindow': {'max': 1, 'min': -.25}})
    .setOption('height', 400).setOption('width', 900)
    .setOption('areaOpacity', 0.0)
    .setOption('lineWidth', 3)
    .setOption('colors', colours);
  fixed_range_chart.setOption('title', 'Key Performance Indicators');
  // Eventually we may want to create additional charts for KPIs that do not map into the 0% - 100% range, hence the naming scheme

  // Output html and chart image:
  mailer.add_body_chunk('<p text-align="center"><img src="cid:kpi_fixed1_chart"></p>', {'kpi_fixed1_chart': fixed_range_chart.build().getAs('image/png')});
  Logger.log('Cleaning up sheet');
  delete_sheet('_kpis');
  Logger.log('Done building KPIs');
}

function get_html_table(kwargs) {
  // kwargs = {title, header, rows, total}
  if (!kwargs.rows || !kwargs.header) { throw new Error('Header or rows undefined, no data to generate table with'); }
  const width = kwargs.header.length;
  let html_str = '<p text-align="center"><table border="1"><thead>';
  if (kwargs.title) {
    html_str += `<tr><th colspan="${width}">${kwargs.title}</th></tr>`;
  }
  html_str += '<tr>';
  for (let i = 0; i < width; i++) {
    html_str += `<th text-align="center">${kwargs.header[i]}</th>`;
  }
  html_str += '</tr></thead><tbody>';
  for (let i = 0; i < kwargs.rows.length; i++) {
    html_str += '<tr>';
    for (let k = 0; k < kwargs.rows[i].length; k++) {
      html_str += `<td>${kwargs.rows[i][k]}</td>`;
    }
    html_str += '</tr>';
  }
  if (kwargs.total) {
    let total_span, amount_span;
    if (width > 2) {
      total_span = width - 2;
      amount_span = 2;
    } else {
      total_span = 1;
      amount_span = 1;
    }
    html_str += `<tr><th colspan="${total_span}">Total:</th><th colspan="${amount_span}">${kwargs.total}</th></tr>`;
  }
  html_str += '</tbody></table></p>';
  return html_str;
}

function build_budget_forecast(mailer, kwargs) {
  // kwargs = {all_expense_records, timeframe_start, timeframe_end}
  if (!kwargs.all_expense_records) { throw new Error('Missing all_expense_records'); }
  if (!kwargs.timeframe_start) { throw new Error('Missing timeframe_start'); }
  if (!kwargs.timeframe_end) { throw new Error('Missing timeframe_end'); }
  const series_by_category = {}
  for (let cat in EXPENSE_CATEGORIES) {
    if (!EXPENSE_CATEGORIES.hasOwnProperty(cat)) { continue; }
    series_by_category[cat] = [];
  }
  // convert records into a series of monthly sums for each category
  const split_months = split_timeframe_into_months(kwargs.timeframe_start, kwargs.timeframe_end);
  for (let i = 1; i < split_months.length; i++) {
    const month_records = kwargs.all_expense_records.filter(
      get_record_filter({'start_date': split_months[i-1], 'end_date': split_months[i]})
    );
    for (let cat in EXPENSE_CATEGORIES) {
      if (!EXPENSE_CATEGORIES.hasOwnProperty(cat)) { continue; }
      const cat_month_records = month_records.filter(
        get_record_filter({'categories': [cat]})
      );
      series_by_category[cat].push(sum_records(cat_month_records).to_literal());
    }
  }
  const forecast_by_category = {}
  for (let cat in series_by_category) {
    if (!series_by_category.hasOwnProperty(cat)) { continue; }
    // skip categories with no records in their history (0-filled array)
    if (is_zero_array(series_by_category[cat])) { continue; }
    Logger.log('Forecasting category: %s', cat);
    forecast_by_category[cat] = forecast(series_by_category[cat], FORECAST_HORIZON);
  }
  // build table
  const header = ['Category', '2 Months Ago', 'Prior Month', 'Current Forecast'];
  for (let i = 1; i < FORECAST_HORIZON; i++) {
    header.push(i + ' Months Ahead');
  }
  const rows = [];
  // category sums per month plus forecasts
  const totals = create_zero_filled_array(2 + FORECAST_HORIZON);
  for (let cat in forecast_by_category) {  // using forecast because zero-filled arrays are already filtered out
    if (!forecast_by_category.hasOwnProperty(cat)) { continue; }
    const single_row = [
      cat,
      new CurrencyUSD(series_by_category[cat][series_by_category[cat].length - 2]).to_string(),
      new CurrencyUSD(series_by_category[cat][series_by_category[cat].length - 1]).to_string()
    ];
    // We want to exclude non-expense categories from the totals, e.g. "Other" and "Asset"
    // but still display the forecasts inline
    if (REDUCED_EXPENSE_CATEGORIES.indexOf(EXPENSE_CATEGORIES[cat]) !== -1) {
      totals[0] += series_by_category[cat][series_by_category[cat].length - 2];
      totals[1] += series_by_category[cat][series_by_category[cat].length - 1];
      for (let i = 0; i < FORECAST_HORIZON; i++) {
        single_row.push(new CurrencyUSD(forecast_by_category[cat][i]).to_string());
        totals[2 + i] += forecast_by_category[cat][i];
      }
    }
    rows.push(single_row);
  }
  // create custom total row
  const total_row = ['<b>Total:</b>'];
  for (let i = 0; i < totals.length; i++) {
    total_row.push(new CurrencyUSD(totals[i]).to_string());
  }
  rows.push(total_row);
  const table_html = get_html_table(
    {
      'title': 'Categorical Expense Breakdown and Forecast',
      'header': header,
      'rows': rows,
    }
  );
  mailer.add_body_chunk(table_html, {});
}

function build_expense_category_breakdown(mailer, kwargs) {
  // kwargs = {all_expense_records, timeframe_start, timeframe_end}
  if (!kwargs.all_expense_records) { throw new Error('Missing all_expense_records'); }
  if (!kwargs.timeframe_start) { throw new Error('Missing timeframe_start'); }
  if (!kwargs.timeframe_end) { throw new Error('Missing timeframe_end'); }
  const split_months = split_timeframe_into_months(kwargs.timeframe_start, kwargs.timeframe_end);
  // use only window of the last two dates
  const start_date = split_months[split_months.length - 2];
  const end_date = split_months[split_months.length - 1];
  const month_records = kwargs.all_expense_records.filter(
    get_record_filter({'start_date': start_date, 'end_date': end_date})
  );
  if (!month_records.length) {
    Logger.log('No expenses for breakdown, exiting');
    return;
  }
  const header = ['Category', 'Amount'];
  const rows = [];
  for (let single_category in EXPENSE_CATEGORIES) {
    if (!EXPENSE_CATEGORIES.hasOwnProperty(single_category)) { continue; }
    const single_category_records = month_records.filter(
      get_record_filter({'categories': [single_category]})
    );
    const single_category_total = sum_records(single_category_records);
    if (single_category_total.value > 0) {
      rows.push([single_category, single_category_total.to_string()]);
    }
  }
  // For the breakdown we want to exclude non-expense items from the total (i.e. "Other" and "Asset")
  const month_expenses_only = month_records.filter(
    get_record_filter({'reduced_categories': REDUCED_EXPENSE_CATEGORIES})
  );
  const table_html = get_html_table(
    {
      'title': 'Categorical Expense Breakdown',
      'header': header,
      'rows': rows,
      'total': sum_records(month_expenses_only).to_string(),
    }
  );
  mailer.add_body_chunk(table_html, {});
}

function build_expense_breakdown(mailer, kwargs) {
  // kwargs = {all_expense_records, timeframe_start, timeframe_end}
  if (!kwargs.all_expense_records) { throw new Error('Missing all_expense_records'); }
  if (!kwargs.timeframe_start) { throw new Error('Missing timeframe_start'); }
  if (!kwargs.timeframe_end) { throw new Error('Missing timeframe_end'); }
  const split_months = split_timeframe_into_months(kwargs.timeframe_start, kwargs.timeframe_end);
  // use only window of the last two dates
  const start_date = split_months[split_months.length - 2];
  const end_date = split_months[split_months.length - 1];
  const month_records = kwargs.all_expense_records.filter(
    get_record_filter({'start_date': start_date, 'end_date': end_date})
  );
  if (!month_records.length) {
    Logger.log('No expenses for breakdown, exiting');
    return;
  }
  const display_rows = month_records.map(record => record.display_array());
  const table_html = get_html_table(
    {
      'title': 'Expense Breakdown', // FIXME use month's date?
      'header': month_records[0].display_header(),
      'rows': display_rows,
      'total': sum_records(month_records).to_string(),
    }
  );
  mailer.add_body_chunk(table_html, {});
}

function build_income_breakdown(mailer, kwargs) {
  // kwargs = {all_income_records, timeframe_start, timeframe_end}
  if (!kwargs.all_income_records) { throw new Error('Missing all_income_records'); }
  if (!kwargs.timeframe_start) { throw new Error('Missing timeframe_start'); }
  if (!kwargs.timeframe_end) { throw new Error('Missing timeframe_end'); }
  const split_months = split_timeframe_into_months(kwargs.timeframe_start, kwargs.timeframe_end);
  // use only window of the last two dates
  const start_date = split_months[split_months.length - 2];
  const end_date = split_months[split_months.length - 1];
  const month_records = kwargs.all_income_records.filter(
    get_record_filter({'start_date': start_date, 'end_date': end_date})
  );
  if (!month_records.length) {
    Logger.log('No incomes for breakdown, exiting');
    return;
  }
  const display_rows = month_records.map(record => record.display_array());
  const table_html = get_html_table(
    {
      'title': 'Income Breakdown', // FIXME use month's date?
      'header': month_records[0].display_header(),
      'rows': display_rows,
      'total': sum_records(month_records).to_string(),
    }
  );
  mailer.add_body_chunk(table_html, {});
}

function build_discretionary_expense_by_account(mailer, kwargs) {
  // kwargs = {all_expense_records, timeframe_start, timeframe_end}
  if (!kwargs.all_expense_records) { throw new Error('Missing all_expense_records'); }
  if (!kwargs.timeframe_start) { throw new Error('Missing timeframe_start'); }
  if (!kwargs.timeframe_end) { throw new Error('Missing timeframe_end'); }
  const accounts = [];
  const colours = [];
  for (let account_name in ACCOUNT_NAMES) {
    if (!ACCOUNT_NAMES.hasOwnProperty(account_name)) { continue; }
    accounts.push(account_name);
    colours.push(ACCOUNT_NAMES[account_name]);
  }
  const split_months = split_timeframe_into_months(kwargs.timeframe_start, kwargs.timeframe_end);
  const header = ['Date'].concat(accounts);
  const sheet_values = [header];
  for (let i = 1; i < split_months.length; i++) {
    const single_month_expense_records = kwargs.all_expense_records.filter(
      get_record_filter({'start_date': split_months[i-1], 'end_date': split_months[i], 'reduced_categories': ['Fun']})
    );
    const single_month_expense_row = [split_months[i-1]];
    for (let j = 0; j < accounts.length; j++) {
      single_month_expense_row.push(
        sum_records(
          single_month_expense_records.filter(
            get_record_filter({'accounts': [accounts[j]]})
          )
        ).value
      );
    }
    sheet_values.push(single_month_expense_row);
  }

  // Build Review Chart
  Logger.log('Creating discretionary expense by account review chart');
  const sheet = ensure_new_sheet('_discretionary_expense_by_account_review');
  const review_range = sheet.getRange(1, 1, sheet_values.length, header.length);
  review_range.setValues(sheet_values);
  const chart = sheet.newChart()
    .asAreaChart().addRange(review_range)
    .setOption('chartArea', {width:'95%', height:'95%'})
    .setOption('legend', {position:'in'})
    .setOption('titlePosition', 'in')
    .setOption('hAxis', {'title':'Date', 'gridlines':{'count': review_range.getHeight()-1}, 'textPosition':'in'})
    .setOption('vAxis', {'title':'Spending (USD)', 'textPosition':'in'})
    .setOption('height', 400).setOption('width', 900)
    .setOption('areaOpacity', 0.0)
    .setOption('lineWidth', 3)
    .setOption('colors', colours);
  chart.setOption('title', 'Discretionary Expense By Account');

  // Output html and chart image:
  mailer.add_body_chunk('<p text-align="center"><img src="cid:discretionary_expense_by_account_chart"></p>', {'discretionary_expense_by_account_chart':chart.build().getAs('image/png')});
  Logger.log('Cleaning up sheet');
  delete_sheet('_discretionary_expense_by_account_review');
  Logger.log('Done building discretionary expense by account review');
}
