import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { Inspection } from '../../../quality/types';
import { Notice, styles } from '../../../shared/ui';
import { CriterionModal } from '../components/CriterionModal';
import { ChecksStage } from './ChecksStage';
import { DataStage } from './DataStage';
import { DecisionStage } from './DecisionStage';
import { InspectionFooter } from './InspectionFooter';
import { InspectionHeader } from './InspectionHeader';
import { InspectionSteps } from './InspectionSteps';
import { PhotoCategoryDialog } from './PhotoCategoryDialog';
import { PhotosStage } from './PhotosStage';
import { SamplePassport } from './SamplePassport';
import { ui } from './styles';
import { useInspectionEditor } from './useInspectionEditor';

export function InspectionEditor({
  inspection: item,
  onBack,
  onDirty,
}: {
  inspection: Inspection;
  onBack: () => void;
  onDirty: (value: boolean) => void;
}) {
  const editor = useInspectionEditor({ inspection: item, onBack, onDirty });
  const { width, height } = useWindowDimensions();
  const wide = width >= 800 && width > height;
  const [checkSection, setCheckSection] = useState('trace');
  const [profileDetails, setProfileDetails] = useState(false);
  const [reportDetails, setReportDetails] = useState(false);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const { step, editable, locked, stale, photograph, removePhoto, done } =
    editor;
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [step, checkSection]);

  const steps = (
    <InspectionSteps
      active={step}
      completed={editor.completeStages}
      wide={wide}
      locked={locked}
      onChange={editor.changeStep}
    />
  );
  return (
    <KeyboardAvoidingView
      testID="inspection-workspace"
      style={ui.workspace}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <InspectionHeader
        item={item}
        locked={locked}
        editable={editable}
        material={editor.material}
        quantity={editor.quantity}
        onBack={editor.leave}
      />
      {!wide && steps}
      <View style={ui.workArea}>
        {wide && (
          <View testID="inspection-rail" style={ui.rail}>
            {steps}
            <SamplePassport item={item} material={editor.material} />
          </View>
        )}
        <View style={ui.pane}>
          <ScrollView
            ref={scroll}
            testID="workspace-scroll"
            style={ui.scroll}
            contentContainerStyle={ui.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {stale && (
              <Notice
                text={
                  editable
                    ? 'Состав объекта изменился. Начните новый осмотр из списка.'
                    : 'Историческое заключение: состав объекта изменился.'
                }
              />
            )}
            {!!editor.message && (
              <Text
                testID="inspection-message"
                accessibilityRole="alert"
                style={styles.text}
              >
                {editor.message}
              </Text>
            )}
            {step === 'data' && (
              <DataStage
                item={item}
                draft={editor.draft}
                set={editor.set}
                wide={wide}
                locked={locked}
                editable={editable}
                stale={stale}
                scan={editor.scan}
                updateScan={editor.updateScan}
                applyScan={editor.applyScan}
                calendar={editor.calendar}
                photograph={photograph}
                removePhoto={removePhoto}
                profileDetails={profileDetails}
                toggleProfileDetails={() => setProfileDetails(value => !value)}
              />
            )}
            {step === 'checks' && (
              <ChecksStage
                item={item}
                checkSection={checkSection}
                setCheckSection={setCheckSection}
                editable={editable}
                locked={locked}
                stale={stale}
                assess={editor.assess}
                openCriterion={editor.openCriterion}
                photograph={photograph}
                removePhoto={removePhoto}
              />
            )}
            {step === 'photos' && (
              <PhotosStage
                item={item}
                editable={editable}
                locked={locked}
                stale={stale}
                category={editor.category}
                openCategoryPicker={editor.openCategoryPicker}
                caption={editor.caption}
                setCaption={editor.setCaption}
                photograph={photograph}
                removePhoto={removePhoto}
              />
            )}
            {step === 'decision' && (
              <DecisionStage
                item={item}
                editable={editable}
                done={done}
                conclusion={editor.draft.summary}
                changeConclusion={editor.set('summary')}
                locked={locked}
                issues={editor.issues}
                dirty={editor.dirty}
                hasPendingInput={
                  !!(editor.caption.trim() || editor.scan.trim())
                }
                pdf={!!editor.pdf}
                reportDetails={reportDetails}
                toggleReportDetails={() => setReportDetails(value => !value)}
              />
            )}
          </ScrollView>
          <InspectionFooter
            step={step}
            editable={editable}
            locked={locked}
            dirty={editor.dirty}
            done={done}
            stale={stale}
            photoCount={item.photos.length}
            unsaved={editor.unsaved}
            issueCount={editor.issues.length}
            pdf={!!editor.pdf}
            save={editor.save}
            changeStep={editor.changeStep}
            photograph={photograph}
            sign={editor.sign}
            openReport={editor.openReport}
            printReport={editor.printReport}
            shareReport={editor.shareReport}
            exportPdf={editor.exportPdf}
          />
        </View>
      </View>
      {editor.criterion && (
        <CriterionModal
          key={editor.criterion.id}
          {...editor.criterion}
          busy={locked}
          onClose={editor.closeCriterion}
          onSave={editor.saveCriterion}
        />
      )}
      {editor.categoryPicker && (
        <PhotoCategoryDialog
          category={editor.category}
          wide={wide}
          onSelect={editor.selectCategory}
          onClose={editor.closeCategoryPicker}
        />
      )}
    </KeyboardAvoidingView>
  );
}
