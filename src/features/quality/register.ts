import type { Warehouse } from '../../domain/types';
import type { Inspection } from '../../quality/types';

export type SubjectKind = Inspection['subjectKind'];

export type RegisterRow = {
  key: string;
  reference: string;
  title: string;
  detail: string;
  count: number;
  last?: Inspection;
};

export function buildRegister(
  state: Warehouse,
  {
    kind,
    history,
    filter,
    historyQuery,
    historyLimit,
  }: {
    kind: SubjectKind;
    history: boolean;
    filter: string;
    historyQuery: string;
    historyLimit: number;
  },
): { rows: RegisterRow[]; total: number } {
  const query = filter.trim().toLocaleLowerCase();
  const subjects =
    kind === 'job'
      ? state.jobs
          .filter(job => job.stage !== 'dispatched')
          .map(job => ({
            key: job.key,
            reference: job.reference,
            title: job.recipient,
            detail: job.lines.map(line => line.label).join(' · '),
            quantity: job.lines.reduce(
              (n, line) => n + (line.counted ? line.picked : line.requested),
              0,
            ),
          }))
      : state.stock
          .filter(lot => lot.quantity > 0)
          .map(lot => ({
            key: lot.key,
            reference: lot.sku,
            title: lot.label,
            detail: `${lot.species} · ${lot.size} · ${lot.location}`,
            quantity: lot.quantity,
          }));
  const filtered = subjects.filter(subject =>
    `${subject.key} ${subject.reference} ${subject.title} ${subject.detail}`
      .toLocaleLowerCase()
      .includes(query),
  );
  const archive = [...state.inspections]
    .reverse()
    .filter(item =>
      `${item.reference} ${item.title} ${item.inspector}`
        .toLocaleLowerCase()
        .includes(historyQuery.toLocaleLowerCase()),
    );
  const latest = new Map(
    state.inspections
      .filter(item => item.subjectKind === kind)
      .map(item => [item.subjectKey, item] as const),
  );
  const rows = history
    ? archive.slice(0, historyLimit).map(item => ({
        key: item.key,
        reference: item.reference,
        title: item.title,
        detail: `${item.inspector} · ${new Date(item.updatedAt).toLocaleString(
          'ru-RU',
        )}`,
        count: item.inspectedQuantity,
        last: item,
      }))
    : filtered.map(subject => ({
        ...subject,
        count: subject.quantity,
        last: latest.get(subject.key),
      }));
  const total = history ? archive.length : filtered.length;
  return { rows, total };
}
