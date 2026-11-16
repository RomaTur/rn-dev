import React from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Button, palette, styles } from '../../shared/ui';
import { sections, type SectionName } from './routes';

export function WorkspaceMenu({
  menu,
  page,
  inspectorName,
  onClose,
  onSelect,
  onLock,
}: {
  menu: boolean;
  page: SectionName;
  inspectorName: string;
  onClose: () => void;
  onSelect: (name: SectionName) => void;
  onLock: () => void;
}) {
  return (
    <Modal
      visible={menu}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: palette.scrim,
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <View
          style={{
            alignSelf: 'center',
            width: '100%',
            maxWidth: 700,
            maxHeight: '100%',
            backgroundColor: palette.white,
            borderRadius: 16,
            padding: 24,
            gap: 16,
          }}
        >
          <View style={styles.spread}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading}>Разделы Woodland</Text>
              <Text style={styles.muted}>{inspectorName}</Text>
            </View>
            <Button secondary testID="app-menu-close" onPress={onClose}>
              Закрыть
            </Button>
          </View>
          <ScrollView contentContainerStyle={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {(Object.entries(sections) as [SectionName, string][]).map(
                ([key, label]) => (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: key === page }}
                    testID={'nav-' + key}
                    onPress={() => onSelect(key)}
                    style={({ pressed }) => ({
                      flexBasis: '47%',
                      flexGrow: 1,
                      minHeight: 64,
                      borderRadius: 10,
                      padding: 18,
                      justifyContent: 'center',
                      backgroundColor:
                        key === page
                          ? palette.leaf
                          : pressed
                          ? palette.line
                          : palette.paper,
                    })}
                  >
                    <Text
                      style={{
                        fontSize: 18,
                        fontWeight: '600',
                        color: key === page ? 'white' : palette.ink,
                      }}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>
          </ScrollView>
          <Button secondary testID="auth-lock" onPress={onLock}>
            Заблокировать планшет
          </Button>
        </View>
      </View>
    </Modal>
  );
}
