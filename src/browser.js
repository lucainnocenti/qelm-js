/** A small observable store. Updates replace top-level keys; unsubscribe when disposing a view. */
export function createStore(initial) {
  let state = { ...initial };
  const listeners = new Set();
  return {
    get: () => ({ ...state }),
    set(patch) {
      state = { ...state, ...patch };
      for (const fn of listeners) fn({ ...state });
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** Coalesce redraws to one callback per animation frame. Returns a cancellable scheduler. */
export function scheduleFrame(fn) {
  let id = null;
  return {
    request() {
      if (id === null) id = requestAnimationFrame(() => {
        id = null;
        fn();
      });
    },
    cancel() {
      if (id !== null) cancelAnimationFrame(id);
      id = null;
    },
  };
}

/** Resize canvas for device pixel ratio, returning CSS-pixel coordinates. */
export function prepareCanvas(canvas) {
  const rect = canvas.getBoundingClientRect(), dpr = globalThis.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: rect.width, height: rect.height };
}

const defaultTheme = { background: '#f7fafc', grid: '#a9b7c7', text: '#46566b', line: '#2463eb' };

function extent(points, index, range) {
  let a = range?.[0], b = range?.[1];
  if (a == null || b == null) {
    let min = Infinity, max = -Infinity;
    for (const p of points) {
      min = Math.min(min, p[index]);
      max = Math.max(max, p[index]);
    }
    a ??= min;
    b ??= max;
  }
  if (!Number.isFinite(a) || !Number.isFinite(b) || a > b) throw new RangeError('invalid plot range');
  return a === b ? [a - 0.5, b + 0.5] : [a, b];
}

/**
 * Simple chart with shared x/y scaling; series are {label, color, points: [[x, y], ...]}.
 * Non-finite points break lines. Series with labels get a legend. `theme` overrides colors.
 */
export function drawLineChart(canvas, series, { xLabel = '', yLabel = '', xRange, yRange, theme = {} } = {}) {
  const colors = { ...defaultTheme, ...theme };
  const { ctx, width: w, height: h } = prepareCanvas(canvas);
  const points = series.flatMap(s => s.points).filter(p => p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, w, h);
  if (!points.length) return;
  const [xmin, xmax] = extent(points, 0, xRange), [ymin, ymax] = extent(points, 1, yRange);
  const left = 55, right = w - 20, top = 20, bottom = h - 42;
  const x = v => left + ((v - xmin) / (xmax - xmin)) * (right - left);
  const y = v => bottom - ((v - ymin) / (ymax - ymin)) * (bottom - top);

  ctx.font = '12px system-ui';
  ctx.strokeStyle = colors.grid;
  ctx.fillStyle = colors.text;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const f = i / 4, xx = left + f * (right - left), yy = bottom - f * (bottom - top);
    ctx.beginPath();
    ctx.moveTo(left, yy);
    ctx.lineTo(right, yy);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText((ymin + f * (ymax - ymin)).toPrecision(2), left - 6, yy + 4);
    ctx.textAlign = 'center';
    ctx.fillText((xmin + f * (xmax - xmin)).toPrecision(2), xx, bottom + 17);
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, right - left, bottom - top);
  ctx.clip();
  ctx.lineWidth = 2;
  for (const s of series) {
    ctx.beginPath();
    ctx.strokeStyle = s.color || colors.line;
    let started = false;
    for (const p of s.points) {
      if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
        started = false;
        continue;
      }
      if (started) ctx.lineTo(x(p[0]), y(p[1]));
      else ctx.moveTo(x(p[0]), y(p[1]));
      started = true;
    }
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = colors.text;
  ctx.textAlign = 'center';
  ctx.fillText(xLabel, (left + right) / 2, bottom + 35);
  ctx.save();
  ctx.translate(13, (top + bottom) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();

  const labelled = series.filter(s => s.label);
  ctx.textAlign = 'left';
  labelled.forEach((s, i) => {
    const ly = top + 8 + i * 16;
    ctx.fillStyle = s.color || colors.line;
    ctx.fillRect(right - 110, ly - 5, 14, 3);
    ctx.fillStyle = colors.text;
    ctx.fillText(s.label, right - 90, ly);
  });
}

/** Download a text artifact. */
export function downloadText(text, filename, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  // Some browsers ignore clicks on detached links or cancel downloads whose URL is revoked at once.
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Module-worker RPC. The worker answers each {id, payload} with any number of {id, progress}
 * messages, then {id, result} or {id, error}.
 * run(payload, {onProgress, signal}) returns a promise. Workers cannot be preempted, so
 * aborting a call (or a worker error) terminates the worker and rejects every pending call;
 * the next run() starts a fresh worker. dispose() terminates it permanently.
 */
export function createWorkerClient(url, WorkerClass = Worker) {
  const pending = new Map();
  let worker = null, next = 0, disposed = false;

  function reset(error) {
    if (worker) worker.terminate();
    worker = null;
    const calls = [...pending.values()];
    pending.clear();
    for (const call of calls) call.fail(error);
  }

  function start() {
    const w = new WorkerClass(url, { type: 'module' });
    w.addEventListener('message', ({ data }) => {
      const call = pending.get(data?.id);
      if (!call) return;
      if ('progress' in data && !('result' in data) && !('error' in data)) {
        call.onProgress?.(data.progress);
        return;
      }
      call.finish();
      if (data.error != null) call.reject(new Error(String(data.error)));
      else call.resolve(data.result);
    });
    w.addEventListener('messageerror', () => reset(new Error('Worker message could not be deserialized')));
    w.addEventListener('error', event => {
      event.preventDefault?.();
      reset(new Error(event.message || 'Worker failed'));
    });
    return w;
  }

  return {
    run(payload, { onProgress, signal } = {}) {
      if (disposed) return Promise.reject(new Error('Worker client disposed'));
      if (signal?.aborted) return Promise.reject(new DOMException('Worker call aborted', 'AbortError'));
      worker ??= start();
      const id = ++next;
      return new Promise((resolve, reject) => {
        const onAbort = () => {
          const call = pending.get(id);
          if (!call) return;
          pending.delete(id);
          call.fail(new DOMException('Worker call aborted', 'AbortError'));
          reset(new Error('Worker restarted after an aborted call'));
        };
        const call = {
          resolve,
          reject,
          onProgress,
          finish() {
            pending.delete(id);
            signal?.removeEventListener('abort', onAbort);
          },
          fail(error) {
            this.finish();
            reject(error);
          },
        };
        pending.set(id, call);
        signal?.addEventListener('abort', onAbort, { once: true });
        try {
          worker.postMessage({ id, payload });
        } catch (error) {
          call.fail(error);
        }
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      reset(new Error('Worker client disposed'));
    },
  };
}
