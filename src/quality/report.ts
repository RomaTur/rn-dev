import type { NativeReportInput } from '../device/types';
import { CRITERIA } from './catalogue';
import type { Assessment, Inspection } from './types';

const VERDICTS: Record<Assessment['verdict'], string> = {
  pending: 'Не оценено',
  pass: 'Соответствует',
  fail: 'Не соответствует',
};
const OWNED_PHOTO_NAME = /^photo_[a-f0-9-]{16,64}\.jpg$/;

/** Text is drawn by the native PDF adapter, never interpreted as HTML. */
function singleLine(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex -- Printable text excludes control bytes.
    .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function timestamp(value: string): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new Error('Некорректная дата в подписанном отчёте.');
  }
  const local = new Date(milliseconds + 3 * 60 * 60 * 1000).toISOString();
  return `${local.slice(8, 10)}.${local.slice(5, 7)}.${local.slice(
    0,
    4,
  )} ${local.slice(11, 16)} (GMT+3)`;
}

function measured(value: number | null, unit: string): string {
  return value !== null && Number.isFinite(value)
    ? `${value} ${unit}`
    : 'не измерено';
}

/** Creates a detached snapshot for native rendering; exporting does not sign. */
export function toNativeReport(inspection: Inspection): NativeReportInput {
  if (
    (inspection.status !== 'released' && inspection.status !== 'hold') ||
    !inspection.signedAt ||
    !Number.isFinite(Date.parse(inspection.signedAt))
  ) {
    throw new Error('Отчёт доступен только для подписанной проверки.');
  }

  const profile = inspection.profile;
  const decision = inspection.status === 'released' ? 'Разрешено' : 'Приостановлено';
  const notice = 'Применены учебные критерии и демонстрационные пределы; отчёт не подтверждает соответствие стандарту.';
  const passport = [
    {label: 'Номер проверки', value: singleLine(inspection.key)},
    {label: 'Основание', value: singleLine(inspection.reference)},
    {label: inspection.subjectKind === 'job' ? 'Заказ' : 'Материал', value: singleLine(inspection.title)},
    {label: 'Инспектор', value: singleLine(inspection.inspector)},
    {label: 'Начало проверки', value: timestamp(inspection.openedAt)},
    {label: 'Подписано', value: timestamp(inspection.signedAt)},
    {label: 'Проверенное количество', value: String(inspection.inspectedQuantity)},
    {label: 'Маркировка', value: singleLine(inspection.marking) || 'не указана'},
    {label: 'Дата обработки', value: singleLine(inspection.processedOn) || 'не указана'},
    {label: 'Контрольный образец', value: singleLine(profile.label)},
  ];
  const measurements = [
    {label: 'Влажность', measured: measured(inspection.moisture, '%'), expected: `${profile.moistureMin}–${profile.moistureMax} %`},
    {label: 'Длина', measured: measured(inspection.length, 'мм'), expected: `${profile.nominalLength} мм ±${profile.tolerance} мм`},
    {label: 'Ширина', measured: measured(inspection.width, 'мм'), expected: `${profile.nominalWidth} мм ±${profile.tolerance} мм`},
    {label: 'Толщина', measured: measured(inspection.thickness, 'мм'), expected: `${profile.nominalThickness} мм ±${profile.tolerance} мм`},
  ];
  const criteria = CRITERIA.map(criterion => {
    const assessment = inspection.checks[criterion.id];
    return {
      group: singleLine(criterion.group),
      title: singleLine(criterion.title),
      status: assessment.verdict,
      findings: assessment.reasons.map(singleLine).filter(Boolean).join('; ') || 'не отмечены',
      comment: singleLine(assessment.comment) || '—',
    };
  });
  const lines = [
    `Номер проверки: ${singleLine(inspection.key)}`,
    `Основание: ${singleLine(inspection.reference)}`,
    `Объект: ${
      inspection.subjectKind === 'job' ? 'Заказ' : 'Материал'
    } — ${singleLine(inspection.title)}`,
    `Инспектор: ${singleLine(inspection.inspector)}`,
    `Начало проверки: ${timestamp(inspection.openedAt)}`,
    `Подписано: ${timestamp(inspection.signedAt)}`,
    `Решение: ${
      inspection.status === 'released' ? 'Разрешено' : 'Приостановлено'
    }`,
    `Проверенное количество: ${inspection.inspectedQuantity}`,
    `Маркировка: ${singleLine(inspection.marking) || 'не указана'}`,
    `Дата обработки: ${singleLine(inspection.processedOn) || 'не указана'}`,
    `Профиль контрольного образца: ${singleLine(profile.label)}`,
    'Измерения относятся к контрольному образцу указанного профиля.',
    `Влажность: измерено ${measured(
      inspection.moisture,
      '%',
    )}; учебный диапазон ${profile.moistureMin}–${profile.moistureMax} %`,
    `Длина: измерено ${measured(inspection.length, 'мм')}; номинал ${
      profile.nominalLength
    } мм; учебный допуск ±${profile.tolerance} мм`,
    `Ширина: измерено ${measured(inspection.width, 'мм')}; номинал ${
      profile.nominalWidth
    } мм; учебный допуск ±${profile.tolerance} мм`,
    `Толщина: измерено ${measured(inspection.thickness, 'мм')}; номинал ${
      profile.nominalThickness
    } мм; учебный допуск ±${profile.tolerance} мм`,
    'Результаты по критериям:',
  ];

  for (const criterion of CRITERIA) {
    const assessment = inspection.checks[criterion.id];
    lines.push(
      `${criterion.group} / ${criterion.title}: ${
        VERDICTS[assessment.verdict]
      }`,
      `Причины: ${
        assessment.reasons.map(singleLine).filter(Boolean).join('; ') ||
        'не отмечены'
      }`,
      `Комментарий: ${singleLine(assessment.comment) || '—'}`,
    );
  }
  lines.push(
    `Заключение: ${singleLine(inspection.summary) || '—'}`,
    notice,
  );

  const photos = inspection.photos.map(photo => {
    // Comparing the entire match also rejects a trailing newline accepted by `$`.
    if (photo.fileName.match(OWNED_PHOTO_NAME)?.[0] !== photo.fileName) {
      throw new Error('Недопустимое имя файла фотографии.');
    }
    const category = CRITERIA.find(
      criterion => criterion.id === photo.category,
    );
    if (!category) {
      throw new Error('Неизвестная категория фотографии.');
    }
    const description = singleLine(photo.caption);
    return {
      fileName: photo.fileName,
      group: singleLine(category.group),
      caption: `${category.title}${
        description ? ` — ${description}` : ''
      }; снято ${timestamp(photo.capturedAt)}`,
    };
  });

  return {
    title: `Отчёт о контроле качества — ${singleLine(inspection.reference)}`,
    lines,
    photos,
    document: {passport, measurements, criteria, conclusion: singleLine(inspection.summary) || '—', decision, notice},
  };
}

