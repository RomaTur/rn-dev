/* global jest */

// Keep the real navigation router and Redux. Substitute native rendering only.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-screens', () => {
  const { View } = require('react-native');
  return {
    ...jest.requireActual('react-native-screens'),
    Screen: View,
    ScreenStack: View,
    ScreenStackItem: View,
    ScreenStackHeaderConfig: View,
  };
});
// Native motion is covered by the Android build. Jest uses the settled value.
jest.mock('react-native-reanimated', () => {
  const { useRef } = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    useSharedValue: value => useRef({ value }).current,
    useAnimatedStyle: buildStyle => buildStyle(),
    withTiming: value => value,
    interpolateColor: (value, _input, output) => output[value],
    ReduceMotion: { System: 'system' },
  };
});
