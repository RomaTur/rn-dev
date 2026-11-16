import {
  connectWarehouse,
  createWarehouseStore,
  executeCommand,
  loadWarehouse,
  syncWarehouse,
  type WarehouseRuntime,
} from '../src/app/warehouse/store';
import { createSeed } from '../src/domain/seed';

test('screens receive saved snapshots and stay busy until all outstanding operations settle', async () => {
  const seed = createSeed();
  const saved = { ...seed, revision: seed.revision + 1 };
  let current = seed;
  let notify = () => {};
  let finishSync = () => {};
  const unsubscribe = jest.fn();
  const runtime: WarehouseRuntime = {
    load: async () => seed,
    getSnapshot: () => current,
    subscribe: listener => {
      notify = listener;
      return unsubscribe;
    },
    execute: async () => {
      current = saved;
      notify();
    },
    sync: () => new Promise<void>(resolve => (finishSync = resolve)),
  };
  const store = createWarehouseStore(runtime);
  const disconnect = connectWarehouse(store, runtime);
  await store.dispatch(loadWarehouse());
  expect(store.getState().warehouse.snapshot).toBe(seed);

  const exchange = store.dispatch(syncWarehouse());
  const edit = store.dispatch(
    executeCommand({ type: 'begin', jobKey: seed.jobs[0].key }),
  );
  expect(store.getState().warehouse.pendingOperations).toBe(2);
  await edit;
  expect(store.getState().warehouse.snapshot).toBe(saved);
  expect(store.getState().warehouse.pendingOperations).toBe(1);
  finishSync();
  await exchange;
  expect(store.getState().warehouse.pendingOperations).toBe(0);
  disconnect();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});
