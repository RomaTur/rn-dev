import React from 'react';
import { View } from 'react-native';

type IconName =
  | 'camera'
  | 'calendar'
  | 'chevron-left'
  | 'chevron-right'
  | 'close'
  | 'check';

/** Original geometric icons drawn with native views; no font assets. */
export function Icon({
  name,
  size = 24,
  color = '#246347',
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  const stroke = 2;
  return (
    <View
      accessible={false}
      pointerEvents="none"
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {name === 'camera' && (
        <>
          <View
            style={{
              position: 'absolute',
              top: size * 0.25,
              width: size * 0.88,
              height: size * 0.6,
              borderWidth: stroke,
              borderColor: color,
              borderRadius: 3,
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: size * 0.12,
              width: size * 0.4,
              height: size * 0.2,
              borderTopWidth: stroke,
              borderLeftWidth: stroke,
              borderRightWidth: stroke,
              borderColor: color,
              borderTopLeftRadius: 2,
              borderTopRightRadius: 2,
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: size * 0.4,
              width: size * 0.3,
              height: size * 0.3,
              borderWidth: stroke,
              borderColor: color,
              borderRadius: size,
            }}
          />
        </>
      )}
      {name === 'calendar' && (
        <>
          <View
            style={{
              position: 'absolute',
              top: size * 0.2,
              width: size * 0.8,
              height: size * 0.72,
              borderWidth: stroke,
              borderColor: color,
              borderRadius: 2,
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: size * 0.4,
              width: size * 0.76,
              height: stroke,
              backgroundColor: color,
            }}
          />
          {[0.3, 0.62].map(left => (
            <View
              key={left}
              style={{
                position: 'absolute',
                top: size * 0.06,
                left: size * left,
                height: size * 0.27,
                width: stroke,
                backgroundColor: color,
              }}
            />
          ))}
        </>
      )}
      {(name === 'chevron-left' || name === 'chevron-right') && (
        <View
          style={{
            width: size * 0.4,
            height: size * 0.4,
            borderTopWidth: stroke,
            borderRightWidth: stroke,
            borderColor: color,
            transform: [
              { rotate: name === 'chevron-left' ? '-135deg' : '45deg' },
            ],
          }}
        />
      )}
      {name === 'close' && (
        <>
          <View
            style={{
              position: 'absolute',
              width: size * 0.8,
              height: stroke,
              backgroundColor: color,
              transform: [{ rotate: '45deg' }],
            }}
          />
          <View
            style={{
              position: 'absolute',
              width: size * 0.8,
              height: stroke,
              backgroundColor: color,
              transform: [{ rotate: '-45deg' }],
            }}
          />
        </>
      )}
      {name === 'check' && (
        <View
          style={{
            width: size * 0.32,
            height: size * 0.58,
            marginTop: -size * 0.12,
            borderBottomWidth: stroke,
            borderRightWidth: stroke,
            borderColor: color,
            transform: [{ rotate: '45deg' }],
          }}
        />
      )}
    </View>
  );
}
