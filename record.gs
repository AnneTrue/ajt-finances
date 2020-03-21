// Functions related to record objects (the models used in the scripts)

const CurrencyUSD = function(num_val) {
  if (num_val.value) {
    this.value = Number(num_val.value);
  } else {
    this.value = Number(num_val);
  }
  this.to_literal = () => this.value.valueOf()
  this.to_string = () => '$' + this.value.toFixed(2)
  this.add = other => new CurrencyUSD(this.value + other.value)
  this.subtract = other => new CurrencyUSD(this.value - other.value)
  this.multiply = multiplicand => new CurrencyUSD(this.value * multiplicand)
  this.divide = divisor => new CurrencyUSD(this.value / divisor)
}

const ExpenseRecord = function(account, date, amount, category, note) {
  this.account = account;
  this.date = new Date(date);
  this.amount = new CurrencyUSD(amount);
  this.category = category;
  this.note = note;
  this.reduced_category = EXPENSE_CATEGORIES[this.category];

  this.to_array = () => [this.date, this.amount.value, this.category, this.note, this.account]
  this.display_date = () => display_date(this.date)
  this.display_header = () => ['Date', 'Account', 'Category', 'Amount', 'Note']
  this.display_array = () => [this.display_date(), this.account, this.category, this.amount.to_string(), this.note]
}

function get_expense_record_from_array(row) {
  const [date, amount, category, note, account] = row
  return get_expense_record(account, date, amount, category, note);
}

function get_expense_record(account, date, amount, category, note) {
  const currency_amount = new CurrencyUSD(amount);
  if (!date || !is_valid_expense_category(category) || currency_amount.value <= 0) {
    return null;
  }
  return new ExpenseRecord(account, date, currency_amount, category, note);
}

const IncomeRecord = function(account, date, amount, category, note) { 
  this.account = account;
  this.date = new Date(date);
  this.amount = new CurrencyUSD(amount);
  this.category = category;
  this.note = note;

  this.to_array = () => [this.date, this.amount.value, this.category, this.note, this.account]
  this.display_date = () => display_date(this.date)
  this.display_header = () => ['Date', 'Account', 'Category', 'Amount', 'Note']
  this.display_array = () => [this.display_date(), this.account, this.category, this.amount.to_string(), this.note]
}

function get_income_record_from_array(row) {
  const [date, amount, category, note, account] = row;
  return get_income_record(account, date, amount, category, note);
}

function get_income_record(account, date, amount, category, note) {
  const currency_amount = new CurrencyUSD(amount);
  if (!date || !is_valid_income_category(category) || currency_amount.value <= 0) {
    return null;
  }
  return new IncomeRecord(account, date, currency_amount, category, note);
}

function get_record_filter(kwargs) {
  // kwargs = {start_date, end_date, accounts, categories, reduced_categories, start_amount, end_amount}
  // dates are both Date objects
  // amounts are both Numbers
  // accounts/categories/reduced_categories is null or array of strings
  // filtering reduced_categories is undefined for IncomeRecords
  return function(record) {
    // filter by account
    if (kwargs.accounts && kwargs.accounts.indexOf(record.account) === -1) { return false; }
    // filter by date
    if (kwargs.start_date && kwargs.end_date) {
      if (!(record.date.valueOf() >= kwargs.start_date.valueOf() && record.date.valueOf() < kwargs.end_date.valueOf())) {
        return false;
      }
    } else if (kwargs.start_date) {
      if (record.date.valueOf() < kwargs.start_date.valueOf()) { return false; }
    } else if (kwargs.end_date) {
      if (record.date.valueOf() >= kwargs.end_date.valueOf()) { return false; }
    }
    // filter by categories
    if (kwargs.categories && kwargs.categories.indexOf(record.category) === -1) { return false; } 
    if (kwargs.reduced_categories && kwargs.reduced_categories.indexOf(record.reduced_category) === -1) { return false; }
    // filter by amounts
    if (kwargs.start_amount && kwargs.end_amount) {
      if (!(record.amount.value >= kwargs.start_amount && record.amount.value < kwargs.end_amount)) { return false; }
    } else if (kwargs.start_amount) {
      if (record.amount.value < kwargs.start_amount) { return false; }
    } else if (kwargs.end_amount) {
      if (record.amount.value >= kwargs.end_amount) { return false; }
    }
    return true; // not filtered out prior to this
  }
}

function sum_records(records) {
  // array of records [expense or income] to add up the amounts
  // returns a new CurrencyUSD
  const len = records.length;
  let total = new CurrencyUSD(0.0);
  for (let i = 0; i < len; i++) {
    total = total.add(records[i].amount);
  }
  return total;
}
