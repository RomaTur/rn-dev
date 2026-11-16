const {
  by,
  device,
  element,
  expect,
  target,
  show,
  tap,
  fill,
  login,
  navigate,
  waitFor,
} = require('./helpers');
async function menu(name) {
  await navigate(name);
}
async function openJob() {
  await menu('jobs');
  await tap('job-job-101');
  await tap('job-begin');
}
describe('Woodworking workshop', () => {
  beforeEach(async () => {
    await device.launchApp({ newInstance: true, delete: true });
    await login();
  });
  it('receives a timber lot, counts it and keeps it after restart', async () => {
    await menu('stock');
    await tap('receive-open');
    await fill('receipt-label', 'Доска учебная');
    await fill('receipt-sku', 'DEMO-TIMBER-91');
    await fill('receipt-quantity', '12');
    await expect(target('receipt-label')).toHaveText('Доска учебная');
    await expect(target('receipt-sku')).toHaveText('DEMO-TIMBER-91');
    await tap('receipt-save');
    await waitFor(target('stock-success')).toExist().withTimeout(5000);
    await tap('stock-DEMO-TIMBER-91');
    await fill('inventory-count', '11');
    await fill('inventory-reason', 'Одна заготовка передана на контроль');
    await tap('inventory-save');
    await device.launchApp({ newInstance: true });
    await login(false);
    await menu('stock');
    await fill('stock-search', 'DEMO-TIMBER-91');
    await expect(target('stock-DEMO-TIMBER-91')).toBeVisible();
    await expect(element(by.text('доступно 11'))).toBeVisible();
    await device.takeScreenshot('stock');
  });
  it('preserves pending work offline and retries successfully', async () => {
    await openJob();
    await menu('sync');
    await tap('sync-offline');
    await tap('sync-send');
    await menu('history');
    await expect(target('latest-activity')).toBeVisible();
    await menu('sync');
    await tap('sync-online');
    await tap('sync-send');
    await show('sync-success');
    await expect(target('sync-success')).toBeVisible();
  });
});
