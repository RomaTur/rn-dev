import type { Job, PickLine, Warehouse } from './types';

function line(
  key: string,
  sku: string,
  label: string,
  location: string,
  requested: number,
): PickLine {
  return {
    key,
    sku,
    label,
    location,
    requested,
    picked: 0,
    counted: false,
    shortageNote: '',
  };
}

function job(
  details: Pick<
    Job,
    | 'key'
    | 'reference'
    | 'recipient'
    | 'destination'
    | 'due'
    | 'priority'
    | 'lines'
  >,
): Job {
  return {
    ...details,
    stage: 'queued',
    revision: 0,
    parcel: null,
    dispatchedAt: null,
  };
}

export function createSeed(): Warehouse {
  return {
    format: 2,
    inspections: [],
    revision: 0,
    stock: [
      {
        key: 'lot-oak-raw',
        sku: 'RAW-OAK-50',
        label: 'Дубовая доска',
        kind: 'raw',
        species: 'Дуб',
        size: '50 × 180 × 2500 мм',
        location: 'С-01',
        quantity: 36,
      },
      {
        key: 'lot-pine-raw',
        sku: 'RAW-PINE-40',
        label: 'Сосновый брус',
        kind: 'raw',
        species: 'Сосна',
        size: '40 × 60 × 3000 мм',
        location: 'С-02',
        quantity: 48,
      },
      {
        key: 'lot-ash-raw',
        sku: 'RAW-ASH-30',
        label: 'Ясеневая доска',
        kind: 'raw',
        species: 'Ясень',
        size: '30 × 150 × 2000 мм',
        location: 'С-03',
        quantity: 24,
      },
      {
        key: 'lot-tabletop-oak',
        sku: 'TOP-OAK-120',
        label: 'Столешница «Кромка»',
        kind: 'finished',
        species: 'Дуб',
        size: '1200 × 600 × 28 мм',
        location: 'Г-01',
        quantity: 12,
      },
      {
        key: 'lot-shelf-pine',
        sku: 'SHELF-PINE-80',
        label: 'Полка «Линия»',
        kind: 'finished',
        species: 'Сосна',
        size: '800 × 220 × 22 мм',
        location: 'Г-02',
        quantity: 30,
      },
      {
        key: 'lot-panel-ash',
        sku: 'PANEL-ASH-60',
        label: 'Щит «Ритм»',
        kind: 'finished',
        species: 'Ясень',
        size: '600 × 600 × 18 мм',
        location: 'Г-03',
        quantity: 18,
      },
    ],
    jobs: [
      job({
        key: 'job-101',
        reference: 'WL-101',
        recipient: 'Мастерская «Тихий клён»',
        destination: 'Шоурум · ворота 2',
        due: 'Сегодня, 16:30',
        priority: 'urgent',
        lines: [
          line('line-1', 'TOP-OAK-120', 'Столешница «Кромка»', 'Г-01', 2),
          line('line-2', 'SHELF-PINE-80', 'Полка «Линия»', 'Г-02', 3),
        ],
      }),
      job({
        key: 'job-102',
        reference: 'WL-102',
        recipient: 'Студия «Лесной контур»',
        destination: 'Зона самовывоза · место 4',
        due: 'Сегодня, 18:00',
        priority: 'normal',
        lines: [
          line('line-3', 'SHELF-PINE-80', 'Полка «Линия»', 'Г-02', 5),
          line('line-4', 'PANEL-ASH-60', 'Щит «Ритм»', 'Г-03', 4),
        ],
      }),
      job({
        key: 'job-103',
        reference: 'WL-103',
        recipient: 'Бюро «Северная ветвь»',
        destination: 'Доставка · маршрут 3',
        due: 'Завтра, 10:00',
        priority: 'normal',
        lines: [
          line('line-5', 'TOP-OAK-120', 'Столешница «Кромка»', 'Г-01', 3),
          line('line-6', 'PANEL-ASH-60', 'Щит «Ритм»', 'Г-03', 2),
        ],
      }),
    ],
    activity: [],
    outbox: [],
    applied: [],
  };
}
