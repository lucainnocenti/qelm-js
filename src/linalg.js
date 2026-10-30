export function dot(a, b) {
  if (a.length !== b.length) throw new RangeError('vector lengths differ');
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function maxAbs(rows) {
  let max = 0;
  for (const row of rows) for (let j = 0; j < row.length; j++) max = Math.max(max, Math.abs(row[j]));
  return max;
}

function finiteMatrix(rows, rowCount) {
  if (!Array.isArray(rows) || !rows.length || !rows[0]?.length) return false;
  const n = rows[0].length;
  for (let i = 0; i < rowCount; i++) {
    const row = rows[i];
    if (row?.length !== n) return false;
    for (let j = 0; j < n; j++) if (!Number.isFinite(row[j])) return false;
  }
  return true;
}

/** Symmetric Jacobi eigensolver. Returns descending eigenpairs, eigenvectors in columns. */
export function symmetricEigen(matrix, { tolerance = 1e-13, maxSweeps = 100 } = {}) {
  const n = matrix.length;
  if (!n || !finiteMatrix(matrix, n) || matrix[0].length !== n) throw new TypeError('matrix must be finite and square');
  if (!(tolerance > 0) || !Number.isInteger(maxSweeps) || maxSweeps < 1) throw new RangeError('invalid eigensolver options');
  const a = matrix.map(r => Float64Array.from(r));
  const v = Array.from({ length: n }, (_, i) => {
    const row = new Float64Array(n);
    row[i] = 1;
    return row;
  });
  const scale = Math.max(maxAbs(a), Number.MIN_VALUE);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (Math.abs(a[i][j] - a[j][i]) > tolerance * scale) throw new RangeError('matrix must be symmetric');
    }
  }
  let converged = n === 1;
  for (let sweep = 0; sweep < maxSweeps && !converged; sweep++) {
    let largest = 0;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const z = a[p][q];
        largest = Math.max(largest, Math.abs(z));
        if (Math.abs(z) <= tolerance * scale) continue;
        const tau = (a[q][q] - a[p][p]) / (2 * z);
        const t = (tau >= 0 ? 1 : -1) / (Math.abs(tau) + Math.hypot(1, tau));
        const c = 1 / Math.hypot(1, t), s = t * c;
        a[p][p] -= t * z;
        a[q][q] += t * z;
        a[p][q] = a[q][p] = 0;
        for (let k = 0; k < n; k++) {
          if (k === p || k === q) continue;
          const x = a[k][p], y = a[k][q];
          a[k][p] = a[p][k] = c * x - s * y;
          a[k][q] = a[q][k] = s * x + c * y;
        }
        for (let k = 0; k < n; k++) {
          const x = v[k][p], y = v[k][q];
          v[k][p] = c * x - s * y;
          v[k][q] = s * x + c * y;
        }
      }
    }
    if (largest <= tolerance * scale) converged = true;
  }
  if (!converged) throw new Error('eigensolver did not converge');
  return Array.from({ length: n }, (_, i) => ({ value: a[i][i], vector: v.map(row => row[i]) })).sort((x, y) => y.value - x.value);
}

/**
 * Thin SVD A = Σⱼ σⱼ uⱼ vⱼᵀ of the first `rowCount` rows of `rows` (an array of equal-length
 * numeric arrays), by one-sided Jacobi rotations. Unlike forming AᵀA, this keeps small singular
 * values accurate. Works for tall and wide matrices; returns min(rows, columns) modes sorted
 * by descending σ, with unit u (length rowCount) and v (length columns). u is zero where σ = 0.
 */
