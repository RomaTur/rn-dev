import React from 'react';
import { act, create } from 'react-test-renderer';
import { Quality } from '../src/features/quality/QualityScreen';
import { useWarehouse } from '../src/app/warehouse/WarehouseProvider';
import { createSeed } from '../src/domain/seed';
import { execute } from '../src/domain/engine';
jest.mock('../src/app/warehouse/WarehouseProvider', () => ({ useWarehouse: jest.fn() }));
jest.mock('../src/features/session/AuthGate', () => ({ useInspector: () => ({ name: 'Демо' }) }));
test('keeps an older inspection reachable after its order was dispatched and ten later inspections exist', async () => {
  const initial = createSeed();
  const state = execute(
    initial,
    {
      type: 'quality.start',
      subjectKind: 'job',
      subjectKey: 'job-101',
      inspector: 'Демо',
    },
    { key: 'history-1', at: '2026-11-16T09:00:00.000Z', expectedRevision: 0 },
  );
  state.jobs[0].stage = 'dispatched';
  state.inspections = Array.from({ length: 12 }, (_, i) => ({
    ...state.inspections[0],
    key: 'archive-' + i,
    reference: 'ARCHIVE-' + i,
  }));
  (useWarehouse as jest.Mock).mockReturnValue({
    state,
    busy: false,
    run: jest.fn(),
  });
  let tree: ReturnType<typeof create>;
  await act(async () => {
    tree = create(<Quality onDirty={() => {}} />);
  });
  await act(async () => {
    tree!.root
      .findAll(
        node =>
          node.props.testID === 'quality-history' &&
          typeof node.props.onPress === 'function',
      )
      .at(-1)!
      .props.onPress();
  });
  expect(
    tree!.root.findAllByProps({ testID: 'history-archive-0' }).length,
  ).toBeGreaterThan(0);
  await act(async () => tree!.unmount());
});
