// AOSP camera runs outside the app process, so Espresso/Detox cannot drive it.
// Resolve controls from the actual UI hierarchy; never rely on screen coordinates.
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { device, waitFor } = require('detox');
const { target, tap } = require('./helpers');
function adb(...args) {
  return execFileSync(
    path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb'),
    ['-s', process.env.DETOX_DEVICE || device.id, ...args],
    { encoding: 'utf8', timeout: 15000 },
  );
}
async function cameraButton(resource) {
  let previousBounds;
  for (let attempt = 0; attempt < 12; attempt++) {
    adb('shell', 'uiautomator', 'dump', '/sdcard/woodland-camera-test.xml');
    const xml = adb('shell', 'cat', '/sdcard/woodland-camera-test.xml');
    const node = xml
      .match(/<node\b[^>]*>/g)
      ?.find(
        value =>
          value.includes(`resource-id="com.android.camera2:id/${resource}"`) &&
          value.includes('enabled="true"') &&
          value.includes('clickable="true"'),
      );
    const box = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    const bounds =
      box && +box[3] > +box[1] && +box[4] > +box[2] ? box[0] : null;
    if (bounds && bounds === previousBounds) {
      adb(
        'shell',
        'input',
        'tap',
        String(Math.round((+box[1] + +box[3]) / 2)),
        String(Math.round((+box[2] + +box[4]) / 2)),
      );
      return;
    }
    previousBounds = bounds;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error('AOSP camera control not available: ' + resource);
}
async function captureEvidence() {
  await device.disableSynchronization();
  try {
    await tap('photo-capture');
    await cameraButton('shutter_button');
    await cameraButton('done_button');
    // Wait for the resumed JS screen to persist the attachment before
    // registering AsyncStorage idling resources again.
    await waitFor(target('photo-evidence-0')).toExist().withTimeout(20000);
  } finally {
    await device.enableSynchronization();
  }
}
module.exports = { captureEvidence, adb };
