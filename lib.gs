function is_valid_expense_category(name) { return name in EXPENSE_CATEGORIES; }
function is_valid_income_category(name) { return name in INCOME_CATEGORIES; }

function get_sheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function ensure_new_sheet(name) {
  // creates a new sheet, deleting the sheet first if it is already extant
  var spread_sheet = SpreadsheetApp.getActiveSpreadsheet();
  if (spread_sheet.getSheetByName(name)) { delete_sheet(name); }
  spread_sheet.insertSheet(name, spread_sheet.getNumSheets()); // insert at end of list
  return get_sheet(name);
}

function delete_sheet(name) {
  var spread_sheet = SpreadsheetApp.getActiveSpreadsheet();
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
  var in_date = new Date(date);
  var ret = new Date();
  ret.setFullYear(in_date.getFullYear(), in_date.getMonth(), 1);
  ret.setHours(0); ret.setMinutes(0); ret.setSeconds(0);
  ret.setMilliseconds(0); // this was an annoying bug to track down
  return ret;
}

function get_relative_date(days) {
  // get date $days ago
  var date = new Date();
  var d = date.getDate() - days;
  date.setDate(d);
  return date;
}

function get_relative_month(months) {
  // get date $months ago
  var date = new Date();
  var d = date.getMonth() - months;
  date.setMonth(d);
  return date;
}

function add_months(start, months) {
  // get date $months + $start
  var date = new Date(start);
  var d = date.getMonth() + months;
  date.setMonth(d);
  return date;
}

function add_days(start, amount) {
  // get date $amount + $start
  var date = new Date(start);
  var d = date.getDate() + amount;
  date.setDate(d);
  return date;
}

function split_timeframe_into_months(start, end) {
  var months = [], temp = start, i_exit = 0;
  while (true) {
    if (temp >= end) { break; }
    if (i_exit >= 128) { throw new Error('Anti-looplock break in split_timeframe_into_months'); } // this gives 10 years worth of leniency
    months.push(temp);
    temp = add_months(temp, 1);
    i_exit++;
  }
  months.push(end); // intentionally allow for the end date to be included
  return months;
}

function is_zero_array(data_array) {
  // returns true if the array is filled with zeros, else false
  for (var i = 0; i < data_array.length; i++) {
    if (data_array[i] !== 0) { return false; }
  }
  return true;
}

function create_zero_filled_array(dim) {
  var zero_arr = [];
  for (var i = 0; i < dim; i++) {
    zero_arr.push(0.0);
  }
  return zero_arr;
}

function sum_array(data_array) {
  // data_array = [number]
  return data_array.reduce(function(accumulator, val) { return accumulator + val; }, 0);
}

