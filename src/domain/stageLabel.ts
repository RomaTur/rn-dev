import type { Stage } from './types';

export const stageLabel: Record<Stage, string> = {
  queued: 'К подбору',
  picking: 'Подбор',
  packing: 'Упаковка',
  ready: 'Готово к отправке',
  dispatched: 'Отгружено',
};
