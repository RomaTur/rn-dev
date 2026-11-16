import React from 'react';
import { Text, View } from 'react-native';
import type { PickLine } from '../../../domain/types';
import { palette, styles } from '../../../shared/ui';

export function SummaryLine({
  line,
  actual = false,
}: {
  line: PickLine;
  actual?: boolean;
}) {
  return (
    <View style={{ gap: 6, paddingVertical: 8 }}>
      <View style={styles.spread}>
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={styles.text}>{line.label}</Text>
          <Text style={styles.muted}>
            {line.sku} · {line.location}
          </Text>
        </View>
        <Text style={styles.heading}>
          {actual ? line.picked : line.requested} шт.
        </Text>
      </View>
      {actual && line.picked < line.requested && (
        <Text style={{ color: palette.orange, fontSize: 14 }}>
          Недобор {line.requested - line.picked} шт. · {line.shortageNote}
        </Text>
      )}
    </View>
  );
}
