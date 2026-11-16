import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from './Icon';
import { palette } from './theme';

export function ChoiceRow({
  label,
  checked,
  onPress,
  testID,
  disabled = false,
  radio = false,
  danger = false,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
  testID?: string;
  disabled?: boolean;
  radio?: boolean;
  danger?: boolean;
}) {
  const selectionColor = danger ? palette.danger : palette.accent;
  return (
    <Pressable
      testID={testID}
      accessibilityRole={radio ? 'radio' : 'checkbox'}
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        controlStyles.choice,
        pressed && { backgroundColor: palette.tint },
        disabled && { opacity: 0.5 },
      ]}
    >
      <View
        style={[
          controlStyles.indicator,
          radio && { borderRadius: 12 },
          checked && {
            borderColor: selectionColor,
            borderWidth: radio ? 7.5 : 0,
            backgroundColor: radio ? palette.white : selectionColor,
          },
        ]}
      >
        {checked && !radio && (
          <Icon name="check" size={24} color={palette.white} />
        )}
      </View>
      <Text style={controlStyles.choiceText}>{label}</Text>
    </Pressable>
  );
}

const controlStyles = StyleSheet.create({
  choice: {
    minHeight: 48,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 4,
  },
  choiceText: {
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 20,
    color: palette.ink,
  },
  indicator: {
    width: 24,
    height: 24,
    flexShrink: 0,
    borderWidth: 2,
    borderColor: palette.muted,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
