import { execute } from '../src/domain/engine';
import { createSeed } from '../src/domain/seed';
import type { Command, Warehouse } from '../src/domain/types';
import type { QualityCommand } from '../src/quality/types';
import { decodeSnapshot } from '../src/data/validation';
import type { Inspection, InspectionFields } from '../src/quality/types';

const ids = [
  'identity',
  'cracks',
  'chips',
  'stains',
  'dimensions',
  'moisture',
  'finish',
  'protection',
] as const;
const photo = {
  fileName: 'photo_12345678-1234-1234-1234-123456789abc.jpg',
  uri: 'file:///private/quality/photo_12345678-1234-1234-1234-123456789abc.jpg',
  category: 'identity' as const,
  caption: 'Образец',
  capturedAt: '2026-11-16T08:59:00.000Z',
};
function fields(): InspectionFields {
  return {
    inspectedQuantity: 5,
    processedOn: '2026-11-15',
    marking: 'WL-101',
    moisture: 8,
    length: 1200,
    width: 600,
    thickness: 28,
    checks: Object.fromEntries(
      ids.map(id => [id, { verdict: 'pass', reasons: [], comment: '' }]),
    ) as unknown as InspectionFields['checks'],
    photos: [{ ...photo }],
    summary: 'Проверено',
  };
}
function draft(state = createSeed()) {
  return apply(state, {
    type: 'quality.start',
    subjectKind: 'job',
    subjectKey: 'job-101',
    inspector: 'Инспектор',
  });
}
function update(state: Warehouse, patch: Partial<InspectionFields> = fields()) {
  return apply(state, {
    type: 'quality.update',
    inspectionKey: state.inspections[state.inspections.length - 1].key,
    patch,
  });
}
function sign(state: Warehouse, decision: 'released' | 'hold' = 'released') {
  return apply(state, {
    type: 'quality.sign',
    inspectionKey: state.inspections[state.inspections.length - 1].key,
    decision,
  });
}
function ready(state: Warehouse) {
  state = apply(state, { type: 'begin', jobKey: 'job-101' });
  state = apply(state, {
    type: 'count',
    jobKey: 'job-101',
    lineKey: 'line-1',
    quantity: 2,
    note: '',
  });
  state = apply(state, {
    type: 'count',
    jobKey: 'job-101',
    lineKey: 'line-2',
    quantity: 3,
    note: '',
  });
  state = apply(state, { type: 'finishPicking', jobKey: 'job-101' });
  return apply(state, {
    type: 'pack',
    jobKey: 'job-101',
    label: 'WL-101',
    massGrams: 100,
  });
}

const at = '2026-11-16T09:00:00.000Z';
function apply(state: Warehouse, command: Command | QualityCommand) {
  return execute(state, command as Command, {
    key: `qc-${state.revision + 1}`,
    at,
    expectedRevision: state.revision,
  });
}

test('creates a quality draft atomically with audit and outbox', () => {
  const before = createSeed();
  const state = apply(before, {
    type: 'quality.start',
    subjectKind: 'job',
    subjectKey: 'job-101',
    inspector: '  Инспектор  ',
  });
  expect(state).toMatchObject({
    format: 2,
    revision: 1,
    inspections: [
      { key: 'inspection-qc-1', inspector: 'Инспектор', status: 'draft' },
    ],
  });
  expect(state.outbox).toHaveLength(1);
  expect(state.activity).toHaveLength(1);
  expect(before.revision).toBe(0);
});

test('migrates v1 snapshots without losing warehouse data', () => {
  const legacy = { ...createSeed(), format: 1, inspections: undefined };
  expect(decodeSnapshot(JSON.stringify(legacy))).toEqual({
    ...legacy,
    format: 2,
    inspections: [],
  });
});

