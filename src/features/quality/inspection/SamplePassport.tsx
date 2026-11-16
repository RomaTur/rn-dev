import React from 'react';
import { ScrollView, Text } from 'react-native';
import type { Inspection } from '../../../quality/types';
import { ui } from './styles';

export function SamplePassport({
  item,
  material,
}: {
  item: Inspection;
  material: string;
}) {
  return (
    <ScrollView
      testID="inspection-passport-scroll"
      style={ui.passportScroll}
      contentContainerStyle={ui.passport}
    >
      <Text style={ui.passportTitle}>Паспорт образца</Text>
      <Text style={ui.passportText}>{material}</Text>
      <Text style={ui.passportValue}>
        {item.profile.nominalLength} × {item.profile.nominalWidth} ×{' '}
        {item.profile.nominalThickness} мм
      </Text>
      <Text style={ui.passportText}>Допуск ±{item.profile.tolerance} мм</Text>
      <Text style={ui.passportText}>
        Влажность {item.profile.moistureMin}–{item.profile.moistureMax}%
      </Text>
      <Text style={ui.passportNote}>
        Учебный профиль;{' '}
        {item.subjectKind === 'job'
          ? 'первый артикул заказа.'
          : 'выбранный артикул.'}
      </Text>
    </ScrollView>
  );
}
