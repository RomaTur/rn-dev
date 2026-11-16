import AsyncStorage from '@react-native-async-storage/async-storage';
import { WarehouseController } from '../../data/controller';
import { LocalSyncSimulator } from '../../data/simulator';
import { createSeed } from '../../domain/seed';
import type { SnapshotStore } from '../../domain/types';

function snapshotStore(key: string): SnapshotStore {
  return {
    read: () => AsyncStorage.getItem(key),
    write: value => AsyncStorage.setItem(key, value),
  };
}

export const simulator = new LocalSyncSimulator(
  snapshotStore('woodland.remote.v1'),
);
export const controller = new WarehouseController(
  snapshotStore('woodland.warehouse.v1'),
  simulator,
  createSeed,
);
