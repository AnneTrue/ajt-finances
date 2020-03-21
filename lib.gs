function is_valid_expense_category(name) { return name in EXPENSE_CATEGORIES; }
function is_valid_income_category(name) { return name in INCOME_CATEGORIES; }

function get_sheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function ensure_new_sheet(name) {
  // creates a new sheet, deleting the sheet first if it is already extant
  const spread_sheet = SpreadsheetApp.getActiveSpreadsheet();
  if (spread_sheet.getSheetByName(name)) { delete_sheet(name); }
  spread_sheet.insertSheet(name, spread_sheet.getNumSheets()); // insert at end of list
  return get_sheet(name);
}

function delete_sheet(name) {
  const spread_sheet = SpreadsheetApp.getActiveSpreadsheet();
  spread_sheet.deleteSheet(spread_sheet.getSheetByName(name));
}

function get_expense_category_data_validation(allow_invalid) {
  return SpreadsheetApp.newDataValidation()
    .requireValueInList(Object.getOwnPropertyNames(EXPENSE_CATEGORIES), true)
    .setAllowInvalid(allow_invalid)
    .build();
}

function get_income_category_data_validation(allow_invalid) {
  return SpreadsheetApp.newDataValidation()
    .requireValueInList(Object.getOwnPropertyNames(INCOME_CATEGORIES), true)
    .setAllowInvalid(allow_invalid)
    .build();
}

function display_date(date) {
  return Utilities.formatDate(date, 'PST', 'yyyy/MM/dd');
}

function get_month_year(date) {
  // returns the start of month from a date
  const in_date = new Date(date);
  const ret = new Date();
  ret.setFullYear(in_date.getFullYear(), in_date.getMonth(), 1);
  ret.setHours(0); ret.setMinutes(0); ret.setSeconds(0);
  ret.setMilliseconds(0); // this was an annoying bug to track down
  return ret;
}

function get_relative_date(days) {
  // get date $days ago
  const date = new Date();
  const d = date.getDate() - days;
  date.setDate(d);
  return date;
}

function get_relative_month(months) {
  // get date $months ago
  const date = new Date();
  const d = date.getMonth() - months;
  date.setMonth(d);
  return date;
}

function add_months(start, months) {
  // get date $months + $start
  const date = new Date(start);
  const d = date.getMonth() + months;
  date.setMonth(d);
  return date;
}

function add_days(start, amount) {
  // get date $amount + $start
  const date = new Date(start);
  const d = date.getDate() + amount;
  date.setDate(d);
  return date;
}

function split_timeframe_into_months(start, end) {
  const months = [];
  let cur_month = start, i_exit = 0;
  while (true) {
    if (cur_month >= end) { break; }
    if (i_exit >= 128) { throw new Error('Anti-looplock break in split_timeframe_into_months'); } // this gives 10 years worth of leniency
    months.push(cur_month);
    cur_month = add_months(cur_month, 1);
    i_exit++;
  }
  months.push(end); // intentionally allow for the end date to be included
  return months;
}

function is_zero_array(data_array) {
  // returns true if the array is filled with zeros, else false
  for (let i = 0; i < data_array.length; i++) {
    if (data_array[i] !== 0) { return false; }
  }
  return true;
}

function create_zero_filled_array(dim) {
  const zero_arr = [];
  for (let i = 0; i < dim; i++) {
    zero_arr.push(0.0);
  }
  return zero_arr;
}

function sum_array(data_array) {
  // data_array = [number]
  return data_array.reduce((accumulator, val) => accumulator + val, 0);
}

