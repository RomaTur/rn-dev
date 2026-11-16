import React from 'react';
import { Text, View } from 'react-native';
import { useWarehouse } from '../../app/warehouse/WarehouseProvider';
import { Button, Heading, Tag, palette, styles } from '../../shared/ui';
import { stageLabel } from '../../domain/stageLabel';
export function Overview({ go }: { go: (section: 'jobs' | 'stock') => void }) {
  const { state } = useWarehouse();
  const raw = state.stock.filter(l => l.kind === 'raw');
  const finished = state.stock.filter(l => l.kind === 'finished');
  const active = state.jobs.filter(j => j.stage !== 'dispatched');
  return (
    <View style={styles.section}>
      <Heading
        title="Склад мастерской"
        subtitle="Демонстрационная мастерская «Тихая роща»"
      />
      <View
        style={[
          styles.panel,
          { backgroundColor: palette.leaf, padding: 28, gap: 24 },
        ]}
      >
        <View style={styles.spread}>
          <View style={{ flex: 1, gap: 10 }}>
            <Text style={{ fontSize: 30, fontWeight: '600', color: 'white' }}>
              Из материала — в изделие
            </Text>
            <Text style={{ fontSize: 16, lineHeight: 25, color: '#DCE6DD' }}>
              Поступление, остатки и отгрузки{'\n'}в одном рабочем пространстве.
            </Text>
          </View>
          <View
            accessibilityElementsHidden
            style={{
              width: 110,
              height: 90,
              gap: 9,
              transform: [{ rotate: '-8deg' }],
            }}
          >
            {[0, 1, 2].map(i => (
              <View
                key={i}
                style={{
                  height: 19,
                  marginLeft: i * 9,
                  width: 95 - i * 9,
                  borderRadius: 4,
                  backgroundColor: i === 1 ? '#D5AD6D' : '#F0D4A2',
                }}
              />
            ))}
          </View>
        </View>
        <View style={styles.row}>
          <Button secondary testID="overview-jobs" onPress={() => go('jobs')}>
            Открыть отгрузки
          </Button>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {[
          [String(raw.reduce((s, l) => s + l.quantity, 0)), 'шт. сырья'],
          [String(finished.reduce((s, l) => s + l.quantity, 0)), 'шт. изделий'],
          [String(active.length), 'отгрузки в работе'],
        ].map(([value, label]) => (
          <View
            key={label}
            style={{
              flex: 1,
              minWidth: 130,
              padding: 20,
              gap: 8,
              backgroundColor: palette.white,
              borderRadius: 12,
            }}
          >
            <Text
              style={{ fontSize: 30, fontWeight: '600', color: palette.ink }}
            >
              {value}
            </Text>
            <Text style={styles.muted}>{label}</Text>
          </View>
        ))}
      </View>
      <View style={styles.panel}>
        <View style={styles.spread}>
          <Text style={styles.heading}>Ближайшие задания</Text>
          <Text style={styles.muted}>{active.length} в очереди</Text>
        </View>
        {active.map(job => (
          <View key={job.key} style={{ gap: 14 }}>
            <View style={styles.line} />
            <View style={styles.spread}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.text}>{job.recipient}</Text>
                <Text style={styles.muted}>
                  {job.reference} · {job.due}
                </Text>
              </View>
              <Tag warm={job.priority === 'urgent'}>
                {stageLabel[job.stage]}
              </Tag>
            </View>
          </View>
        ))}
      </View>
      <View style={[styles.panel, { backgroundColor: palette.sand }]}>
        <View style={styles.spread}>
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={styles.heading}>Поступила новая партия?</Text>
            <Text style={styles.muted}>
              Зафиксируйте породу, размеры и ячейку хранения.
            </Text>
          </View>
          <Button secondary onPress={() => go('stock')}>
            К материалам
          </Button>
        </View>
      </View>
    </View>
  );
}