test.each(['', ' '])('rejects an absent inspector %j', inspector => {
  expect(() =>
    apply(createSeed(), {
      type: 'quality.start',
      subjectKind: 'job',
      subjectKey: 'job-101',
      inspector,
    }),
  ).toThrow(/инспектор/i);
});
test('rejects missing subjects and duplicate open drafts', () => {
  expect(() =>
    apply(createSeed(), {
      type: 'quality.start',
      subjectKind: 'lot',
      subjectKey: 'absent',
      inspector: 'Иван',
    }),
  ).toThrow();
  expect(() => draft(draft())).toThrow(/черновик/i);
});
test('deduplicates retried quality start without a second inspection', () => {
  const command: QualityCommand = {
    type: 'quality.start',
    subjectKind: 'job',
    subjectKey: 'job-101',
    inspector: 'Иван',
  };
  const context = { key: 'same', at, expectedRevision: 0 };
  const state = execute(createSeed(), command, context);
  expect(execute(state, command, context)).toBe(state);
});
test('blocks release and hold with missing evidence and answers', () => {
  const state = draft();
  expect(() => sign(state)).toThrow(/фото|критер|колич|дат|маркир/i);
  expect(() => sign(state, 'hold')).toThrow();
});
test.each<Partial<InspectionFields>>([
  { inspectedQuantity: 0 },
  { inspectedQuantity: 6 },
  { photos: [] },
  { marking: '' },
  { processedOn: '2026-11-17' },
  { processedOn: '2026-02-30' },
  { moisture: null },
  { length: null },
  { width: null },
  { thickness: null },
])('rejects an incomplete or invalid signed report: %j', patch => {
  expect(() => sign(update(draft(), { ...fields(), ...patch }))).toThrow();
});
test.each([NaN, Infinity, -1])(
  'rejects malformed measurement %s at update',
  moisture => {
    expect(() => update(draft(), { moisture })).toThrow();
  },
);
test.each<Partial<InspectionFields>>([
  { moisture: 13 },
  { moisture: 5 },
  { length: 1203 },
  { width: 603 },
  { thickness: 31 },
])('computed measurements block release despite manual pass %j', patch => {
  const state = update(draft(), { ...fields(), ...patch });
  expect(() => sign(state)).toThrow(/влажност|размер|допуск/i);
  expect(sign(state, 'hold').inspections[0].status).toBe('hold');
});
test('requires an explanation for failed criteria and a hold summary', () => {
  const input = fields();
  input.checks.cracks.verdict = 'fail';
  expect(() => sign(update(draft(), input), 'hold')).toThrow(/пояс|причин/i);
  input.checks.cracks.comment = 'Трещина у торца';
  input.summary = '';
  expect(() => sign(update(draft(), input), 'hold')).toThrow(/заключ|итог/i);
  input.summary = 'Остановить отгрузку';
  expect(sign(update(draft(), input), 'hold').inspections[0].status).toBe(
    'hold',
  );
});
test('rejects arbitrary reasons and unknown checks', () => {
  const input = fields();
  input.checks.chips = { verdict: 'fail', reasons: ['unknown'], comment: 'x' };
  expect(() => update(draft(), input)).toThrow();
  expect(() =>
    update(draft(), {
      checks: {
        ...fields().checks,
        alien: { verdict: 'pass', reasons: [], comment: '' },
      } as InspectionFields['checks'],
    }),
  ).toThrow();
});
test('freezes signed report through API and clones nested input evidence', () => {
  const input = fields();
  const state = sign(update(draft(), input));
  input.photos[0].caption = 'tampered';
  input.checks.cracks.verdict = 'fail';
  expect(state.inspections[0].photos[0].caption).toBe('Образец');
  expect(state.inspections[0].checks.cracks.verdict).toBe('pass');
  expect(() => update(state, { summary: 'changed' })).toThrow(/подпис/i);
  expect(() => sign(state, 'hold')).toThrow(/подпис/i);
  expect(decodeSnapshot(JSON.stringify(state)).inspections[0]).toEqual(
    state.inspections[0],
  );
});
test('requires current QC release and preserves it through full requested picking', () => {
  expect(() =>
    apply(ready(createSeed()), { type: 'dispatch', jobKey: 'job-101' }),
  ).toThrow(/контрол|качеств/i);
  const state = ready(sign(update(draft())));
  expect(
    apply(state, { type: 'dispatch', jobKey: 'job-101' }).jobs[0].stage,
  ).toBe('dispatched');
});
test('latest hold invalidates an earlier release; a new draft does not', () => {
  let state = ready(sign(update(draft())));
  state = draft(state);
  expect(
    apply(state, { type: 'dispatch', jobKey: 'job-101' }).jobs[0].stage,
  ).toBe('dispatched');
  state = sign(update(state), 'hold');
  expect(() => apply(state, { type: 'dispatch', jobKey: 'job-101' })).toThrow(
    /контрол|качеств/i,
  );
});
test('recounting and stock adjustment invalidate earlier release', () => {
  let state = sign(update(draft()));
  state = apply(state, { type: 'begin', jobKey: 'job-101' });
  state = apply(state, {
    type: 'count',
    jobKey: 'job-101',
    lineKey: 'line-1',
    quantity: 1,
    note: 'Скол',
  });
  state = apply(state, {
    type: 'count',
    jobKey: 'job-101',
    lineKey: 'line-2',
    quantity: 3,
    note: '',
  });
  state = apply(state, { type: 'finishPicking', jobKey: 'job-101' });
  state = apply(state, {
    type: 'pack',
    jobKey: 'job-101',
    label: 'WL',
    massGrams: 1,
  });
  expect(() => apply(state, { type: 'dispatch', jobKey: 'job-101' })).toThrow(
    /контрол|качеств/i,
  );
  const adjusted = apply(ready(sign(update(draft()))), {
    type: 'adjust',
    lotKey: 'lot-tabletop-oak',
    quantity: 11,
    reason: 'Пересчёт',
  });
  expect(() =>
    apply(adjusted, { type: 'dispatch', jobKey: 'job-101' }),
  ).toThrow(/контрол|качеств/i);
});
test('refuses signing when the subject changed after the draft opened', () => {
  let state = update(draft());
  state = apply(state, {
    type: 'adjust',
    lotKey: 'lot-tabletop-oak',
    quantity: 11,
    reason: 'Пересчёт',
  });
  expect(() => sign(state)).toThrow(/измен|повтор/i);
});
test('allows a replacement draft after a changed subject without erasing the old draft', () => {
  let state = update(draft());
  state = apply(state, {
    type: 'adjust',
    lotKey: 'lot-tabletop-oak',
    quantity: 11,
    reason: 'Пересчёт',
  });
  state = draft(state);
  expect(state.inspections).toHaveLength(2);
  expect(decodeSnapshot(JSON.stringify(state)).inspections).toHaveLength(2);
  state = sign(update(state));
  expect(state.inspections[1].status).toBe('released');
});
test('signed evidence is independent of an earlier editable snapshot', () => {
  const editable = update(draft());
  const signed = sign(editable);
  editable.inspections[0].photos[0].caption = 'changed';
  expect(signed.inspections[0].photos[0].caption).toBe('Образец');
});
test('rejects unowned photo paths and future captures', () => {
  expect(() =>
    update(draft(), { photos: [{ ...photo, fileName: '../../external.jpg' }] }),
  ).toThrow();
  expect(() =>
    update(draft(), {
      photos: [{ ...photo, uri: 'https://example.com/a.jpg' }],
    }),
  ).toThrow();
  expect(() =>
    sign(
      update(draft(), {
        ...fields(),
        photos: [{ ...photo, capturedAt: '2026-11-17T00:00:00Z' }],
      }),
    ),
  ).toThrow();
});
test('uses product-specific labelled demo limits for raw materials', () => {
  const state = apply(createSeed(), {
    type: 'quality.start',
    subjectKind: 'lot',
    subjectKey: 'lot-oak-raw',
    inspector: 'Иван',
  });
  expect(state.inspections[0].profile).toMatchObject({
    nominalLength: 2500,
    nominalWidth: 180,
    nominalThickness: 50,
    label: expect.stringMatching(/ДЕМО.*RAW-OAK-50/),
  });
});
test.each<(inspection: Inspection) => void>([
  i => {
    i.status = 'unknown' as Inspection['status'];
  },
  i => {
    i.photos[0].category = 'unknown' as (typeof i.photos)[0]['category'];
  },
  i => {
    i.profile.moistureMax = NaN;
  },
  i => {
    i.subjectKey = 'missing';
  },
  i => {
    i.signedAt = null;
  },
  i => {
    i.checks.identity.verdict = 'pending';
  },
  i => {
    i.subjectFingerprint = 'not-a-fingerprint';
  },
])('rejects corrupt nested persisted quality state', mutate => {
  const state = sign(update(draft()));
  mutate(state.inspections[0]);
  expect(() => decodeSnapshot(JSON.stringify(state))).toThrow(/snapshot/i);
});
test('rejects unknown persisted quality commands and missing inspection references', () => {
  const state = update(draft());
  const last = state.outbox[state.outbox.length - 1];
  (last.command as { inspectionKey: string }).inspectionKey = 'missing';
  expect(() => decodeSnapshot(JSON.stringify(state))).toThrow(/snapshot/i);
});
test('migrates pending commands and already-dispatched legacy jobs', () => {
  const state = ready(createSeed());
  state.jobs[0].stage = 'dispatched';
  state.jobs[0].dispatchedAt = at;
  const legacy = { ...state, format: 1, inspections: undefined };
  const migrated = decodeSnapshot(JSON.stringify(legacy));
  expect(migrated.outbox).toEqual(state.outbox);
  expect(migrated.applied).toEqual(state.applied);
  expect(migrated.jobs[0].stage).toBe('dispatched');
  expect(migrated.inspections).toEqual([]);
});

