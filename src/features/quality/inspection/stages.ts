export const stages = [
  ['data', 'Данные'],
  ['checks', 'Осмотр'],
  ['photos', 'Фото'],
  ['decision', 'Решение'],
] as const;
export type Step = (typeof stages)[number][0];
