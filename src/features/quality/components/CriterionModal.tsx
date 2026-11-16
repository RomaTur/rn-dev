import React, { useEffect, useRef, useState } from 'react';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Assessment, CriterionId } from '../../../quality/types';
import { CRITERIA } from '../../../quality/catalogue';
import { Button, ChoiceRow, Field, palette, styles } from '../../../shared/ui';

export function CriterionModal({
  id,
  value,
  busy,
  onClose,
  onSave,
}: {
  id: CriterionId;
  value: Assessment;
  busy: boolean;
  onClose: () => void;
  onSave: (value: Assessment) => Promise<boolean>;
}) {
  const criterion = CRITERIA.find(item => item.id === id)!;
  const { width } = useWindowDimensions();
  const compact = width < 600;
  const [availableHeight, setAvailableHeight] = useState(500);
  const short = availableHeight < 420;
  const [draft, setDraft] = useState<Assessment>({
    ...value,
    reasons: [...value.reasons],
  });
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [commentFocused, setCommentFocused] = useState(false);
  const [editing, setEditing] = useState<'search' | 'comment' | null>(null);
  // Android 10 and earlier can resize the window without keyboard events.
  // Until an event arrives, available space and input focus remain authoritative.
  const [keyboardVisible, setKeyboardVisible] = useState<boolean | null>(null);
  const compactEditing = short && keyboardVisible !== false && editing !== null;
  const editingComment = compactEditing && editing === 'comment';
  const editingSearch = compactEditing && editing === 'search';
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () =>
      setKeyboardVisible(true),
    );
    const hidden = Keyboard.addListener('keyboardDidHide', () =>
      setKeyboardVisible(false),
    );
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  const savingRef = useRef(false);
  const locked = busy || saving;
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);
  const valid =
    draft.verdict !== 'pending' &&
    (draft.verdict !== 'fail' ||
      draft.reasons.length > 0 ||
      !!draft.comment.trim());
  const query = search.trim().toLocaleLowerCase('ru');
  const reasons = criterion.reasons
    .map((reason, index) => ({ reason, index }))
    .filter(({ reason }) => reason.toLocaleLowerCase('ru').includes(query));
  const close = () => {
    if (busy || savingRef.current) return;
    if (!dirty) return onClose();
    Alert.alert('Несохранённая проверка', 'Отменить изменения этой проверки?', [
      { text: 'Остаться', style: 'cancel' },
      { text: 'Не сохранять', style: 'destructive', onPress: onClose },
    ]);
  };
  const save = async () => {
    if (busy || savingRef.current || !valid) return;
    savingRef.current = true;
    setSaving(true);
    try {
      if (await onSave(draft)) onClose();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  return (
    <Modal transparent animationType="fade" onRequestClose={close}>
      <SafeAreaProvider>
        <KeyboardSafeArea onAvailableHeight={setAvailableHeight}>
          <View
            testID={short ? 'criterion-compact' : 'criterion-sheet'}
            style={[
              modalStyles.sheet,
              { height: Math.min(500, availableHeight) },
              compact && modalStyles.compactSheet,
              short && modalStyles.shortSheet,
            ]}
          >
            <View style={modalStyles.header}>
              <Text accessibilityRole="header" style={modalStyles.title}>
                {criterion.title}
              </Text>
              <View
                style={[
                  modalStyles.verdicts,
                  compactEditing && modalStyles.hidden,
                ]}
                accessibilityElementsHidden={compactEditing}
                importantForAccessibility={
                  compactEditing ? 'no-hide-descendants' : 'auto'
                }
              >
                {(['pass', 'fail'] as const).map(verdict => (
                  <View key={verdict} style={modalStyles.verdictAction}>
                    <ChoiceRow
                      testID={'verdict-' + verdict}
                      label={
                        verdict === 'pass' ? 'Соответствует' : 'Отклонение'
                      }
                      radio
                      danger={verdict === 'fail'}
                      checked={draft.verdict === verdict}
                      disabled={locked}
                      onPress={() =>
                        setDraft(current => ({ ...current, verdict }))
                      }
                    />
                  </View>
                ))}
              </View>
            </View>
            <View
              style={editingComment && modalStyles.hidden}
              accessibilityElementsHidden={editingComment}
              importantForAccessibility={
                editingComment ? 'no-hide-descendants' : 'auto'
              }
            >
              <Field
                label="Поиск замечаний"
                testID="criterion-search"
                value={search}
                onChangeText={setSearch}
                onFocus={() => setEditing('search')}
                editable={!locked}
              />
            </View>
            <ScrollView
              testID="criterion-scroll"
              style={[modalStyles.notes, editingComment && modalStyles.hidden]}
              accessibilityElementsHidden={editingComment}
              importantForAccessibility={
                editingComment ? 'no-hide-descendants' : 'auto'
              }
              contentContainerStyle={modalStyles.notesContent}
              keyboardShouldPersistTaps="handled"
            >
              {reasons.map(({ reason, index }) => (
                <ChoiceRow
                  key={reason}
                  testID={'reason-' + index}
                  label={reason}
                  checked={draft.reasons.includes(reason)}
                  disabled={locked}
                  onPress={() =>
                    setDraft(current => ({
                      ...current,
                      reasons: current.reasons.includes(reason)
                        ? current.reasons.filter(r => r !== reason)
                        : [...current.reasons, reason],
                    }))
                  }
                />
              ))}
              {!reasons.length && (
                <Text style={[styles.muted, modalStyles.empty]}>
                  Замечания не найдены. Измените запрос.
                </Text>
              )}
            </ScrollView>
            <View
              testID="criterion-comment-scroll"
              style={[modalStyles.comment, editingSearch && modalStyles.hidden]}
              accessibilityElementsHidden={editingSearch}
              importantForAccessibility={
                editingSearch ? 'no-hide-descendants' : 'auto'
              }
            >
              <TextInput
                accessibilityLabel="Комментарий"
                testID="criterion-comment"
                multiline
                scrollEnabled
                style={[
                  styles.input,
                  modalStyles.commentInput,
                  commentFocused && { borderColor: palette.accent },
                  locked && {
                    backgroundColor: palette.paper,
                    color: palette.muted,
                  },
                ]}
                onFocus={() => {
                  setCommentFocused(true);
                  setEditing('comment');
                }}
                onBlur={() => setCommentFocused(false)}
                selectionColor={palette.accent}
                placeholderTextColor={palette.muted}
                placeholder={
                  draft.verdict === 'fail'
                    ? 'Укажите причину отклонения'
                    : 'Дополнительный комментарий'
                }
                value={draft.comment}
                onChangeText={comment =>
                  setDraft(current => ({ ...current, comment }))
                }
                editable={!locked}
              />
            </View>
            <View
              testID="criterion-footer"
              style={[
                modalStyles.footer,
                short && modalStyles.shortFooter,
                editingComment && modalStyles.editingFooter,
              ]}
            >
              <View style={modalStyles.footerAction}>
                <Button
                  testID="criterion-cancel"
                  secondary
                  disabled={locked}
                  onPress={close}
                >
                  Отмена
                </Button>
              </View>
              <View style={modalStyles.footerAction}>
                <Button
                  testID="criterion-save"
                  busy={locked}
                  disabled={!valid}
                  onPress={save}
                >
                  Сохранить
                </Button>
              </View>
            </View>
          </View>
        </KeyboardSafeArea>
      </SafeAreaProvider>
    </Modal>
  );
}

function KeyboardSafeArea({
  children,
  onAvailableHeight,
}: {
  children: React.ReactNode;
  onAvailableHeight: (height: number) => void;
}) {
  // A modal owns a separate window. This provider includes the status inset
  // when KeyboardAvoidingView computes the height left above the keyboard.
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView style={modalStyles.safeArea}>
      <KeyboardAvoidingView
        style={modalStyles.avoider}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top}
      >
        <View
          testID="criterion-viewport"
          style={modalStyles.overlay}
          onLayout={event =>
            onAvailableHeight(Math.max(0, event.nativeEvent.layout.height - 32))
          }
        >
          {children}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const modalStyles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.scrim },
  avoider: { flex: 1 },
  overlay: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    width: '100%',
    maxWidth: 544,
    height: 500,
    maxHeight: '100%',
    flexShrink: 1,
    backgroundColor: palette.white,
    borderRadius: 8,
    paddingHorizontal: 32,
    paddingVertical: 24,
    gap: 8,
  },
  compactSheet: { paddingHorizontal: 24, paddingVertical: 16 },
  shortSheet: { paddingVertical: 8, gap: 4 },
  hidden: { display: 'none' },
  header: { flexShrink: 0 },
  title: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '600',
    color: palette.ink,
  },
  verdicts: { flexDirection: 'row', gap: 12, marginTop: 4 },
  verdictAction: { flex: 1, minWidth: 0 },
  notes: { flex: 1, minHeight: 0 },
  notesContent: { paddingBottom: 4 },
  empty: { paddingVertical: 16 },
  comment: { flexShrink: 0 },
  commentInput: {
    height: 66,
    minHeight: 66,
    paddingVertical: 8,
    lineHeight: 24,
    textAlignVertical: 'top',
  },
  footer: {
    flexShrink: 0,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    paddingTop: 8,
  },
  footerAction: { flex: 1 },
  shortFooter: { paddingTop: 0 },
  editingFooter: { marginTop: 'auto' },
});
