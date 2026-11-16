import React from 'react';
import { Text, View } from 'react-native';
import { CRITERIA } from '../../../quality/catalogue';
import { reportText } from '../../../quality/report';
import type { Inspection } from '../../../quality/types';
import { Button, Field, Notice, styles } from '../../../shared/ui';
import { InspectionSummary } from './InspectionSummary';
import { ui } from './styles';

export function DecisionStage({
  item,
  editable,
  done,
  conclusion,
  changeConclusion,
  locked,
  issues,
  dirty,
  hasPendingInput,
  pdf,
  reportDetails,
  toggleReportDetails,
}: {
  item: Inspection;
  editable: boolean;
  done: number;
  conclusion: string;
  changeConclusion: (value: string) => void;
  locked: boolean;
  issues: string[];
  dirty: boolean;
  hasPendingInput: boolean;
  pdf: boolean;
  reportDetails: boolean;
  toggleReportDetails: () => void;
}) {
  return (
    <View style={ui.workBlock}>
      <View style={ui.resultHeading}>
        <Text accessibilityRole="header" style={ui.sectionTitle}>
          {editable ? 'Итоги осмотра' : 'Осмотр подписан'}
        </Text>
        <Text style={styles.muted}>
          {done} из {CRITERIA.length} проверок · {item.photos.length} фото ·{' '}
          {item.inspectedQuantity} шт.
        </Text>
      </View>
      {editable ? (
        <>
          <InspectionSummary item={item} />
          <Text style={styles.heading}>Заключение</Text>
          <Field
            testID="inspection-summary"
            label="Комментарий и дальнейшие действия"
            multiline
            value={conclusion}
            onChangeText={changeConclusion}
            editable={!locked}
          />
          {!!issues.length && (
            <View style={ui.issues}>
              <Text style={styles.heading}>Для допуска осталось</Text>
              {issues.map(issue => (
                <Text key={issue} style={styles.text}>
                  • {issue}
                </Text>
              ))}
            </View>
          )}
          {dirty && <Notice text="Сохраните изменения перед подписанием." />}
          {hasPendingInput && (
            <Notice text="Завершите ввод сканера или добавьте фото с подписью перед подписанием. Лишний ввод можно очистить на соответствующем шаге." />
          )}
          <Text style={styles.muted}>
            Подписанное заключение нельзя редактировать.
          </Text>
        </>
      ) : (
        <>
          <Text
            testID="quality-complete"
            style={[styles.text, item.status === 'hold' && ui.failure]}
          >
            {item.status === 'released'
              ? 'Допуск подписан. Объект прошёл демонстрационный контроль.'
              : 'Объект задержан. Устраните замечания и проведите новый осмотр.'}
          </Text>
          {!!item.summary && <Text style={styles.text}>{item.summary}</Text>}
          <Text style={styles.muted}>
            {item.signedAt
              ? new Date(item.signedAt).toLocaleString('ru-RU')
              : ''}{' '}
            · {item.inspector}
          </Text>
          {pdf && (
            <Text
              testID="report-created"
              accessibilityRole="alert"
              style={styles.text}
            >
              PDF сформирован · {item.reference}
            </Text>
          )}
          <View style={ui.inlineAction}>
            <Button
              testID="report-details-toggle"
              secondary
              onPress={toggleReportDetails}
            >
              {reportDetails ? 'Скрыть текст отчёта' : 'Показать текст отчёта'}
            </Button>
          </View>
          {reportDetails && (
            <Text testID="report-preview" selectable style={styles.text}>
              {reportText(item)}
            </Text>
          )}
          <InspectionSummary item={item} />
        </>
      )}
    </View>
  );
}
