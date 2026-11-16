const { execFileSync } = require('node:child_process');
const path = require('node:path');
const {
  target,
  tap,
  login,
  device,
  expect,
  waitFor,
  stablePosition,
} = require('./helpers');

function fontScale(value) {
  execFileSync(path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb'), [
    '-s',
    process.env.DETOX_DEVICE || device.id,
    'shell',
    'settings',
    'put',
    'system',
    'font_scale',
    value,
  ]);
}

describe('Landscape tablet ergonomics', () => {
  it('keeps navigation and save usable with enlarged text and the software keyboard', async () => {
    fontScale('1.0');
    try {
      await device.launchApp({ newInstance: true, delete: true });
      await login();
      await tap('inspect-job-101');
      await tap('document-start');
      await expect(target('inspection-rail')).toBeVisible();
      await device.takeScreenshot('tablet-normal-data');
      fontScale('1.3');
      await device.launchApp({ newInstance: true });
      await login(false);
      await tap('inspect-job-101');
      await tap('document-start');
      await expect(target('inspection-tab-photos')).toBeVisible();
      await expect(target('inspection-save')).toBeVisible();
      await device.takeScreenshot('tablet-large-text-data');
      await target('inspection-tab-checks').tap();
      await tap('check-section-surface');
      await tap('criterion-cracks');
      await target('verdict-fail').tap();
      await target('reason-0').tap();
      await target('criterion-comment').tap();
      // Keep the real IME open. Espresso typeText taps the input's original
      // center again after resize, outside its clipped visible portion.
      await target('criterion-comment').replaceText('Demo edge check');
      await waitFor(target('criterion-compact'))
        .toBeVisible()
        .withTimeout(10000);
      await stablePosition('criterion-save');
      await expect(target('criterion-save')).toBeVisible(100);
      await device.takeScreenshot('tablet-large-text-keyboard');
      await target('criterion-save').tap();
      await waitFor(target('criterion-cracks')).toBeVisible().withTimeout(5000);
      await target('criterion-cracks').tap();
      await expect(target('criterion-comment')).toHaveText('Demo edge check');
      await target('criterion-cancel').tap();
    } finally {
      fontScale('1.0');
    }
  });
});