test('rejects impossible capture dates rather than normalizing them to March', () => {
  const state = draft();
  expect(() =>
    update(state, {
      photos: [{ ...photo, capturedAt: '2026-02-30T08:00:00.000Z' }],
    }),
  ).toThrow(/время/i);
});
test('rejects an impossible inspection command date', () => {
  expect(() =>
    execute(
      createSeed(),
      {
        type: 'quality.start',
        subjectKind: 'job',
        subjectKey: 'job-101',
        inspector: 'Инспектор',
      },
      {
        key: 'invalid-date',
        at: '2026-02-30T08:00:00.000Z',
        expectedRevision: 0,
      },
    ),
  ).toThrow(/время/i);
});
test('rejects orphan inspections without an applied creation command', () => {
  const state = createSeed();
  state.inspections = draft().inspections;
  expect(() => decodeSnapshot(JSON.stringify(state))).toThrow(/snapshot/i);
});
test('rejects an impossible inspection reference in the audit trail', () => {
  const state = draft();
  state.activity[0].jobKey = 'missing';
  expect(() => decodeSnapshot(JSON.stringify(state))).toThrow(/snapshot/i);
});
test('allows twenty owned photos and rejects a twenty-first', () => {
  const photos = Array.from({ length: 21 }, (_, index) => {
    const fileName = `photo_${index
      .toString(16)
      .padStart(8, '0')}-1234-1234-1234-123456789abc.jpg`;
    return { ...photo, fileName, uri: `file:///private/quality/${fileName}` };
  });
  const state = draft();
  expect(
    update(state, { photos: photos.slice(0, 20) }).inspections[0].photos,
  ).toHaveLength(20);
  expect(() => update(state, { photos })).toThrow(/20/);
});

