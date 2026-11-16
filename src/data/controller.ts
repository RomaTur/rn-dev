import { execute as applyCommand } from '../domain/engine';
import type {
  Command,
  CommandContext,
  SnapshotStore,
  Transport,
  TransportReply,
  Warehouse,
} from '../domain/types';
import { decodeSnapshot, validateCommand } from './validation';

export type ContextSupplier = () => Pick<CommandContext, 'key' | 'at'>;

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function defaultContext(): ContextSupplier {
  const session = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}-${Math.random().toString(36).slice(2)}`;
  let sequence = 0;
  return () => ({
    key: `${session}-${++sequence}`,
    at: new Date().toISOString(),
  });
}

/** One queue covers edits, storage and acknowledgements to prevent lost updates. */
export class WarehouseController {
  private snapshot: Warehouse;
  private loaded = false;
  private queue: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();

  constructor(
    private store: SnapshotStore,
    private transport: Transport,
    seed: () => Warehouse,
    private context: ContextSupplier = defaultContext(),
  ) {
    this.snapshot = freeze(decodeSnapshot(JSON.stringify(seed())));
  }
  getSnapshot = (): Warehouse => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  load(): Promise<Warehouse> {
    return this.enqueue(async () => {
      await this.ensureLoaded();
      return this.snapshot;
    });
  }
  async execute(command: Command): Promise<void> {
    const captured: unknown = JSON.parse(JSON.stringify(command));
    validateCommand(captured);
    return this.enqueue(async () => {
      await this.ensureLoaded();
      const context = {
        ...this.context(),
        expectedRevision: this.snapshot.revision,
      };
      const next = applyCommand(this.snapshot, captured, context);
      await this.save(next);
    });
  }
  sync(): Promise<void> {
    return this.enqueue(async () => {
      await this.ensureLoaded();
      while (this.snapshot.outbox.length > 0) {
        const first = this.snapshot.outbox[0];
        let reply: TransportReply;
        try {
          reply = await this.transport.send(first);
          if (
            !reply ||
            (reply.kind !== 'accepted' && reply.kind !== 'conflict')
          )
            throw new Error('Invalid sync reply');
          if (
            reply.kind === 'conflict' &&
            (!Number.isSafeInteger(reply.remoteRevision) ||
              reply.remoteRevision < 0)
          )
            throw new Error('Invalid remote revision');
        } catch (error) {
          await this.save({
            ...this.snapshot,
            outbox: this.snapshot.outbox.map((item, index) =>
              index === 0 ? { ...item, attempts: item.attempts + 1 } : item,
            ),
          });
          throw error;
        }
        if (reply.kind === 'conflict') {
          await this.save({
            ...this.snapshot,
            outbox: this.snapshot.outbox.map((item, index) =>
              index === 0
                ? { ...item, state: 'conflict', attempts: item.attempts + 1 }
                : item,
            ),
          });
          throw new Error(
            `Конфликт версии: на сервере версия ${reply.remoteRevision}. Операции сохранены на устройстве.`,
          );
        }
        // Save outside the send catch: a failed local acknowledgement must retain
        // the original event and be retried with the same idempotency key.
        await this.save({
          ...this.snapshot,
          outbox: this.snapshot.outbox.slice(1),
        });
      }
    });
  }
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    const raw = await this.store.read();
    const next = raw === null ? this.snapshot : freeze(decodeSnapshot(raw));
    if (raw === null) await this.store.write(JSON.stringify(next));
    this.snapshot = next;
    this.loaded = true;
    this.notify();
  }
  private async save(candidate: Warehouse): Promise<void> {
    const next = freeze(decodeSnapshot(JSON.stringify(candidate)));
    await this.store.write(JSON.stringify(next));
    this.snapshot = next;
    this.notify();
  }
  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* A view callback cannot roll back durable work. */
      }
    }
  }
}
