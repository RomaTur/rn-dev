import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { PhotoEvidence } from '../../../quality/types';
import { CRITERIA } from '../../../quality/catalogue';
import { palette, styles } from '../../../shared/ui';
import { Icon } from '../../../shared/ui/Icon';

export function PhotoStrip({
  photos,
  title,
  testID = 'photo-strip',
  disabled = false,
  canAdd = true,
  onAdd,
  onRemove,
}: {
  photos: PhotoEvidence[];
  title?: string;
  testID?: string;
  disabled?: boolean;
  canAdd?: boolean;
  onAdd?: () => void;
  onRemove?: (photo: PhotoEvidence) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const selectedIndex = photos.findIndex(photo => photo.fileName === selected);
  const current = photos[selectedIndex];
  useEffect(() => {
    if (selected !== null && selectedIndex < 0) setSelected(null);
  }, [selected, selectedIndex]);
  const confirmRemove = (photo: PhotoEvidence) => {
    if (disabled || !onRemove) return;
    Alert.alert(
      'Удалить фото?',
      photo.caption || 'Фото будет удалено из этой проверки.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => onRemove(photo),
        },
      ],
    );
  };
  return (
    <View testID={testID}>
      {title && <Text style={styles.muted}>{title}</Text>}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={photoStyles.strip}
        contentContainerStyle={photoStyles.thumbnails}
      >
        {photos.map((photo, index) => (
          <View key={photo.fileName} style={photoStyles.thumbnailWrap}>
            <Pressable
              testID={testID + '-photo-' + index}
              accessibilityRole="button"
              accessibilityState={{ disabled }}
              disabled={disabled}
              accessibilityLabel={
                'Открыть фото ' +
                (index + 1) +
                ': ' +
                (photo.caption || categoryTitle(photo))
              }
              onPress={() => setSelected(photo.fileName)}
              style={photoStyles.thumbnailButton}
            >
              <Image
                source={{ uri: photo.uri }}
                style={photoStyles.thumbnail}
                resizeMode="cover"
                accessible={false}
              />
            </Pressable>
            {onRemove && (
              <Pressable
                testID={testID + '-remove-' + index}
                accessibilityRole="button"
                accessibilityLabel={
                  'Удалить фото ' +
                  (index + 1) +
                  ': ' +
                  (photo.caption || categoryTitle(photo))
                }
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={() => confirmRemove(photo)}
                style={photoStyles.remove}
              >
                <View
                  style={[photoStyles.removeIcon, disabled && { opacity: 0.5 }]}
                >
                  <Icon name="close" size={16} color={palette.ink} />
                </View>
              </Pressable>
            )}
          </View>
        ))}
        {onAdd && (
          <Pressable
            testID={testID + '-add'}
            accessibilityRole="button"
            accessibilityLabel="Добавить фото"
            accessibilityHint={
              canAdd ? 'Открыть камеру' : 'Достигнут лимит фотографий'
            }
            accessibilityState={{ disabled: disabled || !canAdd }}
            disabled={disabled || !canAdd}
            onPress={onAdd}
            style={({ pressed }) => [
              photoStyles.add,
              pressed && { backgroundColor: palette.tint },
              (disabled || !canAdd) && { opacity: 0.45 },
            ]}
          >
            <Icon name="camera" />
            <Text style={photoStyles.addText}>Добавить</Text>
          </Pressable>
        )}
        {!photos.length && !onAdd && (
          <Text style={styles.muted}>Фотографий пока нет</Text>
        )}
      </ScrollView>
      {current && (
        <Modal animationType="fade" onRequestClose={() => setSelected(null)}>
          <SafeAreaProvider>
            <SafeAreaView testID="photo-preview" style={photoStyles.preview}>
              <View style={photoStyles.previewHeader}>
                <Text style={photoStyles.previewTitle}>
                  Фото {selectedIndex + 1} из {photos.length}
                </Text>
                <Pressable
                  testID="photo-preview-close"
                  accessibilityRole="button"
                  accessibilityLabel="Закрыть фото"
                  onPress={() => setSelected(null)}
                  style={photoStyles.previewAction}
                >
                  <Icon name="close" color={palette.white} />
                </Pressable>
              </View>
              <Image
                testID="photo-preview-image"
                accessibilityLabel={current.caption || categoryTitle(current)}
                source={{ uri: current.uri }}
                style={photoStyles.previewImage}
                resizeMode="contain"
              />
              <View style={photoStyles.previewFooter}>
                <Pressable
                  testID="photo-preview-previous"
                  accessibilityRole="button"
                  accessibilityLabel="Предыдущее фото"
                  accessibilityState={{ disabled: selectedIndex === 0 }}
                  disabled={selectedIndex === 0}
                  onPress={() =>
                    setSelected(photos[selectedIndex - 1].fileName)
                  }
                  style={[
                    photoStyles.previewAction,
                    selectedIndex === 0 && { opacity: 0.35 },
                  ]}
                >
                  <Icon name="chevron-left" color={palette.white} />
                </Pressable>
                <ScrollView
                  style={photoStyles.caption}
                  contentContainerStyle={photoStyles.captionContent}
                >
                  {!!current.caption && (
                    <Text style={photoStyles.captionText}>
                      {current.caption}
                    </Text>
                  )}
                  <Text style={photoStyles.metadata}>
                    {categoryTitle(current)} · {captureDate(current.capturedAt)}
                  </Text>
                </ScrollView>
                <Pressable
                  testID="photo-preview-next"
                  accessibilityRole="button"
                  accessibilityLabel="Следующее фото"
                  accessibilityState={{
                    disabled: selectedIndex === photos.length - 1,
                  }}
                  disabled={selectedIndex === photos.length - 1}
                  onPress={() =>
                    setSelected(photos[selectedIndex + 1].fileName)
                  }
                  style={[
                    photoStyles.previewAction,
                    selectedIndex === photos.length - 1 && { opacity: 0.35 },
                  ]}
                >
                  <Icon name="chevron-right" color={palette.white} />
                </Pressable>
              </View>
            </SafeAreaView>
          </SafeAreaProvider>
        </Modal>
      )}
    </View>
  );
}