test('keeps frozen profile validation independent of JSON object property order', () => {
  const state = sign(update(draft()));
  const profile = state.inspections[0].profile;
  state.inspections[0].profile = {
    nominalThickness: profile.nominalThickness,
    nominalWidth: profile.nominalWidth,
    nominalLength: profile.nominalLength,
    tolerance: profile.tolerance,
    moistureMax: profile.moistureMax,
    moistureMin: profile.moistureMin,
    label: profile.label,
  };
  expect(decodeSnapshot(JSON.stringify(state)).inspections[0].status).toBe(
    'released',
  );
});

test.each(['comment', 'caption', 'summary'] as const)(
  'refuses immutable signing when %s exceeds native report limits',
  field => {
    let state = update(draft());
    const item = state.inspections[0];
    const patch: Partial<InspectionFields> =
      field === 'comment'
        ? {
            checks: {
              ...item.checks,
              cracks: { ...item.checks.cracks, comment: 'x'.repeat(4000) },
            },
          }
        : field === 'caption'
        ? { photos: [{ ...photo, caption: 'x'.repeat(2000) }] }
        : { summary: 'x'.repeat(4000) };
    state = update(state, patch);
    expect(() => sign(state)).toThrow(/PDF|отчёт/i);
    expect(state.inspections[0].status).toBe('draft');
  },
);
