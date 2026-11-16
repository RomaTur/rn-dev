module.exports = {
  preset: '@react-native/jest-preset',
  watchman: false,
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|react-native-(screens|safe-area-context|reanimated|worklets)|@react-native(-community)?|@react-navigation|react-redux|redux(-thunk)?|@reduxjs/toolkit|immer|reselect|nanoid|use-sync-external-store|@react-native-masked-view|@react-native-async-storage)/)',
  ],
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
};
