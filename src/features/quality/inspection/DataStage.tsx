import React from 'react';
import { Text, View } from 'react-native';
import type {
  CriterionId,
  Inspection,
  PhotoEvidence,
} from '../../../quality/types';
import { PhotoStrip } from '../components/PhotoStrip';
import { ui } from './styles';
import { Button, DateField, Field, styles } from '../../../shared/ui';
import type { Draft, DraftChange } from './draft';

export function DataStage({
  item,
  draft,
  set,
  wide,
  locked,
  editable,
  stale,
  scan,
  updateScan,
  applyScan,
  calendar,
  photograph,
  removePhoto,
  profileDetails,
  toggleProfileDetails,
}: {
  item: Inspection;
  draft: Draft;
  set: DraftChange;
  wide: boolean;
  locked: boolean;
  editable: boolean;
  stale: boolean;
  scan: string;
  updateScan: (value: string) => void;
  applyScan: () => void;
  calendar: () => void;
  photograph: (category: CriterionId, caption: string) => void;
  removePhoto: (photo: PhotoEvidence) => void;
  profileDetails: boolean;
  toggleProfileDetails: () => void;
}) {
  return (
    <View style={ui.section}>
      <View style={ui.workBlock}>
        <View style={ui.sectionIntro}>
          <Text style={ui.sectionTitle}>Данные партии</Text>
          <Text style={styles.muted}>
            Сверьте бирку и укажите фактическое количество осмотренных изделий.
          </Text>
        </View>
        <View style={ui.row}>
          <View style={ui.column}>
            <Field
              testID="inspection-quantity"
              label="Осмотрено, шт."
              numeric
              value={draft.quantity}
              onChangeText={set('quantity')}
              editable={editable && !locked}
            />
          </View>
          <View style={ui.column}>
            <DateField
              testID="inspection-date"
              label="Дата обработки"
              value={draft.processedOn}
              disabled={!editable || locked}
              onPress={calendar}
            />
          </View>
        </View>
        <View style={ui.row}>
          <View style={ui.column}>
            <Field
              testID="inspection-marking"
              label="Маркировка"
              value={draft.marking}
              onChangeText={set('marking')}
              editable={editable && !locked}
            />
          </View>
          {editable && (
            <View style={ui.column}>
              <View style={ui.row}>
                <View style={ui.column}>
                  <Field
                    testID="scanner-input"
                    label="Сканер · строка с Enter"
                    value={scan}
                    onChangeText={updateScan}
                    onSubmitEditing={applyScan}
                    editable={!locked}
                  />
                </View>
                <Button
                  testID="scanner-apply"
                  height={56}
                  secondary
                  disabled={locked || !scan.trim()}
                  onPress={applyScan}
                >
                  Принять
                </Button>
              </View>
            </View>
          )}
        </View>
        <PhotoStrip
          testID="data-photos"
          title="Фото маркировки"
          photos={item.photos.filter(p => p.category === 'identity')}
          disabled={locked}
          canAdd={editable && !stale && item.photos.length < 20}
          onAdd={() => photograph('identity', '')}
          onRemove={editable && !stale ? removePhoto : undefined}
        />
      </View>
      <View style={ui.workBlock}>
        <Text style={ui.sectionTitle}>Измерения образца</Text>
        <View style={ui.grid}>
          {(
            [
              ['moisture', 'Влажность, %'],
              ['length', 'Длина, мм'],
              ['width', 'Ширина, мм'],
              ['thickness', 'Толщина, мм'],
            ] as const
          ).map(([key, label]) => (
            <View key={key} style={wide ? ui.measurement : ui.half}>
              <Field
                label={label}
                testID={'inspection-' + key}
                numeric
                value={draft[key]}
                onChangeText={set(key)}
                editable={editable && !locked}
              />
            </View>
          ))}
        </View>
        <View style={ui.inlineAction}>
          <Button
            testID="profile-details-toggle"
            secondary
            onPress={toggleProfileDetails}
          >
            {profileDetails ? 'Скрыть пояснение' : 'Пределы и сканер'}
          </Button>
        </View>
        {profileDetails && (
          <Text style={styles.text}>
            Учебные пределы: влажность {item.profile.moistureMin}–
            {item.profile.moistureMax}%; размер {item.profile.nominalLength} ×{' '}
            {item.profile.nominalWidth} × {item.profile.nominalThickness} мм,
            допуск ±{item.profile.tolerance} мм. Это настройки демо, не
            отраслевой норматив. Сканер принимает строку с клавиатуры; драйверы
            USB и последовательного порта не подключены.
          </Text>
        )}
      </View>
    </View>
  );
}
