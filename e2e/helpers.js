const { by, device, element, expect, waitFor } = require('detox');
const target = id => element(by.id(id));
async function stablePosition(id) {
  let previous;
  let stable = 0;
  for (let attempt = 0; attempt < 20; attempt++) {
    const frame = JSON.stringify((await target(id).getAttributes()).frame);
    stable = frame === previous ? stable + 1 : 0;
    if (stable >= 2) return;
    previous = frame;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Layout did not settle for ' + id);
}
async function show(id) {
  try {
    await expect(target(id)).toBeVisible(100);
    return stablePosition(id);
  } catch {}
  await target('workspace-scroll').scrollTo('top');
  for (let i = 0; i < 15; i++) {
    try {
      await expect(target(id)).toBeVisible(100);
      return stablePosition(id);
    } catch {}
    await target('workspace-scroll').scroll(240, 'down');
  }
  throw new Error('Unable to reveal ' + id);
}
async function tap(id) {
  console.log('tap', id);
  await show(id);
  await target(id).tap();
}
async function fill(id, value) {
  await show(id);
  await target(id).replaceText(value);
}
async function login(fresh = true) {
  await waitFor(target('auth-pin')).toBeVisible().withTimeout(30000);
  if (fresh) {
    await target('auth-name').replaceText('Демо инспектор');
    await target('auth-confirm').replaceText('246810');
  }
  await target('auth-pin').replaceText('246810');
  await target('auth-submit').tap();
  await waitFor(target('app-menu')).toBeVisible().withTimeout(15000);
}
async function navigate(page) {
  await target('app-menu').tap();
  await target('nav-' + page).tap();
}
module.exports = {
  navigate,
  target,
  show,
  tap,
  fill,
  login,
  by,
  device,
  element,
  expect,
  waitFor,
  stablePosition,
};
