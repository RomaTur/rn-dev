import type {
  Envelope,
  SnapshotStore,
  Transport,
  TransportReply,
} from '../domain/types';
import { validateEnvelope } from './validation';

export type SimulatorMode = 'online' | 'offline' | 'conflict';
type Receipt = { key: string; fingerprint: string; revision: number };
type RemoteState = { format: 1; revision: number; receipts: Receipt[] };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonical(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
function fingerprint(envelope: Envelope): string {
  return canonical({
    key: envelope.key,
    baseRevision: envelope.baseRevision,
    revision: envelope.revision,
    command: envelope.command,
    at: envelope.at,
  });
}
function decodeRemote(raw: string): RemoteState {
  let value: RemoteState;
  try {
    value = JSON.parse(raw) as RemoteState;
  } catch {
    throw new Error('Invalid simulator snapshot: unreadable JSON');
  }
  const invalid = () => {
    throw new Error('Invalid simulator snapshot: receipt ledger');
  };
  if (
    !value ||
    value.format !== 1 ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    !Array.isArray(value.receipts) ||
    value.receipts.length !== value.revision
  )
    invalid();
  const keys = new Set<string>();
  for (const [index, item] of value.receipts.entries()) {
    if (
      !item ||
      typeof item.key !== 'string' ||
      !item.key.trim() ||
      keys.has(item.key) ||
      item.revision !== index + 1 ||
      typeof item.fingerprint !== 'string'
    )
      invalid();
    try {
      const payload: unknown = JSON.parse(item.fingerprint);
      const envelope = {
        ...(payload as object),
        attempts: 0,
        state: 'pending',
      };
      validateEnvelope(envelope);
      if (
        envelope.key !== item.key ||
        envelope.revision !== item.revision ||
        fingerprint(envelope) !== item.fingerprint
      )
        invalid();
    } catch {
      invalid();
    }
    keys.add(item.key);
  }
  return value;
}

/** Entirely local: durable server revision and receipts model an idempotent API. */
export class LocalSyncSimulator implements Transport {
  private currentMode: SimulatorMode = 'online';
  private queue: Promise<void> = Promise.resolve();
  constructor(private remoteStore: SnapshotStore) {}
  get mode(): SimulatorMode {
    return this.currentMode;
  }
  setMode(mode: SimulatorMode): void {
    this.currentMode = mode;
  }

  async send(envelope: Envelope): Promise<TransportReply> {
    const captured: unknown = JSON.parse(JSON.stringify(envelope));
    validateEnvelope(captured);
    const operation = this.queue.then(async (): Promise<TransportReply> => {
      if (this.currentMode === 'offline')
        throw new Error('Сервис недоступен. Операции сохранены на устройстве.');
      const raw = await this.remoteStore.read();
      const remote =
        raw === null
          ? { format: 1 as const, revision: 0, receipts: [] }
          : decodeRemote(raw);
      const signature = fingerprint(captured);
      const previous = remote.receipts.find(item => item.key === captured.key);
      if (previous) {
        if (previous.fingerprint !== signature)
          throw new Error('Idempotency key reused with a different payload');
        return { kind: 'accepted' };
      }
      if (this.currentMode === 'conflict')
        return { kind: 'conflict', remoteRevision: remote.revision + 1 };
      if (captured.baseRevision !== remote.revision)
        return { kind: 'conflict', remoteRevision: remote.revision };
      const next: RemoteState = {
        format: 1,
        revision: captured.revision,
        receipts: [
          ...remote.receipts,
          {
            key: captured.key,
            fingerprint: signature,
            revision: captured.revision,
          },
        ],
      };
      await this.remoteStore.write(JSON.stringify(next));
      return { kind: 'accepted' };
    });
    this.queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }
}
