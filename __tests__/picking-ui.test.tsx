import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { useWarehouse } from '../src/app/warehouse/WarehouseProvider';
import { Jobs } from '../src/features/dispatch/DispatchScreen';
import { execute } from '../src/domain/engine';
import { createSeed } from '../src/domain/seed';
import type { Command } from '../src/domain/types';

jest.mock('../src/app/warehouse/WarehouseProvider', () => ({
  useWarehouse: jest.fn(),
}));

const mockedWarehouse = useWarehouse as jest.Mock;
let state = createSeed();
let busy = false;
let tree: ReactTestRenderer;
const apply = (command: Command) => {
  state = execute(state, command, {
    key: `ui-test-${state.revision + 1}`,
    at: '2026-11-16T09:00:00.000Z',
    expectedRevision: state.revision,
  });
};
const button = (id: string) =>
  tree.root
    .findAll(
      node =>
        node.props.testID === id && typeof node.props.onPress === 'function',
    )
    .at(-1)!;
const input = (id: string) =>
  tree.root
    .findAll(
      node =>
        node.props.testID === id &&
        typeof node.props.onChangeText === 'function',
    )
    .at(-1)!;

beforeEach(async () => {
  state = createSeed();
  busy = false;
  apply({ type: 'begin', jobKey: 'job-101' });
  apply({
    type: 'count',
    jobKey: 'job-101',
    lineKey: 'line-1',
    quantity: 1,
    note: 'Surface defect',
  });
  apply({
    type: 'count',
    jobKey: 'job-101',
    lineKey: 'line-2',
    quantity: 3,
    note: '',
  });
  mockedWarehouse.mockImplementation(() => ({ state, busy, run: jest.fn() }));
  await act(async () => {
    tree = create(<Jobs />);
  });
  await act(async () => {
    button('job-job-101').props.onPress();
  });
});

afterEach(async () => {
  await act(async () => tree.unmount());
});

test('requires reconfirmation after editing a previously confirmed count', async () => {
  expect(button('picking-finish').props.disabled).toBe(false);
  await act(async () => {
    input('pick-line-1').props.onChangeText('0');
  });
  expect(button('picking-finish').props.disabled).toBe(true);
  await act(async () => {
    input('pick-line-1').props.onChangeText('1');
  });
  expect(button('picking-finish').props.disabled).toBe(false);
  await act(async () => {
    input('shortage-line-1').props.onChangeText('New explanation');
  });
  expect(button('picking-finish').props.disabled).toBe(true);
});

test('locks both drafts until confirmation is durably saved', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const run = async (command: Command) => {
    busy = true;
    await gate;
    apply(command);
    busy = false;
    return true;
  };
  mockedWarehouse.mockImplementation(() => ({ state, busy, run }));
  await act(async () => {
    tree.update(<Jobs />);
  });
  await act(async () => {
    input('pick-line-1').props.onChangeText('01');
  });
  await act(async () => {
    input('shortage-line-1').props.onChangeText('  Surface defect  ');
  });
  let confirmation!: Promise<void>;
  await act(async () => {
    confirmation = button('count-line-1').props.onPress();
    tree.update(<Jobs />);
  });
  expect(input('pick-line-1').props.editable).toBe(false);
  expect(input('shortage-line-1').props.editable).toBe(false);
  expect(button('picking-finish').props.disabled).toBe(true);
  await act(async () => {
    release();
    await confirmation;
    tree.update(<Jobs />);
  });
  expect(input('pick-line-1').props.editable).toBe(true);
  expect(input('pick-line-1').props.value).toBe('1');
  expect(input('shortage-line-1').props.value).toBe('Surface defect');
  expect(state.jobs[0].lines[0].picked).toBe(1);
  expect(button('picking-finish').props.disabled).toBe(false);
});
