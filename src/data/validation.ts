import type { Command, Envelope, Warehouse } from '../domain/types';
import { validateInspection, validateQualityCommand } from '../quality/engine';

type RecordValue = Record<string, unknown>;

function requireValue(condition: unknown, path: string): asserts condition {
  if (!condition) throw new Error(`Invalid snapshot: ${path}`);
}
function record(value: unknown, path: string): RecordValue {
  requireValue(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    path,
  );
  return value as RecordValue;
}
function text(
  value: unknown,
  path: string,
  empty = false,
): asserts value is string {
  requireValue(
    typeof value === 'string' && (empty || value.trim().length > 0),
    path,
  );
}
function integer(
  value: unknown,
  path: string,
  minimum = 0,
): asserts value is number {
  requireValue(
    typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= minimum,
    path,
  );
}
function list(value: unknown, path: string): asserts value is unknown[] {
  requireValue(Array.isArray(value), path);
}
function timestamp(value: unknown, path: string): asserts value is string {
  text(value, path);
  requireValue(Number.isFinite(Date.parse(value)), path);
}
function unique(values: string[], path: string) {
  requireValue(
    new Set(values).size === values.length,
    `${path} contains duplicate keys`,
  );
}
function lot(value: unknown, path: string, includeKey: boolean) {
  const item = record(value, path);
  if (includeKey) text(item.key, `${path}.key`);
  for (const field of ['sku', 'label', 'species', 'size', 'location'])
    text(item[field], `${path}.${field}`);
  requireValue(item.kind === 'raw' || item.kind === 'finished', `${path}.kind`);
  integer(item.quantity, `${path}.quantity`, includeKey ? 0 : 1);
}

export function validateCommand(value: unknown): asserts value is Command {
  const command = record(value, 'command');
  switch (command.type) {
    case 'quality.start':
    case 'quality.update':
    case 'quality.sign':
      try {
        validateQualityCommand(command);
      } catch {
        throw new Error('Invalid snapshot: quality command');
      }
      break;
    case 'begin':
    case 'finishPicking':
    case 'dispatch':
      text(command.jobKey, 'command.jobKey');
      break;
    case 'count':
      text(command.jobKey, 'command.jobKey');
      text(command.lineKey, 'command.lineKey');
      integer(command.quantity, 'command.quantity');
      text(command.note, 'command.note', true);
      break;
    case 'pack':
      text(command.jobKey, 'command.jobKey');
      text(command.label, 'command.label');
      integer(command.massGrams, 'command.massGrams', 1);
      break;
    case 'receive':
      lot(command.lot, 'command.lot', false);
      break;
    case 'adjust':
      text(command.lotKey, 'command.lotKey');
      integer(command.quantity, 'command.quantity');
      text(command.reason, 'command.reason');
      break;
    default:
      throw new Error('Invalid snapshot: unknown command type');
  }
}

export function validateEnvelope(value: unknown): asserts value is Envelope {
  const item = record(value, 'outbox item');
  text(item.key, 'outbox.key');
  integer(item.baseRevision, 'outbox.baseRevision');
  integer(item.revision, 'outbox.revision', 1);
  requireValue(
    item.revision === item.baseRevision + 1,
    'outbox revision sequence',
  );
  timestamp(item.at, 'outbox.at');
  integer(item.attempts, 'outbox.attempts');
  requireValue(
    item.state === 'pending' || item.state === 'conflict',
    'outbox.state',
  );
  validateCommand(item.command);
}

