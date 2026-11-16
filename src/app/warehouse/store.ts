import {
  configureStore,
  createAsyncThunk,
  createSlice,
  isAnyOf,
  type PayloadAction,
} from '@reduxjs/toolkit';
import type { WarehouseController } from '../../data/controller';
import type { Command, Warehouse } from '../../domain/types';

export type WarehouseRuntime = Pick<
  WarehouseController,
  'load' | 'execute' | 'sync' | 'subscribe' | 'getSnapshot'
>;

const createWarehouseThunk = createAsyncThunk.withTypes<{
  extra: WarehouseRuntime;
  rejectValue: string;
}>();

export const loadWarehouse = createWarehouseThunk(
  'warehouse/load',
  async (_, { extra, rejectWithValue }) => {
    try {
      return await extra.load();
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Не удалось открыть данные'));
    }
  },
);

export const executeCommand = createWarehouseThunk(
  'warehouse/execute',
  async (command: Command, { extra, rejectWithValue }) => {
    try {
      await extra.execute(command);
    } catch (error) {
      return rejectWithValue(
        errorMessage(error, 'Не удалось сохранить изменение'),
      );
    }
  },
);

export const syncWarehouse = createWarehouseThunk(
  'warehouse/sync',
  async (_, { extra, rejectWithValue }) => {
    try {
      await extra.sync();
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Обмен прерван'));
    }
  },
);

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message || fallback : fallback;
}

type WarehouseState = {
  snapshot: Warehouse | null;
  pendingOperations: number;
  loadError: string;
  error: string;
};
const initialState: WarehouseState = {
  snapshot: null,
  pendingOperations: 0,
  loadError: '',
  error: '',
};

const warehouseSlice = createSlice({
  name: 'warehouse',
  initialState,
  reducers: {
    snapshotSaved(state, action: PayloadAction<Warehouse>) {
      state.snapshot = action.payload;
    },
    errorCleared(state) {
      state.error = '';
    },
  },
  extraReducers(builder) {
    builder
      .addCase(loadWarehouse.fulfilled, (state, action) => {
        state.snapshot = action.payload;
        state.loadError = '';
      })
      .addCase(loadWarehouse.rejected, (state, action) => {
        state.loadError = action.payload ?? 'Не удалось открыть данные';
      })
      .addMatcher(
        isAnyOf(executeCommand.pending, syncWarehouse.pending),
        state => {
          state.pendingOperations++;
          state.error = '';
        },
      )
      .addMatcher(
        isAnyOf(executeCommand.fulfilled, syncWarehouse.fulfilled),
        state => {
          state.pendingOperations--;
        },
      )
      .addMatcher(
        isAnyOf(executeCommand.rejected, syncWarehouse.rejected),
        (state, action) => {
          state.pendingOperations--;
          state.error = action.payload ?? 'Не удалось выполнить операцию';
        },
      );
  },
});

export const { errorCleared } = warehouseSlice.actions;

export function createWarehouseStore(runtime: WarehouseRuntime) {
  return configureStore({
    reducer: { warehouse: warehouseSlice.reducer },
    middleware: getDefaultMiddleware =>
      getDefaultMiddleware({ thunk: { extraArgument: runtime } }),
  });
}

export type WarehouseStore = ReturnType<typeof createWarehouseStore>;
export type RootState = ReturnType<WarehouseStore['getState']>;
export type AppDispatch = WarehouseStore['dispatch'];

/** The controller emits only after the durable write succeeds. */
export function connectWarehouse(
  store: WarehouseStore,
  runtime: WarehouseRuntime,
) {
  return runtime.subscribe(() => {
    store.dispatch(warehouseSlice.actions.snapshotSaved(runtime.getSnapshot()));
  });
}
