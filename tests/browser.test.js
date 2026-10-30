import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, createWorkerClient } from '../src/browser.js';

class FakeWorker {
  static instances = [];
  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.handlers = {};
    this.sent = [];
    FakeWorker.instances.push(this);
  }
  addEventListener(name, fn) { this.handlers[name] = fn; }
  postMessage(data) { this.sent.push(data); }
  terminate() { this.terminated = true; }
  reply(data) { this.handlers.message({ data }); }
  get lastId() { return this.sent.at(-1).id; }
}

test('store notifies subscribers until they unsubscribe', () => {
  const store = createStore({ value: 1 }), seen = [];
  const unsubscribe = store.subscribe(s => seen.push(s.value));
  store.set({ value: 2 });
  unsubscribe();
  store.set({ value: 3 });
  assert.deepEqual(seen, [2]);
  assert.equal(store.get().value, 3);
});

test('worker client correlates results, progress, and errors', async () => {
  FakeWorker.instances = [];
  const client = createWorkerClient('worker.js', FakeWorker), progress = [];
  const first = client.run({ a: 1 }, { onProgress: p => progress.push(p) });
  const worker = FakeWorker.instances[0];
  assert.deepEqual(worker.options, { type: 'module' });
  const id = worker.lastId;
  worker.reply({ id, progress: 0.5 });
  worker.reply({ id, result: 42 });
  assert.equal(await first, 42);
  assert.deepEqual(progress, [0.5]);
  const failing = client.run({});
  worker.reply({ id: worker.lastId, error: 'boom' });
  await assert.rejects(failing, /boom/);
});

test('aborting a call restarts the worker; dispose is permanent', async () => {
  FakeWorker.instances = [];
  const client = createWorkerClient('worker.js', FakeWorker), controller = new AbortController();
  const aborted = client.run({}, { signal: controller.signal }), other = client.run({});
  controller.abort();
  await assert.rejects(aborted, { name: 'AbortError' });
  await assert.rejects(other, /restarted/);
  assert.equal(FakeWorker.instances[0].terminated, true);
  const again = client.run({});
  const fresh = FakeWorker.instances[1];
  fresh.reply({ id: fresh.lastId, result: 'ok' });
  assert.equal(await again, 'ok');
  const pending = client.run({});
  client.dispose();
  await assert.rejects(pending, /disposed/);
  assert.equal(fresh.terminated, true);
  await assert.rejects(client.run({}), /disposed/);
});

test('worker errors reject pending calls', async () => {
  FakeWorker.instances = [];
  const client = createWorkerClient('worker.js', FakeWorker), pending = client.run({});
  FakeWorker.instances[0].handlers.error({ message: 'crashed' });
  await assert.rejects(pending, /crashed/);
});