function categoryTitle(photo: PhotoEvidence) {
  return (
    CRITERIA.find(criterion => criterion.id === photo.category)?.title ??
    photo.category
  );
}
function captureDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Дата не указана';
  return date.toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const photoStyles = StyleSheet.create({
  strip: { height: 100, flexGrow: 0 },
  thumbnails: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingRight: 8,
  },
  // Reserve space for the 48dp remove target outside the photo's centre.
  // On an 80dp wrapper that overlay intercepted a normal thumbnail tap.
  thumbnailWrap: { width: 96, height: 80 },
  thumbnailButton: {
    width: 80,
    height: 80,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: palette.tint,
  },
  thumbnail: { width: 80, height: 80 },
  remove: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: 48,
    height: 48,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    padding: 4,
  },
  removeIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.line,
  },
  add: {
    width: 80,
    height: 80,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: palette.accent,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  addText: { color: palette.accent, fontSize: 12, lineHeight: 16 },
  preview: { flex: 1, backgroundColor: palette.darknav },
  previewHeader: {
    minHeight: 64,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  previewTitle: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600',
    color: palette.white,
  },
  previewImage: { flex: 1, minHeight: 0, width: '100%' },
  previewFooter: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  previewAction: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: { flex: 1, maxHeight: 100 },
  captionContent: { gap: 4, alignItems: 'center' },
  captionText: {
    fontSize: 16,
    lineHeight: 24,
    color: palette.white,
    textAlign: 'center',
  },
  metadata: {
    fontSize: 14,
    lineHeight: 20,
    color: palette.onDark,
    textAlign: 'center',
  },
});
