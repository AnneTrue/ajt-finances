// Report Mailer Settings
const MAIL_TO = ''; // Primary User here, only one please
const MAIL_CC = ''; // Comma separated list of recipients
const MAIL_BCC = ''; // Comma separated list
const MAIL_REPLY_TO = MAIL_TO;
const MAIL_BASE_SUBJECT = 'Finance Report - ';
const FAIL_ON_COMPONENT_ERROR = false;
const SEND_LOG_TRANSCRIPT = true; // include the script logs at the end of the report email

// Monthly Report Settings
const MONTHLY_REPORT_WINDOW_IN_MONTHS = 13;

// Account-based Report Settings
const ADDRESS_TO_ACCOUNT_MAPPING = {
  'EXAMPLE ADDRESS': null,
  // 'test-address@gmail.com': ['Joint', 'Demo'],
}

const ACCOUNT_NAMES = {
  //'name1': 'red',
  //'Joint': 'orange',
  // account name: graph colour
}

// Valid Categories
const EXPENSE_CATEGORIES = {
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
  'House Repairs': 'Mandatory',
  'Insurance': 'Mandatory',
  'Investment': 'Asset',
  'Leisure & Hobbies': 'Fun',
  'Mortgage': 'Mandatory',
  'Recreation & Fitness': 'Fun',
  'Refueling': 'Mandatory',
  'Rent': 'Mandatory',
  'Transit & Parking': 'Mandatory',
  'Utility Bills': 'Mandatory',
  'Vacation & Events': 'Fun',
  'Other': 'Misc',
};

const INCOME_CATEGORIES = {
  'Capital Gains': null,
  'Gift': null,
  'Interest & Dividends': null,
  'Wages': null,
  'Other': null,
};

const REDUCED_CATEGORIES = {
  'Asset': 'green',
  'Debt': 'red',
  'Fun': 'orange',
  'Mandatory': 'grey',
  'Misc': 'blue',
  // reduced category: graph colour
};
const ALL_REDUCED_BUT_MISC = [
  'Asset',
  'Debt',
  'Fun',
  'Mandatory',
];
const REDUCED_EXPENSE_CATEGORIES = [  // excludes assets as they are a type of savings, not an expense
  'Debt',
  'Fun',
  'Mandatory',
];

// Sheet names
const INPUT_SHEET_NAME = 'Accounting Input';
const EXPENSE_SHEET_NAME = 'Expense Records';
const INCOME_SHEET_NAME = 'Income Records';

// A1 notation for input fields
const INPUT_SHEET_EXPENSE_RANGE = 'B5:E13';
const INPUT_SHEET_INCOME_RANGE = 'H5:K13';
const INPUT_SHEET_ACCOUNT_CELL = 'G2';

// KPI Settings
const KPI_FUNCTIONS = {
  'savings_rate': {colour: 'green', display_name: 'Savings%', enabled: true},
  'discretionary_rate': {colour: 'red', display_name: 'Discretionary%', enabled: true},
};

function init_kpi_functions() {
  // Functions cannot be referenced before their source files have been parsed
  KPI_FUNCTIONS.savings_rate.func = build_kpi_savings_rate;
  KPI_FUNCTIONS.discretionary_rate.func = build_kpi_discretionary_rate;
}

// Forecasting Settings
const FORECAST_MODELS = {};
function init_forecast_functions() {
  // Functions cannot be referenced before their source files have been parsed
  FORECAST_MODELS['holt damped trend'] = {'func': holt_damped_trend, 'tune': holt_optimisation, 'forecast': holt_forecast_horizon};
}
const FORECAST_CURRENT_MODEL = 'holt damped trend';
const FORECAST_HORIZON = 2; // Two months
// Nelder-Mead parameters for autofitting
// https://en.wikipedia.org/wiki/Nelder–Mead_method
const FORECAST_NM_INITIAL_POSITION = {'alpha': 0.5, 'beta': 0.5, 'phi': 0.55};
const FORECAST_NM_STEP = 0.35;
const FORECAST_NM_IMPROVE_THRESHOLD = 0.000001;
const FORECAST_NM_IMPROVE_BREAK_ITERS = 10;
const FORECAST_NM_MAX_ITERS = 333;
const FORECAST_NM_ALPHA = .5; // > 0
const FORECAST_NM_GAMMA = 1.15; // > 1
const FORECAST_NM_RHO = 0.5 // 0 < rho <= .5
const FORECAST_NM_SIGMA = 0.5 // standard is 0.5
