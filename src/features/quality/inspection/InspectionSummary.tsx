import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CRITERIA } from '../../../quality/catalogue';
import type { Inspection } from '../../../quality/types';
import { palette, styles } from '../../../shared/ui';
import { ui } from './styles';

export function InspectionSummary({ item }: { item: Inspection }) {
  const { profile } = item;
  const dimensions = [
    { label: 'Длина', value: item.length, nominal: profile.nominalLength },
    { label: 'Ширина', value: item.width, nominal: profile.nominalWidth },
    {
      label: 'Толщина',
      value: item.thickness,
      nominal: profile.nominalThickness,
    },
  ];
  const readings = [
    {
      label: 'Влажность',
      value: item.moisture,
      unit: '%',
      expected: `${profile.moistureMin}–${profile.moistureMax} %`,
      min: profile.moistureMin,
      max: profile.moistureMax,
    },
    ...dimensions.map(({ label, value, nominal }) => ({
      label,
      value,
      unit: 'мм',
      expected: `${nominal} ± ${profile.tolerance} мм`,
      min: nominal - profile.tolerance,
      max: nominal + profile.tolerance,
    })),
  ];
  return (
    <View style={summary.tables}>
      <View>
        <View style={[summary.row, summary.header]}>
          <Text style={[styles.muted, summary.parameter]}>Измерение</Text>
          <Text style={[styles.muted, summary.column]}>Факт</Text>
          <Text style={[styles.muted, summary.column]}>Учебный допуск</Text>
        </View>
        {readings.map(({ label, value, unit, expected, min, max }) => {
          const exceeds = value !== null && (value < min || value > max);
          return (
            <View key={label} style={summary.row}>
              <Text style={[summary.text, summary.parameter]}>{label}</Text>
              <Text
                style={[summary.text, summary.column, exceeds && ui.failure]}
              >
                {value === null
                  ? 'Не измерено'
                  : `${value} ${unit}${exceeds ? ' · вне допуска' : ''}`}
              </Text>
              <Text style={[styles.muted, summary.column]}>{expected}</Text>
            </View>
          );
        })}
      </View>
      <View>
        <View style={[summary.row, summary.header]}>
          <Text style={[styles.muted, summary.parameter]}>Критерий</Text>
          <Text style={[styles.muted, summary.column]}>Результат</Text>
          <Text style={[styles.muted, summary.column]}>Замечания</Text>
        </View>
        {CRITERIA.map(({ id, title }) => {
          const { verdict, reasons, comment } = item.checks[id];
          return (
            <View key={id} style={summary.row}>
              <Text style={[summary.text, summary.parameter]}>{title}</Text>
              <Text
                style={[
                  summary.text,
                  summary.column,
                  verdict === 'fail' && ui.failure,
                  verdict === 'pass' && ui.activeText,
                ]}
              >
                {verdict === 'fail'
                  ? 'Отклонение'
                  : verdict === 'pass'
                  ? 'Соответствует'
                  : 'Не оценено'}
              </Text>
              <Text style={[styles.muted, summary.column]} numberOfLines={2}>
                {reasons.join(', ') || (comment ? 'Есть комментарий' : '—')}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const summary = StyleSheet.create({
  tables: { gap: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 36,
  },
  header: { backgroundColor: palette.paper },
  parameter: { flex: 1.4, minWidth: 0 },
  column: { flex: 1, minWidth: 0 },
  text: { fontSize: 14, lineHeight: 19, color: palette.ink },
});
