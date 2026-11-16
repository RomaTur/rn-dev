import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useWarehouse } from '../../app/warehouse/WarehouseProvider';
import { reservedQuantity } from '../../domain/engine';
import { StockLot } from '../../domain/types';
import { Button, Field, Heading, Tag, palette, styles } from '../../shared/ui';
export function Stock() {
  const { state, run, busy } = useWarehouse();
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState(false);
  const [selected, setSelected] = useState<StockLot | null>(null);
  const [count, setCount] = useState('');
  const [reason, setReason] = useState('');
  const [receipt, setReceipt] = useState('');
  if (form)
    return (
      <Receipt
        onBack={() => setForm(false)}
        onSaved={label => {
          setForm(false);
          setReceipt(label);
        }}
      />
    );
  if (selected) {
    const current = state.stock.find(l => l.key === selected.key)!;
    return (
      <View style={styles.section}>
        <Heading
          title="Пересчёт остатка"
          subtitle={current.label}
          action={
            <Button secondary onPress={() => setSelected(null)}>
              К остаткам
            </Button>
          }
        />
        <View style={styles.panel}>
          <Tag>{current.location}</Tag>
          <Text style={styles.heading}>
            {current.species} · {current.size}
          </Text>
          <Text style={styles.text}>
            В учёте {current.quantity} шт. · В подборе{' '}
            {reservedQuantity(state, current.sku)} шт.
          </Text>
          <Field
            label="Фактически на ячейке, шт."
            numeric
            testID="inventory-count"
            value={count}
            onChangeText={setCount}
          />
          <Field
            label="Причина корректировки"
            testID="inventory-reason"
            value={reason}
            onChangeText={setReason}
          />
          <Text style={styles.muted}>
            {count.trim() !== '' && Number.isFinite(Number(count))
              ? `Изменение остатка ${
                  Number(count) - current.quantity > 0 ? '+' : ''
                }${Number(count) - current.quantity} шт.`
              : 'Укажите фактическое количество'}
          </Text>
          <Button
            testID="inventory-save"
            disabled={busy || !count.trim() || !reason.trim()}
            onPress={async () => {
              if (
                await run({
                  type: 'adjust',
                  lotKey: current.key,
                  quantity: Number(count),
                  reason,
                })
              ) {
                setReceipt('Остаток пересчитан');
                setSelected(null);
              }
            }}
          >
            Подтвердить пересчёт
          </Button>
        </View>
      </View>
    );
  }
  const lots = state.stock.filter(l =>
    `${l.label} ${l.sku} ${l.species} ${l.location}`
      .toLocaleLowerCase()
      .includes(filter.toLocaleLowerCase()),
  );
  return (
    <View style={styles.section}>
      <Heading
        title="Сырьё и изделия"
        subtitle="Остатки по ячейкам · единица учёта — штука"
        action={
          <Button
            testID="receive-open"
            onPress={() => {
              setReceipt('');
              setForm(true);
            }}
          >
            Принять партию
          </Button>
        }
      />
      {receipt !== '' && (
        <View style={styles.panel}>
          <Text testID="stock-success" style={styles.text}>
            {receipt}
          </Text>
        </View>
      )}
      <Field
        label="Поиск по материалу, артикулу или ячейке"
        testID="stock-search"
        value={filter}
        onChangeText={setFilter}
      />
      {lots.map(lot => (
        <Pressable
          testID={'stock-' + lot.sku}
          accessibilityRole="button"
          accessibilityLabel={'Пересчитать ' + lot.label}
          key={lot.key}
          onPress={() => {
            setSelected(lot);
            setCount(String(lot.quantity));
            setReason('');
          }}
          style={[styles.panel, { gap: 12 }]}
        >
          <View style={styles.spread}>
            <View style={{ flex: 1, gap: 7 }}>
              <Tag warm={lot.kind === 'raw'}>
                {lot.kind === 'raw' ? 'Сырьё' : 'Готовое изделие'} ·{' '}
                {lot.location}
              </Tag>
              <Text style={styles.heading}>{lot.label}</Text>
              <Text style={styles.muted}>
                {lot.sku} · {lot.species} · {lot.size}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text
                style={{ fontSize: 28, fontWeight: '600', color: palette.ink }}
              >
                {lot.quantity} <Text style={{ fontSize: 14 }}>шт.</Text>
              </Text>
              <Text style={styles.muted}>
                доступно {lot.quantity - reservedQuantity(state, lot.sku)}
              </Text>
              <Text style={{ color: palette.orange, fontWeight: '600' }}>
                Пересчитать
              </Text>
            </View>
          </View>
        </Pressable>
      ))}
      {!lots.length && (
        <Text style={styles.text}>По этому запросу материалы не найдены.</Text>
      )}
    </View>
  );
}
function Receipt({
  onBack,
  onSaved,
}: {
  onBack: () => void;
  onSaved: (s: string) => void;
}) {
  const { run, busy } = useWarehouse();
  const [kind, setKind] = useState<'raw' | 'finished'>('raw');
  const [label, setLabel] = useState('');
  const [sku, setSku] = useState('');
  const [species, setSpecies] = useState('Сосна');
  const [size, setSize] = useState('20 × 140 × 2000 мм');
  const [location, setLocation] = useState('A-04');
  const [quantity, setQuantity] = useState('');
  return (
    <View style={styles.section}>
      <Heading
        title="Поступление партии"
        subtitle="Новая партия получает собственный артикул и запись в журнале"
        action={
          <Button secondary onPress={onBack}>
            К остаткам
          </Button>
        }
      />
      <View style={styles.panel}>
        <View style={styles.row}>
          <Button secondary={kind !== 'raw'} onPress={() => setKind('raw')}>
            Сырьё
          </Button>
          <Button
            secondary={kind !== 'finished'}
            onPress={() => setKind('finished')}
          >
            Готовое изделие
          </Button>
        </View>
        <Field
          label="Наименование"
          testID="receipt-label"
          value={label}
          onChangeText={setLabel}
        />
        <Field
          label="Уникальный артикул партии"
          testID="receipt-sku"
          value={sku}
          onChangeText={setSku}
        />
        <Field
          label="Порода дерева"
          value={species}
          onChangeText={setSpecies}
        />
        <Field label="Размеры" value={size} onChangeText={setSize} />
        <Field
          label="Ячейка хранения"
          value={location}
          onChangeText={setLocation}
        />
        <Field
          label="Принято, шт."
          testID="receipt-quantity"
          numeric
          value={quantity}
          onChangeText={setQuantity}
        />
        <Button
          testID="receipt-save"
          disabled={
            busy ||
            ![label, sku, species, size, location, quantity].every(v =>
              v.trim(),
            )
          }
          onPress={async () => {
            if (
              await run({
                type: 'receive',
                lot: {
                  label,
                  sku,
                  species,
                  size,
                  location,
                  quantity: Number(quantity),
                  kind,
                },
              })
            )
              onSaved('Партия принята · ' + label);
          }}
        >
          Сохранить поступление
        </Button>
      </View>
    </View>
  );
}
