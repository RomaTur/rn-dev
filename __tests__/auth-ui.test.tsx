import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { AuthGate } from '../src/features/session/AuthGate';
import { device } from '../src/device/native';
jest.mock('../src/device/native', () => ({
  device: {
    getIdentity: jest.fn(),
    createIdentity: jest.fn(),
    unlock: jest.fn(),
    lock: jest.fn(),
  },
}));
let tree: ReactTestRenderer;
const native = device as jest.Mocked<typeof device>;
const control = (id: string, prop: string) =>
  tree.root
    .findAll(n => n.props.testID === id && typeof n.props[prop] === 'function')
    .at(-1)!;
beforeEach(() => jest.clearAllMocks());
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
});
test('existing identity must unlock before warehouse renders; failure remains on PIN gate', async () => {
  native.getIdentity.mockResolvedValue({ name: 'Инспектор' });
  native.unlock
    .mockRejectedValueOnce(new Error('Неверный PIN'))
    .mockResolvedValueOnce({ name: 'Инспектор' });
  await act(async () => {
    tree = create(
      <AuthGate>
        <Text testID="private">Склад</Text>
      </AuthGate>,
    );
  });
  expect(tree.root.findAllByProps({ testID: 'private' })).toHaveLength(0);
  await act(async () =>
    control('auth-pin', 'onChangeText').props.onChangeText('123456'),
  );
  await act(async () => control('auth-submit', 'onPress').props.onPress());
  expect(tree.root.findAllByProps({ testID: 'private' })).toHaveLength(0);
  await act(async () =>
    control('auth-pin', 'onChangeText').props.onChangeText('246810'),
  );
  await act(async () => control('auth-submit', 'onPress').props.onPress());
  expect(
    tree.root.findAllByProps({ testID: 'private' }).length,
  ).toBeGreaterThan(0);
});
test('new identity requires a name and matching six digit PIN', async () => {
  native.getIdentity.mockResolvedValue(null);
  native.createIdentity.mockResolvedValue({ name: 'Демо инспектор' });
  await act(async () => {
    tree = create(
      <AuthGate>
        <Text testID="private">Склад</Text>
      </AuthGate>,
    );
  });
  await act(async () => control('auth-submit', 'onPress').props.onPress());
  expect(native.createIdentity).not.toHaveBeenCalled();
  await act(async () => {
    control('auth-name', 'onChangeText').props.onChangeText('Демо инспектор');
    control('auth-pin', 'onChangeText').props.onChangeText('246810');
    control('auth-confirm', 'onChangeText').props.onChangeText('246810');
  });
  await act(async () => control('auth-submit', 'onPress').props.onPress());
  expect(native.createIdentity).toHaveBeenCalledWith(
    'Демо инспектор',
    '246810',
  );
});
