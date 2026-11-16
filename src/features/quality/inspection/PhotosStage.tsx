import React from 'react';
import { Text, View } from 'react-native';
import type {
  CriterionId,
  Inspection,
  PhotoEvidence,
} from '../../../quality/types';
import { PhotoStrip } from '../components/PhotoStrip';
import { ui } from './styles';
import { CRITERIA } from '../../../quality/catalogue';
import { Button, Field, styles } from '../../../shared/ui';

export function PhotosStage({
  item,
  editable,
  locked,
  stale,
  category,
  openCategoryPicker,
  caption,
  setCaption,
  photograph,
  removePhoto,
}: {
  item: Inspection;
  editable: boolean;
  locked: boolean;
  stale: boolean;
  category: CriterionId;
  openCategoryPicker: () => void;
  caption: string;
  setCaption: (value: string) => void;
  photograph: (category: CriterionId, caption: string) => void;
  removePhoto: (photo: PhotoEvidence) => void;
}) {
  return (
    <View style={ui.section}>
      <View style={ui.workBlock}>
        <Text style={styles.heading}>
          Фото осмотра · {item.photos.length} / 20
        </Text>
        {editable && (
          <View style={ui.row}>
            <View style={ui.column}>
              <Text style={styles.label}>Проверка на снимке</Text>
              <Button
                testID="photo-category-select"
                secondary
                disabled={locked}
                onPress={openCategoryPicker}
              >
                {CRITERIA.find(c => c.id === category)?.title}
              </Button>
            </View>
            <View style={ui.column}>
              <Field
                testID="photo-caption"
                label="Подпись к снимку"
                value={caption}
                onChangeText={setCaption}
                editable={!locked}
              />
            </View>
          </View>
        )}
      </View>
      {!item.photos.length && (
        <View style={ui.emptyPhotos}>
          <Text style={styles.heading}>Добавьте первое фото</Text>
          <Text style={styles.text}>
            Общий вид, маркировка или дефект. Для заключения нужно хотя бы одно
            фото.
          </Text>
        </View>
      )}
      {CRITERIA.filter(c => item.photos.some(p => p.category === c.id)).map(
        criterion => (
          <View key={criterion.id} style={ui.evidence}>
            <PhotoStrip
              testID={'photos-' + criterion.id}
              title={criterion.title}
              photos={item.photos.filter(p => p.category === criterion.id)}
              disabled={locked}
              canAdd={editable && !stale && item.photos.length < 20}
              onAdd={() => photograph(criterion.id, '')}
              onRemove={editable && !stale ? removePhoto : undefined}
            />
          </View>
        ),
      )}
      {!!item.photos.length && (
        <Text testID="photo-evidence-0" style={styles.muted}>
          Нажмите на миниатюру, чтобы рассмотреть снимок и подпись.
        </Text>
      )}
    </View>
  );
}