function holt_damped_trend(series, tuning) {
  // series: [y_0, y_1...y_t]
  // tuning = {alpha, beta, phi}
  // alpha: data smoothing
  // beta: trend smoothing
  // phi: trend dampening factor
  const l_t = [], b_t = [], y_t = [];
  for (let i=0; i < series.length; i++) {
    let prev_l, prev_b;
    if (i !== 0) {
      prev_l = l_t[i - 1], prev_b = b_t[i - 1];
    } else {
      prev_l = 0, prev_b = 0;
    }
    const current_l = tuning.alpha * series[i] + (1 - tuning.alpha) * (prev_l + tuning.phi * prev_b);
    const current_b = tuning.beta * (current_l - prev_l) + (1 - tuning.beta) * tuning.phi * prev_b;
    l_t.push(current_l);
    b_t.push(current_b);
    y_t.push(current_l + current_b);
  }
  return {'y_t': y_t, 'final_b': b_t.pop(), 'final_l': l_t.pop(), 'phi': tuning.phi}
}

function holt_forecast_horizon(horizon, kwargs) {
  // horizon: integer number of periods to forecast into the future
  // kwargs = {phi, final_l, final_b}
  // phi: trend dampening factor
  // final_l: last fit data point
  // final_b: last fit trend point
  const geometric_dampening = kwargs.phi * (1 - Math.pow(kwargs.phi, horizon))/(1 - kwargs.phi);
  const result = kwargs.final_l + (geometric_dampening * kwargs.final_b);
  if (result < 0) { return 0; } // disallow negative forecasts
  return result;
}

function r_squared(observation, prediction) {
  // observation = [y_1, y_2, ... y_t]
  // prediction = [y^_1, y^_2, ... y^_t]
  // x (time) is implicitly integer valued index of array (not a scatter plot)
  const sum = sum_array(observation);
  if (observation.length === 0) { return 0; }
  const mean = sum / observation.length;
  const ssyy = observation.reduce(function(accumulator, obs) {
    const difference = obs - mean;
    return accumulator + (difference * difference);
  }, 0);
  const sse = observation.reduce(function(accumulator, obs, index) {
    const residual = obs - prediction[index];
    return accumulator + (residual * residual);
  }, 0);
  if (!ssyy) {
    return 0;
  }
  return 1 - (sse/ssyy);
}

function holt_optimisation(series, tuning) {
  // series: [y_0, y_1...y_t]
  // tuning = {alpha, beta, phi}
  // good fits minimise this value near 0.0
  const result_obj = holt_damped_trend(series, tuning);
  return Math.abs(1 - r_squared(series, result_obj.y_t));
}

function get_current_forecast_model() {
  // Since functions have to be set at runtime, we use this helper to get the current model
  return FORECAST_MODELS[FORECAST_CURRENT_MODEL];
}

function forecast(series, max_horizon) {
  // series = [number]
  // max_horizon = int (how many periods to project out)
  // returns [number] with length == max_horizon
  const kwargs = {
    'func': get_current_forecast_model().tune,
    'initial_position': FORECAST_NM_INITIAL_POSITION,
    'step': FORECAST_NM_STEP,
    'improve_threshold': FORECAST_NM_IMPROVE_THRESHOLD,
    'improve_break_iters': FORECAST_NM_IMPROVE_BREAK_ITERS,
    'max_iters': FORECAST_NM_MAX_ITERS,
    'alpha': FORECAST_NM_ALPHA,
    'gamma': FORECAST_NM_GAMMA,
    'rho': FORECAST_NM_RHO,
    'sigma': FORECAST_NM_SIGMA,
  }
  const best_results = nelder_mead(series, kwargs);
  const tuning = best_results[0];
  Logger.log('Best forecast fit has score %s with tuning %s', best_results[1], tuning);
  const forecast_kwargs = get_current_forecast_model().func(series, tuning);
  const predicted_series = [];
  for (let i = 0; i < max_horizon; i++) {
    predicted_series.push(get_current_forecast_model().forecast(i, forecast_kwargs));
  }
  return predicted_series;
}

