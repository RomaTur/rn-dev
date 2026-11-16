import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { palette } from '../../shared/ui';

export function WorkspaceBar({
  title,
  inspectorName,
  pending,
  busy,
  onMenu,
}: {
  title: string;
  inspectorName: string;
  pending: number;
  busy: boolean;
  onMenu: () => void;
}) {
  return (
    <View
      style={{
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
        paddingHorizontal: 16,
        backgroundColor: palette.darknav,
      }}
    >
      <Pressable
        testID="app-menu"
        accessibilityRole="button"
        accessibilityLabel="Разделы приложения"
        disabled={busy}
        onPress={onMenu}
        style={({ pressed }) => ({
          minHeight: 48,
          minWidth: 48,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          backgroundColor: pressed ? palette.darkPressed : 'transparent',
          borderRadius: 4,
        })}
      >
        <View style={{ width: 24, gap: 5 }}>
          {[0, 1, 2].map(index => (
            <View
              key={index}
              style={{ height: 2, backgroundColor: 'white', borderRadius: 1 }}
            />
          ))}
        </View>
      </Pressable>
      <Text
        accessibilityRole="header"
        style={{
          fontSize: 16,
          lineHeight: 20,
          fontWeight: '600',
          color: 'white',
          flex: 1,
        }}
      >
        {title}
      </Text>
      <Text style={{ fontSize: 14, color: palette.onDark, textAlign: 'right' }}>
        {inspectorName}
        {'\n'}
        {pending ? `${pending} в очереди` : 'На устройстве'}
      </Text>
    </View>
  );
}
