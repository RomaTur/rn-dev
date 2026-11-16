import React, { useCallback, useEffect, useState } from 'react';
import { Provider, useDispatch, useSelector } from 'react-redux';
import type { Command } from '../../domain/types';
import { controller } from './runtime';
import {
  connectWarehouse,
  createWarehouseStore,
  errorCleared,
  executeCommand,
  loadWarehouse,
  syncWarehouse,
  type AppDispatch,
  type RootState,
} from './store';

const useWarehouseDispatch = useDispatch.withTypes<AppDispatch>();
const useWarehouseSelector = useSelector.withTypes<RootState>();

export function useWarehouse() {
  const { snapshot, pendingOperations, error } = useWarehouseSelector(
    s => s.warehouse,
  );
  const dispatch = useWarehouseDispatch();
  const clearError = useCallback(() => dispatch(errorCleared()), [dispatch]);
  const run = useCallback(
    async (command: Command) =>
      executeCommand.fulfilled.match(await dispatch(executeCommand(command))),
    [dispatch],
  );
  const sync = useCallback(async () => {
    await dispatch(syncWarehouse());
  }, [dispatch]);
  if (!snapshot) throw new Error('Warehouse data has not loaded');
  return {
    state: snapshot,
    busy: pendingOperations > 0,
    error,
    clearError,
    run,
    sync,
  };
}

export function WarehouseProvider({
  children,
  onLoadError,
}: {
  children: React.ReactNode;
  onLoadError: (message: string) => void;
}) {
  const [store] = useState(() => createWarehouseStore(controller));
  useEffect(() => {
    const disconnect = connectWarehouse(store, controller);
    store.dispatch(loadWarehouse());
    return disconnect;
  }, [store]);

  return (
    <Provider store={store}>
      <WarehouseReady onLoadError={onLoadError}>{children}</WarehouseReady>
    </Provider>
  );
}

function WarehouseReady({
  children,
  onLoadError,
}: {
  children: React.ReactNode;
  onLoadError: (message: string) => void;
}) {
  const { snapshot, loadError } = useWarehouseSelector(s => s.warehouse);
  useEffect(() => {
    if (loadError) onLoadError(loadError);
  }, [loadError, onLoadError]);
  return snapshot ? children : null;
}
