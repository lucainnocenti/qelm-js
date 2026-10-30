function integer(n, name, min = 1) {
  if (!Number.isInteger(n) || n < min) throw new RangeError(`${name} must be an integer >= ${min}`);
}

function allFinite(values) {
  for (let i = 0; i < values.length; i++) if (!Number.isFinite(values[i])) return false;
  return true;
}

function complexVector(v, size, name) {
  if (!v || v.re?.length !== size || v.im?.length !== size || !allFinite(v.re) || !allFinite(v.im)) {
    throw new TypeError(`${name} must contain finite re and im arrays of length ${size}`);
  }
}

function squaredNorm(v) {
  let n = 0;
  for (let j = 0; j < v.re.length; j++) n += v.re[j] * v.re[j] + v.im[j] * v.im[j];
  return n;
}

/** Haar-random pure state, represented as {re, im} Float64Arrays. Draws (re, im) per entry. */
export function randomPureState(d, rng) {
  integer(d, 'dimension');
  const re = new Float64Array(d), im = new Float64Array(d);
  for (let j = 0; j < d; j++) {
    re[j] = rng.normal();
    im[j] = rng.normal();
  }
  const n = Math.sqrt(squaredNorm({ re, im }));
  if (!(n > 0)) throw new Error('random stream produced a zero state');
  for (let j = 0; j < d; j++) {
    re[j] /= n;
    im[j] /= n;
  }
  return { re, im };
}

/**
 * Random m×d complex isometry, as d complex columns, via reorthogonalized Gram–Schmidt.
 * Each column draws (re, im) pairs per entry, matching randomPureState.
 */
export function randomIsometry(m, d, rng) {
  integer(m, 'outcomes');
  integer(d, 'dimension');
  if (m < d) throw new RangeError('outcomes must be >= dimension');
  const columns = [];
  for (let j = 0; j < d; j++) {
    const re = new Float64Array(m), im = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      re[i] = rng.normal();
      im[i] = rng.normal();
    }
    for (let pass = 0; pass < 2; pass++) {
      for (const q of columns) {
        let a = 0, b = 0;
        for (let i = 0; i < m; i++) {
          a += q.re[i] * re[i] + q.im[i] * im[i];
          b += q.re[i] * im[i] - q.im[i] * re[i];
        }
        for (let i = 0; i < m; i++) {
          re[i] -= q.re[i] * a - q.im[i] * b;
          im[i] -= q.re[i] * b + q.im[i] * a;
        }
      }
    }
    const n = Math.sqrt(squaredNorm({ re, im }));
    if (!(n > 1e-14)) throw new Error('isometry columns are numerically dependent');
    for (let i = 0; i < m; i++) {
      re[i] /= n;
      im[i] /= n;
    }
    columns.push({ re, im });
  }
  return columns;
}

/**
 * Validate a frame once (finite entries and Q†Q = I) and return a fast evaluator of
 * Born probabilities for ρ = (1 − mix)|ψ⟩⟨ψ| + mix I/d, with effects Eₐ = Q†|a⟩⟨a|Q.
 * Use this in loops; frameProbabilities re-validates the frame on every call.
 */
export function createFrame(columns, { tolerance = 1e-10 } = {}) {
  const d = columns?.length;
  if (!d) throw new TypeError('frame must have columns');
  const m = columns[0].re?.length;
  integer(m, 'outcomes');
  if (m < d) throw new RangeError('outcomes must be >= dimension');
  for (const c of columns) complexVector(c, m, 'column');
  const re = columns.map(c => Float64Array.from(c.re));
  const im = columns.map(c => Float64Array.from(c.im));
  for (let j = 0; j < d; j++) {
    for (let k = j; k < d; k++) {
      let gr = 0, gi = 0;
      for (let a = 0; a < m; a++) {
        gr += re[j][a] * re[k][a] + im[j][a] * im[k][a];
        gi += re[j][a] * im[k][a] - im[j][a] * re[k][a];
      }
      if (Math.abs(gr - (j === k ? 1 : 0)) > tolerance || Math.abs(gi) > tolerance) {
        throw new RangeError('frame columns must be orthonormal (Q†Q = I)');
      }
    }
  }
  const traces = new Float64Array(m);
  for (let j = 0; j < d; j++) for (let a = 0; a < m; a++) traces[a] += re[j][a] ** 2 + im[j][a] ** 2;

  function probabilities(psi, { mix = 0, out = new Float64Array(m) } = {}) {
    if (psi?.re?.length !== d || psi?.im?.length !== d) throw new TypeError(`state must have re and im arrays of length ${d}`);
    if (!(mix >= 0 && mix <= 1)) throw new RangeError('mix must be in [0, 1]');
    if (!(Math.abs(squaredNorm(psi) - 1) <= 1e-8)) throw new RangeError('state must be finite and normalized');
    const pure = 1 - mix, mixed = mix / d;
    for (let a = 0; a < m; a++) {
      let ar = 0, ai = 0;
      for (let j = 0; j < d; j++) {
        const cr = re[j][a], ci = im[j][a], sr = psi.re[j], si = psi.im[j];
        ar += cr * sr - ci * si;
        ai += cr * si + ci * sr;
      }
      out[a] = pure * (ar * ar + ai * ai) + mixed * traces[a];
    }
    return out;
  }

  return Object.freeze({ outcomes: m, dimension: d, columns, traces, probabilities });
}

