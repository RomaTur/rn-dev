import React from 'react';
import {
  Alert,
  Keyboard,
  KeyboardEvent,
  Modal,
  StyleSheet,
} from 'react-native';
import {
  act,
  create,
  ReactTestInstance,
  ReactTestRenderer,
} from 'react-test-renderer';
import { CriterionModal } from '../src/features/quality/components/CriterionModal';

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

let tree: ReactTestRenderer;
const save = jest.fn<Promise<boolean>, any[]>();
const close = jest.fn();
let keyboardListeners: Map<string, ((event: KeyboardEvent) => void)[]>;
const keyboard = (name: string) =>
  keyboardListeners.get(name)?.forEach(listener =>
    listener({
      duration: 0,
      easing: 'keyboard',
      endCoordinates: { screenX: 0, screenY: 260, width: 1000, height: 340 },
    } as KeyboardEvent),
  );
const hidden = (node: ReactTestInstance): boolean => {
  if (
    typeof node.props.style !== 'function' &&
    StyleSheet.flatten(node.props.style)?.display === 'none'
  )
    return true;
  return node.parent ? hidden(node.parent) : false;
};
const control = (id: string, handler: string) =>
  tree.root
    .findAll(
      n => n.props.testID === id && typeof n.props[handler] === 'function',
    )
    .at(-1)!;

beforeEach(async () => {
  jest.clearAllMocks();
  keyboardListeners = new Map();
  jest.spyOn(Keyboard, 'addListener').mockImplementation((name, listener) => {
    const listeners = keyboardListeners.get(name) || [];
    listeners.push(listener);
    keyboardListeners.set(name, listeners);
    return {
      remove: () =>
        keyboardListeners.set(
          name,
          listeners.filter(item => item !== listener),
        ),
    };
  });
  save.mockResolvedValue(true);
  await act(async () => {
    tree = create(
      <CriterionModal
        id="cracks"
        value={{ verdict: 'pending', reasons: [], comment: '' }}
        busy={false}
        onClose={close}
        onSave={save}
      />,
    );
  });
});

test('a short keyboard viewport preserves the mounted comment and selected reasons through save', async () => {
  await act(async () => control('verdict-fail', 'onPress').props.onPress());
  await act(async () => control('reason-0', 'onPress').props.onPress());
  const comment = control('criterion-comment', 'onChangeText');
  await act(async () => {
    comment.props.onChangeText('Первая строка\nВторая строка');
    comment.props.onFocus();
    keyboard('keyboardDidShow');
  });
  const viewport = control('criterion-viewport', 'onLayout');
  expect(viewport).toBeDefined();
  await act(async () =>
    viewport.props.onLayout({
      nativeEvent: { layout: { width: 544, height: 260, x: 0, y: 0 } },
    }),
  );
  expect(hidden(control('criterion-search', 'onChangeText'))).toBe(true);
  expect(hidden(control('verdict-fail', 'onPress'))).toBe(true);
  expect(control('criterion-comment', 'onChangeText')).toBe(comment);
  expect(hidden(comment)).toBe(false);
  expect(hidden(control('criterion-save', 'onPress'))).toBe(false);
  await act(async () => control('criterion-save', 'onPress').props.onPress());
  expect(save).toHaveBeenCalledWith({
    verdict: 'fail',
    reasons: ['Сквозная трещина'],
    comment: 'Первая строка\nВторая строка',
  });
});

test('short search mode keeps its input mounted and restores the complete draft when the keyboard hides', async () => {
  await act(async () => control('verdict-fail', 'onPress').props.onPress());
  await act(async () =>
    control('criterion-comment', 'onChangeText').props.onChangeText(
      'Сохранённый черновик',
    ),
  );
  const search = control('criterion-search', 'onChangeText');
  await act(async () => {
    search.props.onFocus();
    search.props.onChangeText('Торцевая');
    keyboard('keyboardDidShow');
  });
  const viewport = control('criterion-viewport', 'onLayout');
  expect(viewport).toBeDefined();
  await act(async () =>
    viewport.props.onLayout({
      nativeEvent: { layout: { width: 544, height: 260, x: 0, y: 0 } },
    }),
  );
  expect(control('criterion-search', 'onChangeText')).toBe(search);
  expect(hidden(search)).toBe(false);
  expect(hidden(control('criterion-comment', 'onChangeText'))).toBe(true);
  expect(hidden(control('reason-1', 'onPress'))).toBe(false);
  await act(async () => control('reason-1', 'onPress').props.onPress());
  await act(async () => keyboard('keyboardDidHide'));
  expect(hidden(control('criterion-comment', 'onChangeText'))).toBe(false);
  expect(hidden(control('verdict-fail', 'onPress'))).toBe(false);
  expect(search.props.value).toBe('Торцевая');
  await act(async () => control('criterion-save', 'onPress').props.onPress());
  expect(save).toHaveBeenCalledWith({
    verdict: 'fail',
    reasons: ['Торцевая трещина'],
    comment: 'Сохранённый черновик',
  });
});

