import {assertReportFits, reportText, toNativeReport} from '../src/quality/report';
import type {Inspection} from '../src/quality/types';
import {execute} from '../src/domain/engine';
import {createSeed} from '../src/domain/seed';
import {decodeSnapshot} from '../src/data/validation';
import type {Command} from '../src/domain/types';

function storedSignedInspection() {
  let state = createSeed();
  const at = '2026-11-16T09:00:00.000Z';
  function apply(command: Command) {
    state = execute(state, command, {key: `saved-${state.revision + 1}`, at, expectedRevision: state.revision});
  }
  apply({type: 'quality.start', subjectKind: 'job', subjectKey: 'job-101', inspector: 'Инспектор'});
  const inspection = state.inspections[0];
  const example = signedInspection();
  apply({type: 'quality.update', inspectionKey: inspection.key, patch: {
    inspectedQuantity: 1, processedOn: '2026-11-15', marking: 'ДЕМО',
    moisture: inspection.profile.moistureMin, length: inspection.profile.nominalLength,
    width: inspection.profile.nominalWidth, thickness: inspection.profile.nominalThickness,
    checks: example.checks, summary: 'Проверено',
    photos: example.photos.map(photo => ({...photo, uri: `file:///private/quality/${photo.fileName}`})),
  }});
  apply({type: 'quality.sign', inspectionKey: inspection.key, decision: 'released'});
  return state;
}

function legacyReportSize(report: ReturnType<typeof toNativeReport>) {
  return JSON.stringify({title: report.title, lines: report.lines,
    photos: report.photos.map(({fileName, caption}) => ({fileName, caption})),
  }).length;
}

function signedInspection(): Inspection {
  return {
    key: 'inspection-demo-1', subjectKind: 'job', subjectKey: 'job-demo-7',
    title: 'Панели для учебного павильона', reference: 'ЗК-ДЕМО-07',
    inspector: 'Демонстрационный инспектор', openedAt: '2026-11-16T08:00:00.000Z',
    updatedAt: '2026-11-16T08:30:00.000Z', signedAt: '2026-11-16T08:30:00.000Z',
    status: 'released', subjectFingerprint: 'demo-subject-snapshot',
    inspectedQuantity: 6, processedOn: '2026-11-15', marking: 'ДЕМО-ПАНЕЛЬ-07',
    moisture: 11, length: 1202, width: 301, thickness: 20,
    profile: {label: 'Учебная выборка: панель', moistureMin: 8, moistureMax: 13,
      nominalLength: 1200, nominalWidth: 300, nominalThickness: 20, tolerance: 3},
    checks: {
      identity: {verdict: 'pass', reasons: [], comment: 'Бирка читается'},
      cracks: {verdict: 'pass', reasons: [], comment: ''},
      chips: {verdict: 'pass', reasons: [], comment: ''},
      stains: {verdict: 'pass', reasons: [], comment: ''},
      dimensions: {verdict: 'pass', reasons: [], comment: 'По контрольному образцу'},
      moisture: {verdict: 'pass', reasons: [], comment: ''},
      finish: {verdict: 'pass', reasons: [], comment: ''},
      protection: {verdict: 'pass', reasons: [], comment: ''},
    },
    photos: [{fileName: 'photo_01234567-89ab-cdef-0123-456789abcdef.jpg',
      uri: 'content://application-private/photo/1', category: 'identity',
      caption: 'Общий вид бирки', capturedAt: '2026-11-16T08:15:00.000Z'}],
    summary: 'Проверена учебная контрольная выборка.',
  };
}

