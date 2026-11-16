import type { Inspection, QualityCommand } from '../quality/types';

export type Stage = 'queued' | 'picking' | 'packing' | 'ready' | 'dispatched';
export type PickLine = {
  key: string;
  sku: string;
  label: string;
  location: string;
  requested: number;
  picked: number;
  counted: boolean;
  shortageNote: string;
};
export type Parcel = { label: string; massGrams: number };
export type Job = {
  key: string;
  reference: string;
  recipient: string;
  destination: string;
  due: string;
  priority: 'normal' | 'urgent';
  stage: Stage;
  revision: number;
  lines: PickLine[];
  parcel: Parcel | null;
  dispatchedAt: string | null;
};
export type Activity = {
  key: string;
  jobKey: string;
  at: string;
  description: string;
};
export type Envelope = {
  key: string;
  baseRevision: number;
  revision: number;
  command: Command;
  at: string;
  state: 'pending' | 'conflict';
  attempts: number;
};
export type StockLot = {
  key: string;
  sku: string;
  label: string;
  kind: 'raw' | 'finished';
  species: string;
  size: string;
  location: string;
  quantity: number;
};
export type Warehouse = {
  format: 2;
  revision: number;
  stock: StockLot[];
  jobs: Job[];
  inspections: Inspection[];
  activity: Activity[];
  outbox: Envelope[];
  applied: string[];
};
export type Command =
  | QualityCommand
  | { type: 'begin'; jobKey: string }
  | {
      type: 'count';
      jobKey: string;
      lineKey: string;
      quantity: number;
      note: string;
    }
  | { type: 'finishPicking'; jobKey: string }
  | { type: 'pack'; jobKey: string; label: string; massGrams: number }
  | { type: 'dispatch'; jobKey: string }
  | { type: 'receive'; lot: Omit<StockLot, 'key'> }
  | { type: 'adjust'; lotKey: string; quantity: number; reason: string };
export type CommandContext = {
  key: string;
  at: string;
  expectedRevision: number;
};
export type TransportReply =
  | { kind: 'accepted' }
  | { kind: 'conflict'; remoteRevision: number };
export interface Transport {
  send(envelope: Envelope): Promise<TransportReply>;
}
export interface SnapshotStore {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}
