import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Job, StockLot } from '../../../domain/types';
import { Inspection } from '../../../quality/types';
import { Button, Tag, palette, styles } from '../../../shared/ui';

/** A document overview precedes the focused inspection workspace. */
export function DocumentCard({
  job,
  lot,
  last,
  busy,
  onBack,
  onStart,
  onReport,
}: {
  job?: Job;
  lot?: StockLot;
  last?: Inspection;
  busy: boolean;
  onBack: () => void;
  onStart: () => void;
  onReport: () => void;
}) {
  const reference = job?.reference || lot?.sku;
  const title = job ? 'Заказ на отгрузку' : 'Партия материала';
  const rows = job
    ? job.lines.map(line => ({
        key: line.key,
        sku: line.sku,
        label: line.label,
        location: line.location,
        quantity: line.counted ? line.picked : line.requested,
      }))
    : lot
    ? [{ ...lot, quantity: lot.quantity }]
    : [];
  const quantity = rows.reduce((sum, row) => sum + row.quantity, 0);
  const picked =
    !!job && ['packing', 'ready', 'dispatched'].includes(job.stage);
  const status =
    last?.status === 'released'
      ? 'Допуск подписан'
      : last?.status === 'hold'
      ? 'Отгрузка задержана'
      : last
      ? 'Осмотр в работе'
      : 'Ожидает осмотра';
  return (
    <View style={{ flex: 1 }}>
      <ScrollView testID="workspace-scroll" contentContainerStyle={doc.content}>
        <View style={doc.passport}>
          <View style={styles.spread}>
            <Text style={doc.title}>
              {title} <Text style={doc.reference}>{reference}</Text>
            </Text>
            <View style={doc.documentActions}>
              <Tag
                tone={
                  last?.status === 'hold'
                    ? 'danger'
                    : last
                    ? 'positive'
                    : 'neutral'
                }
              >
                {status}
              </Tag>
              <Button secondary testID="document-back" onPress={onBack}>
                К документам
              </Button>
            </View>
          </View>
          <View style={doc.details}>
            {(job
              ? [
                  ['Получатель', job.recipient],
                  ['Направление', job.destination],
                  ['Срок отгрузки', job.due],
                  ['Состав', `${rows.length} поз. · ${quantity} шт.`],
                ]
              : [
                  ['Материал', lot?.label || ''],
                  ['Порода', lot?.species || ''],
                  ['Размер', lot?.size || ''],
                  ['Ячейка', lot?.location || ''],
                ]
            ).map(([label, value]) => (
              <View key={label} style={doc.detail}>
                <Text style={doc.label}>{label}</Text>
                <Text style={doc.value}>{value}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={doc.process}>
          <View style={[doc.processItem, doc.processReady]}>
            <Text style={doc.processTitle}>
              {job ? 'Комплектация' : 'Учёт партии'}
            </Text>
            <Text style={styles.muted}>
              {job
                ? picked
                  ? 'Количество подтверждено складом'
                  : 'Количество по заданию'
                : 'Материал зарегистрирован на складе'}
            </Text>
            <Text style={doc.processState}>{quantity} шт. в документе</Text>
          </View>
          <View style={[doc.processItem, doc.activeProcess]}>
            <Text style={doc.processTitle}>Контроль качества</Text>
            <Text style={styles.muted}>
              Осмотр, измерения, фото и заключение
            </Text>
            <Button testID="document-start" disabled={busy} onPress={onStart}>
              {last?.status === 'draft' ? 'Продолжить осмотр' : 'Начать осмотр'}
            </Button>
          </View>
          <View style={[doc.processItem, !last && doc.processWaiting]}>
            <Text style={doc.processTitle}>Заключение</Text>
            <Text style={styles.muted}>
              {last
                ? 'Сохранённая проверка и PDF'
                : 'Появится после проверки продукции'}
            </Text>
            {last ? (
              <Button
                secondary
                testID="document-report"
                disabled={busy}
                onPress={onReport}
              >
                Открыть проверку
              </Button>
            ) : (
              <Text style={doc.processState}>Ожидает проверки</Text>
            )}
          </View>
        </View>
        <View style={doc.table}>
          <View style={doc.tableTitle}>
            <Text style={styles.heading}>Продукция к осмотру</Text>
            <Text style={styles.muted}>
              Измерения — для первого артикула, количество — для задания.
            </Text>
          </View>
          <View style={doc.tableHeader}>
            <Text style={[doc.label, doc.sku]}>Артикул</Text>
            <Text style={[doc.label, doc.product]}>Наименование</Text>
            <Text style={[doc.label, doc.location]}>Ячейка</Text>
            <Text style={[doc.label, doc.count]}>Кол-во</Text>
          </View>
          {rows.map((row, index) => (
            <View key={row.key} style={doc.tableRow}>
              <Text style={[styles.text, doc.sku]}>{row.sku}</Text>
              <View style={doc.product}>
                <Text style={styles.text}>{row.label}</Text>
                {index === 0 && (
                  <Text style={doc.sample}>
                    Контрольный образец для измерений
                  </Text>
                )}
              </View>
              <Text style={[styles.text, doc.location]}>{row.location}</Text>
              <Text style={[styles.text, doc.count]}>{row.quantity} шт.</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
const doc = StyleSheet.create({
  documentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  content: { padding: 20, gap: 16 },
  passport: {
    padding: 24,
    gap: 16,
    backgroundColor: palette.white,
    borderRadius: 4,
  },
  title: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '600',
    color: palette.ink,
    flex: 1,
  },
  reference: { color: palette.leaf },
  details: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 32,
    rowGap: 12,
  },
  detail: {
    flexBasis: '45%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 16,
  },
  label: { fontSize: 14, lineHeight: 20, color: palette.muted },
  value: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: palette.ink,
    fontWeight: '500',
  },
  process: { flexDirection: 'row', gap: 16 },
  processItem: {
    flex: 1,
    backgroundColor: palette.white,
    borderRadius: 4,
    padding: 18,
    gap: 10,
    borderWidth: 1,
    borderColor: palette.line,
  },
  activeProcess: { flex: 1.5, borderColor: palette.leaf },
  processReady: { backgroundColor: palette.tint, borderColor: palette.tint },
  processWaiting: { backgroundColor: palette.paper },
  processTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    color: palette.ink,
  },
  processState: {
    fontSize: 14,
    lineHeight: 20,
    color: palette.muted,
    paddingVertical: 14,
  },
  table: { backgroundColor: palette.white, borderRadius: 4 },
  tableTitle: { padding: 16, gap: 4 },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: palette.paper,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    gap: 20,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  sku: { width: 120 },
  product: { flex: 1, gap: 4 },
  location: { width: 100 },
  count: { width: 80, textAlign: 'right' },
  sample: { fontSize: 12, lineHeight: 18, color: palette.leaf },
});
