const { device, target, expect, show } = require('./helpers');
const { adb } = require('./camera');

// Open the Android chooser and cancel. A test never selects a printer or submits a job.
async function previewAndCancelPrint() {
  await show('report-print');
  await device.disableSynchronization();
  try {
    await target('report-print').tap();
    let opened = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      adb('shell', 'uiautomator', 'dump', '/sdcard/woodland-print-test.xml');
      const xml = adb('shell', 'cat', '/sdcard/woodland-print-test.xml');
      if (xml.includes('package="com.android.printspooler"')) {
        opened = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    if (!opened) throw new Error('Android print chooser did not open');
    await device.takeScreenshot('android-print-preview');
    adb('shell', 'input', 'keyevent', '4');
  } finally {
    await device.enableSynchronization();
  }
  await show('quality-complete');
  await expect(target('quality-complete')).toBeVisible();
}
module.exports = { previewAndCancelPrint };
