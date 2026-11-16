const {
  target,
  show,
  tap,
  fill,
  login,
  navigate,
  waitFor,
  by,
  device,
  element,
  expect,
} = require('./helpers');
const { captureEvidence } = require('./camera');
const { previewAndCancelPrint } = require('./printing');
const criteria = [
  'identity',
  'cracks',
  'chips',
  'stains',
  'dimensions',
  'moisture',
  'finish',
  'protection',
];
async function inspect(hold = false) {
  await navigate('quality');
  await tap('inspect-job-101');
  await device.takeScreenshot('quality-document');
  await tap('document-start');
  await fill('inspection-quantity', hold ? '5' : '4');
  await fill('scanner-input', 'WOOD-DEMO-101');
  await tap('scanner-apply');
  await tap('inspection-date');
  await element(by.text('OK')).tap();
  await fill('inspection-moisture', '10.5');
  await fill('inspection-length', '1200');
  await fill('inspection-width', '600');
  await fill('inspection-thickness', '28');
  await tap('inspection-save');
  await target('workspace-scroll').scrollTo('top');
  await device.takeScreenshot('inspection-data');
  await tap('inspection-next-checks');
  for (const id of criteria) {
    const section =
      id === 'identity'
        ? 'trace'
        : ['dimensions', 'moisture'].includes(id)
        ? 'measure'
        : ['cracks', 'chips', 'stains'].includes(id)
        ? 'surface'
        : id === 'finish'
        ? 'finish'
        : 'pack';
    await target('workspace-scroll').scrollTo('top');
    await tap('check-section-' + section);
    await tap('criterion-' + id);
    await target(
      'verdict-' + (hold && id === 'cracks' ? 'fail' : 'pass'),
    ).tap();
    if (hold && id === 'cracks') {
      await target('reason-0').tap();
      await target('criterion-comment').replaceText(
        'Торец образца требует повторной обработки',
      );
      await device.takeScreenshot('criterion-modal');
    }
    await target('criterion-save').tap();
  }
  await target('workspace-scroll').scrollTo('top');
  await tap('check-section-surface');
  await device.takeScreenshot('quality-checks');
  await tap('inspection-next-photos');
  await tap('photo-category-select');
  await target(
    hold ? 'photo-category-cracks' : 'photo-category-identity',
  ).tap();
  await fill(
    'photo-caption',
    hold
      ? 'Повреждение контрольного образца'
      : 'Маркировка и общий вид учебного образца',
  );
  await captureEvidence();
  await tap('photos-' + (hold ? 'cracks' : 'identity') + '-photo-0');
  await expect(target('photo-preview')).toBeVisible();
  await device.takeScreenshot('photo-carousel');
  await target('photo-preview-close').tap();
  await tap('inspection-tab-checks');
  await tap('check-section-' + (hold ? 'surface' : 'trace'));
  await show('evidence-' + (hold ? 'cracks' : 'identity') + '-photo-0');
  await device.takeScreenshot('inspection-evidence');
  await tap('inspection-tab-photos');
  await target('workspace-scroll').scrollTo('top');
  await device.takeScreenshot('photo-evidence');
  await tap('inspection-next-decision');
  await fill(
    'inspection-summary',
    hold
      ? 'Изолировать партию, устранить трещину и повторить осмотр.'
      : 'Контрольный образец и упаковка проверены. Разрешена передача в отгрузку.',
  );
  await tap('summary-save');
  await tap(hold ? 'quality-hold' : 'quality-release');
  await show('quality-complete');
  await expect(target('quality-complete')).toBeVisible();
  await target('workspace-scroll').scrollTo('top');
  await device.takeScreenshot(hold ? 'quality-hold' : 'quality-release');
  await tap('report-create');
  await show('report-created');
  await expect(target('report-created')).toBeVisible();
  await show('report-open');
  // The private native Activity pauses React Native with mount items queued.
  // Observe native controls directly until returning to the resumed JS screen.
  await device.disableSynchronization();
  try {
    await target('report-open').tap();
    const counter = element(by.label('Номер страницы PDF'));
    await waitFor(counter).toBeVisible().withTimeout(15000);
    let pageCount = 0;
    for (let attempt = 0; attempt < 30; attempt++) {
      const attributes = await counter.getAttributes();
      const match = attributes.text?.match(/^Страница 1 из (\d+)$/);
      if (match) {
        pageCount = Number(match[1]);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (pageCount < 2)
      throw new Error('Expected text and photo sections on separate pages');
    await device.takeScreenshot('native-pdf-first-page');
    await element(by.label('Прокрутка PDF')).scroll(300, 'down');
    await device.takeScreenshot('native-pdf-scroll');
    for (let page = 2; page <= pageCount; page++) {
      await element(by.label('Следующая страница PDF')).tap();
      await waitFor(element(by.text(`Страница ${page} из ${pageCount}`)))
        .toBeVisible()
        .withTimeout(15000);
      await device.takeScreenshot('native-pdf-page-' + page);
    }
    await device.takeScreenshot('native-pdf-viewer');
    await element(by.text('Закрыть PDF')).tap();
  } finally {
    await device.enableSynchronization();
  }
  await previewAndCancelPrint();
}
describe('Quality inspection on an Android tablet', () => {
  beforeEach(async () => {
    await device.launchApp({ newInstance: true, delete: true });
    await login();
  });
  it('inspects actual picked quantity, photographs, signs, exports PDF and completes dispatch', async () => {
    await device.takeScreenshot('quality-overview');
    await navigate('jobs');
    await tap('job-job-101');
    await tap('job-begin');
    await fill('pick-line-1', '1');
    await fill(
      'shortage-line-1',
      'Один образец оставлен для повторной обработки',
    );
    await tap('count-line-1');
    await fill('pick-line-2', '3');
    await tap('count-line-2');
    await device.takeScreenshot('picking');
    await tap('picking-finish');
    await fill('parcel-mass', '4200');
    await tap('parcel-save');
    await tap('dispatch-confirm');
    await show('job-stage');
    await expect(target('job-stage')).toHaveText('Готово к отправке');
    await inspect();
    await navigate('jobs');
    await tap('job-job-101');
    await tap('dispatch-confirm');
    await show('dispatch-receipt');
    await expect(target('dispatch-receipt')).toBeVisible();
    await expect(element(by.text('Передано 4 шт. · 4200 г'))).toBeVisible();
    await device.takeScreenshot('completed-dispatch');
  });
  it('records a defect with photo, signs a hold, exports PDF and reopens the report after PIN unlock', async () => {
    await inspect(true);
    await device.launchApp({ newInstance: true });
    await login(false);
    await tap('report-job-101');
    await show('quality-complete');
    await expect(target('quality-complete')).toHaveText(
      'Объект задержан. Устраните замечания и проведите новый осмотр.',
    );
    await tap('report-create');
    await show('report-created');
    await expect(target('report-created')).toBeVisible();
  });
});
