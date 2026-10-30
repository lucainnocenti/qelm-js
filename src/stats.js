function requireFinite(values, message) {
  if (!values?.length) throw new RangeError(message);
  for (let i = 0; i < values.length; i++) if (!Number.isFinite(values[i])) throw new RangeError(message);
}

function mean(values) {
  let s = 0;
  for (let i = 0; i < values.length; i++) s += values[i];
  return s / values.length;
}

/** Quantile of already sorted values, interpolating linearly at (n − 1)q. */
function sortedQuantile(x, q) {
  const k = (x.length - 1) * q, i = Math.floor(k), f = k - i;
  return x[i] * (1 - f) + x[Math.min(i + 1, x.length - 1)] * f;
}

/** Linear interpolation between ordered observations. */
export function quantile(values, q) {
  requireFinite(values, 'finite nonempty values and q in [0,1] required');
  if (!(q >= 0 && q <= 1)) throw new RangeError('finite nonempty values and q in [0,1] required');
  return sortedQuantile(Float64Array.from(values).sort(), q);
}

/** Mean, sample variance, and quantiles. Variance is zero for one observation. Sorts once. */
export function summarize(values) {
  requireFinite(values, 'finite nonempty values required');
  const average = mean(values), sorted = Float64Array.from(values).sort();
  let squares = 0;
  for (let i = 0; i < values.length; i++) squares += (values[i] - average) ** 2;
  return {
    count: values.length,
    mean: average,
    variance: squares / Math.max(1, values.length - 1),
    median: sortedQuantile(sorted, 0.5),
    q05: sortedQuantile(sorted, 0.05),
    q95: sortedQuantile(sorted, 0.95),
  };
}

/** Population bias–variance decomposition of empirical squared error. */
export function predictionMetrics(predictions, truth) {
  requireFinite(predictions, 'finite predictions and truth required');
  if (!Number.isFinite(truth)) throw new RangeError('finite predictions and truth required');
  const average = mean(predictions), bias = average - truth;
  let variance = 0, mse = 0;
  for (let i = 0; i < predictions.length; i++) {
    variance += (predictions[i] - average) ** 2;
    mse += (predictions[i] - truth) ** 2;
  }
  return { mean: average, bias, biasSquared: bias * bias, variance: variance / predictions.length, mse: mse / predictions.length };
}
