# Changelog

## 0.3.0

Random streams and sampling algorithms changed, so seeded results differ from 0.2.0. Results cached from 0.2.0 should be regenerated.

### Changed
- `Random` now uses sfc32 seeded through splitmix32. With 0.2.0's xorshift32, small seeds produced tiny first uniforms (about 6e-5 × seed) and so a 3–4σ first normal draw.
- `randomIsometry` draws one (re, im) Gaussian pair per entry, as `randomPureState` already did.
- `fitReadout` uses a one-sided Jacobi SVD instead of eigendecomposing XᵀX, so accuracy no longer degrades with the square of the condition number and `rcond` below ~1e-7 is honored. It returns `condition`, `singularValues`, `sweeps` and `converged` instead of `eigenvalues`, and accepts `rowCount` to fit on a prefix of the rows.
- `sampleFrequencies` defaults to an exact binomial-chain multinomial sampler (≈700× faster at 10⁶ shots), adds `model: 'gaussian' | 'categorical'` and `validate: false`, and accepts `null` for infinite shots.
- `frameProbabilities` now checks the full isometry condition Q†Q = I. It and the other vector-valued functions return `Float64Array`s.
- `createWorkerClient` supports `{id, progress}` messages and `AbortSignal` cancellation, restarts its worker after an abort or worker error, and handles `messageerror`.
- `downloadText` attaches the link before clicking and revokes the URL later, for Safari and Firefox.
- `drawLineChart` draws a legend for labelled series and accepts a `theme`.
- `symmetricEigen` and `drawLineChart` no longer overflow the stack on large inputs.
- Code reformatted to one statement per line; tests reorganized and extended.

### Added
- `createFrame` (validate once, evaluate fast), `stateCoordinates`, `effectCoordinates`, `svd`, `binomial`, `logGamma`, `Random#uint32`.
- `dist/qelm.js` single-file bundle (`npm run build`), exported as `qelm-lab/bundle`.

### Removed
- `hello.js`.
