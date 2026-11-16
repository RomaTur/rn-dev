import React from 'react';
import { Text, View } from 'react-native';
import { palette } from './theme';

export function Tag({
  children,
  warm = false,
  tone = warm ? 'warm' : 'positive',
}: {
  children: React.ReactNode;
  warm?: boolean;
  tone?: 'warm' | 'positive' | 'neutral' | 'danger';
}) {
  const colors = {
    warm: [palette.sand, palette.ink],
    positive: [palette.tint, palette.accent],
    neutral: [palette.paper, palette.muted],
    danger: [palette.dangerTint, palette.danger],
  }[tone];
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: colors[0],
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 4,
      }}
    >
      <Text
        style={{
          fontSize: 14,
          lineHeight: 20,
          fontWeight: '600',
          color: colors[1],
        }}
      >
        {children}
      </Text>
    </View>
  );
}
