import { execute, reservedQuantity } from '../src/domain/engine';
import { createSeed } from '../src/domain/seed';
import type { Command, StockLot, Warehouse } from '../src/domain/types';
import type { InspectionFields } from '../src/quality/types';

const at = '2026-11-16T09:00:00.000Z';
const jobKey = 'job-101';
const oakSku = 'TOP-OAK-120';
const shelfSku = 'SHELF-PINE-80';

function apply(state: Warehouse, command: Command): Warehouse {
  return execute(state, command, {
    key: `command-${state.revision + 1}`,
    at,
    expectedRevision: state.revision,
  });
}

function counted(first = 2, second = 3, note = ''): Warehouse {
  let state = apply(createSeed(), { type: 'begin', jobKey });
  state = apply(state, {
    type: 'count',
    jobKey,
    lineKey: 'line-1',
    quantity: first,
    note,
  });
  return apply(state, {
    type: 'count',
    jobKey,
    lineKey: 'line-2',
    quantity: second,
    note,
  });
}

function ready(first = 2, second = 3, note = ''): Warehouse {
  const state = apply(counted(first, second, note), {
    type: 'finishPicking',
    jobKey,
  });
  return apply(state, {
    type: 'pack',
    jobKey,
    label: 'WL-101',
    massGrams: 18500,
  });
}

function quantity(state: Warehouse, sku: string): number {
  return state.stock
    .filter(lot => lot.sku === sku)
    .reduce((sum, lot) => sum + lot.quantity, 0);
}

function release(state: Warehouse): Warehouse {
  state = apply(state, {
    type: 'quality.start',
    subjectKind: 'job',
    subjectKey: jobKey,
    inspector: 'Инспектор',
  });
  const inspection = state.inspections[state.inspections.length - 1];
  const checks = Object.fromEntries(
    [
      'identity',
      'cracks',
      'chips',
      'stains',
      'dimensions',
      'moisture',
      'finish',
      'protection',
    ].map(id => [id, { verdict: 'pass', reasons: [], comment: '' }]),
  ) as unknown as InspectionFields['checks'];
  state = apply(state, {
    type: 'quality.update',
    inspectionKey: inspection.key,
    patch: {
      inspectedQuantity: state.jobs[0].lines.reduce(
        (total, line) => total + line.picked,
        0,
      ),
      processedOn: '2026-11-16',
      marking: 'WL-101',
      moisture: 8,
      length: 1200,
      width: 600,
      thickness: 28,
      checks,
      photos: [
        {
          fileName: 'photo_12345678-1234-1234-1234-123456789abc.jpg',
          uri: 'file:///private/quality/photo_12345678-1234-1234-1234-123456789abc.jpg',
          category: 'identity',
          caption: 'Образец',
          capturedAt: at,
        },
      ],
    },
  });
  return apply(state, {
    type: 'quality.sign',
    inspectionKey: inspection.key,
    decision: 'released',
  });
}

