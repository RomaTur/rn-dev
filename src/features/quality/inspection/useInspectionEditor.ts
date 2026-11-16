import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler } from 'react-native';
import { useWarehouse } from '../../../app/warehouse/WarehouseProvider';
import { device } from '../../../device/native';
import { KeyboardScanner } from '../../../device/scanner';
import type { PdfAsset } from '../../../device/types';
import { CRITERIA } from '../../../quality/catalogue';
import {
  inspectionDataIssues,
  inspectionIssues,
  subjectFingerprint,
  subjectQuantity,
} from '../../../quality/engine';
import { toNativeReport } from '../../../quality/report';
import type {
  Assessment,
  CriterionId,
  Inspection,
  PhotoEvidence,
} from '../../../quality/types';
import { draftPatch, toDraft, type Draft, type DraftChange } from './draft';
import { stages, type Step } from './stages';

export function useInspectionEditor({
  inspection: item,
  onBack,
  onDirty,
}: {
  inspection: Inspection;
  onBack: () => void;
  onDirty: (value: boolean) => void;
}) {
  const { state, run, busy } = useWarehouse();
  const [step, setStep] = useState<Step>(
    item.status === 'draft' ? 'data' : 'decision',
  );
  const [draft, setDraft] = useState<Draft>(() => toDraft(item));
  const [modal, setModal] = useState<CriterionId | null>(null);
  const [proposedVerdict, setProposedVerdict] = useState<'fail' | undefined>();
  const [category, setCategory] = useState<CriterionId>('identity');
  const [categoryPicker, setCategoryPicker] = useState(false);
  const [caption, setCaption] = useState('');
  const [operation, setOperation] = useState(false);
  const operationRef = useRef(false);
  const [message, setMessage] = useState('');
  const [pdf, setPdf] = useState<PdfAsset | null>(null);
  const [scan, setScan] = useState('');
  const scanner = useMemo(() => new KeyboardScanner(), []);
  useEffect(
    () =>
      scanner.subscribe(code => {
        setDraft(current => ({ ...current, marking: code }));
        setScan('');
        setMessage('Маркировка добавлена. Сохраните данные.');
      }),
    [scanner],
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(item));
  const unsaved = dirty || !!scan.trim() || !!caption.trim();
  useEffect(() => {
    onDirty(unsaved);
    return () => onDirty(false);
  }, [unsaved, onDirty]);
  const locked = busy || operation;
  const editable = item.status === 'draft';
  const stale =
    item.subjectFingerprint !==
    subjectFingerprint(state, item.subjectKind, item.subjectKey);
  const done = CRITERIA.filter(
    c => item.checks[c.id].verdict !== 'pending',
  ).length;
  const issues = inspectionIssues(item);
  const completeStages = {
    data: !stale && inspectionDataIssues(item).length === 0,
    checks: done === CRITERIA.length,
    photos: item.photos.length > 0,
    decision: !editable,
  };
  const material =
    (item.subjectKind === 'job'
      ? state.jobs.find(job => job.key === item.subjectKey)?.lines[0]?.label
      : state.stock.find(lot => lot.key === item.subjectKey)?.label) ||
    item.title;
  const set: DraftChange = key => (value: string) =>
    setDraft(current => ({ ...current, [key]: value }));

  const leave = useCallback(
    (action: () => void) => {
      if (busy || operationRef.current) return;
      if (!unsaved) return action();
      Alert.alert('Несохранённые данные', 'Выйти без сохранения изменений?', [
        { text: 'Остаться', style: 'cancel' },
        {
          text: 'Не сохранять',
          style: 'destructive',
          onPress: () => {
            setDraft(toDraft(item));
            setScan('');
            setCaption('');
            action();
          },
        },
      ]);
    },
    [busy, unsaved, item],
  );
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (busy || operationRef.current || modal || categoryPicker)
          return true;
        const previous = stages[stages.findIndex(([key]) => key === step) - 1];
        leave(previous ? () => setStep(previous[0]) : onBack);
        return true;
      },
    );
    return () => subscription.remove();
  }, [busy, categoryPicker, leave, modal, onBack, step]);

  async function perform(action: () => Promise<void>) {
    if (busy || operationRef.current) return;
    operationRef.current = true;
    setOperation(true);
    setMessage('');
    try {
      await action();
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : 'Не удалось выполнить действие. Повторите попытку.',
      );
    } finally {
      operationRef.current = false;
      setOperation(false);
    }
  }
  const save = () =>
    perform(async () => {
      const patch = draftPatch(draft);
      if (
        await run({ type: 'quality.update', inspectionKey: item.key, patch })
      ) {
        setDraft(toDraft({ ...item, ...patch }));
        setMessage('Данные сохранены на планшете.');
      }
    });
  const changeStep = (value: Step) => {
    if (locked || operationRef.current) return;
    if (!dirty) {
      setStep(value);
      setMessage('');
    } else setMessage('Сохраните данные перед переходом к другому шагу.');
  };
  const photograph = (target: CriterionId = category, description = caption) =>
    perform(async () => {
      if (stale || item.photos.length >= 20 || !editable) return;
      const photo = await device.capturePhoto();
      if (!photo) {
        setMessage('Съёмка отменена.');
        return;
      }
      if (
        await run({
          type: 'quality.update',
          inspectionKey: item.key,
          patch: {
            photos: [
              ...item.photos,
              {
                fileName: photo.fileName,
                uri: photo.uri,
                category: target,
                caption: description.trim(),
                capturedAt: new Date().toISOString(),
              },
            ],
          },
        })
      ) {
        if (description === caption) setCaption('');
        setMessage('Фотография добавлена.');
      }
    });
  const removePhoto = (photo: PhotoEvidence) =>
    perform(async () => {
      if (!editable || stale) return;
      await run({
        type: 'quality.update',
        inspectionKey: item.key,
        patch: {
          photos: item.photos.filter(p => p.fileName !== photo.fileName),
        },
      });
    });
  const assess = (id: CriterionId, verdict: 'pass' | 'fail') => {
    if (verdict === 'fail') {
      setProposedVerdict('fail');
      setModal(id);
      return;
    }
    const current = item.checks[id];
    if (current.reasons.length || current.comment.trim()) {
      setProposedVerdict(undefined);
      setModal(id);
      return;
    }
    return perform(async () => {
      await run({
        type: 'quality.update',
        inspectionKey: item.key,
        patch: { checks: { ...item.checks, [id]: { ...current, verdict } } },
      });
    });
  };
  const calendar = () =>
    perform(async () => {
      const date = await device.pickDate(
        draft.processedOn || new Date().toISOString().slice(0, 10),
      );
      if (date) setDraft(current => ({ ...current, processedOn: date }));
    });
  const exportPdf = () =>
    perform(async () => {
      setPdf(await device.createPdf(JSON.stringify(toNativeReport(item))));
    });
  const sign = (decision: 'released' | 'hold') =>
    perform(async () => {
      if (
        unsaved ||
        stale ||
        !editable ||
        (decision === 'released' && issues.length)
      )
        return;
      if (
        await run({ type: 'quality.sign', inspectionKey: item.key, decision })
      ) {
        setMessage(
          decision === 'released'
            ? 'Допуск подписан.'
            : 'Задержка подписана. Отгрузка заблокирована.',
        );
      }
    });

  const applyScan = () => scanner.feed(scan + '\r\n');
  const updateScan = (value: string) => {
    if (/[\r\n]/.test(value)) scanner.feed(value);
    else setScan(value);
  };
  const openCriterion = (id: CriterionId) => {
    setProposedVerdict(undefined);
    setModal(id);
  };
  const saveCriterion = (value: Assessment) => {
    if (!modal) return Promise.resolve(false);
    return run({
      type: 'quality.update',
      inspectionKey: item.key,
      patch: { checks: { ...item.checks, [modal]: value } },
    });
  };
  const criterion = modal
    ? {
        id: modal,
        value: proposedVerdict
          ? { ...item.checks[modal], verdict: proposedVerdict }
          : item.checks[modal],
      }
    : undefined;
  return {
    step,
    changeStep,
    draft,
    set,
    locked,
    editable,
    stale,
    done,
    issues,
    completeStages,
    material,
    quantity: subjectQuantity(state, item.subjectKind, item.subjectKey),
    message,
    dirty,
    unsaved,
    save,
    photograph,
    removePhoto,
    assess,
    calendar,
    sign,
    pdf,
    exportPdf,
    openReport: () => pdf && perform(() => device.openReport(pdf.fileName)),
    printReport: () => pdf && perform(() => device.printReport(pdf.fileName)),
    shareReport: () => pdf && perform(() => device.shareReport(pdf.fileName)),
    leave: () => leave(onBack),
    scan,
    updateScan,
    applyScan,
    caption,
    setCaption,
    category,
    categoryPicker,
    openCategoryPicker: () => setCategoryPicker(true),
    closeCategoryPicker: () => setCategoryPicker(false),
    selectCategory: (value: CriterionId) => {
      setCategory(value);
      setCategoryPicker(false);
    },
    criterion,
    openCriterion,
    saveCriterion,
    closeCriterion: () => setModal(null),
  };
}
