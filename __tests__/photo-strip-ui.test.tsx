import React from 'react';
import { Alert, Image } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { PhotoStrip } from '../src/features/quality/components/PhotoStrip';
import type { PhotoEvidence } from '../src/quality/types';

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

const photos: PhotoEvidence[] = [
  {
    fileName: 'first.jpg',
    uri: 'file:///photos/first.jpg',
    category: 'cracks',
    caption: 'Первый образец',
    capturedAt: '2026-01-10T08:00:00Z',
  },
  {
    fileName: 'second.jpg',
    uri: 'file:///photos/second.jpg',
    category: 'chips',
    caption: 'Второй образец',
    capturedAt: '2026-01-11T08:00:00Z',
  },
];
let tree: ReactTestRenderer;
const remove = jest.fn();
const add = jest.fn();
const button = (id: string) =>
  tree.root
    .findAll(
      n => n.props.testID === id && typeof n.props.onPress === 'function',
    )
    .at(-1)!;

beforeEach(async () => {
  jest.clearAllMocks();
  await act(async () => {
    tree = create(
      <PhotoStrip
        photos={photos}
        testID="evidence"
        onRemove={remove}
        onAdd={add}
      />,
    );
  });
});
afterEach(async () => {
  await act(async () => tree.unmount());
  jest.restoreAllMocks();
});

test('opens the selected local photo and browses the other evidence', async () => {
  await act(async () => button('evidence-photo-1').props.onPress());
  const previewImage = () =>
    tree.root
      .findAllByType(Image)
      .find(n => n.props.testID === 'photo-preview-image')!;
  expect(previewImage().props.source.uri).toBe(photos[1].uri);
  expect(button('photo-preview-next').props.disabled).toBe(true);
  await act(async () => button('photo-preview-previous').props.onPress());
  expect(previewImage().props.source.uri).toBe(photos[0].uri);
  expect(button('photo-preview-previous').props.disabled).toBe(true);
  await act(async () => button('photo-preview-close').props.onPress());
  expect(tree.root.findAllByProps({ testID: 'photo-preview' })).toHaveLength(0);
});

test('removal requires confirmation and targets the tapped photo', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  await act(async () => button('evidence-remove-1').props.onPress());
  expect(remove).not.toHaveBeenCalled();
  const actions = alert.mock.calls[0][2]!;
  expect(actions.some(action => action.style === 'cancel')).toBe(true);
  await act(async () =>
    actions.find(action => action.style === 'destructive')?.onPress?.(),
  );
  expect(remove).toHaveBeenCalledWith(photos[1]);
});

test('a reached global limit disables adding while keeping the gallery readable', async () => {
  await act(async () =>
    tree.update(
      <PhotoStrip
        photos={photos}
        testID="evidence"
        onAdd={add}
        canAdd={false}
      />,
    ),
  );
  expect(button('evidence-add').props.disabled).toBe(true);
  await act(async () => button('evidence-photo-0').props.onPress());
  expect(
    tree.root.findAllByProps({ testID: 'photo-preview' }).length,
  ).toBeGreaterThan(0);
});
