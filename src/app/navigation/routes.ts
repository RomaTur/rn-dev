export type WorkspaceRoutes = {
  quality: { focusKey?: string } | undefined;
  stock: undefined;
  jobs: undefined;
  history: undefined;
  sync: undefined;
  home: undefined;
};

export type SectionName = keyof WorkspaceRoutes;

export const sections: Record<SectionName, string> = {
  quality: 'Осмотр качества',
  stock: 'Склад',
  jobs: 'Отгрузки',
  history: 'Журнал',
  sync: 'Обмен',
  home: 'Обзор склада',
};
