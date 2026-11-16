import React from 'react';
import { Text, View } from 'react-native';
import { palette } from './theme';

export function Notice({ text }: { text: string }) {
  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: palette.dangerTint,
        padding: 16,
        borderRadius: 4,
      }}
    >
      <Text
        testID="feedback"
        style={{ color: palette.danger, fontSize: 16, lineHeight: 24 }}
      >
        {text}
      </Text>
    </View>
  );
}
