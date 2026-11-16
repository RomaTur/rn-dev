/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: { config: 'e2e/jest.config.js' },
    jest: { setupTimeout: 180000 },
  },
  apps: {
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      testBinaryPath:
        'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk',
      build:
        'cd android && ./gradlew :app:assembleDebug :app:assembleAndroidTest -DtestBuildType=debug -PreactNativeArchitectures=arm64-v8a --max-workers=2',
    },
  },
  devices: {
    attached: {
      type: 'android.attached',
      device: { adbName: process.env.DETOX_DEVICE || 'emulator-5582' },
    },
    tablet: {
      type: 'android.emulator',
      device: { avdName: process.env.DETOX_AVD || 'WoodlandReview' },
    },
  },
  configurations: {
    'android.attached': { device: 'attached', app: 'android.debug' },
    'android.tablet': { device: 'tablet', app: 'android.debug' },
  },
};