describe('signed inspection report', () => {
  it('includes the signed subject, decision, quantities, measurements, profile and educational limits', () => {
    const text = reportText(signedInspection());
    for (const expected of [
      'ЗК-ДЕМО-07', 'Панели для учебного павильона', 'Демонстрационный инспектор',
      '16.11.2026 11:30 (GMT+3)', 'Разрешено', 'Проверенное количество: 6',
      'ДЕМО-ПАНЕЛЬ-07', '2026-11-15', 'Учебная выборка: панель',
      '1202 мм', '1200 мм', '301 мм', '300 мм', '20 мм', '±3 мм',
      '11 %', '8–13 %', 'учебные критерии', 'не подтверждает соответствие стандарту',
    ]) {
      expect(text).toContain(expected);
    }
  });

  it('keeps failed criteria, selected findings and inspector comments in hold reports', () => {
    const inspection = signedInspection();
    inspection.status = 'hold';
    inspection.checks.cracks = {
      verdict: 'fail', reasons: ['Торцевая трещина', 'Раскрытие клеевого шва'],
      comment: 'Нужно отложить образец для повторной проверки.',
    };
    const text = reportText(inspection);

    expect(text).toContain('Приостановлено');
    expect(text).toContain('Трещины: Не соответствует');
    expect(text).toContain('Торцевая трещина; Раскрытие клеевого шва');
    expect(text).toContain('Нужно отложить образец для повторной проверки.');
    expect(text).toContain('Порода и маркировка: Соответствует');
    expect(text).toContain('Сколы и вмятины: Соответствует');
    expect(text).toContain('Пятна и изменение цвета: Соответствует');
    expect(text).toContain('Размеры и геометрия: Соответствует');
    expect(text).toContain('Влажность древесины: Соответствует');
    expect(text).toContain('Шлифовка и покрытие: Соответствует');
    expect(text).toContain('Упаковка и защита: Соответствует');
  });

  it.each([
    {status: 'draft', signedAt: null},
    {status: 'draft', signedAt: '2026-11-16T08:30:00.000Z'},
    {status: 'released', signedAt: null},
    {status: 'hold', signedAt: ''},
    {status: 'hold', signedAt: 'invalid-date'},
  ] as const)('rejects unsigned or invalid snapshots (%s)', patch => {
    const inspection: Inspection = {...signedInspection(), ...patch};
    expect(() => toNativeReport(inspection)).toThrow(/подписан/i);
    expect(() => reportText(inspection)).toThrow(/подписан/i);
  });

  it('passes only owned photo names, with readable category captions and no URI metadata', () => {
    const inspection = signedInspection();
    const before = JSON.stringify(inspection);
    const input = toNativeReport(inspection);

    expect(input.photos).toEqual([{
      fileName: 'photo_01234567-89ab-cdef-0123-456789abcdef.jpg',
      group: 'Идентификация',
      caption: 'Порода и маркировка — Общий вид бирки; снято 16.11.2026 11:15 (GMT+3)',
    }]);
    expect(JSON.stringify(input)).not.toContain('content://');
    expect(JSON.stringify(inspection)).toBe(before);
    input.photos[0].caption = 'Changed output';
    expect(inspection.photos[0].caption).toBe('Общий вид бирки');
  });

  it.each([
    '../photo_01234567-89ab-cdef.jpg', '/private/photo_01234567-89ab-cdef.jpg',
    'file://photo_01234567-89ab-cdef.jpg', 'photo_01234567-89ab-cdef.jpg/extra',
    'photo_01234567-89ab-cdef.jpg\n', 'photo_01234567-89ab-cdef.png',
    'photo_../../secret.jpg', 'photo_01234567-89ab-cdef.JPG',
  ])('rejects photo path injection: %s', fileName => {
    const inspection = signedInspection();
    inspection.photos[0].fileName = fileName;
    expect(() => toNativeReport(inspection)).toThrow(/фотограф/i);
  });

  it('renders arbitrary text literally and prevents newlines or controls from forging report fields', () => {
    const inspection = signedInspection();
    inspection.inspector = 'Учебный <инспектор> & "контроль"\r\nРешение: подмена';
    inspection.summary = 'Строка 1\nСтрока 2\u0000';
    inspection.photos[0].caption = '<img src="file:///private">\nПодпись';
    const output = toNativeReport(inspection);

    expect(output.lines).toContain('Инспектор: Учебный <инспектор> & "контроль" Решение: подмена');
    expect(output.lines).toContain('Заключение: Строка 1 Строка 2');
    expect(output.lines.every(line => !/[\r\n]/.test(line) && !line.includes('\u0000'))).toBe(true);
    expect(output.photos[0].caption).toContain('<img src="file:///private"> Подпись');
    expect(output.photos[0]).not.toHaveProperty('uri');
  });

  it('creates detached passport and measurement rows from the signed snapshot', () => {
    const report = toNativeReport(signedInspection());
    expect(report.document.passport).toEqual([
      {label: 'Номер проверки', value: 'inspection-demo-1'},
      {label: 'Основание', value: 'ЗК-ДЕМО-07'},
      {label: 'Заказ', value: 'Панели для учебного павильона'},
      {label: 'Инспектор', value: 'Демонстрационный инспектор'},
      {label: 'Начало проверки', value: '16.11.2026 11:00 (GMT+3)'},
      {label: 'Подписано', value: '16.11.2026 11:30 (GMT+3)'},
      {label: 'Проверенное количество', value: '6'},
      {label: 'Маркировка', value: 'ДЕМО-ПАНЕЛЬ-07'},
      {label: 'Дата обработки', value: '2026-11-15'},
      {label: 'Контрольный образец', value: 'Учебная выборка: панель'},
    ]);
    expect(report.document.measurements).toEqual([
      {label: 'Влажность', measured: '11 %', expected: '8–13 %'},
      {label: 'Длина', measured: '1202 мм', expected: '1200 мм ±3 мм'},
      {label: 'Ширина', measured: '301 мм', expected: '300 мм ±3 мм'},
      {label: 'Толщина', measured: '20 мм', expected: '20 мм ±3 мм'},
    ]);
    expect(report.document.criteria).toHaveLength(8);
    expect(report.document.conclusion).toBe('Проверена учебная контрольная выборка.');
    expect(() => assertReportFits(report)).not.toThrow();
  });

  it('keeps full findings, comments and individual photo captions under catalogue groups', () => {
    const inspection = signedInspection();
    inspection.status = 'hold';
    inspection.checks.cracks = {verdict: 'fail', reasons: ['Торцевая трещина', 'Раскрытие клеевого шва'], comment: 'Полный комментарий '.repeat(100).trim()};
    inspection.photos.push({...inspection.photos[0], fileName: 'photo_11234567-89ab-cdef-0123-456789abcdef.jpg', category: 'cracks', caption: 'Торец образца'});
    const report = toNativeReport(inspection);
    expect(report.document.criteria[1]).toEqual({group: 'Поверхность', title: 'Трещины', status: 'fail', findings: 'Торцевая трещина; Раскрытие клеевого шва', comment: inspection.checks.cracks.comment});
    expect(report.document.decision).toBe('Приостановлено');
    expect(report.photos.map(photo => photo.group)).toEqual(['Идентификация', 'Поверхность']);
    expect(report.photos[1].caption).toContain('Торец образца');
    expect(report.photos).toHaveLength(2);
    expect(() => assertReportFits(report)).not.toThrow();
  });

  it.each(['comment', 'conclusion', 'caption', 'group', 'passport', 'filename'] as const)('rejects overflow or unsafe %s before signing', field => {
    const report = toNativeReport(signedInspection());
    if (field === 'comment') report.document.criteria[0].comment = 'а'.repeat(4001);
    if (field === 'conclusion') report.document.conclusion = 'а'.repeat(4001);
    if (field === 'caption') report.photos[0].caption = 'а'.repeat(2001);
    if (field === 'group') report.photos[0].group = 'а'.repeat(121);
    if (field === 'passport') report.document.passport[0].value = 'а'.repeat(4001);
    if (field === 'filename') report.photos[0].fileName = '../pdf_report.pdf';
    expect(() => assertReportFits(report)).toThrow(/пределы PDF/);
  });

  it('loads and exports legacy signed snapshots with 3500-character comments and conclusions unchanged', () => {
    const saved = storedSignedInspection();
    saved.inspections[0].checks.cracks.comment = 'К'.repeat(3490) + 'КОНЕЦ_3500';
    saved.inspections[0].summary = 'З'.repeat(3490) + 'КОНЕЦ_3500';
    const serialized = JSON.stringify(saved);
    const loaded = decodeSnapshot(serialized);
    const report = toNativeReport(loaded.inspections[0]);

    expect(JSON.stringify(loaded)).toBe(serialized);
    expect(report.document.criteria[1].comment).toBe(saved.inspections[0].checks.cracks.comment);
    expect(report.document.conclusion).toBe(saved.inspections[0].summary);
    expect(() => assertReportFits(report)).not.toThrow();
  });

  it('preserves the legacy size envelope with maximum escaped comments, conclusion and twenty captions', () => {
    const saved = storedSignedInspection();
    const inspection = saved.inspections[0];
    Object.values(inspection.checks).forEach(check => { check.comment = '"'.repeat(4000 - 'Комментарий: '.length); });
    inspection.summary = '"'.repeat(4000 - 'Заключение: '.length);
    inspection.marking = '"'.repeat(4000 - 'Маркировка: '.length);
    const photo = {...inspection.photos[0], caption: ''};
    inspection.photos = [photo];
    const captionLength = 2000 - toNativeReport(inspection).photos[0].caption.length - ' — '.length;
    inspection.photos = Array.from({length: 20}, (_, index) => {
      const fileName = `photo_${String(index).padStart(8, '0')}-89ab-cdef-0123-456789abcdef.jpg`;
      return {...photo, fileName, uri: `file:///private/quality/${fileName}`, caption: '"'.repeat(captionLength)};
    });
    const report = toNativeReport(inspection);
    expect(Math.max(...report.lines.map(line => line.length))).toBe(4000);
    expect(report.photos.every(item => item.caption.length === 2000)).toBe(true);
    expect(legacyReportSize(report)).toBeLessThanOrEqual(200000);
    expect(JSON.stringify(report).length).toBeGreaterThan(200000);
    expect(JSON.stringify(report).length).toBeLessThanOrEqual(450000);
    expect(decodeSnapshot(JSON.stringify(saved)).inspections[0]).toEqual(inspection);
    expect(() => assertReportFits(report)).not.toThrow();
  });
});