export function svd(rows, { rowCount = rows?.length, tolerance = 1.5e-13, maxSweeps = 60 } = {}) {
  if (!Number.isInteger(rowCount) || rowCount < 1 || rowCount > rows.length || !finiteMatrix(rows, rowCount)) {
    throw new TypeError('rows must be a finite, rectangular, nonempty matrix');
  }
  if (!(tolerance > 0) || !Number.isInteger(maxSweeps) || maxSweeps < 1) throw new RangeError('invalid SVD options');
  const m = rowCount, n = rows[0].length, flip = m < n;
  // Orthogonalize the columns of A (or of Aᵀ when wide), accumulating rotations in V.
  const nr = flip ? n : m, nc = flip ? m : n;
  const C = new Array(nc), V = new Array(nc);
  for (let j = 0; j < nc; j++) {
    const col = new Float64Array(nr), rot = new Float64Array(nc);
    rot[j] = 1;
    if (flip) col.set(rows[j]);
    else for (let i = 0; i < nr; i++) col[i] = rows[i][j];
    C[j] = col;
    V[j] = rot;
  }
  let sweeps = 0, converged = false;
  while (sweeps < maxSweeps) {
    sweeps++;
    let rotations = 0;
    for (let p = 0; p < nc - 1; p++) {
      const cp = C[p], vp = V[p];
      for (let q = p + 1; q < nc; q++) {
        const cq = C[q], vq = V[q];
        let alpha = 0, beta = 0, gamma = 0;
        for (let i = 0; i < nr; i++) {
          const x = cp[i], z = cq[i];
          alpha += x * x;
          beta += z * z;
          gamma += x * z;
        }
        if (alpha === 0 || beta === 0 || Math.abs(gamma) <= tolerance * Math.sqrt(alpha * beta)) continue;
        const zeta = (beta - alpha) / (2 * gamma);
        const t = (zeta >= 0 ? 1 : -1) / (Math.abs(zeta) + Math.hypot(1, zeta));
        const c = 1 / Math.sqrt(1 + t * t), s = c * t;
        for (let i = 0; i < nr; i++) {
          const x = cp[i], z = cq[i];
          cp[i] = c * x - s * z;
          cq[i] = s * x + c * z;
        }
        for (let i = 0; i < nc; i++) {
          const x = vp[i], z = vq[i];
          vp[i] = c * x - s * z;
          vq[i] = s * x + c * z;
        }
        rotations++;
      }
    }
    if (!rotations) {
      converged = true;
      break;
    }
  }
  const modes = [];
  for (let j = 0; j < nc; j++) {
    const sigma = Math.sqrt(dot(C[j], C[j]));
    const scaled = sigma > 0 ? C[j].map(x => x / sigma) : new Float64Array(nr);
    modes.push(flip ? { sigma, u: V[j], v: scaled } : { sigma, u: scaled, v: V[j] });
  }
  modes.sort((x, y) => y.sigma - x.sigma);
  return {
    values: Float64Array.from(modes, x => x.sigma),
    u: modes.map(x => x.u),
    v: modes.map(x => x.v),
    sweeps,
    converged,
  };
}

/** Ridge filter for an SVD mode with squared singular value s²: 1/(s² + λ), and 0 when s² = λ = 0. */
export function ridgeSpectralFactor(squaredSingularValue, lambda = 0) {
  if (!Number.isFinite(squaredSingularValue) || squaredSingularValue < 0 || !Number.isFinite(lambda) || lambda < 0) {
    throw new RangeError('squared singular value and lambda must be finite and nonnegative');
  }
  if (squaredSingularValue === 0 && lambda === 0) return 0;
  return 1 / (squaredSingularValue + lambda);
}

/**
 * Ridge regression minimizing ||Xw − y||² + λ||w||², without an implicit intercept, via a
 * truncated SVD of X: modes with σ ≤ rcond·σ_max are dropped (λ = 0 gives the minimum-norm
 * pseudoinverse solution). `rowCount` fits on a prefix of the rows without copying.
 * Returns {weights, rank, condition, singularValues, sweeps, converged, predict(features)}.
 */
export function fitReadout(X, y, { lambda = 0, rcond = 1e-10, rowCount = X?.length } = {}) {
  if (!Array.isArray(X) || !X.length || !Number.isInteger(rowCount) || rowCount < 1 || rowCount > X.length || !finiteMatrix(X, rowCount) || !(y?.length >= rowCount)) {
    throw new TypeError('X and y must be finite, rectangular, and have matching rows');
  }
  for (let i = 0; i < rowCount; i++) if (!Number.isFinite(y[i])) throw new TypeError('y must be finite');
  if (!Number.isFinite(lambda) || lambda < 0 || !Number.isFinite(rcond) || rcond < 0 || rcond >= 1) throw new RangeError('invalid lambda or rcond');
  const n = X[0].length, decomposition = svd(X, { rowCount });
  const { values, u, v } = decomposition;
  const cutoff = values[0] * rcond, weights = new Float64Array(n);
  let rank = 0;
  for (let j = 0; j < values.length; j++) {
    const sigma = values[j];
    if (!(sigma > cutoff)) continue;
    rank++;
    let projection = 0;
    for (let i = 0; i < rowCount; i++) projection += u[j][i] * y[i];
    const coefficient = projection * sigma * ridgeSpectralFactor(sigma * sigma, lambda);
    for (let a = 0; a < n; a++) weights[a] += coefficient * v[j][a];
  }
  return {
    weights,
    rank,
    condition: rank > 0 ? values[0] / values[rank - 1] : Infinity,
    singularValues: values,
    sweeps: decomposition.sweeps,
    converged: decomposition.converged,
    predict: features => dot(weights, features),
  };
}
