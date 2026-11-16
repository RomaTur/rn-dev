import { WarehouseController } from '../src/data/controller';
import { LocalSyncSimulator } from '../src/data/simulator';
import { decodeSnapshot } from '../src/data/validation';
import type {
  Command,
  Envelope,
  SnapshotStore,
  Transport,
  Warehouse,
} from '../src/domain/types';

class MemoryStore implements SnapshotStore {
  value: string | null = null;
  failNextWrite = false;
  async read() {
    return this.value;
  }
  async write(value: string) {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error('Storage unavailable');
    }
    this.value = value;
  }
}

const initial = (): Warehouse => ({
  format: 2,
  inspections: [],
  revision: 0,
  stock: [
    {
      key: 'lot-oak',
      sku: 'OAK',
      label: 'Oak board',
      kind: 'finished',
      species: 'Oak',
      size: '20 × 100 × 500 mm',
      location: 'A-01',
      quantity: 20,
    },
  ],
  jobs: [
    {
      key: 'job-one',
      reference: 'WD-001',
      recipient: 'Small workshop',
      destination: 'Loading bay',
      due: '2026-11-16',
      priority: 'normal',
      stage: 'queued',
      revision: 0,
      lines: [
        {
          key: 'line-one',
          sku: 'OAK',
          label: 'Oak board',
          location: 'A-01',
          requested: 3,
          picked: 0,
          counted: false,
          shortageNote: '',
        },
      ],
      parcel: null,
      dispatchedAt: null,
    },
  ],
  activity: [],
  outbox: [],
  applied: [],
});
const receipt = (sku: string): Command => ({
  type: 'receive',
  lot: {
    sku,
    label: `Timber ${sku}`,
    kind: 'raw',
    species: 'Pine',
    size: '40 × 100 × 1000 mm',
    location: 'R-01',
    quantity: 5,
  },
});
const context = () => {
  let number = 0;
  return () => ({ key: `event-${++number}`, at: '2026-11-16T08:00:00.000Z' });
};
const setup = () => {
  const local = new MemoryStore();
  const remote = new MemoryStore();
  const simulator = new LocalSyncSimulator(remote);
  const controller = new WarehouseController(
    local,
    simulator,
    initial,
    context(),
  );
  return { local, remote, simulator, controller };
};

describe('snapshot validation', () => {
  test('rejects corrupt JSON and unsupported formats', () => {
    expect(() => decodeSnapshot('{broken')).toThrow(/snapshot/i);
    expect(() =>
      decodeSnapshot(JSON.stringify({ ...initial(), format: 3 })),
    ).toThrow(/snapshot/i);
  });
  test('rejects unsafe quantities, unknown stages and inconsistent reservations', () => {
    const unsafe = initial();
    unsafe.stock[0].quantity = Number.MAX_SAFE_INTEGER + 1;
    expect(() => decodeSnapshot(JSON.stringify(unsafe))).toThrow(/snapshot/i);
    const stage = initial();
    (stage.jobs[0] as unknown as { stage: string }).stage = 'lost';
    expect(() => decodeSnapshot(JSON.stringify(stage))).toThrow(/snapshot/i);
    const shortage = initial();
    shortage.jobs[0].stage = 'picking';
    shortage.jobs[0].lines[0].picked = 3;
    shortage.jobs[0].lines[0].counted = true;
    shortage.stock[0].quantity = 2;
    expect(() => decodeSnapshot(JSON.stringify(shortage))).toThrow(/snapshot/i);
  });
  test('rejects duplicate keys and impossible stage details', () => {
    const duplicate = initial();
    duplicate.stock.push({ ...duplicate.stock[0] });
    expect(() => decodeSnapshot(JSON.stringify(duplicate))).toThrow(
      /snapshot/i,
    );
    const ready = initial();
    ready.jobs[0].stage = 'ready';
    expect(() => decodeSnapshot(JSON.stringify(ready))).toThrow(/snapshot/i);
  });
});