/** One-off Born probabilities (Float64Array). Validates the frame each call; see createFrame. */
export function frameProbabilities(columns, psi, mix = 0) {
  return createFrame(columns).probabilities(psi, { mix });
}

/**
 * Coordinates of |ψ⟩⟨ψ| in an orthonormal real Hilbert–Schmidt basis of Hermitian d×d
 * matrices: d diagonal entries, then √2·Re and √2·Im of each upper-triangle entry.
 * The Euclidean dot product of two coordinate vectors equals Tr(AB).
 */
export function stateCoordinates(psi) {
  const d = psi.re.length, f = new Float64Array(d * d);
  for (let j = 0; j < d; j++) f[j] = psi.re[j] * psi.re[j] + psi.im[j] * psi.im[j];
  let k = d;
  for (let j = 0; j < d; j++) {
    for (let l = j + 1; l < d; l++) {
      f[k++] = Math.SQRT2 * (psi.re[j] * psi.re[l] + psi.im[j] * psi.im[l]);
      f[k++] = Math.SQRT2 * (psi.im[j] * psi.re[l] - psi.re[j] * psi.im[l]);
    }
  }
  return f;
}

/**
 * Hilbert–Schmidt coordinates (as in stateCoordinates) of each effect Eₐ = Q†|a⟩⟨a|Q,
 * plus their traces. Then pₐ = effects[a] · stateCoordinates(ψ).
 */
export function effectCoordinates(columns) {
  const d = columns.length, m = columns[0].re.length;
  const effects = new Array(m), traces = new Float64Array(m);
  for (let a = 0; a < m; a++) {
    const f = new Float64Array(d * d);
    for (let j = 0; j < d; j++) {
      const re = columns[j].re[a], im = columns[j].im[a];
      f[j] = re * re + im * im;
      traces[a] += f[j];
    }
    let k = d;
    for (let j = 0; j < d; j++) {
      for (let l = j + 1; l < d; l++) {
        const rj = columns[j].re[a], ij = columns[j].im[a];
        const rl = columns[l].re[a], il = columns[l].im[a];
        f[k++] = Math.SQRT2 * (rj * rl + ij * il);
        f[k++] = Math.SQRT2 * (rj * il - ij * rl);
      }
    }
    effects[a] = f;
  }
  return { effects, traces };
}

/** Born probabilities for qubit effects E=(t I + v·σ)/2 and Bloch vector r. */
export function qubitProbabilities(effects, r) {
  if (!Array.isArray(r) || r.length !== 3 || !r.every(Number.isFinite) || Math.hypot(...r) > 1 + 1e-10) {
    throw new RangeError('Bloch vector must be finite and inside the unit ball');
  }
  if (!Array.isArray(effects) || !effects.length) throw new TypeError('effects must be nonempty');
  const p = effects.map(e => {
    if (!Number.isFinite(e.t) || !Array.isArray(e.v) || e.v.length !== 3 || !e.v.every(Number.isFinite) || e.t < Math.hypot(...e.v) - 1e-10) {
      throw new RangeError('invalid positive qubit effect');
    }
    return (e.t + e.v[0] * r[0] + e.v[1] * r[1] + e.v[2] * r[2]) / 2;
  });
  let t = 0;
  const v = [0, 0, 0];
  for (const e of effects) {
    t += e.t;
    for (let i = 0; i < 3; i++) v[i] += e.v[i];
  }
  if (Math.abs(t - 2) > 1e-8 || Math.hypot(...v) > 1e-8) throw new RangeError('effects must sum to identity');
  return p.map(x => Math.max(0, x));
}

/** Convert a two-column isometry to qubit effects. */
export function qubitEffects(columns) {
  if (columns.length !== 2) throw new RangeError('qubit frame requires two columns');
  const m = columns[0].re.length;
  columns.forEach(c => complexVector(c, m, 'column'));
  return Array.from({ length: m }, (_, i) => {
    const a = columns[0].re[i], b = columns[0].im[i], c = columns[1].re[i], d = columns[1].im[i];
    return { t: a * a + b * b + c * c + d * d, v: [2 * (a * c + b * d), -2 * (a * d - b * c), a * a + b * b - c * c - d * d] };
  });
}