/** Decode persisted data only after checking every field used by the application. */
export function decodeSnapshot(raw: string): Warehouse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid snapshot: unreadable JSON');
  }
  const state = record(parsed, 'root');
  requireValue(state.format === 1 || state.format === 2, 'unsupported format');
  if (state.format === 1) {
    requireValue(
      !Object.hasOwn(state, 'inspections'),
      'legacy snapshot contains quality data',
    );
    state.format = 2;
    state.inspections = [];
  }
  integer(state.revision, 'revision');
  const revision = state.revision;
  for (const field of [
    'stock',
    'jobs',
    'activity',
    'outbox',
    'applied',
    'inspections',
  ])
    list(state[field], field);
  const stock = state.stock as unknown[];
  const jobs = state.jobs as unknown[];
  const activity = state.activity as unknown[];
  const outbox = state.outbox as unknown[];
  const applied = state.applied as unknown[];
  stock.forEach((item, index) => lot(item, `stock[${index}]`, true));
  jobs.forEach((value, index) => {
    const item = record(value, `jobs[${index}]`);
    for (const field of ['key', 'reference', 'recipient', 'destination', 'due'])
      text(item[field], `job.${field}`);
    requireValue(
      item.priority === 'normal' || item.priority === 'urgent',
      'job.priority',
    );
    requireValue(
      ['queued', 'picking', 'packing', 'ready', 'dispatched'].includes(
        item.stage as string,
      ),
      'job.stage',
    );
    integer(item.revision, 'job.revision');
    requireValue(item.revision <= revision, 'job revision exceeds warehouse');
    list(item.lines, 'job.lines');
    requireValue(item.lines.length > 0, 'empty job');
    item.lines.forEach(lineValue => {
      const line = record(lineValue, 'line');
      for (const field of ['key', 'sku', 'label', 'location'])
        text(line[field], `line.${field}`);
      integer(line.requested, 'line.requested', 1);
      integer(line.picked, 'line.picked');
      requireValue(line.picked <= line.requested, 'picked exceeds requested');
      requireValue(typeof line.counted === 'boolean', 'line.counted');
      text(line.shortageNote, 'line.shortageNote', true);
      requireValue(
        line.counted || line.picked === 0,
        'uncounted line has picked pieces',
      );
      if (item.stage === 'queued')
        requireValue(
          !line.counted && line.picked === 0,
          'queued job contains picked lines',
        );
      if (['packing', 'ready', 'dispatched'].includes(item.stage as string)) {
        requireValue(line.counted, 'finished picking contains uncounted lines');
        if (line.picked < line.requested)
          requireValue(
            line.shortageNote.trim().length > 0,
            'shortage requires reason',
          );
      }
    });
    unique(
      item.lines.map(line => (line as RecordValue).key as string),
      'job.lines',
    );
    if (['packing', 'ready', 'dispatched'].includes(item.stage as string)) {
      requireValue(
        item.lines.some(line => ((line as RecordValue).picked as number) > 0),
        'empty shipment',
      );
    }
    if (item.stage === 'ready' || item.stage === 'dispatched') {
      const parcel = record(item.parcel, 'job.parcel');
      text(parcel.label, 'parcel.label');
      integer(parcel.massGrams, 'parcel.massGrams', 1);
    } else requireValue(item.parcel === null, 'parcel before packing');
    if (item.stage === 'dispatched')
      timestamp(item.dispatchedAt, 'job.dispatchedAt');
    else
      requireValue(item.dispatchedAt === null, 'dispatch date before dispatch');
  });
  activity.forEach(value => {
    const item = record(value, 'activity');
    text(item.key, 'activity.key');
    text(item.jobKey, 'activity.jobKey');
    text(item.description, 'activity.description');
    timestamp(item.at, 'activity.at');
  });
  outbox.forEach(validateEnvelope);
  applied.forEach(key => text(key, 'applied key'));
  const warehouse = parsed as Warehouse;
  warehouse.inspections.forEach(item => {
    try {
      validateInspection(item);
    } catch {
      throw new Error('Invalid snapshot: quality inspection');
    }
    requireValue(
      item.subjectKind === 'job'
        ? warehouse.jobs.some(job => job.key === item.subjectKey)
        : warehouse.stock.some(lotEntry => lotEntry.key === item.subjectKey),
      'inspection subject reference',
    );
    const creationKey = item.key.slice('inspection-'.length);
    requireValue(
      item.key.startsWith('inspection-') &&
        warehouse.applied.includes(creationKey),
      'inspection creation command reference',
    );
    requireValue(
      warehouse.activity.some(
        entry =>
          entry.key === `activity-${creationKey}` &&
          entry.jobKey === item.subjectKey &&
          entry.at === item.openedAt,
      ),
      'inspection creation audit reference',
    );
  });
  unique(
    warehouse.inspections.map(item => item.key),
    'inspections',
  );
  unique(
    warehouse.inspections
      .filter(item => item.status === 'draft')
      .map(
        item =>
          `${item.subjectKind}:${item.subjectKey}:${item.subjectFingerprint}`,
      ),
    'inspection drafts',
  );
  unique(
    warehouse.stock.map(item => item.key),
    'stock',
  );
  unique(
    warehouse.stock.map(item => item.sku),
    'stock SKU',
  );
  unique(
    warehouse.jobs.map(item => item.key),
    'jobs',
  );
  unique(
    warehouse.activity.map(item => item.key),
    'activity',
  );
  unique(
    warehouse.outbox.map(item => item.key),
    'outbox',
  );
  unique(warehouse.applied, 'applied');
  requireValue(
    warehouse.applied.length === warehouse.revision,
    'applied revision count',
  );
  warehouse.outbox.forEach((item, index) => {
    if (item.command.type === 'quality.start') {
      const command = item.command;
      requireValue(
        warehouse.inspections.some(
          inspection =>
            inspection.key === `inspection-${item.key}` &&
            inspection.subjectKind === command.subjectKind &&
            inspection.subjectKey === command.subjectKey &&
            inspection.inspector === command.inspector,
        ),
        'quality start reference',
      );
    } else if (
      item.command.type === 'quality.update' ||
      item.command.type === 'quality.sign'
    ) {
      const command = item.command;
      const inspection = warehouse.inspections.find(
        candidate => candidate.key === command.inspectionKey,
      );
      requireValue(inspection, 'quality command inspection reference');
      if (command.type === 'quality.sign')
        requireValue(
          inspection.status === command.decision &&
            inspection.signedAt === item.at,
          'quality signature reference',
        );
    }
    requireValue(
      item.revision ===
        warehouse.revision - warehouse.outbox.length + index + 1,
      'outbox must be an ordered suffix',
    );
    requireValue(
      warehouse.applied[item.revision - 1] === item.key,
      'outbox key missing from applied history',
    );
  });
  const available = new Map<string, number>();
  for (const item of warehouse.stock.filter(
    stockEntry => stockEntry.kind === 'finished',
  )) {
    const total = (available.get(item.sku) ?? 0) + item.quantity;
    requireValue(
      Number.isSafeInteger(total),
      'stock total exceeds safe integer',
    );
    available.set(item.sku, total);
  }
  const reserved = new Map<string, number>();
  for (const job of warehouse.jobs) {
    for (const line of job.lines) {
      requireValue(
        available.has(line.sku),
        'job references missing finished stock',
      );
      if (job.stage !== 'queued' && job.stage !== 'dispatched') {
        const total = (reserved.get(line.sku) ?? 0) + line.picked;
        requireValue(
          Number.isSafeInteger(total) && total <= available.get(line.sku)!,
          'picked stock exceeds available pieces',
        );
        reserved.set(line.sku, total);
      }
    }
  }
  return warehouse;
}
