# API and design notes

All core exports are available through `src/index.js`. Inputs are plain arrays (complex vectors use `{re, im}`), and outputs are ordinary JavaScript data unless stated otherwise. Functions throw for invalid inputs where documented. `src/browser.js` is a separate browser-only entry point. No module touches the DOM when imported.

## Reproducibility

`new Random(seed)` accepts an integer seed; `uniform()` is strictly between 0 and 1, `normal()` is standard normal via Box–Muller. `mixSeed(seed, ...integerCoordinates)` derives seeds for separate tasks, so scheduling order does not determine results. These pseudorandom streams are deterministic, not cryptographically secure. A seed of zero uses a fixed nonzero xorshift state. Changing the library algorithm may change generated values.

## Quantum model

`randomPureState(d, rng)` returns a normalized Haar-random complex state. `randomIsometry(m, d, rng)` returns `d` complex columns of length `m` with Q†Q = I; it requires `m >= d >= 1`. Each outcome has effect Eₐ = Q†|a⟩⟨a|Q. `frameProbabilities(Q, psi, mix = 0)` evaluates the Born probabilities for ρ = (1 − mix)|ψ⟩⟨ψ| + mix I/d. State normalization and the sum of resulting probabilities are checked; callers supplying their own frames are responsible for ensuring the full isometry condition.

`qubitEffects(Q)` converts a two-column frame to `{t, v}` objects representing E = (t I + v·σ)/2. `qubitProbabilities(effects, r)` takes a Bloch vector within the unit ball and checks positivity and completeness. σy uses the standard convention [[0, −i], [i, 0]]. It also works with user-defined valid effects.

## Sampling and readout

`sampleFrequencies(p, shots, rng)` draws exact independent categorical trials. `shots` is a positive safe integer or `Infinity` (returns exact probabilities). Its cost is O(shots × outcomes), so avoid extremely large counts or substitute a faster sampler. `frequencyCovariance(p, shots)` returns (diag(p) − ppᵀ)/shots, and zero at infinite shots. Probabilities must sum to one within 1e-8.

`fitReadout(X, y, {lambda=0, rcond=1e-10})` minimizes `||Xw − y||² + lambda ||w||²`, without an implicit intercept. Add a constant feature if one is needed. It returns `{weights, rank, eigenvalues, predict(features)}`. For zero lambda it uses a truncated pseudoinverse; small eigendirections of XᵀX are also dropped at a floating-point precision threshold even with positive ridge. `rcond` is a relative singular-value cutoff, applied squared to Gram eigenvalues. Forming the Gram matrix squares the condition number; the Jacobi eigensolver and dense storage are intended for small teaching examples, not high-dimensional or strongly ill-conditioned scientific computation. `rank` is the retained numerical rank, and eigenvalues are of XᵀX. `symmetricEigen` returns descending `{value, vector}` pairs and throws if it fails to converge.

## Statistics and sweeps

`quantile(values, q)` uses linear interpolation at `(n − 1)q`. `summarize` gives sample variance (zero for n=1), median, and 5th/95th percentiles. `predictionMetrics(predictions, truth)` uses **population** variance over the provided predictions, so MSE = bias² + variance exactly up to rounding. It does not estimate the separate training/test noise components or analytical Haar averages from the original lab.

`parameterGrid({name: [values], ...})` produces Cartesian combinations. `runSweep(tasks, evaluate, {signal, onProgress})` runs tasks sequentially and checks cancellation before and after each task. The evaluator receives `(task, index, signal)` and must itself cooperate during long computations. Partial progress arrives through `onProgress`; cancellation rejects with `AbortError`. `toCSV(rows, columns)` escapes headers and values and returns text; callers should avoid feeding untrusted formula-like fields to spreadsheet software.

## Browser helpers

`createStore(initial)` provides shallow `get`, `set(patch)`, and `subscribe(callback)` returning an unsubscribe function. Nested objects are not copied. `scheduleFrame(callback)` coalesces requests; call `cancel()` when disposing. `prepareCanvas(canvas)` sizes for device pixel ratio and returns the 2D context in CSS pixels. `drawLineChart(canvas, series, options)` draws a simple line chart; series are `{label, color, points: [[x,y], ...]}`. Options include `xLabel`, `yLabel`, `xRange`, and `yRange`. NaN points break lines. For 3D, rich hover, or publication-quality figures, plug in a dedicated plotting library instead. `downloadText` downloads a Blob.

For heavier computation, `createWorkerClient(url)` starts a module Worker. Its `run(payload)` sends `{id, payload}` and expects `{id, result}` or `{id, error}`; calls are correlated by ID. `dispose()` terminates it and rejects pending calls. A worker can import the core modules, for example:

```js
import { parameterGrid } from '../src/index.js';
self.onmessage = ({data: {id, payload}}) => {
  try { self.postMessage({id, result: parameterGrid(payload)}); }
  catch (error) { self.postMessage({id, error: error.message}); }
};
```

The example uses short main-thread batches for clarity. For longer computations use a worker, chunk your work, or both. Worker messages must be structured-cloneable; `fitReadout` results contain a `predict` function, so send `weights` and diagnostics rather than the full result.
