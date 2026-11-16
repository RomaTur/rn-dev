import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useWarehouse } from '../../app/warehouse/WarehouseProvider';
import { Button, Heading, Tag, palette, styles } from '../../shared/ui';
import { simulator } from '../../app/warehouse/runtime';

export function Sync() {
  const { state, busy, sync } = useWarehouse();
  const [mode, setMode] = useState(simulator.mode);
  const [finished, setFinished] = useState(false);
  const choose = (value: typeof mode) => {
    simulator.setMode(value);
    setMode(value);
    setFinished(false);
  };
  return (
    <View style={styles.section}>
      <Heading
        title="Обмен данными"
        subtitle="Локальный симулятор сервиса · вымышленные операции"
      />
      <View style={styles.panel}>
        <Tag warm={!!state.outbox.length}>
          {state.outbox.length
            ? `Ожидают обмена · ${state.outbox.length}`
            : 'Все операции подтверждены'}
        </Tag>
        <Text style={styles.heading}>Проверьте работу при сбое связи</Text>
        <Text style={styles.muted}>
          Изменения сначала сохраняются на устройстве. Симулятор подтверждает
          операции по порядку и распознаёт повторную отправку.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {(
            [
              ['online', 'Доступен'],
              ['offline', 'Нет связи'],
              ['conflict', 'Конфликт'],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              testID={'sync-' + value}
              secondary={mode !== value}
              disabled={busy}
              onPress={() => choose(value)}
            >
              {label}
            </Button>
          ))}
        </View>
        <Button
          testID="sync-send"
          disabled={busy || !state.outbox.length}
          busy={busy}
          onPress={async () => {
            await sync();
            setFinished(true);
          }}
        >
          Отправить накопленные операции
        </Button>
        {finished && !state.outbox.length && (
          <Text testID="sync-success" style={styles.text}>
            Обмен завершён
          </Text>
        )}
      </View>
      {state.outbox.map(event => (
        <View key={event.key} style={[styles.panel, { gap: 8 }]}>
          <View style={styles.spread}>
            <Text style={styles.text}>Изменение {event.revision}</Text>
            <Tag warm={event.state === 'conflict'}>
              {event.state === 'conflict' ? 'Конфликт версии' : 'В очереди'}
            </Tag>
          </View>
          <Text style={styles.muted}>Попыток отправки {event.attempts}</Text>
        </View>
      ))}
      {state.outbox.some(e => e.state === 'conflict') && (
        <View style={styles.panel}>
          <Text style={{ fontSize: 15, color: palette.orange }}>
            Симуляция конфликта приостановила очередь. Выберите «Доступен» и
            повторите обмен. Реальное расхождение версий требует сверки
            изменений.
          </Text>
        </View>
      )}
    </View>
  );
}
