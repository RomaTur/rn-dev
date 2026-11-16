import React from 'react';
import { Text, View } from 'react-native';
import type { Inspection } from '../../../quality/types';
import { Button, Tag } from '../../../shared/ui';
import { ui } from './styles';

export function InspectionHeader({
  item,
  locked,
  editable,
  material,
  quantity,
  onBack,
}: {
  item: Inspection;
  locked: boolean;
  editable: boolean;
  material: string;
  quantity: number;
  onBack: () => void;
}) {
  return (
    <View testID="inspection-context" style={ui.context}>
      <Button
        testID="inspection-back"
        secondary
        disabled={locked}
        onPress={onBack}
      >
        К списку
      </Button>
      <View style={ui.documentNumber}>
        <Text style={ui.reference}>{item.reference}</Text>
        <Text style={ui.contextDetail} numberOfLines={1}>
          {item.title}
        </Text>
      </View>
      <View style={ui.column}>
        <Text style={ui.documentMaterial} numberOfLines={2}>
          {material}
        </Text>
      </View>
      <Text style={ui.contextQuantity}>{quantity} шт.</Text>
      <Tag
        tone={
          item.status === 'hold' ? 'danger' : editable ? 'neutral' : 'positive'
        }
      >
        {editable
          ? 'Черновик'
          : item.status === 'released'
          ? 'Допуск'
          : 'Задержка'}
      </Tag>
    </View>
  );
}
