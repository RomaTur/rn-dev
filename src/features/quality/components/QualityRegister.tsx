import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { Inspection } from '../../../quality/types';
import { Button, Field, Tag, palette, styles } from '../../../shared/ui';
import { Icon } from '../../../shared/ui/Icon';
import type { RegisterRow, SubjectKind } from '../register';

export function QualityRegister({
  kind,
  history,
  query,
  rows,
  total,
  busy,
  onTabChange,
  onQueryChange,
  onDocument,
  onReport,
  onMore,
}: {
  kind: SubjectKind;
  history: boolean;
  query: string;
  rows: RegisterRow[];
  total: number;
  busy: boolean;
  onTabChange: (tab: SubjectKind | 'history') => void;
  onQueryChange: (value: string) => void;
  onDocument: (key: string) => void;
  onReport: (key: string) => void;
  onMore: () => void;
}) {
  const wide = useWindowDimensions().width >= 840;
  return (
    <View style={list.screen}>
      <View style={list.toolbar}>
        <View style={list.partitions} accessibilityRole="tablist">
          {(
            [
              ['job', 'Заказы', !history && kind === 'job'],
              ['lot', 'Партии', !history && kind === 'lot'],
              ['history', 'История', history],
            ] as const
          ).map(([key, label, active]) => (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              testID={
                'quality-' +
                (key === 'job' ? 'jobs' : key === 'lot' ? 'lots' : key)
              }
              style={({ pressed }) => [
                list.partition,
                (active || pressed) && list.activePartition,
              ]}
              onPress={() => onTabChange(key)}
            >
              <Text style={[list.partitionText, active && list.activeText]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={[list.search, !wide && list.searchCompact]}>
          <Field
            testID={history ? 'history-search' : 'quality-search'}
            label={history ? 'Поиск в истории' : 'Номер документа или название'}
            placeholder={
              history ? 'Документ или инспектор' : 'Например, WL-101'
            }
            value={query}
            onChangeText={onQueryChange}
          />
        </View>
      </View>
      <ScrollView
        testID="workspace-scroll"
        stickyHeaderIndices={wide && rows.length ? [1] : []}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={list.content}
      >
        <View style={list.listTitle}>
          <Text accessibilityRole="header" style={styles.heading}>
            {history
              ? 'История осмотров'
              : kind === 'job'
              ? 'Заказы к осмотру'
              : 'Партии материалов'}
          </Text>
          <Text style={styles.muted}>{total} в списке</Text>
        </View>
        {wide && rows.length > 0 && (
          <View style={list.tableHeader}>
            <View style={list.grid}>
              <Text style={[styles.muted, list.reference]}>Документ</Text>
              <Text style={[styles.muted, list.status]}>Статус</Text>
              <Text style={[styles.muted, list.description]}>
                {history
                  ? 'Объект / инспектор'
                  : kind === 'job'
                  ? 'Получатель / продукция'
                  : 'Материал'}
              </Text>
              <Text style={[styles.muted, list.quantity]}>Штук</Text>
              <View style={list.rowEnd} />
            </View>
          </View>
        )}
        {rows.map(row => {
          const status = row.last ? statusName(row.last) : 'Ожидает';
          return (
            <View key={row.key} style={list.row}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${row.reference}. ${row.title}. ${row.detail}. ${status}. ${row.count} шт.`}
                accessibilityState={{ disabled: busy }}
                testID={(history ? 'history-' : 'inspect-') + row.key}
                disabled={busy}
                onPress={() =>
                  history ? onReport(row.key) : onDocument(row.key)
                }
                style={({ pressed }) => [
                  list.grid,
                  list.record,
                  !wide && list.recordCompact,
                  pressed && list.recordPressed,
                ]}
              >
                <Text style={[list.recordNumber, wide && list.reference]}>
                  {row.reference}
                </Text>
                <View style={wide && list.status}>
                  <Tag
                    tone={
                      row.last?.status === 'hold'
                        ? 'danger'
                        : row.last
                        ? 'positive'
                        : 'neutral'
                    }
                  >
                    {status}
                  </Tag>
                </View>
                <View
                  style={[list.description, !wide && list.descriptionCompact]}
                >
                  <Text style={list.recordText} numberOfLines={2}>
                    {row.title}
                  </Text>
                  <Text
                    numberOfLines={history ? undefined : 1}
                    style={styles.muted}
                  >
                    {row.detail}
                  </Text>
                </View>
                <Text style={[list.recordText, list.quantity]}>
                  {row.count}
                  {wide ? '' : ' шт.'}
                </Text>
                <View style={list.rowEnd}>
                  <Icon name="chevron-right" size={18} color={palette.accent} />
                </View>
              </Pressable>
              {!history && row.last && (
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  testID={'report-' + row.key}
                  onPress={() => row.last && onReport(row.last.key)}
                  style={({ pressed }) => [
                    list.reportLink,
                    pressed && list.recordPressed,
                  ]}
                >
                  <Text style={list.partitionText}>
                    {row.last.status === 'draft'
                      ? 'Открыть черновик'
                      : 'Открыть заключение'}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })}
        {history && total > rows.length && (
          <Button secondary testID="history-more" onPress={onMore}>
            Ещё отчёты
          </Button>
        )}
        {rows.length === 0 && (
          <View style={list.empty}>
            <Text style={styles.heading}>
              {history && !query ? 'Отчётов пока нет' : 'Ничего не найдено'}
            </Text>
            <Text style={styles.muted}>
              {history && !query
                ? 'Здесь появятся сохранённые осмотры.'
                : 'Проверьте номер или измените запрос.'}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
function statusName(item: Inspection) {
  return item.status === 'draft'
    ? 'В работе'
    : item.status === 'released'
    ? 'Допуск'
    : 'Задержка';
}

const list = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.paper },
  toolbar: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 16,
    backgroundColor: palette.white,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  partitions: {
    flexDirection: 'row',
    backgroundColor: palette.paper,
    borderRadius: 6,
    gap: 2,
    padding: 3,
  },
  partition: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 48,
    justifyContent: 'center',
    borderRadius: 4,
  },
  activePartition: { backgroundColor: palette.tint },
  partitionText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: palette.ink,
  },
  activeText: { color: palette.accent },
  search: { flex: 1, minWidth: 260 },
  searchCompact: { flexBasis: '100%', minWidth: 0 },
  content: { paddingHorizontal: 24, paddingBottom: 24 },
  listTitle: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: 12,
    paddingTop: 22,
    paddingBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
  },
  tableHeader: { paddingVertical: 10, backgroundColor: palette.paper },
  row: {
    backgroundColor: palette.white,
    marginBottom: 8,
    borderRadius: 6,
    overflow: 'hidden',
  },
  record: { minHeight: 70, paddingVertical: 12 },
  recordCompact: { flexWrap: 'wrap', gap: 8 },
  recordPressed: { backgroundColor: palette.tint },
  recordNumber: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: palette.ink,
  },
  recordText: { fontSize: 15, lineHeight: 21, color: palette.ink },
  reference: { flex: 1.1, minWidth: 0 },
  status: { flex: 1.15, minWidth: 0 },
  description: { flex: 3.6, minWidth: 0, gap: 2 },
  descriptionCompact: { flexBasis: '100%', flexGrow: 1 },
  quantity: { width: 58, textAlign: 'right' },
  rowEnd: { width: 22, alignItems: 'center' },
  reportLink: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  empty: { paddingVertical: 24, gap: 8 },
});