afterEach(async () => {
  await act(async () => tree.unmount());
  jest.restoreAllMocks();
});

test('search filters notes without losing selected hidden notes when saving', async () => {
  await act(async () => control('verdict-fail', 'onPress').props.onPress());
  await act(async () => control('reason-0', 'onPress').props.onPress());
  const search = control('criterion-search', 'onChangeText');
  expect(search).toBeDefined();
  await act(async () => search.props.onChangeText('  ТОРЦЕВАЯ  '));
  expect(tree.root.findAllByProps({ testID: 'reason-0' })).toHaveLength(0);
  await act(async () => control('reason-1', 'onPress').props.onPress());
  await act(async () =>
    control('criterion-comment', 'onChangeText').props.onChangeText(
      'На образце',
    ),
  );
  await act(async () => control('criterion-save', 'onPress').props.onPress());
  expect(save).toHaveBeenCalledWith({
    verdict: 'fail',
    reasons: ['Сквозная трещина', 'Торцевая трещина'],
    comment: 'На образце',
  });
  expect(close).toHaveBeenCalledTimes(1);
});

test('resizing without keyboard events keeps comment editing usable and restores the full form', async () => {
  await act(async () => control('verdict-fail', 'onPress').props.onPress());
  const comment = control('criterion-comment', 'onChangeText');
  const viewport = control('criterion-viewport', 'onLayout');
  await act(async () => {
    comment.props.onFocus();
    comment.props.onChangeText('Проверено без событий клавиатуры');
    viewport.props.onLayout({
      nativeEvent: { layout: { width: 544, height: 260, x: 0, y: 0 } },
    });
  });
  expect(hidden(control('criterion-search', 'onChangeText'))).toBe(true);
  expect(hidden(control('verdict-fail', 'onPress'))).toBe(true);
  expect(hidden(comment)).toBe(false);
  expect(hidden(control('criterion-save', 'onPress'))).toBe(false);
  await act(async () =>
    viewport.props.onLayout({
      nativeEvent: { layout: { width: 544, height: 620, x: 0, y: 0 } },
    }),
  );
  expect(hidden(control('criterion-search', 'onChangeText'))).toBe(false);
  expect(hidden(control('verdict-fail', 'onPress'))).toBe(false);
  expect(control('criterion-comment', 'onChangeText')).toBe(comment);
  await act(async () => control('criterion-save', 'onPress').props.onPress());
  expect(save).toHaveBeenCalledWith({
    verdict: 'fail',
    reasons: [],
    comment: 'Проверено без событий клавиатуры',
  });
});

test('a failed persistence keeps the draft and dirty dismiss confirmation', async () => {
  save.mockResolvedValue(false);
  const alert = jest.spyOn(Alert, 'alert');
  await act(async () => control('verdict-fail', 'onPress').props.onPress());
  expect(control('criterion-save', 'onPress').props.disabled).toBe(true);
  await act(async () =>
    control('criterion-comment', 'onChangeText').props.onChangeText(
      'Требует проверки',
    ),
  );
  await act(async () => control('criterion-save', 'onPress').props.onPress());
  expect(close).not.toHaveBeenCalled();
  expect(control('criterion-comment', 'onChangeText').props.value).toBe(
    'Требует проверки',
  );
  await act(async () => tree.root.findByType(Modal).props.onRequestClose());
  expect(alert).toHaveBeenCalledWith(
    'Несохранённая проверка',
    'Отменить изменения этой проверки?',
    expect.any(Array),
  );
});
