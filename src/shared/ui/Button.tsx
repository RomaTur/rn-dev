import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { palette } from './theme';

export function Button({
  children,
  onPress,
  secondary = false,
  disabled = false,
  testID,
  busy = false,
  height = 48,
  danger = false,
}: {
  children: React.ReactNode;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  testID?: string;
  busy?: boolean;
  height?: 48 | 56;
  danger?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const locked = disabled || busy;
  const actionColor = danger ? palette.danger : palette.accent;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: locked, busy }}
      disabled={locked}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        controlStyles.button,
        {
          minHeight: height,
          backgroundColor: secondary ? palette.white : actionColor,
          borderColor: secondary && !danger ? palette.line : actionColor,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
        focused && { borderColor: palette.ink, borderWidth: 2 },
      ]}
    >
      {busy ? (
        <ActivityIndicator
          size={28}
          color={secondary ? actionColor : palette.white}
        />
      ) : (
        <Text
          style={[
            controlStyles.buttonText,
            { color: secondary ? actionColor : palette.white },
          ]}
        >
          {children}
        </Text>
      )}
    </Pressable>
  );
}

const controlStyles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    textAlign: 'center',
  },
});
