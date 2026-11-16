import React from 'react';
import { Alert } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Workspace } from '../src/app/navigation/Workspace';
import { useWarehouse } from '../src/app/warehouse/WarehouseProvider';
import { createSeed } from '../src/domain/seed';
import { execute } from '../src/domain/engine';
import { Command } from '../src/domain/types';

jest.mock('../src/app/warehouse/WarehouseProvider', () => ({ useWarehouse: jest.fn() }));
jest.mock('../src/features/session/AuthGate', () => ({
  useInspector: () => ({ name: 'Демо инспектор', lock: jest.fn() }),
}));
jest.mock('../src/device/native', () => ({ device: {} }));
let tree: ReactTestRenderer;
let state = createSeed();
const clearError = jest.fn();
const control = (id: string, prop = 'onPress') =>
  tree.root
    .findAll(n => n.props.testID === id && typeof n.props[prop] === 'function')
    .at(-1)!;
const tap = async (id: string) =>
  act(async () => {
    await control(id).props.onPress();
  });

beforeEach(async () => {
  state = createSeed();
  (useWarehouse as jest.Mock).mockImplementation(() => ({
    state,
    busy: false,
    error: '',
    clearError,
    run: async (command: Command) => {
      state = execute(state, command, {
        key: 'workspace-' + (state.revision + 1),
        at: '2026-01-10T12:00:00.000Z',
        expectedRevision: state.revision,
      });
      tree.update(<Workspace />);
      return true;
    },
  }));
  await act(async () => {
    tree = create(<Workspace />);
  });
});
afterEach(async () => {
  await act(async () => tree.unmount());
  jest.restoreAllMocks();
});

test('choosing the active section preserves draft protection for the next navigation', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  await tap('inspect-job-101');
  await tap('document-start');
  await act(async () =>
    control('inspection-marking', 'onChangeText').props.onChangeText(
      'UNSAVED-DEMO',
    ),
  );
  await tap('app-menu');
  await tap('nav-quality');
  expect(alert).not.toHaveBeenCalled();
  expect(control('inspection-marking', 'onChangeText').props.value).toBe(
    'UNSAVED-DEMO',
  );
  await tap('app-menu');
  await tap('nav-stock');
  expect(alert).toHaveBeenCalledTimes(1);
  expect(control('inspection-marking', 'onChangeText').props.value).toBe(
    'UNSAVED-DEMO',
  );
  await act(async () =>
    alert.mock.calls[0][2]
      ?.find(button => button.style === 'destructive')
      ?.onPress?.(),
  );
  expect(
    tree.root.findAllByProps({ testID: 'inspection-marking' }),
  ).toHaveLength(0);
});

test('opening a document is read-only and starting its inspection creates one draft', async () => {
  await tap('inspect-job-101');
  expect(state.inspections).toHaveLength(0);
  expect(control('document-start')).toBeDefined();
  await tap('document-back');
  expect(state.inspections).toHaveLength(0);
  await tap('inspect-job-101');
  await tap('document-start');
  expect(state.inspections).toHaveLength(1);
  await tap('inspection-back');
  await tap('document-start');
  expect(state.inspections).toHaveLength(1);
  expect(control('inspection-marking', 'onChangeText')).toBeDefined();
});
