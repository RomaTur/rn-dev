import React from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { CRITERIA } from '../../../quality/catalogue';
import type { CriterionId } from '../../../quality/types';
import { Button, styles } from '../../../shared/ui';
import { ui } from './styles';

export function PhotoCategoryDialog({
  category,
  wide,
  onSelect,
  onClose,
}: {
  category: CriterionId;
  wide: boolean;
  onSelect: (criterion: CriterionId) => void;
  onClose: () => void;
}) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={ui.safeModal}>
          <View style={ui.modalOverlay}>
            <View style={ui.categorySheet}>
              <Text style={styles.heading}>Проверка на снимке</Text>
              <ScrollView
                testID="photo-category-scroll"
                contentContainerStyle={ui.grid}
              >
                {CRITERIA.map(c => (
                  <View key={c.id} style={wide ? ui.checkHalf : ui.checkFull}>
                    <Button
                      testID={'photo-category-' + c.id}
                      secondary={category !== c.id}
                      onPress={() => onSelect(c.id)}
                    >
                      {c.title}
                    </Button>
                  </View>
                ))}
              </ScrollView>
              <View style={ui.inlineAction}>
                <Button
                  testID="photo-category-cancel"
                  secondary
                  onPress={onClose}
                >
                  Отмена
                </Button>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
