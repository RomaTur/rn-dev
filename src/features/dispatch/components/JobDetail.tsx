import React, { useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { useWarehouse } from '../../../app/warehouse/WarehouseProvider';
import { stageLabel } from '../../../domain/stageLabel';
import type { Job } from '../../../domain/types';
import { latestRelease } from '../../../quality/engine';
import {
  Button,
  Field,
  Heading,
  Tag,
  palette,
  styles,
} from '../../../shared/ui';
import { CountLine } from './CountLine';
import { SummaryLine } from './SummaryLine';

export function JobDetail({
  job,
  onBack,
  onInspect,
}: {
  job: Job;
  onBack: () => void;
  onInspect?: (key: string) => void;
}) {
  const { run, busy, state } = useWarehouse();
  const wide = useWindowDimensions().width > 1000;
  const [label, setLabel] = useState('Место ' + job.reference);
  const [mass, setMass] = useState('');
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const total = job.lines.reduce((sum, l) => sum + l.requested, 0),
    picked = job.lines.reduce((sum, l) => sum + l.picked, 0);
  return (
    <View style={styles.section}>
      <Heading
        title={
          job.stage === 'dispatched' ? 'Отгрузка завершена' : job.reference
        }
        subtitle={job.recipient + ' · ' + job.destination}
        action={
          <Button secondary testID="job-back" onPress={onBack}>
            К заданиям
          </Button>
        }
      />
      <View style={[styles.panel, { backgroundColor: palette.leaf }]}>
        <View style={styles.spread}>
          <Text
            testID="job-stage"
            style={{ fontSize: 23, fontWeight: '600', color: 'white' }}
          >
            {stageLabel[job.stage]}
          </Text>
          <Text style={{ fontSize: 16, color: '#E0E8DE' }}>
            {picked} / {total} шт.
          </Text>
        </View>
        <View
          style={{ height: 6, borderRadius: 3, backgroundColor: '#6F8875' }}
        >
          <View
            style={{
              height: 6,
              borderRadius: 3,
              backgroundColor: '#E6C077',
              width: `${(100 * picked) / total}%`,
            }}
          />
        </View>
        <Text style={{ fontSize: 14, color: '#E0E8DE' }}>
          Срок отгрузки · {job.due}
        </Text>
      </View>
      {job.stage === 'queued' && (
        <View style={styles.panel}>
          <Text style={styles.heading}>Состав задания</Text>
          {job.lines.map(line => (
            <SummaryLine key={line.key} line={line} />
          ))}
          <Button
            busy={busy}
            testID="job-begin"
            onPress={() => {
              run({ type: 'begin', jobKey: job.key });
            }}
          >
            Начать подбор
          </Button>
        </View>
      )}
      {job.stage === 'picking' && (
        <>
          <View style={{ gap: 16 }}>
            {job.lines.map(line => (
              <CountLine
                key={line.key}
                job={job}
                line={line}
                onDirty={value =>
                  setDirty(current => ({ ...current, [line.key]: value }))
                }
              />
            ))}
          </View>
          <View
            style={[
              styles.panel,
              {
                flexDirection: wide ? 'row' : 'column',
                alignItems: wide ? 'center' : 'stretch',
                justifyContent: 'space-between',
              },
            ]}
          >
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.heading}>Проверьте каждую позицию</Text>
              <Text style={styles.muted}>
                При недоборе укажите причину. Нулевое количество тоже требует
                подтверждения.
              </Text>
            </View>
            <Button
              testID="picking-finish"
              disabled={
                job.lines.some(line => !line.counted) ||
                Object.values(dirty).some(Boolean)
              }
              busy={busy}
              onPress={() => {
                run({ type: 'finishPicking', jobKey: job.key });
              }}
            >
              К упаковке
            </Button>
          </View>
        </>
      )}
      {job.stage === 'packing' && (
        <View style={styles.panel}>
          <Text style={styles.heading}>Подготовьте грузовое место</Text>
          {job.lines.map(line => (
            <SummaryLine key={line.key} line={line} actual />
          ))}
          <View style={styles.line} />
          <Field
            label="Маркировка места"
            testID="parcel-label"
            value={label}
            onChangeText={setLabel}
          />
          <Field
            label="Масса брутто, г"
            testID="parcel-mass"
            numeric
            value={mass}
            onChangeText={setMass}
          />
          <Button
            testID="parcel-save"
            disabled={busy || !mass.trim() || !label.trim()}
            onPress={() => {
              run({
                type: 'pack',
                jobKey: job.key,
                label,
                massGrams: Number(mass),
              });
            }}
          >
            Подтвердить упаковку
          </Button>
        </View>
      )}
      {job.stage === 'ready' && (
        <View style={styles.panel}>
          <Text style={styles.heading}>Передача в отгрузку</Text>
          <Text style={styles.text}>
            Проверьте маркировку перед передачей. Подтверждение спишет {picked}{' '}
            шт. готовых изделий со склада.
          </Text>
          <Text style={styles.heading}>{job.parcel?.label}</Text>
          <Text style={styles.muted}>
            Масса {job.parcel?.massGrams} г · {job.lines.length} позиции
          </Text>
          <Text style={styles.text}>
            {latestRelease(state, job)
              ? 'Контроль качества пройден. Допуск действителен.'
              : 'Для отгрузки требуется действующее заключение контроля качества.'}
          </Text>
          {onInspect && (
            <Button
              secondary
              testID="job-inspect"
              onPress={() => onInspect(job.key)}
            >
              Перейти к осмотру
            </Button>
          )}
          <Button
            disabled={!latestRelease(state, job)}
            testID="dispatch-confirm"
            busy={busy}
            onPress={() => {
              run({ type: 'dispatch', jobKey: job.key });
            }}
          >
            Подтвердить отгрузку
          </Button>
        </View>
      )}
      {job.stage === 'dispatched' && (
        <View testID="dispatch-receipt" style={styles.panel}>
          <Tag>Складской учёт обновлён</Tag>
          <Text style={styles.heading}>{job.parcel?.label}</Text>
          <Text style={styles.text}>
            Передано {picked} шт. · {job.parcel?.massGrams} г
          </Text>
          {job.lines.map(line => (
            <SummaryLine key={line.key} line={line} actual />
          ))}
          <View style={styles.line} />
          <Text style={styles.muted}>
            {job.dispatchedAt
              ? new Date(job.dispatchedAt).toLocaleString('ru-RU')
              : ''}
          </Text>
          <Text style={styles.muted}>
            Документ сохранён на устройстве. Состояние обмена доступно в разделе
            «Обмен».
          </Text>
          <Button testID="receipt-done" onPress={onBack}>
            Готово
          </Button>
        </View>
      )}
    </View>
  );
}
