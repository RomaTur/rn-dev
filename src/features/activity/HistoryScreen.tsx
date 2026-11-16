import React from 'react';
import { Text, View } from 'react-native';
import { useWarehouse } from '../../app/warehouse/WarehouseProvider';
import { Heading, styles } from '../../shared/ui';

export function History() {
  const { state } = useWarehouse();
  return (
    <View style={styles.section}>
      <Heading
        title="Журнал операций"
        subtitle="Сохранённые действия в порядке выполнения"
      />
      {!state.activity.length && (
        <View style={styles.panel}>
          <Text style={styles.heading}>Журнал готов к работе</Text>
          <Text style={styles.muted}>
            Примите партию, пересчитайте остаток или начните отгрузку.
          </Text>
        </View>
      )}
      {[...state.activity].reverse().map((event, i) => (
        <View key={event.key} style={[styles.panel, { gap: 8 }]}>
          <Text style={styles.muted}>
            {new Date(event.at).toLocaleString('ru-RU')}
          </Text>
          <Text
            testID={i === 0 ? 'latest-activity' : undefined}
            style={styles.text}
          >
            {event.description}
          </Text>
        </View>
      ))}
    </View>
  );
}
