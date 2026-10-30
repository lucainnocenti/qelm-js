import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Random, mixSeed, randomPureState, randomIsometry, createFrame, frameProbabilities,
  stateCoordinates, effectCoordinates, qubitEffects, qubitProbabilities,
  binomial, sampleFrequencies, frequencyCovariance,
  symmetricEigen, svd, fitReadout, ridgeSpectralFactor,
  quantile, summarize, predictionMetrics, parameterGrid, runSweep, toCSV,
} from '../src/index.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b} (tol ${tol})`);
const meanOf = xs => xs.reduce((s, x) => s + x, 0) / xs.length;

test('seeded streams reproduce and separate', () => {
  const a = new Random(4), b = new Random(4), c = new Random(mixSeed(4, 1));
  for (let i = 0; i < 20; i++) assert.equal(a.normal(), b.normal());
  assert.notEqual(c.uniform(), b.uniform());
  assert.equal(mixSeed(7), 7);
  assert.throws(() => new Random(1.5));
});

test('small adjacent seeds give well-spread first draws', () => {
  const first = Array.from({ length: 1000 }, (_, seed) => new Random(seed).uniform());
  // The first uniforms of seeds 0..999 should look uniform, not cluster near zero.
  near(meanOf(first), 0.5, 0.03);
  assert.ok(first.filter(u => u < 0.01).length < 30);
  const normals = Array.from({ length: 1000 }, (_, seed) => new Random(seed).normal());
  near(meanOf(normals), 0, 0.1);
  near(meanOf(normals.map(z => z * z)), 1, 0.15);
});

test('uniform and normal moments over a long stream', () => {
  const rng = new Random(2024), n = 200000;
  let u1 = 0, u2 = 0, z1 = 0, z2 = 0;
  for (let i = 0; i < n; i++) {
    const u = rng.uniform(), z = rng.normal();
    assert.ok(u > 0 && u < 1);
    u1 += u; u2 += u * u; z1 += z; z2 += z * z;
  }
  near(u1 / n, 0.5, 0.005);
  near(u2 / n, 1 / 3, 0.005);
  near(z1 / n, 0, 0.01);
  near(z2 / n, 1, 0.01);
});

test('random frames are isometric and Born probabilities agree with qubit representation', () => {
  for (let seed = 0; seed < 10; seed++) {
    const rng = new Random(seed), f = randomIsometry(7, 2, rng), s = randomPureState(2, rng);
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        let re = 0, im = 0;
        for (let k = 0; k < 7; k++) {
          re += f[i].re[k] * f[j].re[k] + f[i].im[k] * f[j].im[k];
          im += f[i].re[k] * f[j].im[k] - f[i].im[k] * f[j].re[k];
        }
        near(re, +(i === j));
        near(im, 0);
      }
    }
    const [a, b] = s.re, [c, d] = s.im, r = [2 * (a * b + c * d), 2 * (a * d - c * b), a * a + c * c - b * b - d * d];
    const p = frameProbabilities(f, s), q = qubitProbabilities(qubitEffects(f), r);
    p.forEach((x, i) => near(x, q[i]));
    near(p.reduce((x, y) => x + y, 0), 1);
    near(frameProbabilities(f, s, 1).reduce((x, y) => x + y, 0), 1);
  }
  assert.throws(() => randomIsometry(1, 2, new Random(1)));
  assert.throws(() => qubitProbabilities([{ t: 1, v: [0, 0, 0] }], [0, 0, 0]));
});

test('createFrame validates once and matches frameProbabilities', () => {
  const rng = new Random(9), Q = randomIsometry(10, 3, rng), frame = createFrame(Q), out = new Float64Array(10);
  for (let i = 0; i < 5; i++) {
    const psi = randomPureState(3, rng), expected = frameProbabilities(Q, psi, 0.2);
    const p = frame.probabilities(psi, { mix: 0.2, out });
    assert.equal(p, out);
    p.forEach((x, a) => near(x, expected[a], 1e-14));
  }
  const bad = Q.map(c => ({ re: c.re.map(x => 2 * x), im: c.im }));
  assert.throws(() => createFrame(bad), /orthonormal/);
  assert.throws(() => frame.probabilities({ re: [1, 0, 0], im: [0, 0, 0] }, { mix: 2 }), /mix/);
  assert.throws(() => frame.probabilities({ re: [1, 1, 0], im: [0, 0, 0] }), /normalized/);
});

