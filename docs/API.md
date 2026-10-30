# API and design notes

All core exports are available through `src/index.js`, or as a single file through `dist/qelm.js` (`qelm-lab/bundle`), which is generated from `src/` by `npm run build` and is the better choice for CDN imports (one request instead of seven). Inputs are plain or typed arrays (complex vectors use `{re, im}`). Vector outputs are `Float64Array`s unless stated otherwise. Functions throw for invalid inputs where documented. `src/browser.js` is a separate browser-only entry point. No module touches the DOM when imported.

## Reproducibility

`new Random(seed)` accepts an integer seed and runs the sfc32 generator, whose state is expanded from the seed with splitmix32, so nearby seeds (0, 1, 2, …) give unrelated streams. `uint32()` returns raw 32-bit integers, `uniform()` is strictly between 0 and 1, and `normal()` is standard normal via Box–Muller. `mixSeed(seed, ...integerCoordinates)` derives seeds for separate tasks, so scheduling order does not determine results. These pseudorandom streams are deterministic, not cryptographically secure. Changing the library algorithm may change generated values; pin a version (and include it in any cache key) when results must be reproduced exactly.

## Quantum model

`randomPureState(d, rng)` returns a normalized Haar-random complex state. `randomIsometry(m, d, rng)` returns `d` complex columns of length `m` with Q†Q = I; it requires `m >= d >= 1`. Both draw one (re, im) Gaussian pair per entry. Each outcome has effect Eₐ = Q†|a⟩⟨a|Q.

`createFrame(Q, {tolerance = 1e-10})` validates the columns once (finite entries, Q†Q = I within `tolerance`) and returns `{outcomes, dimension, columns, traces, probabilities(psi, {mix = 0, out})}`. `probabilities` evaluates the Born probabilities for ρ = (1 − mix)|ψ⟩⟨ψ| + mix I/d, checking only the state's shape and normalization; pass `out` to reuse a buffer. Use it inside loops. `frameProbabilities(Q, psi, mix = 0)` is the one-off form and re-validates the frame on every call.

`stateCoordinates(psi)` returns the coordinates of |ψ⟩⟨ψ| in an orthonormal real Hilbert–Schmidt basis of Hermitian matrices (the d diagonal entries, then √2·Re and √2·Im of each upper-triangle entry), so dot products equal Tr(AB). `effectCoordinates(Q)` returns `{effects, traces}` with the same coordinates of each Eₐ, so pₐ = effects[a] · stateCoordinates(ψ).

`qubitEffects(Q)` converts a two-column frame to `{t, v}` objects representing E = (t I + v·σ)/2. `qubitProbabilities(effects, r)` takes a Bloch vector within the unit ball and checks positivity and completeness. σy uses the standard convention [[0, −i], [i, 0]]. It also works with user-defined valid effects.

## Sampling

`sampleFrequencies(p, shots, rng, {model = 'multinomial', validate = true})` returns empirical frequencies. `shots` is a positive safe integer, or `Infinity` or `null` (exact probabilities; `null` is convenient for settings passed through JSON). Models:

- `'multinomial'`: exact, as a chain of conditional binomial draws. The cost is roughly O(outcomes × √shots), so a million shots costs about as much as a thousand.
- `'gaussian'`: p plus Gaussian noise with the multinomial covariance (diag p − ppᵀ)/shots. Frequencies sum to one but may be slightly negative.
- `'categorical'`: exact, one draw per shot, O(shots × outcomes). Kept for small counts and for checking the others.

Pass `validate: false` in hot loops when `p` comes from a validated frame. `binomial(n, p, rng)` is the exact binomial sampler used by the multinomial model, and `logGamma` is its Lanczos log-gamma. `frequencyCovariance(p, shots)` returns (diag(p) − ppᵀ)/shots, and zero at infinite shots. Probabilities must sum to one within 1e-8.

## Readout

`svd(rows, {rowCount, tolerance = 1.5e-13, maxSweeps = 60})` computes the thin SVD A = Σⱼ σⱼ uⱼ vⱼᵀ of the first `rowCount` rows by one-sided Jacobi rotations. It never forms AᵀA, so small singular values stay accurate. It returns `{values, u, v, sweeps, converged}` with modes sorted by descending σ, unit `u` vectors of length `rowCount` and unit `v` vectors of length equal to the number of columns.