export function reportText(inspection: Inspection): string {
  const report = toNativeReport(inspection);
  return [
    report.title,
    ...report.lines,
    ...report.photos.map(
      (photo, index) => `Фотография ${index + 1}: ${photo.caption}`,
    ),
  ].join('\n');
}

/** Keep immutable signed documents inside the native renderer's bounded input contract. */
export function assertReportFits(report: NativeReportInput): void {
  const {document} = report;
  // Persisted signed inspections were validated against this exact envelope.
  // Structured rendering duplicates its text; that must not invalidate old signatures.
  const legacy = {
    title: report.title,
    lines: report.lines,
    photos: report.photos.map(({fileName, caption}) => ({fileName, caption})),
  };
  if (
    report.title.length < 1 || report.title.length > 200 ||
    report.lines.length > 400 ||
    report.lines.some(line => line.length > 4000) ||
    report.lines.reduce((total, line) => total + line.length, 0) > 100000 ||
    report.photos.length > 20 ||
    report.photos.some(photo => photo.caption.length > 2000 || photo.group.length < 1 || photo.group.length > 120 || photo.fileName.match(OWNED_PHOTO_NAME)?.[0] !== photo.fileName) ||
    document.passport.length < 1 || document.passport.length > 20 ||
    document.passport.some(row => row.label.length < 1 || row.label.length > 120 || row.value.length > 4000) ||
    document.measurements.length !== 4 ||
    document.measurements.some(row => row.label.length < 1 || row.label.length > 120 || row.measured.length > 500 || row.expected.length > 500) ||
    document.criteria.length !== 8 ||
    document.criteria.some(row => row.group.length < 1 || row.group.length > 120 || row.title.length < 1 || row.title.length > 120 || !['pending', 'pass', 'fail'].includes(row.status) || row.findings.length > 4000 || row.comment.length > 4000) ||
    document.conclusion.length > 4000 || document.notice.length > 500 ||
    !['Разрешено', 'Приостановлено'].includes(document.decision) ||
    JSON.stringify(legacy).length > 200000 ||
    // At most a second copy of legacy text, plus bounded labels/keys/group metadata.
    JSON.stringify(report).length > 450000
  ) {
    throw new Error(
      'Отчёт превышает пределы PDF. Сократите комментарии и заключение до 3000 символов, подписи фото до 1500 символов и повторите подписание.',
    );
  }
}
