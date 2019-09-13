// Report Mailer Settings
var MAIL_TO = ''; // Primary User here, only one please
var MAIL_CC = ''; // Comma separated list of recipients
var MAIL_BCC = ''; // Comma separated list
var MAIL_REPLY_TO = MAIL_TO;
var MAIL_BASE_SUBJECT = 'Finance Report - ';
var FAIL_ON_COMPONENT_ERROR = false;
var SEND_LOG_TRANSCRIPT = true; // include the script logs at the end of the report email

// Monthly Report Settings
var MONTHLY_REPORT_WINDOW_IN_MONTHS = 13;

// Account-based Report Settings
var ADDRESS_TO_ACCOUNT_MAPPING = {
  'EXAMPLE ADDRESS': null,
  // 'test-address@gmail.com': ['Joint', 'Demo'],
}

var ACCOUNT_NAMES = {
  //'name1': 'red',
  //'Joint': 'orange',
  // account name: graph colour
}

// Valid Categories
var EXPENSE_CATEGORIES = {
  'Business & Work': 'Mandatory',
  'Car Fees': 'Mandatory', // maintenance, registrations, etc.
  'Clothing': 'Mandatory',
  'Debt': 'Debt',
  'Dependents': 'Mandatory', // pets or family
  'Dining Out': 'Fun', // includes drinks
  'Education': 'Mandatory',
  'Finance': 'Debt', // generic financial fees
  'Gift': 'Misc',
  'Groceries': 'Mandatory',
  'Grooming': 'Mandatory',
  'Health': 'Mandatory',
  'Household Supplies': 'Mandatory',
  'Insurance': 'Mandatory',
  'Investment': 'Asset',
  'Leisure & Hobbies': 'Fun',
  'Recreation & Fitness': 'Fun',
  'Refueling': 'Mandatory',
  'Rent': 'Mandatory',
  'Transit & Parking': 'Mandatory',
  'Utility Bills': 'Mandatory',
  'Vacation & Events': 'Fun',
  'Other': 'Misc',
};

var INCOME_CATEGORIES = {
  'Capital Gains': null,
  'Gift': null,
  'Interest': null,
  'Wages': null,
  'Other': null,
};

var REDUCED_CATEGORIES = {
  'Asset': 'green',
  'Debt': 'red',
  'Fun': 'orange',
  'Mandatory': 'grey',
  'Misc': 'blue',
  // reduced category: graph colour
};

// Sheet names
var INPUT_SHEET_NAME = 'Accounting Input';
var EXPENSE_SHEET_NAME = 'Expense Records';
var INCOME_SHEET_NAME = 'Income Records';

// A1 notation for input fields
var INPUT_SHEET_EXPENSE_RANGE = 'B5:E13';
var INPUT_SHEET_INCOME_RANGE = 'H5:K13';
var INPUT_SHEET_ACCOUNT_CELL = 'G2';

// KPI Settings
var KPI_FUNCTIONS = {
  'savings_rate': {func: build_kpi_savings_rate, colour: 'green', display_name: 'Savings%', enabled: true},
  'discretionary_rate': {func: build_kpi_discretionary_rate, colour: 'red', display_name: 'Discretionary%', enabled: true},
};

// Forecasting Settings
var FORECAST_MODELS = {
  'holt damped trend': {'func': holt_damped_trend, 'tune': holt_optimisation, 'forecast': holt_forecast_horizon},
  // TODO try holt-winter's method (with seasonal component)
};
var FORECAST_CURRENT_MODEL = FORECAST_MODELS['holt damped trend'];
var FORECAST_HORIZON = 2; // Two months
// Nelder-Mead parameters for autofitting
// https://en.wikipedia.org/wiki/Nelder–Mead_method
var FORECAST_NM_INITIAL_POSITION = {'alpha': 0.96, 'beta': 0.05, 'phi': 0.85};
var FORECAST_NM_STEP = 0.2;
var FORECAST_NM_IMPROVE_THRESHOLD = 0.000001;
var FORECAST_NM_IMPROVE_BREAK_ITERS = 10;
var FORECAST_NM_MAX_ITERS = 108;
var FORECAST_NM_ALPHA = .5; // > 0
var FORECAST_NM_GAMMA = 1.15; // > 1
var FORECAST_NM_RHO = 0.5 // 0 < rho <= .5
var FORECAST_NM_SIGMA = 0.5 // standard is 0.5
