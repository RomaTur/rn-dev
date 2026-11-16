import React from 'react';
import { Text, View } from 'react-native';
import { CRITERIA } from '../../../quality/catalogue';
import { Button, styles } from '../../../shared/ui';
import type { Step } from './stages';
import { ui } from './styles';

export function InspectionFooter({
  step,
  editable,
  locked,
  dirty,
  done,
  stale,
  photoCount,
  unsaved,
  issueCount,
  pdf,
  save,
  changeStep,
  photograph,
  sign,
  openReport,
  printReport,
  shareReport,
  exportPdf,
}: {
  step: Step;
  editable: boolean;
  locked: boolean;
  dirty: boolean;
  done: number;
  stale: boolean;
  photoCount: number;
  unsaved: boolean;
  issueCount: number;
  pdf: boolean;
  save: () => void;
  changeStep: (step: Step) => void;
  photograph: () => void;
  sign: (decision: 'released' | 'hold') => void;
  openReport: () => void;
  printReport: () => void;
  shareReport: () => void;
  exportPdf: () => void;
}) {
  return (
    <View testID="inspection-footer" style={ui.footer}>
      {step === 'data' && (
        <>
          {editable && (
            <View style={ui.footerAction}>
              <Button testID="inspection-save" busy={locked} onPress={save}>
                Сохранить данные
              </Button>
            </View>
          )}
          <View style={ui.footerAction}>
            <Button
              testID="inspection-next-checks"
              secondary={editable}
              disabled={dirty || locked}
              onPress={() => changeStep('checks')}
            >
              К проверкам
            </Button>
          </View>
        </>
      )}
      {step === 'checks' && (
        <>
          <Text style={[styles.text, ui.column]}>
            {done} из {CRITERIA.length} проверок
          </Text>
          <View style={ui.footerAction}>
            <Button
              testID="inspection-next-photos"
              disabled={locked}
              onPress={() => changeStep('photos')}
            >
              К фото
            </Button>
          </View>
        </>
      )}
      {step === 'photos' && (
        <>
          {editable && (
            <View style={ui.footerAction}>
              <Button
                testID="photo-capture"
                busy={locked}
                disabled={stale || photoCount >= 20}
                onPress={() => photograph()}
              >
                Снять фото
              </Button>
            </View>
          )}
          <View style={ui.footerAction}>
            <Button
              testID="inspection-next-decision"
              secondary={editable}
              disabled={locked}
              onPress={() => changeStep('decision')}
            >
              К решению
            </Button>
          </View>
        </>
      )}
      {step === 'decision' &&
        (editable ? (
          <>
            <View style={ui.footerAction}>
              <Button
                testID="summary-save"
                secondary
                busy={locked}
                onPress={save}
              >
                Сохранить
              </Button>
            </View>
            <View style={ui.footerAction}>
              <Button
                testID="quality-hold"
                secondary
                danger
                disabled={locked || unsaved || stale}
                onPress={() => sign('hold')}
              >
                Задержать
              </Button>
            </View>
            <View style={ui.footerAction}>
              <Button
                testID="quality-release"
                disabled={locked || unsaved || stale || issueCount > 0}
                onPress={() => sign('released')}
              >
                Допустить
              </Button>
            </View>
          </>
        ) : pdf ? (
          <>
            <View style={ui.footerAction}>
              <Button testID="report-open" busy={locked} onPress={openReport}>
                Открыть PDF
              </Button>
            </View>
            <View style={ui.footerAction}>
              <Button
                testID="report-print"
                secondary
                disabled={locked}
                onPress={printReport}
              >
                Печать
              </Button>
            </View>
            <View style={ui.footerAction}>
              <Button
                testID="report-share"
                secondary
                disabled={locked}
                onPress={shareReport}
              >
                Отправить PDF
              </Button>
            </View>
          </>
        ) : (
          <View style={ui.footerAction}>
            <Button testID="report-create" busy={locked} onPress={exportPdf}>
              Создать PDF
            </Button>
          </View>
        ))}
    </View>
  );
}
