import React from 'react';
import { Text, View } from 'react-native';
import { styles } from './theme';

export function Heading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.spread}>
      <View style={{ flex: 1, gap: 6 }}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {subtitle && <Text style={styles.muted}>{subtitle}</Text>}
      </View>
      {action}
    </View>
  );
}