test('Hilbert–Schmidt coordinates reproduce overlaps and Born probabilities', () => {
  const rng = new Random(5), d = 3, Q = randomIsometry(12, d, rng), a = randomPureState(d, rng), b = randomPureState(d, rng);
  let re = 0, im = 0;
  for (let j = 0; j < d; j++) {
    re += a.re[j] * b.re[j] + a.im[j] * b.im[j];
    im += a.re[j] * b.im[j] - a.im[j] * b.re[j];
  }
  const ca = stateCoordinates(a), cb = stateCoordinates(b);
  near(ca.reduce((s, x, i) => s + x * cb[i], 0), re * re + im * im);
  const { effects, traces } = effectCoordinates(Q), p = frameProbabilities(Q, a);
  effects.forEach((e, k) => near(e.reduce((s, x, i) => s + x * ca[i], 0), p[k]));
  near(traces.reduce((s, x) => s + x, 0), d);
});

test('binomial draws have the right mean and variance in sparse, modal, and symmetric regimes', () => {
  const rng = new Random(77);
  for (const [n, p] of [[50, 0.1], [1000, 0.3], [100000, 0.02], [400, 0.85]]) {
    const draws = Array.from({ length: 4000 }, () => binomial(n, p, rng));
    const mean = meanOf(draws), variance = meanOf(draws.map(x => (x - mean) ** 2));
    assert.ok(draws.every(x => Number.isInteger(x) && x >= 0 && x <= n));
    near(mean, n * p, 5 * Math.sqrt(n * p * (1 - p) / 4000));
    near(variance / (n * p * (1 - p)), 1, 0.1);
  }
  assert.equal(binomial(10, 0, rng), 0);
  assert.equal(binomial(10, 1, rng), 10);
});

test('all sampling models have multinomial means and covariance', () => {
  const p = [0.2, 0.3, 0.5], shots = 30, n = 10000, cov = frequencyCovariance(p, shots);
  for (const model of ['multinomial', 'categorical', 'gaussian']) {
    const rng = new Random(123), draws = Array.from({ length: n }, () => sampleFrequencies(p, shots, rng, { model }));
    for (let i = 0; i < 3; i++) near(meanOf(draws.map(x => x[i])), p[i], 0.004);
    near(meanOf(draws.map(x => (x[0] - p[0]) * (x[1] - p[1]))), cov[0][1], 0.0005);
    near(meanOf(draws.map(x => (x[2] - p[2]) ** 2)), cov[2][2], 0.0008);
    draws.forEach(x => near(x[0] + x[1] + x[2], 1, 1e-12));
    if (model !== 'gaussian') assert.ok(draws.every(x => x.every(f => Number.isInteger(Math.round(f * shots)) && Math.abs(f * shots - Math.round(f * shots)) < 1e-9)));
  }
  const rng = new Random(1);
  assert.deepEqual(Array.from(sampleFrequencies(p, Infinity, rng)), p);
  assert.deepEqual(Array.from(sampleFrequencies(p, null, rng)), p);
  assert.throws(() => sampleFrequencies([0.1, 0.2], 2, rng));
  assert.throws(() => sampleFrequencies(p, 2.5, rng));
  assert.throws(() => sampleFrequencies(p, 2, rng, { model: 'poisson' }), /unknown/);
});

test('multinomial sampling is fast at large shot counts', () => {
  const rng = new Random(3), p = new Float64Array(64).fill(1 / 64), start = performance.now();
  for (let i = 0; i < 1000; i++) sampleFrequencies(p, 1e6, rng);
  assert.ok(performance.now() - start < 2000, 'expected 1000 draws of 1e6 shots to be well under 2 s');
});

test('eigenvectors satisfy the eigen equation, also beyond spread-argument limits', () => {
  const A = [[2, 1], [1, 2]], eig = symmetricEigen(A);
  near(eig[0].value, 3);
  near(eig[1].value, 1);
  for (const e of eig) for (let i = 0; i < 2; i++) near(A[i][0] * e.vector[0] + A[i][1] * e.vector[1], e.value * e.vector[i]);
  const n = 400, identity = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => +(i === j)));
  assert.equal(symmetricEigen(identity).length, n);
});

