# QELM Lab

A dependency-free ES module toolkit for interactive quantum extreme learning machine (QELM) experiments.

## Run the example

Requires Node 18+ for tests and the build script and Python 3 for the local server. No install or network access is needed.

```sh
npm test
npm run serve
```

Open [http://localhost:8000/examples/](http://localhost:8000/examples/). ES modules and workers should be served over HTTP; opening the HTML directly as a file may be blocked by browser security. The example generates a random POVM and states, trains a noisy linear readout, and plots test MSE against shot count. Export its raw summary data as CSV.

## Build an experiment

Import from `src/index.js` in the browser, or install/link this directory as an npm package and import from `qelm-lab`:

```js
import { Random, randomIsometry, randomPureState, createFrame,
  sampleFrequencies, fitReadout, predictionMetrics } from 'qelm-lab';

const rng = new Random(42);
const frame = createFrame(randomIsometry(6, 2, rng));
const states = Array.from({ length: 12 }, () => randomPureState(2, rng));
const X = states.map(s => sampleFrequencies(frame.probabilities(s), 200, rng));
const y = states.map(s => s.re[0] ** 2 + s.im[0] ** 2 - s.re[1] ** 2 - s.im[1] ** 2);
const fit = fitReadout(X, y, { lambda: 0.001 });
const test = randomPureState(2, rng);
const prediction = fit.predict(frame.probabilities(test));
const metrics = predictionMetrics([prediction, prediction + 0.1], 0.5);
```

Keep model construction, sampling, readout, and rendering separate. A custom POVM can provide its own probability arrays to `sampleFrequencies`; a different model can provide feature rows to `fitReadout`; an alternative renderer can consume the resulting plain arrays. For qubits, `qubitProbabilities` also accepts explicit effects. See [API and design notes](docs/API.md) and the [example source](examples/lab.js).

From a CDN, import the single-file bundle at a pinned tag:

```js
import { Random, createFrame } from 'https://cdn.jsdelivr.net/gh/lucainnocenti/qelm-js@v0.3.0/dist/qelm.js';
```

## Modules

- `random.js`: reproducible sfc32 random streams and derived seeds.
- `quantum.js`: Haar-random states and isometric POVMs, validated frames with fast Born probabilities, Hilbert–Schmidt coordinates, depolarizing mixture, and qubit effects.
- `sampling.js`: fast exact multinomial, Gaussian, and per-shot categorical frequencies, binomial draws, and their covariance.
- `linalg.js`: one-sided Jacobi SVD, ridge/pseudoinverse readouts (also on row prefixes), and a symmetric eigensolver.
- `stats.js`: quantiles and empirical prediction error decomposition.
- `experiment.js`: parameter grids, cancellable sequential sweeps, and CSV.
- `browser.js`: observable state, frame scheduling, canvas line charts, downloads, and a module-worker client with progress and cancellation. Import separately via `qelm-lab/browser` or `src/browser.js`.

`dist/qelm.js` bundles the core modules (everything except `browser.js`); regenerate it with `npm run build` after editing `src/`. The tests check that it is up to date. See [CHANGELOG.md](CHANGELOG.md) for changes between versions.

These are small educational building blocks, not a general quantum simulator or production numerical linear algebra package. Validate results against trusted solvers for research calculations, particularly for ill-conditioned or large problems. See the API notes for conventions and performance limits.