function nelder_mead(series, kwargs) {
  // series: [y_0, y_1...y_t]
  // kwargs = {func, initial_position, step, improve_threshold, improve_break_iters, max_iters, alpha, gamma, rho, sigma}
  // From github.com/fchollet/nelder-mead/
  // Init
  const dim = kwargs.initial_position.length;
  let prev_best = kwargs.func(series, kwargs.initial_position);
  let results = [[kwargs.initial_position, prev_best]];
  
  for (let tuning in kwargs.initial_position) {
    if (!kwargs.initial_position.hasOwnProperty(tuning)) { continue; }
    const x = JSON.parse(JSON.stringify(kwargs.initial_position)); // deep copy
    x[tuning] += kwargs.step;
    var score = kwargs.func(series, x);
    results.push([x, score]);
  }
  
  // Simplex Iteration
  let total_iters = 0;
  let count_no_improvements = 0;
  while (true) {
    // Order results
    results.sort((a, b) => a[1] - b[1]);
    const best = results[0][1];
    
    // Iteration break
    total_iters++;
    if (total_iters > kwargs.max_iters) { break; }
    if (best < prev_best - kwargs.improve_threshold) {
      count_no_improvements = 0;
      prev_best = best;
    } else {
      count_no_improvements++;
    }
    if (count_no_improvements >= kwargs.improv_break_iters) {
      return results[0];
    }
    
    // Centroid
    const x0 = JSON.parse(JSON.stringify(kwargs.initial_position)); // deep copy
    for (let tuning in x0) {
      if (!x0.hasOwnProperty(tuning)) { continue; }
      x0[tuning] = 0.0;
    }
    for (let i = 0; i < results.length - 1; i++) {
      for (let tuning in x0) {
        if (!x0.hasOwnProperty(tuning)) { continue; }
        x0[tuning] += results[i][0][tuning] / (results.length - 1);
      }
    }
    // Reflection
    const xr = JSON.parse(JSON.stringify(x0)); // deep copy
    for (let tuning in xr) {
      if (!xr.hasOwnProperty(tuning)) { continue; }
      xr[tuning] += kwargs.alpha * (xr[tuning] - results[results.length - 1][0][tuning]);
    }
    const rscore = kwargs.func(series, xr);
    if (results[0][1] <= rscore && rscore < results[results.length - 2][1]) {
      results.pop(); // remove worst score
      results.push([xr, rscore]);
      continue;
    }
    // Expansion
    if (rscore < results[0][1]) {
      const xe = JSON.parse(JSON.stringify(x0)); // deep copy
      for (let tuning in xe) {
        if (!xe.hasOwnProperty(tuning)) { continue; }
        xe[tuning] += kwargs.gamma * (x0[tuning] - results[results.length - 1][0][tuning]);
      }
      const escore = kwargs.func(series, xe);
      if (escore < rscore) {
        results.pop(); // remove worst score
        results.push([xe, escore]);
        continue;
      } else {
        results.pop(); // remove worst score
        results.push([xr, rscore]);
        continue;
      }
    }
    // Contraction
    const xc = JSON.parse(JSON.stringify(x0)); // deep copy
    for (let tuning in xc) {
      if (!xc.hasOwnProperty(tuning)) { continue; }
      xc[tuning] += kwargs.rho * (x0[tuning] - results[results.length - 1][0][tuning]);
    }
    const cscore = kwargs.func(series, xc);
    if (cscore < results[results.length - 1][1]) {
      results.pop(); // remove worst score
      results.push([xc, cscore]);
      continue;
    }
    // Reduction
    const x1 = results[0][0];
    const next_results = [];
    for (let i = 0; i < results.length; i++) {
      const redx = JSON.parse(JSON.stringify(x1)); // deep copy
      for (let tuning in redx) {
        if (!redx.hasOwnProperty(tuning)) { continue; }
        redx[tuning] += kwargs.sigma * (results[i][0][tuning] - x1[tuning]);
      }
      const score = kwargs.func(series, redx);
      next_results.push([redx, score]);
    }
    results = next_results;
  }
  return results.shift(); // [tunings, best_score]
}