function holt_damped_trend(series, tuning) {
  // series: [y_0, y_1...y_t]
  // tuning = {alpha, beta, phi}
  // alpha: data smoothing
  // beta: trend smoothing
  // phi: trend dampening factor
  var l_t = [], b_t = [], y_t = [];
  for (var i=0; i < series.length; i++) {
    if (i !== 0) {
      var prev_l = l_t[i - 1], prev_b = b_t[i - 1];
    } else {
      var prev_l = 0, prev_b = 0;
    }
    var current_l = tuning.alpha * series[i] + (1 - tuning.alpha) * (prev_l + tuning.phi * prev_b);
    var current_b = tuning.beta * (current_l - prev_l) + (1 - tuning.beta) * tuning.phi * prev_b;
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
  var geometric_dampening = kwargs.phi * (1 - Math.pow(kwargs.phi, horizon))/(1 - kwargs.phi);
  var result = kwargs.final_l + (geometric_dampening * kwargs.final_b);
  if (result < 0) { result = 0; } // disallow negative forecasts
  return result;
}

function r_squared(observation, prediction) {
  // observation = [y_1, y_2, ... y_t]
  // prediction = [y^_1, y^_2, ... y^_t]
  // x (time) is implicitly integer valued index of array (not a scatter plot)
  var sum = sum_array(observation);
  if (observation.length === 0) { return 0; }
  var mean = sum / observation.length;
  var ssyy = observation.reduce(function(accumulator, obs) {
    var difference = obs - mean;
    return accumulator + (difference * difference);
  }, 0);
  var sse = observation.reduce(function(accumulator, obs, index) {
    var pred = prediction[index];
    var residual = obs - pred;
    return accumulator + (residual * residual);
  }, 0);
  if (ssyy === 0) {
    return 0;
  }
  return 1 - (sse/ssyy);
}

function holt_optimisation(series, tuning) {
  // series: [y_0, y_1...y_t]
  // tuning = {alpha, beta, phi}
  // good fits minimise this value near 0.0
  result_obj = holt_damped_trend(series, tuning);
  return Math.abs(1 - r_squared(series, result_obj.y_t));
}

function forecast(series, max_horizon) {
  // series = [number]
  // max_horizon = int (how many periods to project out)
  // returns [number] with length == max_horizon
  var kwargs = {
    'func': FORECAST_CURRENT_MODEL.tune,
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
  var best_results = nelder_mead(series, kwargs);
  var tuning = best_results[0];
  Logger.log('Best forecast fit has score %s with tuning %s', best_results[1], tuning);
  var forecast_kwargs = FORECAST_CURRENT_MODEL.func(series, tuning);
  var predicted_series = [];
  for (var i = 0; i < max_horizon; i++) {
    predicted_series.push(FORECAST_CURRENT_MODEL.forecast(i, forecast_kwargs));
  }
  return predicted_series;
}

function nelder_mead(series, kwargs) {
  // series: [y_0, y_1...y_t]
  // kwargs = {func, initial_position, step, improve_threshold, improve_break_iters, max_iters, alpha, gamma, rho, sigma}
  // From github.com/fchollet/nelder-mead/
  // Init
  var dim = kwargs.initial_position.length;
  var prev_best = kwargs.func(series, kwargs.initial_position);
  var results = [[kwargs.initial_position, prev_best]];
  
  for (tuning in kwargs.initial_position) {
    if (!kwargs.initial_position.hasOwnProperty(tuning)) { continue; }
    var x = JSON.parse(JSON.stringify(kwargs.initial_position)); // deep copy
    x[tuning] += kwargs.step;
    var score = kwargs.func(series, x);
    results.push([x, score]);
  }
  
  // Simplex Iteration
  var total_iters = 0;
  var count_no_improvements = 0;
  while (true) {
    // Order results
    results.sort(function(a, b) { return a[1] - b[1]; });
    var best = results[0][1];
    
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
    var x0 = JSON.parse(JSON.stringify(kwargs.initial_position)); // deep copy
    for (tuning in x0) {
      if (!x0.hasOwnProperty(tuning)) { continue; }
      x0[tuning] = 0.0;
    }
    for (var i = 0; i < results.length - 1; i++) {
      for (tuning in x0) {
        if (!x0.hasOwnProperty(tuning)) { continue; }
        x0[tuning] += results[i][0][tuning] / (results.length - 1);
      }
    }
    // Reflection
    var xr = JSON.parse(JSON.stringify(x0)); // deep copy
    for (tuning in xr) {
      if (!xr.hasOwnProperty(tuning)) { continue; }
      xr[tuning] += kwargs.alpha * (xr[tuning] - results[results.length - 1][0][tuning]);
    }
    var rscore = kwargs.func(series, xr);
    if (results[0][1] <= rscore && rscore < results[results.length - 2][1]) {
      results.pop(); // remove worst score
      results.push([xr, rscore]);
      continue;
    }
    // Expansion
    if (rscore < results[0][1]) {
      var xe = JSON.parse(JSON.stringify(x0)); // deep copy
      for (tuning in xe) {
        if (!xe.hasOwnProperty(tuning)) { continue; }
        xe[tuning] += kwargs.gamma * (x0[tuning] - results[results.length - 1][0][tuning]);
      }
      var escore = kwargs.func(series, xe);
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
    var xc = JSON.parse(JSON.stringify(x0)); // deep copy
    for (tuning in xc) {
      if (!xc.hasOwnProperty(tuning)) { continue; }
      xc[tuning] += kwargs.rho * (x0[tuning] - results[results.length - 1][0][tuning]);
    }
    var cscore = kwargs.func(series, xc);
    if (cscore < results[results.length - 1][1]) {
      results.pop(); // remove worst score
      results.push([xc, cscore]);
      continue;
    }
    // Reduction
    var x1 = results[0][0];
    var next_results = [];
    for (var i = 0; i < results.length; i++) {
      var redx = JSON.parse(JSON.stringify(x1)); // deep copy
      for (tuning in redx) {
        if (!redx.hasOwnProperty(tuning)) { continue; }
        redx[tuning] += kwargs.sigma * (results[i][0][tuning] - x1[tuning]);
      }
      var score = kwargs.func(series, redx);
      next_results.push([redx, score]);
    }
    results = next_results;
  }
  return results.shift(); // [tunings, best_score]
}
