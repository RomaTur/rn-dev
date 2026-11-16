import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { palette } from '../../../shared/ui';
import { Icon } from '../../../shared/ui/Icon';
import { stages, type Step } from './stages';
import { ui } from './styles';

export function InspectionSteps({
  active,
  completed,
  wide,
  locked,
  onChange,
}: {
  active: Step;
  completed: Record<Step, boolean>;
  wide: boolean;
  locked: boolean;
  onChange: (step: Step) => void;
}) {
  return (
    <View testID="inspection-steps" style={wide ? ui.verticalSteps : ui.steps}>
      {stages.map(([key, label], index) => (
        <StepRow
          key={key}
          step={key}
          label={label}
          number={index + 1}
          selected={active === key}
          complete={completed[key]}
          wide={wide}
          locked={locked}
          onPress={() => onChange(key)}
        />
      ))}
    </View>
  );
}

function StepRow({
  step,
  label,
  number,
  selected,
  complete,
  wide,
  locked,
  onPress,
}: {
  step: Step;
  label: string;
  number: number;
  selected: boolean;
  complete: boolean;
  wide: boolean;
  locked: boolean;
  onPress: () => void;
}) {
  const progress = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(selected ? 1 : 0, {
      duration: 160,
      reduceMotion: ReduceMotion.System,
    });
  }, [progress, selected]);
  const animatedBackground = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [palette.white, palette.tint],
    ),
  }));

  return (
    <Pressable
      testID={'inspection-tab-' + step}
      accessibilityRole="tab"
      accessibilityLabel={complete ? label + ' · заполнено' : label}
      accessibilityState={{ selected, disabled: locked }}
      disabled={locked}
      onPress={onPress}
      style={({ pressed }) => [
        ui.step,
        !wide && ui.column,
        selected && ui.stepSelected,
        pressed && ui.pressed,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          stepStyles.background,
          animatedBackground,
        ]}
      />
      <View
        style={[ui.stepBadge, (selected || complete) && ui.stepBadgeActive]}
      >
        {complete ? (
          <Icon name="check" size={16} color={palette.accent} />
        ) : (
          <Text style={[ui.stepNumber, selected && ui.activeText]}>
            {number}
          </Text>
        )}
      </View>
      <Text style={[ui.stepText, selected && ui.activeText]}>{label}</Text>
    </Pressable>
  );
}

const stepStyles = StyleSheet.create({ background: { borderRadius: 4 } });
