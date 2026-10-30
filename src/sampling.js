/** Validate probabilities, allowing only roundoff in their sum. */
export function validateProbabilities(p) {
  if (!p || !p.length) throw new RangeError('probabilities must be finite and in [0, 1]');
  let total = 0;
  for (let i = 0; i < p.length; i++) {
    const x = p[i];
    if (!(Number.isFinite(x) && x >= 0 && x <= 1)) throw new RangeError('probabilities must be finite and in [0, 1]');
    total += x;
  }
  if (Math.abs(total - 1) > 1e-8) throw new RangeError('probabilities must sum to one');
}

/** Infinity, or null (convenient for JSON-transported settings), means exact probabilities. */
function isInfiniteShots(shots) {
  return shots === Infinity || shots === null;
}

function validateShots(shots) {
  if (!isInfiniteShots(shots) && (!Number.isSafeInteger(shots) || shots < 1)) {
    throw new RangeError('shots must be a positive integer, Infinity, or null');
  }
}

/** Lanczos approximation of log Γ(z), accurate to ~1e-15 relative for the arguments used here. */
export function logGamma(z) {
  const q = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = q[0];
  for (let i = 1; i < 9; i++) x += q[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Exact Binomial(n, p) draw. Sparse cases use geometric inter-arrival times; otherwise an
 * inverse-CDF search outward from the mode: one uniform draw and about O(√(n p (1−p))) steps.
 */
export function binomial(n, p, rng) {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  if (p > 0.5) return n - binomial(n, 1 - p, rng);
  if (n * p < 24) {
    let successes = 0, position = 0;
    const logq = Math.log1p(-p);
    while (position < n) {
      position += 1 + Math.floor(Math.log(rng.uniform()) / logq);
      if (position <= n) successes++;
    }
    return successes;
  }
  const k = Math.floor((n + 1) * p), q = 1 - p;
  const modal = Math.exp(logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1) + k * Math.log(p) + (n - k) * Math.log1p(-p));
  let u = rng.uniform();
  if (u < modal) return k;
  u -= modal;
  let left = modal, right = modal;
  for (let s = 1; s <= n; s++) {
    if (k - s >= 0) {
      const from = k - s + 1;
      left *= (from / (n - from + 1)) * (q / p);
      if (u < left) return k - s;
      u -= left;
    }
    if (k + s <= n) {
      const from = k + s - 1;
      right *= ((n - from) / (from + 1)) * (p / q);
      if (u < right) return k + s;
      u -= right;
    }
    if (k - s < 0 && k + s > n) break;
  }
  // Only reachable through floating-point roundoff in the modal mass.
  return k;
}

/**
 * Empirical frequencies from `shots` measurements with outcome probabilities p.
 * - model 'multinomial' (default): exact, via a chain of conditional binomials; fast for large shots.
 * - model 'gaussian': p + noise with the multinomial covariance (diag p − ppᵀ)/shots; entries may be
 *   negative but always sum to one.
 * - model 'categorical': exact, one categorical draw per shot; O(shots × outcomes).
 * shots = Infinity or null returns a copy of p. Pass {validate: false} in hot loops when p is trusted.
 * Returns a Float64Array.
 */
export function sampleFrequencies(p, shots, rng, { model = 'multinomial', validate = true } = {}) {
  if (validate) {
    validateProbabilities(p);
    validateShots(shots);
  }
  const m = p.length;
  if (isInfiniteShots(shots)) return Float64Array.from(p);
  const out = new Float64Array(m);
  if (model === 'multinomial') {
    let remaining = shots, mass = 1;
    for (let a = 0; a < m - 1 && remaining > 0; a++) {
      const conditional = mass > 0 ? Math.max(0, Math.min(1, p[a] / mass)) : 0;
      const k = binomial(remaining, conditional, rng);
      out[a] = k / shots;
      remaining -= k;
      mass -= p[a];
    }
    out[m - 1] += remaining / shots;
    return out;
  }
  if (model === 'gaussian') {
    let total = 0;
    for (let a = 0; a < m; a++) {
      out[a] = Math.sqrt(Math.max(0, p[a])) * rng.normal();
      total += out[a];
    }
    const scale = 1 / Math.sqrt(shots);
    for (let a = 0; a < m; a++) out[a] = p[a] + scale * (out[a] - p[a] * total);
    return out;
  }
  if (model === 'categorical') {
    for (let k = 0; k < shots; k++) {
      const u = rng.uniform();
      let sum = 0, i = 0;
      for (; i < m - 1; i++) {
        sum += p[i];
        if (u < sum) break;
      }
      out[i]++;
    }
    for (let a = 0; a < m; a++) out[a] /= shots;
    return out;
  }
  throw new RangeError(`unknown sampling model: ${model}`);
}

/** Covariance (diag p − ppᵀ)/shots of empirical multinomial frequencies; zero at infinite shots. */
export function frequencyCovariance(p, shots) {
  validateProbabilities(p);
  validateShots(shots);
  const scale = isInfiniteShots(shots) ? 0 : 1 / shots;
  return Array.from(p, (x, i) => Array.from(p, (y, j) => ((i === j ? x : 0) - x * y) * scale));
}