function receipt(): Omit<StockLot, 'key'> {
  return {
    sku: ' RAW-BIRCH-20 ',
    label: ' Берёзовая доска ',
    kind: 'raw',
    species: ' Берёза ',
    size: ' 20 × 100 × 2000 мм ',
    location: ' С-03 ',
    quantity: 8,
  };
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

describe('warehouse commands', () => {
  it('provides isolated stock sufficient to fulfil every seeded outbound line', () => {
    const state = createSeed();
    expect(state.stock).toHaveLength(6);
    expect(state.jobs).toHaveLength(3);
    expect(state.jobs.every(job => job.stage === 'queued')).toBe(true);
    for (const job of state.jobs) {
      for (const line of job.lines) {
        expect(
          state.stock.some(
            lot =>
              lot.kind === 'finished' &&
              lot.sku === line.sku &&
              lot.quantity >= line.requested,
          ),
        ).toBe(true);
      }
    }
    state.stock[0].quantity = 0;
    state.jobs[0].lines[0].picked = 1;
    expect(createSeed().stock[0].quantity).toBeGreaterThan(0);
    expect(createSeed().jobs[0].lines[0].picked).toBe(0);
  });

  it('starts picking and records its revision, activity and pending command together', () => {
    const state = apply(freeze(createSeed()), { type: 'begin', jobKey });
    expect(state.jobs[0]).toMatchObject({ stage: 'picking', revision: 1 });
    expect(state.revision).toBe(1);
    expect(state.activity).toEqual([
      expect.objectContaining({ jobKey, at, description: expect.any(String) }),
    ]);
    expect(state.outbox).toEqual([
      {
        key: 'command-1',
        baseRevision: 0,
        revision: 1,
        command: { type: 'begin', jobKey },
        at,
        state: 'pending',
        attempts: 0,
      },
    ]);
    expect(state.applied).toEqual(['command-1']);
  });

  it('deduplicates an applied command even when its expected revision is now stale', () => {
    const context = { key: 'same-command', at, expectedRevision: 0 };
    const next = execute(createSeed(), { type: 'begin', jobKey }, context);
    expect(execute(next, { type: 'begin', jobKey }, context)).toBe(next);
    expect(next.outbox).toHaveLength(1);
    expect(next.activity).toHaveLength(1);
  });

  it('rejects a new command carrying a stale global revision without changing stock or work', () => {
    const state = freeze(apply(createSeed(), { type: 'begin', jobKey }));
    expect(() =>
      execute(
        state,
        { type: 'count', jobKey, lineKey: 'line-1', quantity: 2, note: '' },
        { key: 'stale', at, expectedRevision: 0 },
      ),
    ).toThrow(/верси|устар/i);
    expect(state.revision).toBe(1);
    expect(state.jobs[0].lines[0].picked).toBe(0);
  });

  it.each(['', '  '])('rejects an empty command identifier %j', key => {
    expect(() =>
      execute(
        createSeed(),
        { type: 'begin', jobKey },
        { key, at, expectedRevision: 0 },
      ),
    ).toThrow();
  });

  it.each<Command>([
    { type: 'count', jobKey, lineKey: 'line-1', quantity: 1, note: '' },
    { type: 'finishPicking', jobKey },
    { type: 'pack', jobKey, label: 'WL-101', massGrams: 1 },
    { type: 'dispatch', jobKey },
  ])('rejects an illegal queued-to-$type transition', command => {
    expect(() => apply(freeze(createSeed()), command)).toThrow();
  });

  it('rejects beginning an already active job and unknown job or line identifiers', () => {
    const state = apply(createSeed(), { type: 'begin', jobKey });
    expect(() => apply(state, { type: 'begin', jobKey })).toThrow();
    expect(() => apply(state, { type: 'begin', jobKey: 'missing' })).toThrow();
    expect(() =>
      apply(state, {
        type: 'count',
        jobKey,
        lineKey: 'missing',
        quantity: 1,
        note: '',
      }),
    ).toThrow();
  });

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 3])(
    'rejects invalid or excessive picked quantity %s',
    value => {
      const state = freeze(apply(createSeed(), { type: 'begin', jobKey }));
      expect(() =>
        apply(state, {
          type: 'count',
          jobKey,
          lineKey: 'line-1',
          quantity: value,
          note: '',
        }),
      ).toThrow();
      expect(state.jobs[0].lines[0]).toMatchObject({
        picked: 0,
        counted: false,
      });
    },
  );

  it('accepts a counted zero, trims shortage notes and keeps the submitted command independent', () => {
    const state = apply(createSeed(), { type: 'begin', jobKey });
    const command: Command = {
      type: 'count',
      jobKey,
      lineKey: 'line-1',
      quantity: 0,
      note: '  Повреждена кромка  ',
    };
    const next = apply(state, command);
    command.note = 'changed later';
    expect(next.jobs[0].lines[0]).toMatchObject({
      picked: 0,
      counted: true,
      shortageNote: 'Повреждена кромка',
    });
    expect(next.outbox[1].command).toMatchObject({ note: 'Повреждена кромка' });
  });

  it('reserves counted pieces without physically deducting stock, and recounting releases them', () => {
    const state = counted();
    expect(reservedQuantity(state, oakSku)).toBe(2);
    expect(reservedQuantity(state, shelfSku)).toBe(3);
    expect(quantity(state, oakSku)).toBe(12);
    const next = apply(state, {
      type: 'count',
      jobKey,
      lineKey: 'line-1',
      quantity: 1,
      note: 'Скол',
    });
    expect(reservedQuantity(next, oakSku)).toBe(1);
  });

  it('prevents another job from consuming stock reserved by the first job', () => {
    let state = createSeed();
    state.stock.find(lot => lot.sku === oakSku)!.quantity = 4;
    state = apply(state, { type: 'begin', jobKey });
    state = apply(state, {
      type: 'count',
      jobKey,
      lineKey: 'line-1',
      quantity: 2,
      note: '',
    });
    state = apply(state, { type: 'begin', jobKey: 'job-103' });
    expect(() =>
      apply(state, {
        type: 'count',
        jobKey: 'job-103',
        lineKey: 'line-5',
        quantity: 3,
        note: '',
      }),
    ).toThrow(/остат|доступ|резерв/i);
    state = apply(state, {
      type: 'count',
      jobKey: 'job-103',
      lineKey: 'line-5',
      quantity: 2,
      note: 'Не хватает',
    });
    expect(reservedQuantity(state, oakSku)).toBe(4);
  });

  it('includes other same-SKU lines of the current job in its reservation check', () => {
    let state = createSeed();
    state.stock.find(lot => lot.sku === oakSku)!.quantity = 3;
    state.jobs[0].lines[1].sku = oakSku;
    state = apply(state, { type: 'begin', jobKey });
    state = apply(state, {
      type: 'count',
      jobKey,
      lineKey: 'line-1',
      quantity: 2,
      note: '',
    });
    expect(() =>
      apply(state, {
        type: 'count',
        jobKey,
        lineKey: 'line-2',
        quantity: 2,
        note: '',
      }),
    ).toThrow();
  });

  it('does not let raw materials fulfil a finished-product line', () => {
    let state = createSeed();
    state.stock.find(lot => lot.sku === oakSku)!.kind = 'raw';
    state = apply(state, { type: 'begin', jobKey });
    expect(() =>
      apply(state, {
        type: 'count',
        jobKey,
        lineKey: 'line-1',
        quantity: 1,
        note: '',
      }),
    ).toThrow();
  });

  it('requires every line to be counted before picking can finish', () => {
    let state = apply(createSeed(), { type: 'begin', jobKey });
    state = apply(state, {
      type: 'count',
      jobKey,
      lineKey: 'line-1',
      quantity: 2,
      note: '',
    });
    expect(() => apply(state, { type: 'finishPicking', jobKey })).toThrow(
      /строк|пересчит|подсчит/i,
    );
  });

  it('requires a nonempty reason on every short line, including a zero pick', () => {
    expect(() =>
      apply(counted(0, 3, '  '), { type: 'finishPicking', jobKey }),
    ).toThrow(/причин|расхожд/i);
    expect(() =>
      apply(counted(1, 3), { type: 'finishPicking', jobKey }),
    ).toThrow(/причин|расхожд/i);
    expect(
      apply(counted(0, 3, 'Нет пригодных изделий'), {
        type: 'finishPicking',
        jobKey,
      }).jobs[0].stage,
    ).toBe('packing');
  });

  it('prevents an empty shipment even when all shortages are explained', () => {
    expect(() =>
      apply(counted(0, 0, 'Не найдено'), { type: 'finishPicking', jobKey }),
    ).toThrow(/пуст|одн|ноль/i);
  });

  it.each([0, -1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid parcel mass %s',
    massGrams => {
      const state = apply(counted(), { type: 'finishPicking', jobKey });
      expect(() =>
        apply(state, { type: 'pack', jobKey, label: 'WL-101', massGrams }),
      ).toThrow();
    },
  );

  it('requires a parcel label and normalizes it before moving to ready', () => {
    const state = apply(counted(), { type: 'finishPicking', jobKey });
    expect(() =>
      apply(state, { type: 'pack', jobKey, label: '  ', massGrams: 5 }),
    ).toThrow();
    const next = apply(state, {
      type: 'pack',
      jobKey,
      label: '  WL-101  ',
      massGrams: 18500,
    });
    expect(next.jobs[0]).toMatchObject({
      stage: 'ready',
      parcel: { label: 'WL-101', massGrams: 18500 },
    });
    expect(reservedQuantity(next, oakSku)).toBe(2);
  });

  it('dispatches actual picked quantities once and releases their reservations', () => {
    const before = freeze(release(ready(1, 3, 'Скол на одном изделии')));
    const state = apply(before, { type: 'dispatch', jobKey });
    expect(state.jobs[0]).toMatchObject({
      stage: 'dispatched',
      dispatchedAt: at,
      revision: 6,
    });
    expect(quantity(state, oakSku)).toBe(11);
    expect(quantity(state, shelfSku)).toBe(27);
    expect(reservedQuantity(state, oakSku)).toBe(0);
    expect(state.revision).toBe(9);
    expect(state.activity).toHaveLength(9);
    expect(state.outbox).toHaveLength(9);
    expect(() => apply(state, { type: 'dispatch', jobKey })).toThrow();
    expect(quantity(before, oakSku)).toBe(12);
  });

  it('rejects dispatch atomically if one product no longer has enough stock', () => {
    const state = ready();
    state.stock.find(lot => lot.sku === shelfSku)!.quantity = 2;
    freeze(state);
    expect(() => apply(state, { type: 'dispatch', jobKey })).toThrow();
    expect(quantity(state, oakSku)).toBe(12);
    expect(state.jobs[0].stage).toBe('ready');
    expect(state.activity).toHaveLength(5);
    expect(state.outbox).toHaveLength(5);
  });

  it('checks aggregate same-SKU demand before atomically dispatching', () => {
    let state = createSeed();
    state.jobs[0].lines[1].sku = oakSku;
    state = apply(state, { type: 'begin', jobKey });
    state = apply(state, {
      type: 'count',
      jobKey,
      lineKey: 'line-1',
      quantity: 2,
      note: '',
    });
    state = apply(state, {
      type: 'count',
      jobKey,
      lineKey: 'line-2',
      quantity: 3,
      note: '',
    });
    state = apply(state, { type: 'finishPicking', jobKey });
    state = apply(state, {
      type: 'pack',
      jobKey,
      label: 'WL-101',
      massGrams: 1,
    });
    state = release(state);
    expect(quantity(apply(state, { type: 'dispatch', jobKey }), oakSku)).toBe(
      7,
    );
    state.stock.find(lot => lot.sku === oakSku)!.quantity = 4;
    expect(() => apply(state, { type: 'dispatch', jobKey })).toThrow();
  });

  it.each(['raw', 'finished'] as const)(
    'receives a new %s lot with normalized fields and an independent command copy',
    kind => {
      const lot = { ...receipt(), kind };
      const state = apply(freeze(createSeed()), { type: 'receive', lot });
      lot.quantity = 99;
      expect(state.stock).toHaveLength(7);
      expect(state.stock[6]).toMatchObject({
        key: expect.any(String),
        sku: 'RAW-BIRCH-20',
        label: 'Берёзовая доска',
        species: 'Берёза',
        location: 'С-03',
        quantity: 8,
        kind,
      });
      expect(state.revision).toBe(1);
      expect(state.jobs[0].revision).toBe(0);
      expect(state.activity[0].jobKey).toBe(state.stock[6].key);
      expect(state.outbox[0].command).toMatchObject({
        type: 'receive',
        lot: { quantity: 8, sku: 'RAW-BIRCH-20' },
      });
    },
  );

  it.each([0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid receipt quantity %s',
    value => {
      expect(() =>
        apply(createSeed(), {
          type: 'receive',
          lot: { ...receipt(), quantity: value },
        }),
      ).toThrow();
    },
  );

  it.each(['sku', 'label', 'species', 'size', 'location'] as const)(
    'rejects an empty receipt %s field',
    field => {
      expect(() =>
        apply(createSeed(), {
          type: 'receive',
          lot: { ...receipt(), [field]: '  ' },
        }),
      ).toThrow();
    },
  );

  it('rejects duplicate SKU receipts so each catalogue SKU stays unambiguous', () => {
    expect(() =>
      apply(createSeed(), {
        type: 'receive',
        lot: { ...receipt(), sku: ` ${oakSku} ` },
      }),
    ).toThrow(/артикул|SKU|существ/i);
  });

  it('counts stock to an absolute quantity with a reason and cannot erase active reservations', () => {
    const before = ready();
    expect(() =>
      apply(before, {
        type: 'adjust',
        lotKey: 'lot-tabletop-oak',
        quantity: 1,
        reason: 'Пересчёт',
      }),
    ).toThrow(/резерв/i);
    expect(() =>
      apply(before, {
        type: 'adjust',
        lotKey: 'lot-tabletop-oak',
        quantity: 2,
        reason: '  ',
      }),
    ).toThrow();
    const state = apply(freeze(before), {
      type: 'adjust',
      lotKey: 'lot-tabletop-oak',
      quantity: 2,
      reason: '  Пересчёт стеллажа  ',
    });
    expect(quantity(state, oakSku)).toBe(2);
    expect(state.jobs[0].revision).toBe(5);
    expect(state.outbox[5].command).toMatchObject({
      reason: 'Пересчёт стеллажа',
    });
    expect(state.activity[5].description).toContain('Пересчёт стеллажа');
    const dispatched = apply(release(state), { type: 'dispatch', jobKey });
    expect(quantity(dispatched, oakSku)).toBe(0);
  });

  it('allows an unreserved lot to be reconciled to zero and rejects unknown lots', () => {
    const state = apply(createSeed(), {
      type: 'adjust',
      lotKey: 'lot-oak-raw',
      quantity: 0,
      reason: 'Передано в производство',
    });
    expect(state.stock.find(lot => lot.key === 'lot-oak-raw')!.quantity).toBe(
      0,
    );
    expect(() =>
      apply(state, {
        type: 'adjust',
        lotKey: 'missing',
        quantity: 0,
        reason: 'Пересчёт',
      }),
    ).toThrow();
  });

  it.each([-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid stock reconciliation quantity %s',
    value => {
      expect(() =>
        apply(createSeed(), {
          type: 'adjust',
          lotKey: 'lot-oak-raw',
          quantity: value,
          reason: 'Пересчёт',
        }),
      ).toThrow();
    },
  );
});
