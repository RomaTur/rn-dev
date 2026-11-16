import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useWarehouse } from '../../app/warehouse/WarehouseProvider';
import { stageLabel } from '../../domain/stageLabel';
import { Button, Heading, Tag, palette, styles } from '../../shared/ui';
import { JobDetail } from './components/JobDetail';

export function Jobs({ onInspect }: { onInspect?: (key: string) => void }) {
  const { state } = useWarehouse();
  const [selected, setSelected] = useState('');
  const [showDone, setShowDone] = useState(false);
  const job = state.jobs.find(j => j.key === selected);
  if (job)
    return (
      <JobDetail
        key={job.key}
        job={job}
        onInspect={onInspect}
        onBack={() => setSelected('')}
      />
    );
  const jobs = state.jobs.filter(j =>
    showDone ? j.stage === 'dispatched' : j.stage !== 'dispatched',
  );
  return (
    <View style={styles.section}>
      <Heading title="Отгрузки" subtitle="От ячейки до готового места" />
      <View style={styles.row}>
        <Button secondary={showDone} onPress={() => setShowDone(false)}>
          В работе
        </Button>
        <Button secondary={!showDone} onPress={() => setShowDone(true)}>
          Завершённые
        </Button>
      </View>
      {jobs.map(j => (
        <Pressable
          accessibilityRole="button"
          testID={'job-' + j.key}
          key={j.key}
          onPress={() => setSelected(j.key)}
          style={[styles.panel, { gap: 20 }]}
        >
          <View style={styles.spread}>
            <Tag warm={j.priority === 'urgent'}>
              {j.priority === 'urgent' ? 'Приоритетная' : 'Плановая'} ·{' '}
              {stageLabel[j.stage]}
            </Tag>
            <Text style={styles.muted}>{j.due}</Text>
          </View>
          <View style={styles.spread}>
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={styles.heading}>{j.recipient}</Text>
              <Text style={styles.muted}>
                {j.reference} · {j.destination}
              </Text>
            </View>
            <Text
              style={{ fontSize: 25, fontWeight: '600', color: palette.ink }}
            >
              {j.lines.reduce((sum, l) => sum + l.requested, 0)}{' '}
              <Text style={{ fontSize: 14 }}>шт.</Text>
            </Text>
          </View>
          <View style={styles.line} />
          <View style={styles.spread}>
            <Text style={styles.muted}>
              {j.lines.length} позиции · собрано{' '}
              {j.lines.reduce((sum, l) => sum + l.picked, 0)} шт.
            </Text>
            <Text
              style={{ fontSize: 15, fontWeight: '600', color: palette.orange }}
            >
              Открыть задание
            </Text>
          </View>
        </Pressable>
      ))}
      {!jobs.length && (
        <View style={styles.panel}>
          <Text style={styles.heading}>Здесь пока нет заданий</Text>
          <Text style={styles.muted}>
            Завершённые отгрузки появятся в этой вкладке.
          </Text>
        </View>
      )}
    </View>
  );
}
