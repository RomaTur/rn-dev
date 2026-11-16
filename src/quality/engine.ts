import { assertReportFits, toNativeReport } from './report';
import type { CommandContext, Job, StockLot, Warehouse } from '../domain/types';
import { CRITERIA } from './catalogue';
import type {
  Inspection,
  InspectionFields,
  QualityCommand,
  QualityProfile,
} from './types';

type RecordValue = Record<string, unknown>;
const fieldNames = [
  'inspectedQuantity',
  'processedOn',
  'marking',
  'moisture',
  'length',
  'width',
  'thickness',
  'checks',
  'photos',
  'summary',
];
const measurementNames = ['moisture', 'length', 'width', 'thickness'] as const;
const profileNames = [
  'label',
  'moistureMin',
  'moistureMax',
  'nominalLength',
  'nominalWidth',
  'nominalThickness',
  'tolerance',
];
const lotNames = [
  'key',
  'sku',
  'label',
  'kind',
  'species',
  'size',
  'location',
  'quantity',
];

function requireValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function record(value: unknown, name: string): RecordValue {
  requireValue(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    `Некорректное поле «${name}».`,
  );
  return value as RecordValue;
}
function keys(value: RecordValue, allowed: string[], name: string, all = true) {
  requireValue(
    Object.keys(value).every(key => allowed.includes(key)) &&
      (!all || allowed.every(key => Object.hasOwn(value, key))),
    `Некорректный состав полей «${name}».`,
  );
}
function text(
  value: unknown,
  name: string,
  empty = false,
): asserts value is string {
  requireValue(
    typeof value === 'string' && (empty || value.trim().length > 0),
    `Заполните поле «${name}».`,
  );
}
function whole(
  value: unknown,
  name: string,
  minimum = 0,
): asserts value is number {
  requireValue(
    typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= minimum,
    `${name}: укажите целое число от ${minimum}.`,
  );
}
function finite(
  value: unknown,
  name: string,
  minimum = 0,
): asserts value is number {
  requireValue(
    typeof value === 'number' && Number.isFinite(value) && value >= minimum,
    `Некорректное измерение «${name}».`,
  );
}
function timestamp(value: unknown, name: string): asserts value is string {
  text(value, name);
  requireValue(
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
      value,
    ) &&
      dateValid(value.slice(0, 10)) &&
      Number.isFinite(Date.parse(value)),
    `Некорректное время «${name}».`,
  );
}
function dateValid(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
function commandDay(at: string): string {
  return new Date(Date.parse(at) + 3 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}
function validateProfile(value: unknown): asserts value is QualityProfile {
  const profile = record(value, 'Профиль');
  keys(profile, profileNames, 'Профиль');
  text(profile.label, 'Название профиля');
  requireValue(
    profile.label.includes('ДЕМО'),
    'Профиль должен быть обозначен как ДЕМО.',
  );
  for (const name of profileNames.filter(item => item !== 'label'))
    finite(profile[name], name);
  requireValue(
    (profile.moistureMin as number) <= (profile.moistureMax as number) &&
      (profile.moistureMax as number) <= 100,
    'Некорректный диапазон влажности.',
  );
  for (const name of ['nominalLength', 'nominalWidth', 'nominalThickness'])
    requireValue(
      (profile[name] as number) > 0,
      'Номинальные размеры должны быть больше нуля.',
    );
}

/** Only application-owned photo identities cross the domain boundary. Native code verifies ownership on disk. */
function validateFields(
  value: unknown,
  partial: boolean,
): asserts value is InspectionFields {
  const fields = record(value, 'Данные осмотра');
  keys(fields, fieldNames, 'Данные осмотра', !partial);
  if (Object.hasOwn(fields, 'inspectedQuantity'))
    whole(fields.inspectedQuantity, 'Проверенное количество');
  for (const name of ['processedOn', 'marking', 'summary'])
    if (Object.hasOwn(fields, name)) text(fields[name], name, true);
  if (fields.processedOn)
    requireValue(
      dateValid(fields.processedOn as string),
      'Укажите действительную дату обработки.',
    );
  for (const name of measurementNames)
    if (Object.hasOwn(fields, name) && fields[name] !== null) {
      finite(fields[name], name);
      requireValue(
        name === 'moisture'
          ? (fields[name] as number) <= 100
          : (fields[name] as number) > 0,
        'Некорректное измерение.',
      );
    }
  if (Object.hasOwn(fields, 'checks')) {
    const checks = record(fields.checks, 'Критерии');
    keys(
      checks,
      CRITERIA.map(item => item.id),
      'Критерии',
    );
    for (const criterion of CRITERIA) {
      const check = record(checks[criterion.id], criterion.title);
      keys(check, ['verdict', 'reasons', 'comment'], criterion.title);
      requireValue(
        ['pending', 'pass', 'fail'].includes(check.verdict as string),
        'Неизвестный результат проверки.',
      );
      requireValue(
        Array.isArray(check.reasons) &&
          check.reasons.every(
            reason =>
              typeof reason === 'string' && criterion.reasons.includes(reason),
          ),
        'Выберите причину из справочника критерия.',
      );
      requireValue(
        new Set(check.reasons).size === check.reasons.length,
        'Причины не должны повторяться.',
      );
      text(check.comment, 'Комментарий', true);
      requireValue(
        check.verdict !== 'pass' || check.reasons.length === 0,
        'Удалите причины несоответствия перед положительной оценкой.',
      );
    }
  }
  if (Object.hasOwn(fields, 'photos')) {
    requireValue(Array.isArray(fields.photos), 'Некорректный список фото.');
    requireValue(
      fields.photos.length <= 20,
      'К осмотру можно приложить не более 20 фото.',
    );
    for (const valuePhoto of fields.photos) {
      const photo = record(valuePhoto, 'Фото');
      keys(
        photo,
        ['fileName', 'uri', 'category', 'caption', 'capturedAt'],
        'Фото',
      );
      text(photo.fileName, 'Файл фото');
      requireValue(
        /^photo_[a-f0-9-]{16,64}\.jpg$/.test(photo.fileName),
        'Фото должно быть снято камерой приложения.',
      );
      text(photo.uri, 'Путь фото');
      requireValue(
        photo.uri.startsWith('file:///') &&
          photo.uri.endsWith(`/${photo.fileName}`) &&
          !/[\\%?#]/.test(photo.uri) &&
          !photo.uri.split('/').some(part => part === '.' || part === '..'),
        'Недопустимый путь фото.',
      );
      requireValue(
        CRITERIA.some(item => item.id === photo.category),
        'Выберите критерий для фото.',
      );
      text(photo.caption, 'Подпись фото', true);
      timestamp(photo.capturedAt, 'Съёмка фото');
    }
    requireValue(
      new Set(fields.photos.map(item => (item as RecordValue).fileName))
        .size === fields.photos.length,
      'Фото не должны повторяться.',
    );
  }
}

export function validateQualityCommand(
  value: unknown,
): asserts value is QualityCommand {
  const command = record(value, 'Команда контроля');
  switch (command.type) {
    case 'quality.start':
      keys(
        command,
        ['type', 'subjectKind', 'subjectKey', 'inspector'],
        'Команда контроля',
      );
      requireValue(
        command.subjectKind === 'job' || command.subjectKind === 'lot',
        'Выберите заказ или партию.',
      );
      text(command.subjectKey, 'Объект контроля');
      text(command.inspector, 'Инспектор');
      break;
    case 'quality.update':
      keys(command, ['type', 'inspectionKey', 'patch'], 'Команда контроля');
      text(command.inspectionKey, 'Осмотр');
      validateFields(command.patch, true);
      break;
    case 'quality.sign':
      keys(command, ['type', 'inspectionKey', 'decision'], 'Команда контроля');
      text(command.inspectionKey, 'Осмотр');
      requireValue(
        command.decision === 'released' || command.decision === 'hold',
        'Выберите допуск или задержку.',
      );
      break;
    default:
      throw new Error('Неизвестная операция контроля качества.');
  }
}

function subject(state: Warehouse, kind: 'job' | 'lot', key: string) {
  if (kind === 'lot') {
    const lot = state.stock.find(item => item.key === key);
    requireValue(lot, 'Партия не найдена.');
    return {
      kind,
      key,
      quantity: lot.quantity,
      lots: [{ ...lot }],
      lines: [] as {
        key: string;
        sku: string;
        label: string;
        location: string;
        quantity: number;
      }[],
    };
  }
  const job = state.jobs.find(item => item.key === key);
  requireValue(job, 'Задание не найдено.');
  const lines = job.lines.map(line => ({
    key: line.key,
    sku: line.sku,
    label: line.label,
    location: line.location,
    quantity: line.counted ? line.picked : line.requested,
  }));
  const lots = Array.from(new Set(lines.map(line => line.sku))).map(sku => {
    const lot = state.stock.find(
      item => item.sku === sku && item.kind === 'finished',
    );
    requireValue(lot, 'Для заказа не найдена партия готовых изделий.');
    return { ...lot };
  });
  const quantity = lines.reduce((total, line) => total + line.quantity, 0);
  whole(quantity, 'Количество объекта');
  return { kind, key, quantity, lines, lots };
}
export function subjectQuantity(
  state: Warehouse,
  kind: 'job' | 'lot',
  key: string,
): number {
  return subject(state, kind, key).quantity;
}
export function subjectFingerprint(
  state: Warehouse,
  kind: 'job' | 'lot',
  key: string,
): string {
  return JSON.stringify(subject(state, kind, key));
}
function fingerprint(value: unknown) {
  text(value, 'Состав объекта');
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Некорректный состав объекта контроля.');
  }
  const item = record(parsed, 'Состав объекта');
  keys(item, ['kind', 'key', 'quantity', 'lots', 'lines'], 'Состав объекта');
  requireValue(
    item.kind === 'job' || item.kind === 'lot',
    'Некорректный тип объекта контроля.',
  );
  text(item.key, 'Ключ объекта');
  whole(item.quantity, 'Количество объекта', 1);
  requireValue(
    Array.isArray(item.lots) && item.lots.length > 0,
    'Не указан состав партий.',
  );
  item.lots.forEach(valueLot => {
    const lot = record(valueLot, 'Партия');
    keys(lot, lotNames, 'Партия');
    for (const name of lotNames.filter(
      field => !['kind', 'quantity'].includes(field),
    ))
      text(lot[name], name);
    requireValue(
      lot.kind === 'raw' || lot.kind === 'finished',
      'Некорректный вид партии.',
    );
    whole(lot.quantity, 'Количество партии');
  });
  requireValue(Array.isArray(item.lines), 'Не указан состав заказа.');
  let quantity = 0;
  item.lines.forEach(valueLine => {
    const line = record(valueLine, 'Строка');
    keys(line, ['key', 'sku', 'label', 'location', 'quantity'], 'Строка');
    for (const name of ['key', 'sku', 'label', 'location'])
      text(line[name], name);
    whole(line.quantity, 'Количество строки');
    quantity += line.quantity;
    requireValue(
      (item.lots as RecordValue[]).some(
        lot => lot.sku === line.sku && lot.kind === 'finished',
      ),
      'Строка осмотра не соответствует партии.',
    );
  });
  if (item.kind === 'job')
    requireValue(
      item.lines.length > 0 && quantity === item.quantity,
      'Некорректное количество заказа.',
    );
  else
    requireValue(
      item.lines.length === 0 &&
        item.lots.length === 1 &&
        (item.lots[0] as RecordValue).key === item.key &&
        (item.lots[0] as RecordValue).quantity === item.quantity,
      'Некорректная партия осмотра.',
    );
  return item as unknown as ReturnType<typeof subject>;
}
function profileForLot(lot: StockLot, job: boolean): QualityProfile {
  const sizes = lot.size
    .match(/\d+(?:[.,]\d+)?/g)
    ?.map(value => Number(value.replace(',', '.')));
  requireValue(
    sizes && sizes.length === 3 && sizes.every(value => value > 0),
    'Для материала нужны три корректных номинальных размера.',
  );
  const [nominalLength, nominalWidth, nominalThickness] =
    lot.kind === 'raw' ? [sizes[2], sizes[1], sizes[0]] : sizes;
  return {
    label: `ДЕМО · ${lot.sku} · ${
      job ? 'контрольный образец первого артикула' : 'партия'
    }; не норматив`,
    moistureMin: lot.kind === 'raw' ? 8 : 6,
    moistureMax: lot.kind === 'raw' ? 18 : 12,
    nominalLength,
    nominalWidth,
    nominalThickness,
    tolerance: lot.kind === 'raw' ? 3 : 2,
  };
}
export function qualityProfile(
  state: Warehouse,
  kind: 'job' | 'lot',
  key: string,
): QualityProfile {
  return profileForLot(subject(state, kind, key).lots[0], kind === 'job');
}

export function inspectionDataIssues(
  inspection: Inspection,
  at = inspection.updatedAt,
): string[] {
  const issues: string[] = [];
  const frozen = fingerprint(inspection.subjectFingerprint);
  if (
    !Number.isSafeInteger(inspection.inspectedQuantity) ||
    inspection.inspectedQuantity < 1 ||
    inspection.inspectedQuantity > frozen.quantity
  )
    issues.push(
      `Проверенное количество должно быть от 1 до ${frozen.quantity}.`,
    );
  if (
    !dateValid(inspection.processedOn) ||
    inspection.processedOn > commandDay(at)
  )
    issues.push('Укажите действительную дату обработки не позже даты осмотра.');
  if (!inspection.marking.trim()) issues.push('Укажите маркировку.');
  for (const name of measurementNames)
    if (inspection[name] === null)
      issues.push(
        name === 'moisture'
          ? 'Введите влажность.'
          : 'Введите все размеры образца.',
      );
  return [...new Set(issues)];
}

function completeness(
  inspection: Inspection,
  at = inspection.updatedAt,
): string[] {
  const issues = inspectionDataIssues(inspection, at);
  if (!inspection.inspector.trim()) issues.push('Укажите инспектора.');
  if (!inspection.photos.length) issues.push('Добавьте хотя бы одно фото.');
  if (
    inspection.photos.some(
      photo => Date.parse(photo.capturedAt) > Date.parse(at),
    )
  )
    issues.push('Дата фото не может быть позже осмотра.');
  for (const criterion of CRITERIA) {
    const check = inspection.checks[criterion.id];
    if (check.verdict === 'pending')
      issues.push(`Ответьте на критерий «${criterion.title}».`);
    if (
      check.verdict === 'fail' &&
      !check.reasons.length &&
      !check.comment.trim()
    )
      issues.push(`Укажите причину или пояснение: ${criterion.title}.`);
  }
  return [...new Set(issues)];
}
function failures(inspection: Inspection): string[] {
  const issues: string[] = [];
  for (const criterion of CRITERIA)
    if (inspection.checks[criterion.id].verdict === 'fail')
      issues.push(`Несоответствие: ${criterion.title}.`);
  const { profile } = inspection;
  if (
    inspection.moisture !== null &&
    (inspection.moisture < profile.moistureMin ||
      inspection.moisture > profile.moistureMax)
  )
    issues.push(
      `Влажность вне демонстрационного диапазона ${profile.moistureMin}–${profile.moistureMax}%.`,
    );
  if (
    (
      [
        ['length', 'nominalLength'],
        ['width', 'nominalWidth'],
        ['thickness', 'nominalThickness'],
      ] as const
    ).some(
      ([field, nominal]) =>
        inspection[field] !== null &&
        Math.abs(inspection[field]! - profile[nominal]) > profile.tolerance,
    )
  )
    issues.push('Размеры вне допуска демонстрационного профиля.');
  return issues;
}
export function inspectionIssues(inspection: Inspection): string[] {
  return [...completeness(inspection), ...failures(inspection)];
}

/** Checks every nested persisted field without requiring an old signed subject to remain current. */
export function validateInspection(
  value: unknown,
): asserts value is Inspection {
  const item = record(value, 'Осмотр');
  keys(
    item,
    [
      ...fieldNames,
      'key',
      'subjectKind',
      'subjectKey',
      'title',
      'reference',
      'inspector',
      'openedAt',
      'updatedAt',
      'profile',
      'subjectFingerprint',
      'status',
      'signedAt',
    ],
    'Осмотр',
  );
  const fields = Object.fromEntries(fieldNames.map(name => [name, item[name]]));
  validateFields(fields, false);
  for (const name of ['key', 'subjectKey', 'title', 'reference', 'inspector'])
    text(item[name], name);
  requireValue(
    item.subjectKind === 'job' || item.subjectKind === 'lot',
    'Неизвестный вид объекта осмотра.',
  );
  timestamp(item.openedAt, 'Начало осмотра');
  timestamp(item.updatedAt, 'Изменение осмотра');
  requireValue(
    Date.parse(item.openedAt) <= Date.parse(item.updatedAt),
    'Время изменения раньше создания осмотра.',
  );
  validateProfile(item.profile);
  const storedProfile = item.profile;
  const frozen = fingerprint(item.subjectFingerprint);
  requireValue(
    frozen.kind === item.subjectKind && frozen.key === item.subjectKey,
    'Состав осмотра относится к другому объекту.',
  );
  const expectedProfile = profileForLot(frozen.lots[0], frozen.kind === 'job');
  requireValue(
    (Object.keys(expectedProfile) as (keyof QualityProfile)[]).every(
      key => storedProfile[key] === expectedProfile[key],
    ),
    'Профиль осмотра не соответствует контрольному образцу.',
  );
  requireValue(
    ['draft', 'released', 'hold'].includes(item.status as string),
    'Неизвестное состояние осмотра.',
  );
  if (item.status === 'draft')
    requireValue(item.signedAt === null, 'Черновик не может иметь подпись.');
  else {
    timestamp(item.signedAt, 'Подпись');
    requireValue(
      item.signedAt === item.updatedAt,
      'Подписанный осмотр изменён после подписи.',
    );
    const inspection = value as Inspection;
    assertReportFits(toNativeReport(inspection));
    requireValue(
      completeness(inspection).length === 0,
      'Подписанный осмотр не заполнен.',
    );
    if (item.status === 'released')
      requireValue(
        failures(inspection).length === 0,
        'Допуск содержит несоответствия.',
      );
    else text(item.summary, 'Итоговое заключение задержки');
  }
}

export function latestRelease(
  state: Warehouse,
  job: Job,
): Inspection | undefined {
  const latest = [...state.inspections]
    .reverse()
    .find(
      item =>
        item.subjectKind === 'job' &&
        item.subjectKey === job.key &&
        item.status !== 'draft',
    );
  return latest?.status === 'released' &&
    latest.subjectFingerprint === subjectFingerprint(state, 'job', job.key)
    ? latest
    : undefined;
}

export function transitionQuality(
  state: Warehouse,
  command: QualityCommand,
  context: CommandContext,
): {
  inspections: Inspection[];
  command: QualityCommand;
  subjectKey: string;
  description: string;
} {
  validateQualityCommand(command);
  timestamp(context.at, 'Время операции');
  if (command.type === 'quality.start') {
    const inspector = command.inspector.trim();
    const data = subject(state, command.subjectKind, command.subjectKey);
    requireValue(
      data.quantity > 0,
      'Нельзя осмотреть пустую партию или пустой заказ.',
    );
    const job =
      command.subjectKind === 'job'
        ? state.jobs.find(item => item.key === command.subjectKey)
        : undefined;
    requireValue(
      job?.stage !== 'dispatched',
      'Отгруженное задание нельзя осматривать заново.',
    );
    requireValue(
      !state.inspections.some(
        item =>
          item.subjectKind === command.subjectKind &&
          item.subjectKey === command.subjectKey &&
          item.status === 'draft' &&
          item.subjectFingerprint === JSON.stringify(data),
      ),
      'Для объекта уже открыт актуальный черновик осмотра.',
    );
    const key = `inspection-${context.key}`;
    requireValue(
      !state.inspections.some(item => item.key === key),
      'Идентификатор осмотра уже существует.',
    );
    const inspection: Inspection = {
      key,
      subjectKind: command.subjectKind,
      subjectKey: command.subjectKey,
      title: job ? job.recipient : data.lots[0].label,
      reference: job ? job.reference : data.lots[0].sku,
      inspector,
      openedAt: context.at,
      updatedAt: context.at,
      profile: qualityProfile(state, command.subjectKind, command.subjectKey),
      subjectFingerprint: JSON.stringify(data),
      status: 'draft',
      signedAt: null,
      inspectedQuantity: 0,
      processedOn: '',
      marking: '',
      moisture: null,
      length: null,
      width: null,
      thickness: null,
      checks: Object.fromEntries(
        CRITERIA.map(item => [
          item.id,
          { verdict: 'pending', reasons: [], comment: '' },
        ]),
      ) as unknown as Inspection['checks'],
      photos: [],
      summary: '',
    };
    return {
      inspections: [...state.inspections, inspection],
      command: { ...command, inspector },
      subjectKey: command.subjectKey,
      description: `${inspection.reference} · Начат контроль качества · ${inspector}`,
    };
  }
  const current = state.inspections.find(
    item => item.key === command.inspectionKey,
  );
  requireValue(current, 'Осмотр не найден.');
  requireValue(
    current.status === 'draft',
    'Подписанный осмотр нельзя изменять. Создайте новый осмотр.',
  );
  requireValue(
    Date.parse(context.at) >= Date.parse(current.updatedAt),
    'Время операции раньше последнего изменения осмотра.',
  );
  let next: Inspection;
  let normalized: QualityCommand;
  if (command.type === 'quality.update') {
    const patch = JSON.parse(
      JSON.stringify(command.patch),
    ) as Partial<InspectionFields>;
    next = { ...current, ...patch, updatedAt: context.at };
    normalized = {
      ...command,
      patch: JSON.parse(JSON.stringify(patch)) as Partial<InspectionFields>,
    };
  } else {
    requireValue(
      current.subjectFingerprint ===
        subjectFingerprint(state, current.subjectKind, current.subjectKey),
      'Состав или количество объекта изменились. Начните повторный осмотр.',
    );
    const issues = completeness(current, context.at);
    if (command.decision === 'released') issues.push(...failures(current));
    else if (!current.summary.trim())
      issues.push('Укажите итоговое заключение задержки.');
    requireValue(issues.length === 0, issues.join('\n'));
    next = {
      ...JSON.parse(JSON.stringify(current)),
      status: command.decision,
      signedAt: context.at,
      updatedAt: context.at,
    } as Inspection;
    assertReportFits(toNativeReport(next));
    normalized = { ...command };
  }
  const inspections =
    command.type === 'quality.sign'
      ? [...state.inspections.filter(item => item.key !== current.key), next]
      : state.inspections.map(item => (item.key === current.key ? next : item));
  return {
    inspections,
    command: normalized,
    subjectKey: current.subjectKey,
    description: `${current.reference} · ${
      command.type === 'quality.update'
        ? 'Осмотр сохранён'
        : command.decision === 'released'
        ? 'Контроль качества: допуск'
        : 'Контроль качества: задержка'
    }`,
  };
}