test('svd reconstructs tall and wide matrices with orthonormal factors', () => {
  const rng = new Random(11);
  for (const [m, n] of [[7, 4], [4, 7], [5, 5]]) {
    const A = Array.from({ length: m }, () => Array.from({ length: n }, () => rng.normal()));
    const { values, u, v, converged } = svd(A);
    assert.ok(converged);
    assert.equal(values.length, Math.min(m, n));
    for (let k = 1; k < values.length; k++) assert.ok(values[k - 1] >= values[k]);
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) near(values.reduce((s, sigma, k) => s + sigma * u[k][i] * v[k][j], 0), A[i][j], 1e-12);
    }
    for (let a = 0; a < values.length; a++) {
      for (let b = 0; b < values.length; b++) {
        near(u[a].reduce((s, x, i) => s + x * u[b][i], 0), +(a === b), 1e-12);
        near(v[a].reduce((s, x, i) => s + x * v[b][i], 0), +(a === b), 1e-12);
      }
    }
  }
  const prefix = svd([[3, 0], [0, 4], [100, 100]], { rowCount: 2 });
  assert.deepEqual(Array.from(prefix.values), [4, 3]);
});

test('ridge readout handles singular, regularized, and prefix systems', () => {
  const fit = fitReadout([[1, 1], [2, 2]], [2, 4]);
  near(fit.weights[0], 1);
  near(fit.weights[1], 1);
  assert.equal(fit.rank, 1);
  near(fit.predict([3, 3]), 6);
  near(ridgeSpectralFactor(4, 1), 0.2);
  near(ridgeSpectralFactor(4, 0), 0.25);
  assert.equal(ridgeSpectralFactor(0, 0), 0);
  assert.throws(() => ridgeSpectralFactor(1, -1));
  const ridge = fitReadout([[1, 0], [0, 1]], [2, 4], { lambda: 1 });
  near(ridge.weights[0], 1);
  near(ridge.weights[1], 2);
  const prefix = fitReadout([[1, 0], [0, 1], [5, 5]], new Float64Array([2, 4, 1000]), { rowCount: 2 });
  near(prefix.weights[0], 2);
  near(prefix.weights[1], 4);
  assert.throws(() => fitReadout([[1, 0]], [1, 2], { rowCount: 2 }));
});

test('readout keeps accuracy where the Gram-matrix approach squares the condition number', () => {
  // Columns scaled over 1e-9..1: cond(X) = 1e9, so cond(XᵀX) = 1e18 exceeds double precision.
  const rng = new Random(8), n = 6, scales = Array.from({ length: n }, (_, j) => 10 ** (-9 * j / (n - 1)));
  const X = Array.from({ length: 10 }, () => scales.map(s => s * rng.normal()));
  const truth = Array.from({ length: n }, () => rng.normal()), y = X.map(r => r.reduce((s, x, j) => s + x * truth[j], 0));
  const fit = fitReadout(X, y, { rcond: 1e-14 });
  assert.equal(fit.rank, n);
  truth.forEach((w, j) => near(fit.weights[j], w, 1e-4));
});

test('statistics, grid, CSV, and cancellation', async () => {
  near(quantile([3, 1, 2], 0.5), 2);
  const s = summarize([4, 1, 3, 2]);
  near(s.median, 2.5);
  near(s.q05, 1.15);
  near(s.variance, 5 / 3);
  const m = predictionMetrics([1, 2, 4], 2);
  near(m.mse, m.biasSquared + m.variance);
  assert.deepEqual(parameterGrid({ a: [1, 2], b: ['x', 'y'] }), [{ a: 1, b: 'x' }, { a: 1, b: 'y' }, { a: 2, b: 'x' }, { a: 2, b: 'y' }]);
  assert.equal(toCSV([{ a: 'a,b', b: '"x"' }], ['a', 'b']), 'a,b\r\n"a,b","""x"""');
  const controller = new AbortController(), seen = [];
  await assert.rejects(
    runSweep([1, 2], async x => x * 2, { signal: controller.signal, onProgress: p => { seen.push(p.value); controller.abort(); } }),
    { name: 'AbortError' },
  );
  assert.deepEqual(seen, [2]);
});
