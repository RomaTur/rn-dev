import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useWarehouse } from '../../../app/warehouse/WarehouseProvider';
import type { Job, PickLine } from '../../../domain/types';
import { Button, Field, Tag, styles } from '../../../shared/ui';

export function CountLine({
  job,
  line,
  onDirty,
}: {
  job: Job;
  line: PickLine;
  onDirty: (value: boolean) => void;
}) {
  const { run, busy } = useWarehouse();
  const [quantity, setQuantity] = useState(
    line.counted ? String(line.picked) : '',
  );
  const [note, setNote] = useState(line.shortageNote);
  return (
    <View style={styles.panel}>
      <View style={styles.spread}>
        <Tag>{line.location}</Tag>
        {line.counted && <Tag>Подтверждено {line.picked} шт.</Tag>}
      </View>
      <Text style={styles.heading}>{line.label}</Text>
      <Text style={styles.muted}>
        {line.sku} · требуется {line.requested} шт.
      </Text>
      <Field
        label="Отобрано, шт."
        testID={'pick-' + line.key}
        editable={!busy}
        numeric
        value={quantity}
        onChangeText={value => {
          setQuantity(value);
          onDirty(value !== String(line.picked) || note !== line.shortageNote);
        }}
      />
      {quantity.trim() !== '' && Number(quantity) < line.requested && (
        <Field
          label="Причина недобора"
          testID={'shortage-' + line.key}
          editable={!busy}
          value={note}
          onChangeText={value => {
            setNote(value);
            onDirty(
              quantity !== String(line.picked) || value !== line.shortageNote,
            );
          }}
        />
      )}
      <Button
        testID={'count-' + line.key}
        disabled={busy || !quantity.trim()}
        secondary={line.counted}
        onPress={async () => {
          const saved = await run({
            type: 'count',
            jobKey: job.key,
            lineKey: line.key,
            quantity: Number(quantity),
            note,
          });
          if (saved) {
            setQuantity(String(Number(quantity)));
            setNote(note.trim());
            onDirty(false);
          }
        }}
      >
        Подтвердить количество
      </Button>
    </View>
  );
}