`fitReadout(X, y, {lambda = 0, rcond = 1e-10, rowCount})` minimizes `||Xw − y||² + lambda ||w||²` over the first `rowCount` rows, without an implicit intercept; add a constant feature if one is needed. It uses `svd` and drops modes with σ ≤ rcond·σ_max, so `lambda = 0` gives the minimum-norm pseudoinverse solution. It returns `{weights, rank, condition, singularValues, sweeps, converged, predict(features)}`, where `condition` is σ_max/σ_min over retained modes. Dense storage and Jacobi sweeps suit the small and medium problems of interactive visualizations, not large-scale scientific computation.

`ridgeSpectralFactor(s², lambda)` returns `1 / (s² + lambda)` for a retained SVD mode (and zero for `s² = lambda = 0`). Both arguments must be finite and nonnegative. With `svd`, the ridge solution is Σⱼ σⱼ·ridgeSpectralFactor(σⱼ², λ)·(uⱼ·y)·vⱼ.

`symmetricEigen(matrix, {tolerance, maxSweeps})` returns descending `{value, vector}` pairs from a Jacobi eigensolver and throws if it fails to converge.

## Statistics and sweeps

`quantile(values, q)` uses linear interpolation at `(n − 1)q`. `summarize` gives sample variance (zero for n=1), median, and 5th/95th percentiles, sorting once. `predictionMetrics(predictions, truth)` uses **population** variance over the provided predictions, so MSE = bias² + variance exactly up to rounding. It does not estimate the separate training/test noise components or analytical Haar averages.

`parameterGrid({name: [values], ...})` produces Cartesian combinations. `runSweep(tasks, evaluate, {signal, onProgress})` runs tasks sequentially and checks cancellation before and after each task. The evaluator receives `(task, index, signal)` and must itself cooperate during long computations. Partial progress arrives through `onProgress`; cancellation rejects with `AbortError`. `toCSV(rows, columns)` escapes headers and values and returns text; callers should avoid feeding untrusted formula-like fields to spreadsheet software.

## Browser helpers

`createStore(initial)` provides shallow `get`, `set(patch)`, and `subscribe(callback)` returning an unsubscribe function. Nested objects are not copied. `scheduleFrame(callback)` coalesces requests; call `cancel()` when disposing. `prepareCanvas(canvas)` sizes for device pixel ratio and returns the 2D context in CSS pixels. `drawLineChart(canvas, series, options)` draws a simple line chart; series are `{label, color, points: [[x,y], ...]}`, and labelled series get a legend. Options include `xLabel`, `yLabel`, `xRange`, `yRange`, and `theme` (`{background, grid, text, line}` colors, e.g. for dark mode). Non-finite points break lines. For 3D, rich hover, or publication-quality figures, use a dedicated plotting library instead. `downloadText(text, filename, type)` downloads a Blob.

For heavier computation, `createWorkerClient(url)` starts a module Worker on the first call. `run(payload, {onProgress, signal})` sends `{id, payload}`; the worker may answer with any number of `{id, progress}` messages (passed to `onProgress`) and then `{id, result}` or `{id, error}`. Workers cannot be preempted, so aborting a call through `signal` terminates the worker: the aborted call rejects with `AbortError`, other pending calls reject too, and the next `run` starts a fresh worker. A worker error or undeserializable message does the same. `dispose()` terminates it permanently and rejects pending calls. A worker can import the core modules, for example:

```js
import { parameterGrid } from '../dist/qelm.js';
self.onmessage = ({ data: { id, payload } }) => {
  try {
    self.postMessage({ id, progress: 'started' });
    self.postMessage({ id, result: parameterGrid(payload) });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
```

The example uses short main-thread batches for clarity. For longer computations use a worker, chunk your work, or both. Worker messages must be structured-cloneable; `fitReadout` results contain a `predict` function, so send `weights` and diagnostics rather than the full result.
