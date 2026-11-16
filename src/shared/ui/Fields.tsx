import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  useWindowDimensions,
  View,
} from 'react-native';
import { Icon } from './Icon';
import { palette, styles } from './theme';

export function Field({
  label,
  value,
  onChangeText,
  testID,
  numeric = false,
  multiline = false,
  editable = true,
  error,
  placeholder,
  onSubmitEditing,
  returnKeyType,
  compact = false,
  onFocus,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  testID?: string;
  numeric?: boolean;
  multiline?: boolean;
  editable?: boolean;
  error?: string;
  placeholder?: string;
  onSubmitEditing?: () => void;
  returnKeyType?: TextInputProps['returnKeyType'];
  compact?: boolean;
  onFocus?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const { fontScale } = useWindowDimensions();
  const scale = Math.max(1, fontScale);
  // Keep the baseline 56 dp field exact, while making room for larger text.
  const fieldHeight = 16 + 40 * scale;
  const borderColor = error
    ? palette.danger
    : focused
    ? palette.accent
    : palette.line;
  return (
    <View style={controlStyles.fieldGroup}>
      <View>
        <TextInput
          testID={testID}
          accessibilityLabel={label}
          accessibilityState={{ disabled: !editable }}
          editable={editable}
          style={[
            styles.input,
            {
              borderColor,
              height: fieldHeight,
              paddingTop: 6 + 16 * scale,
              paddingBottom: 8,
            },
            multiline && {
              height: compact ? fieldHeight : 16 + 64 * scale,
              textAlignVertical: 'top',
            },
            !editable && controlStyles.disabledField,
          ]}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
          onFocus={() => {
            setFocused(true);
            onFocus?.();
          }}
          onBlur={() => setFocused(false)}
          keyboardType={numeric ? 'decimal-pad' : 'default'}
          selectionColor={palette.accent}
          multiline={multiline}
          placeholder={placeholder}
          placeholderTextColor={palette.muted}
        />
        <Text
          pointerEvents="none"
          style={[
            controlStyles.floatingLabel,
            {
              color: error
                ? palette.danger
                : focused
                ? palette.accent
                : palette.muted,
            },
          ]}
        >
          {label}
        </Text>
      </View>
      {error && (
        <Text accessibilityRole="alert" style={controlStyles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

export function DateField({
  label,
  value,
  onPress,
  testID,
  disabled = false,
}: {
  label: string;
  value: string;
  onPress: () => void;
  testID?: string;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const { fontScale } = useWindowDimensions();
  const scale = Math.max(1, fontScale);
  const fieldHeight = 16 + 40 * scale;
  return (
    <View style={controlStyles.fieldGroup}>
      <View>
        <Pressable
          testID={testID}
          accessibilityRole="button"
          accessibilityLabel={label + ': ' + value}
          accessibilityHint="Открыть календарь"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onPress}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={({ pressed }) => [
            styles.input,
            controlStyles.dateField,
            {
              height: fieldHeight,
              paddingTop: 6 + 16 * scale,
              paddingBottom: 8,
            },
            focused && { borderColor: palette.accent },
            disabled && controlStyles.disabledField,
            pressed && { backgroundColor: palette.tint },
          ]}
        >
          <Text
            style={[
              styles.text,
              controlStyles.dateValue,
              disabled && { color: palette.muted },
            ]}
          >
            {value}
          </Text>
          <View
            style={[controlStyles.calendar, { top: (fieldHeight - 24) / 2 }]}
          >
            <Icon
              name="calendar"
              size={24}
              color={disabled ? palette.muted : palette.accent}
            />
          </View>
        </Pressable>
        <Text
          pointerEvents="none"
          style={[controlStyles.floatingLabel, controlStyles.dateLabel]}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

const controlStyles = StyleSheet.create({
  fieldGroup: { gap: 4 },
  floatingLabel: {
    position: 'absolute',
    top: 6,
    left: 16,
    right: 16,
    fontSize: 12,
    lineHeight: 16,
    color: palette.muted,
  },
  disabledField: { backgroundColor: palette.paper, color: palette.muted },
  error: {
    fontSize: 12,
    lineHeight: 16,
    color: palette.danger,
    paddingHorizontal: 16,
  },
  dateField: { paddingRight: 56 },
  dateValue: { includeFontPadding: false },
  dateLabel: { right: 56 },
  calendar: { position: 'absolute', right: 16, width: 24, height: 24 },
});
