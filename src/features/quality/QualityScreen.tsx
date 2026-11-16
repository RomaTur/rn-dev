import React, { useEffect, useState } from 'react';
import { BackHandler } from 'react-native';
import { useWarehouse } from '../../app/warehouse/WarehouseProvider';
import { subjectFingerprint } from '../../quality/engine';
import { useInspector } from '../session/AuthGate';
import { DocumentCard } from './components/DocumentCard';
import { QualityRegister } from './components/QualityRegister';
import { buildRegister, type SubjectKind } from './register';
import { InspectionEditor } from './inspection/InspectionEditor';

export function Quality({
  focusKey,
  onDirty,
}: {
  focusKey?: string;
  onDirty: (value: boolean) => void;
}) {
  const { state, run, busy } = useWarehouse();
  const inspector = useInspector();
  const [kind, setKind] = useState<SubjectKind>('job');
  const [history, setHistory] = useState(false);
  const [filter, setFilter] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyLimit, setHistoryLimit] = useState(20);
  const [selected, setSelected] = useState('');
  const [subjectKey, setSubjectKey] = useState('');
  const [documentKey, setDocumentKey] = useState('');
  useEffect(() => {
    if (focusKey) {
      setKind('job');
      setHistory(false);
      setFilter(focusKey);
    }
  }, [focusKey]);
  const current =
    state.inspections.find(item => item.key === selected) ??
    (subjectKey
      ? [...state.inspections]
          .reverse()
          .find(
            item => item.subjectKind === kind && item.subjectKey === subjectKey,
          )
      : undefined);
  useEffect(() => {
    if (!documentKey || current) return;
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        setDocumentKey('');
        return true;
      },
    );
    return () => subscription.remove();
  }, [documentKey, current]);
  const open = async (key: string) => {
    if (busy) return;
    const fingerprint = subjectFingerprint(state, kind, key);
    const draft = [...state.inspections]
      .reverse()
      .find(
        item =>
          item.subjectKind === kind &&
          item.subjectKey === key &&
          item.status === 'draft' &&
          item.subjectFingerprint === fingerprint,
      );
    if (draft) {
      setSelected(draft.key);
      return;
    }
    if (
      await run({
        type: 'quality.start',
        subjectKind: kind,
        subjectKey: key,
        inspector: inspector.name,
      })
    ) {
      setSelected('');
      setSubjectKey(key);
    }
  };
  if (current)
    return (
      <InspectionEditor
        key={current.key}
        inspection={current}
        onDirty={onDirty}
        onBack={() => {
          setSelected('');
          setSubjectKey('');
          onDirty(false);
        }}
      />
    );
  if (documentKey) {
    const last = state.inspections
      .filter(
        item => item.subjectKind === kind && item.subjectKey === documentKey,
      )
      .at(-1);
    return (
      <DocumentCard
        job={
          kind === 'job'
            ? state.jobs.find(job => job.key === documentKey)
            : undefined
        }
        lot={
          kind === 'lot'
            ? state.stock.find(lot => lot.key === documentKey)
            : undefined
        }
        last={last}
        busy={busy}
        onBack={() => setDocumentKey('')}
        onStart={() => open(documentKey)}
        onReport={() => last && setSelected(last.key)}
      />
    );
  }
  const { rows, total } = buildRegister(state, {
    kind,
    history,
    filter,
    historyQuery,
    historyLimit,
  });
  return (
    <QualityRegister
      kind={kind}
      history={history}
      query={history ? historyQuery : filter}
      rows={rows}
      total={total}
      busy={busy}
      onTabChange={tab => {
        setHistory(tab === 'history');
        if (tab !== 'history') {
          setKind(tab);
          setFilter('');
        }
      }}
      onQueryChange={value => {
        if (history) {
          setHistoryQuery(value);
          setHistoryLimit(20);
        } else setFilter(value);
      }}
      onDocument={setDocumentKey}
      onReport={setSelected}
      onMore={() => setHistoryLimit(limit => limit + 20)}
    />
  );
}
