import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type {
  CriterionId,
  Inspection,
  PhotoEvidence,
} from '../../../quality/types';
import { PhotoStrip } from '../components/PhotoStrip';
import { ui } from './styles';
import { CRITERIA, INSPECTION_SECTIONS } from '../../../quality/catalogue';
import { Button, ChoiceRow, palette, styles } from '../../../shared/ui';

export function ChecksStage({
  item,
  checkSection,
  setCheckSection,
  editable,
  locked,
  stale,
  assess,
  openCriterion,
  photograph,
  removePhoto,
}: {
  item: Inspection;
  checkSection: string;
  setCheckSection: (section: string) => void;
  editable: boolean;
  locked: boolean;
  stale: boolean;
  assess: (criterion: CriterionId, verdict: 'pass' | 'fail') => void;
  openCriterion: (criterion: CriterionId) => void;
  photograph: (category: CriterionId, caption: string) => void;
  removePhoto: (photo: PhotoEvidence) => void;
}) {
  return (
    <View style={ui.section}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={ui.sectionTabs}
      >
        {INSPECTION_SECTIONS.map(section => (
          <Pressable
            key={section.id}
            testID={'check-section-' + section.id}
            accessibilityRole="tab"
            accessibilityState={{
              selected: checkSection === section.id,
            }}
            onPress={() => setCheckSection(section.id)}
            style={[
              ui.sectionTab,
              checkSection === section.id && ui.sectionTabActive,
            ]}
          >
            <Text
              style={[
                ui.sectionTabLabel,
                checkSection === section.id && {
                  color: palette.leaf,
                },
              ]}
            >
              {section.title}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <View>
        {CRITERIA.filter(c => c.section === checkSection).map(criterion => {
          const check = item.checks[criterion.id];
          const status =
            check.verdict === 'pending'
              ? 'Оценить'
              : check.verdict === 'pass'
              ? 'Соответствует'
              : 'Отклонение';
          return (
            <View key={criterion.id} style={ui.checkBlock}>
              <View style={ui.sectionIntro}>
                <View style={styles.spread}>
                  <Text style={ui.checkTitle}>{criterion.title}</Text>
                  <Text
                    style={[
                      ui.checkStatus,
                      check.verdict === 'fail' && ui.failure,
                    ]}
                  >
                    {status}
                  </Text>
                </View>
                <Text style={styles.muted}>{criterion.hint}</Text>
              </View>
              <View style={ui.assessmentRow}>
                <View style={ui.column}>
                  <ChoiceRow
                    label="Соответствует"
                    radio
                    checked={check.verdict === 'pass'}
                    disabled={!editable || locked || stale}
                    testID={'check-pass-' + criterion.id}
                    onPress={() => assess(criterion.id, 'pass')}
                  />
                </View>
                <View style={ui.column}>
                  <ChoiceRow
                    label="Отклонение"
                    radio
                    danger
                    checked={check.verdict === 'fail'}
                    disabled={!editable || locked || stale}
                    testID={'check-fail-' + criterion.id}
                    onPress={() => assess(criterion.id, 'fail')}
                  />
                </View>
                <Button
                  secondary
                  testID={'criterion-' + criterion.id}
                  disabled={!editable || locked || stale}
                  onPress={() => openCriterion(criterion.id)}
                >
                  Замечания
                </Button>
              </View>
              {(!!check.reasons.length || !!check.comment) && (
                <View style={ui.notes}>
                  {check.reasons.map(reason => (
                    <Text key={reason} style={styles.text}>
                      • {reason}
                    </Text>
                  ))}
                  {!!check.comment && (
                    <Text style={ui.comment}>{check.comment}</Text>
                  )}
                </View>
              )}
              <PhotoStrip
                testID={'evidence-' + criterion.id}
                photos={item.photos.filter(p => p.category === criterion.id)}
                disabled={locked}
                canAdd={editable && !stale && item.photos.length < 20}
                onAdd={() => photograph(criterion.id, '')}
                onRemove={editable && !stale ? removePhoto : undefined}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}