describe('durable application controller', () => {
  test('loads a saved snapshot after a new controller is created', async () => {
    const { local, simulator, controller } = setup();
    await controller.load();
    await controller.execute({ type: 'begin', jobKey: 'job-one' });
    const restarted = new WarehouseController(
      local,
      simulator,
      initial,
      context(),
    );
    expect((await restarted.load()).jobs[0].stage).toBe('picking');
    expect(restarted.getSnapshot().outbox).toHaveLength(1);
  });
  test('preserves corrupt persisted data and reports it instead of resetting', async () => {
    const { local, controller } = setup();
    local.value = '{broken';
    await expect(controller.load()).rejects.toThrow(/snapshot/i);
    expect(local.value).toBe('{broken');
  });
  test('rejects duplicate stock SKU without replacing persisted data', async () => {
    const { local, controller } = setup();
    const corrupt = initial();
    corrupt.stock.push({
      ...corrupt.stock[0],
      key: 'lot-oak-duplicate',
      location: 'B-02',
    });
    const saved = JSON.stringify(corrupt);
    local.value = saved;
    const before = controller.getSnapshot();
    await expect(controller.load()).rejects.toThrow(/stock.*sku/i);
    expect(local.value).toBe(saved);
    expect(controller.getSnapshot()).toBe(before);
  });
  test('serializes concurrent operations without losing stock or outbox entries', async () => {
    const { controller, local } = setup();
    await controller.load();
    await Promise.all([
      controller.execute(receipt('RAW-A')),
      controller.execute(receipt('RAW-B')),
    ]);
    expect(controller.getSnapshot().revision).toBe(2);
    expect(controller.getSnapshot().outbox.map(item => item.revision)).toEqual([
      1, 2,
    ]);
    expect(decodeSnapshot(local.value!).stock.map(item => item.sku)).toEqual([
      'OAK',
      'RAW-A',
      'RAW-B',
    ]);
  });
  test('does not publish or mutate state when the durable write fails', async () => {
    const { controller, local } = setup();
    await controller.load();
    const before = controller.getSnapshot();
    const saved = local.value;
    let notifications = 0;
    controller.subscribe(() => {
      notifications += 1;
    });
    local.failNextWrite = true;
    await expect(controller.execute(receipt('RAW-A'))).rejects.toThrow(
      'Storage unavailable',
    );
    expect(controller.getSnapshot()).toBe(before);
    expect(local.value).toBe(saved);
    expect(notifications).toBe(0);
    await controller.execute(receipt('RAW-B'));
    expect(controller.getSnapshot().revision).toBe(1);
  });
  test('queues edits behind in-flight sync and publishes both without lost updates', async () => {
    const local = new MemoryStore();
    const remote = new LocalSyncSimulator(new MemoryStore());
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const transport: Transport = {
      async send(envelope) {
        await gate;
        return remote.send(envelope);
      },
    };
    const controller = new WarehouseController(
      local,
      transport,
      initial,
      context(),
    );
    await controller.load();
    await controller.execute(receipt('RAW-A'));
    const sending = controller.sync();
    const editing = controller.execute(receipt('RAW-B'));
    release();
    await Promise.all([sending, editing]);
    expect(controller.getSnapshot().stock.map(item => item.sku)).toEqual([
      'OAK',
      'RAW-A',
      'RAW-B',
    ]);
    expect(controller.getSnapshot().outbox.map(item => item.revision)).toEqual([
      2,
    ]);
  });
  test('persists offline attempts and retries the same operation after restart', async () => {
    const { controller, local, remote, simulator } = setup();
    await controller.load();
    await controller.execute(receipt('RAW-A'));
    simulator.setMode('offline');
    await expect(controller.sync()).rejects.toThrow(/недоступен/i);
    expect(decodeSnapshot(local.value!).outbox[0].attempts).toBe(1);
    const restarted = new WarehouseController(
      local,
      new LocalSyncSimulator(remote),
      initial,
      context(),
    );
    await restarted.load();
    await restarted.sync();
    expect(restarted.getSnapshot().outbox).toHaveLength(0);
    expect(restarted.getSnapshot().revision).toBe(1);
  });
  test('retries a server acknowledgement safely after a failed local save and restart', async () => {
    const { controller, local, remote } = setup();
    await controller.load();
    await controller.execute(receipt('RAW-A'));
    local.failNextWrite = true;
    await expect(controller.sync()).rejects.toThrow('Storage unavailable');
    expect(controller.getSnapshot().outbox).toHaveLength(1);
    const restarted = new WarehouseController(
      local,
      new LocalSyncSimulator(remote),
      initial,
      context(),
    );
    await restarted.load();
    await restarted.sync();
    expect(restarted.getSnapshot().outbox).toHaveLength(0);
    expect(
      restarted.getSnapshot().stock.filter(item => item.sku === 'RAW-A'),
    ).toHaveLength(1);
  });
  test('stops after conflict, retains later commands and can resume forced conflicts online', async () => {
    const { controller, simulator } = setup();
    await controller.load();
    await controller.execute(receipt('RAW-A'));
    await controller.execute(receipt('RAW-B'));
    simulator.setMode('conflict');
    await expect(controller.sync()).rejects.toThrow(/конфликт/i);
    expect(controller.getSnapshot().outbox.map(item => item.state)).toEqual([
      'conflict',
      'pending',
    ]);
    expect(controller.getSnapshot().outbox[1].attempts).toBe(0);
    simulator.setMode('online');
    await controller.sync();
    expect(controller.getSnapshot().outbox).toHaveLength(0);
  });
  test('serializes repeated sync calls so the queue is acknowledged once', async () => {
    const { controller } = setup();
    await controller.load();
    await controller.execute(receipt('RAW-A'));
    await Promise.all([
      controller.sync(),
      controller.sync(),
      controller.sync(),
    ]);
    expect(controller.getSnapshot().outbox).toHaveLength(0);
    expect(controller.getSnapshot().revision).toBe(1);
  });
});

describe('local remote simulator', () => {
  const envelope = (): Envelope => ({
    key: 'event-one',
    baseRevision: 0,
    revision: 1,
    command: receipt('RAW-A'),
    at: '2026-11-16T08:00:00.000Z',
    state: 'pending',
    attempts: 0,
  });
  test('persists idempotent receipts across simulator recreation', async () => {
    const store = new MemoryStore();
    const first = new LocalSyncSimulator(store);
    expect(await first.send(envelope())).toEqual({ kind: 'accepted' });
    const restarted = new LocalSyncSimulator(store);
    expect(
      await restarted.send({ ...envelope(), attempts: 4, state: 'conflict' }),
    ).toEqual({ kind: 'accepted' });
    expect(
      await restarted.send({
        ...envelope(),
        key: 'event-two',
        baseRevision: 1,
        revision: 2,
      }),
    ).toEqual({ kind: 'accepted' });
  });
  test('rejects reuse of an idempotency key for a different command', async () => {
    const simulator = new LocalSyncSimulator(new MemoryStore());
    await simulator.send(envelope());
    await expect(
      simulator.send({ ...envelope(), command: receipt('RAW-B') }),
    ).rejects.toThrow(/key|payload|different/i);
  });
  test('returns real revision conflicts without accepting a later operation', async () => {
    const simulator = new LocalSyncSimulator(new MemoryStore());
    expect(
      await simulator.send({ ...envelope(), baseRevision: 1, revision: 2 }),
    ).toEqual({ kind: 'conflict', remoteRevision: 0 });
    expect(await simulator.send(envelope())).toEqual({ kind: 'accepted' });
  });
});
