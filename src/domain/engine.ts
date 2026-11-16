import type {
  Command,
  CommandContext,
  Job,
  Stage,
  StockLot,
  Warehouse,
} from './types';
import { latestRelease, transitionQuality } from '../quality/engine';

function text(value: string, name: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Заполните поле «${name}».`);
  }
  return value.trim();
}

function whole(value: number, name: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(
      `${name}: укажите целое число ${
        minimum === 0 ? 'от нуля' : 'больше нуля'
      }.`,
    );
  }
  return value;
}

function sum(values: number[]): number {
  return values.reduce(
    (total, value) =>
      whole(total + whole(value, 'Количество'), 'Общее количество'),
    0,
  );
}

function stockQuantity(state: Warehouse, sku: string): number {
  return sum(
    state.stock
      .filter(lot => lot.sku === sku && lot.kind === 'finished')
      .map(lot => lot.quantity),
  );
}

export function reservedQuantity(state: Warehouse, sku: string): number {
  return sum(
    state.jobs
      .filter(
        job =>
          job.stage === 'picking' ||
          job.stage === 'packing' ||
          job.stage === 'ready',
      )
      .flatMap(job =>
        job.lines.filter(line => line.sku === sku).map(line => line.picked),
      ),
  );
}

function requireStage(job: Job, stage: Stage): void {
  if (job.stage !== stage) {
    throw new Error(`${job.reference}: действие недоступно на текущем этапе.`);
  }
}

function requireCompletePicking(job: Job): void {
  if (job.lines.length === 0 || job.lines.some(line => !line.counted)) {
    throw new Error('Пересчитайте каждую строку задания.');
  }
  for (const line of job.lines) {
    whole(line.picked, 'Подобранное количество');
    if (line.picked > line.requested) {
      throw new Error('Нельзя подобрать больше заказанного количества.');
    }
    if (line.picked < line.requested && !line.shortageNote.trim()) {
      throw new Error(`Укажите причину расхождения: ${line.label}.`);
    }
  }
  if (!job.lines.some(line => line.picked > 0)) {
    throw new Error(
      'Пустую отгрузку завершить нельзя: подберите хотя бы одно изделие.',
    );
  }
}

/** Pure transition: stock, audit and outbox become visible in one returned snapshot. */
export function execute(
  state: Warehouse,
  command: Command,
  context: CommandContext,
): Warehouse {
  const key = text(context.key, 'Идентификатор операции');
  // A replay remains successful after later work has advanced the revision.
  if (state.applied.includes(key)) {
    return state;
  }
  if (context.expectedRevision !== state.revision) {
    throw new Error(
      'Версия данных устарела. Откройте актуальное состояние и повторите действие.',
    );
  }
  const at = text(context.at, 'Время операции');
  if (!Number.isFinite(Date.parse(at))) {
    throw new Error('Некорректное время операции.');
  }
  const revision = whole(state.revision + 1, 'Версия данных', 1);
  let stock = state.stock;
  let jobs = state.jobs;
  let inspections = state.inspections;
  let normalized: Command;
  let subjectKey: string;
  let description: string;

  if (
    command.type === 'quality.start' ||
    command.type === 'quality.update' ||
    command.type === 'quality.sign'
  ) {
    const result = transitionQuality(state, command, { ...context, key, at });
    inspections = result.inspections;
    normalized = result.command;
    subjectKey = result.subjectKey;
    description = result.description;
  } else if (command.type === 'receive') {
    const input = command.lot;
    if (input.kind !== 'raw' && input.kind !== 'finished') {
      throw new Error('Выберите сырьё или готовое изделие.');
    }
    const lot: Omit<StockLot, 'key'> = {
      sku: text(input.sku, 'Артикул'),
      label: text(input.label, 'Наименование'),
      kind: input.kind,
      species: text(input.species, 'Порода дерева'),
      size: text(input.size, 'Размеры'),
      location: text(input.location, 'Место хранения'),
      quantity: whole(input.quantity, 'Количество', 1),
    };
    if (stock.some(existing => existing.sku === lot.sku)) {
      throw new Error(
        'Артикул уже существует. Для изменения его остатка используйте пересчёт.',
      );
    }
    subjectKey = `lot-${key}`;
    if (stock.some(existing => existing.key === subjectKey)) {
      throw new Error(
        'Идентификатор партии уже существует. Повторите приёмку новой операцией.',
      );
    }
    stock = [...stock, { ...lot, key: subjectKey }];
    normalized = { type: 'receive', lot };
    description = `${lot.label}: принято ${lot.quantity} шт. · ${lot.location}`;
  } else if (command.type === 'adjust') {
    const index = stock.findIndex(lot => lot.key === command.lotKey);
    if (index < 0) {
      throw new Error('Партия не найдена.');
    }
    const lot = stock[index];
    const quantity = whole(command.quantity, 'Количество');
    const reason = text(command.reason, 'Причина пересчёта');
    if (
      lot.kind === 'finished' &&
      stockQuantity(state, lot.sku) - lot.quantity + quantity <
        reservedQuantity(state, lot.sku)
    ) {
      throw new Error('Остаток нельзя уменьшить ниже количества в резерве.');
    }
    stock = stock.map((item, itemIndex) =>
      itemIndex === index ? { ...item, quantity } : item,
    );
    normalized = { ...command, quantity, reason };
    subjectKey = lot.key;
    description = `${lot.label}: ${lot.quantity} → ${quantity} шт. · ${reason}`;
  } else {
    const index = jobs.findIndex(job => job.key === command.jobKey);
    if (index < 0) {
      throw new Error('Задание не найдено.');
    }
    const job = jobs[index];
    const next = {
      ...job,
      revision: whole(job.revision + 1, 'Версия задания', 1),
    };
    subjectKey = job.key;

    switch (command.type) {
      case 'begin':
        requireStage(job, 'queued');
        next.stage = 'picking';
        normalized = { ...command };
        description = `${job.reference} · Комплектация начата`;
        break;
      case 'count': {
        requireStage(job, 'picking');
        const lineIndex = job.lines.findIndex(
          line => line.key === command.lineKey,
        );
        if (lineIndex < 0) {
          throw new Error('Строка задания не найдена.');
        }
        const line = job.lines[lineIndex];
        const quantity = whole(command.quantity, 'Подобранное количество');
        if (quantity > line.requested) {
          throw new Error('Нельзя подобрать больше заказанного количества.');
        }
        const otherReservations =
          reservedQuantity(state, line.sku) - line.picked;
        if (quantity > stockQuantity(state, line.sku) - otherReservations) {
          throw new Error(
            'Недостаточно доступного остатка с учётом резерва других строк.',
          );
        }
        if (typeof command.note !== 'string') {
          throw new Error('Причина расхождения должна быть текстом.');
        }
        const note = command.note.trim();
        next.lines = job.lines.map((item, itemIndex) =>
          itemIndex === lineIndex
            ? { ...item, picked: quantity, counted: true, shortageNote: note }
            : item,
        );
        normalized = { ...command, quantity, note };
        description = `${job.reference} · ${line.label}: ${quantity} из ${
          line.requested
        } шт.${note ? ` · ${note}` : ''}`;
        break;
      }
      case 'finishPicking':
        requireStage(job, 'picking');
        requireCompletePicking(job);
        next.stage = 'packing';
        normalized = { ...command };
        description = `${job.reference} · Комплектация проверена, можно упаковывать`;
        break;
      case 'pack': {
        requireStage(job, 'packing');
        const label = text(command.label, 'Маркировка упаковки');
        const massGrams = whole(command.massGrams, 'Масса в граммах', 1);
        next.parcel = { label, massGrams };
        next.stage = 'ready';
        normalized = { ...command, label, massGrams };
        description = `${job.reference} · Упаковка ${label}, ${massGrams} г`;
        break;
      }
      case 'dispatch': {
        requireStage(job, 'ready');
        requireCompletePicking(job);
        if (!latestRelease(state, job)) {
          throw new Error(
            'Отгрузка требует актуального допуска контроля качества.',
          );
        }
        if (!job.parcel) {
          throw new Error('Сначала заполните данные упаковки.');
        }
        text(job.parcel.label, 'Маркировка упаковки');
        whole(job.parcel.massGrams, 'Масса в граммах', 1);
        const demand = new Map<string, number>();
        for (const line of job.lines) {
          demand.set(line.sku, sum([demand.get(line.sku) ?? 0, line.picked]));
        }
        // Check every product before producing any stock debit, including other jobs' reserves.
        for (const [sku, amount] of demand) {
          const available = stockQuantity(state, sku);
          if (available < amount || available < reservedQuantity(state, sku)) {
            throw new Error(
              'Остаток изменился: недостаточно изделий для отгрузки и сохранения резерва.',
            );
          }
        }
        stock = stock.map(lot => {
          const remaining =
            lot.kind === 'finished' ? demand.get(lot.sku) ?? 0 : 0;
          const debit = Math.min(lot.quantity, remaining);
          if (debit === 0) {
            return lot;
          }
          demand.set(lot.sku, remaining - debit);
          return { ...lot, quantity: lot.quantity - debit };
        });
        next.stage = 'dispatched';
        next.dispatchedAt = at;
        normalized = { ...command };
        description = `${job.reference} · Отгружено ${sum(
          job.lines.map(line => line.picked),
        )} шт. · ${job.parcel.label}`;
        break;
      }
      default:
        throw new Error('Неизвестная складская операция.');
    }
    jobs = jobs.map((item, itemIndex) => (itemIndex === index ? next : item));
  }

  return {
    ...state,
    revision,
    stock,
    jobs,
    inspections,
    activity: [
      ...state.activity,
      { key: `activity-${key}`, jobKey: subjectKey, at, description },
    ],
    outbox: [
      ...state.outbox,
      {
        key,
        baseRevision: state.revision,
        revision,
        command: normalized,
        at,
        state: 'pending',
        attempts: 0,
      },
    ],
    applied: [...state.applied, key],
  };
}
