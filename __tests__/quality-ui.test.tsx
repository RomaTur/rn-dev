import React from 'react';
import { Alert, BackHandler, Modal, ScrollView } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { InspectionEditor } from '../src/features/quality/inspection/InspectionEditor';
import { useWarehouse } from '../src/app/warehouse/WarehouseProvider';
import { device } from '../src/device/native';
import { createSeed } from '../src/domain/seed';
import { execute } from '../src/domain/engine';
import { CRITERIA } from '../src/quality/catalogue';
import { Command } from '../src/domain/types';
import { CriterionModal } from '../src/features/quality/components/CriterionModal';
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('../src/app/warehouse/WarehouseProvider', () => ({ useWarehouse: jest.fn() }));
jest.mock('../src/device/native', () => ({
  device: {
    capturePhoto: jest.fn(),
    pickDate: jest.fn(),
    createPdf: jest.fn(),
    shareReport: jest.fn(),
    openReport: jest.fn(),
    printReport: jest.fn(),
  },
}));
const native = device as jest.Mocked<typeof device>;
let state = createSeed();
let tree: ReactTestRenderer;
let failSave = false;
const dirty = jest.fn();
const back = jest.fn();
function apply(command: Command) {
  state = execute(state, command, {
    key: 'qc-ui-' + (state.revision + 1),
    at: new Date().toISOString(),
    expectedRevision: state.revision,
  });
}
function render() {
  return (
    <InspectionEditor
      inspection={state.inspections[0]}
      onBack={back}
      onDirty={dirty}
    />
  );
}
const button = (id: string) =>
  tree.root
    .findAll(
      n => n.props.testID === id && typeof n.props.onPress === 'function',
    )
    .at(-1)!;
const input = (id: string) =>
  tree.root
    .findAll(
      n => n.props.testID === id && typeof n.props.onChangeText === 'function',
    )
    .at(-1)!;
async function tap(id: string) {
  await act(async () => {
    await button(id).props.onPress();
  });
}
const photo = {
  fileName: 'photo_12345678-1234-1234-1234-123456789abc.jpg',
  uri: 'file:///private/photos/photo_12345678-1234-1234-1234-123456789abc.jpg',
  width: 100,
  height: 100,
};
beforeEach(async () => {
  jest.clearAllMocks();
  failSave = false;
  state = createSeed();
  apply({
    type: 'quality.start',
    subjectKind: 'job',
    subjectKey: 'job-101',
    inspector: 'Инспектор демо',
  });
  (useWarehouse as jest.Mock).mockImplementation(() => ({
    state,
    busy: false,
    run: async (command: Command) => {
      if (failSave) return false;
      apply(command);
      tree.update(render());
      return true;
    },
  }));
  await act(async () => {
    tree = create(render());
  });
});
afterEach(async () => {
  await act(async () => tree.unmount());
  jest.restoreAllMocks();
});
test('cancelled camera creates no evidence; captured photo is attached only after durable update', async () => {
  await tap('inspection-tab-photos');
  native.capturePhoto.mockResolvedValueOnce(null);
  await tap('photo-capture');
  expect(state.inspections[0].photos).toHaveLength(0);
  native.capturePhoto.mockResolvedValue(photo);
  failSave = true;
  await tap('photo-capture');
  expect(state.inspections[0].photos).toHaveLength(0);
  failSave = false;
  await act(async () =>
    input('photo-caption').props.onChangeText('Маркировка образца'),
  );
  await tap('photo-capture');
  expect(state.inspections[0].photos[0]).toMatchObject({
    fileName: photo.fileName,
    uri: photo.uri,
    caption: 'Маркировка образца',
  });
});
test('native calendar and scanner populate a draft; failed save preserves inputs and blocks leaving step', async () => {
  native.pickDate.mockResolvedValue('2026-01-10');
  await tap('inspection-date');
  await act(async () =>
    input('scanner-input').props.onChangeText('DEMO-PACK-28'),
  );
  await tap('scanner-apply');
  await act(async () => input('inspection-quantity').props.onChangeText('2'));
  expect(button('inspection-next-checks').props.disabled).toBe(true);
  failSave = true;
  await tap('inspection-save');
  expect(input('inspection-marking').props.value).toBe('DEMO-PACK-28');
  expect(state.inspections[0].marking).toBe('');
  failSave = false;
  await tap('inspection-save');
  expect(state.inspections[0].processedOn).toBe('2026-01-10');
  expect(state.inspections[0].marking).toBe('DEMO-PACK-28');
  expect(button('inspection-next-checks').props.disabled).toBe(false);
});
test('editing a complete saved inspection blocks signing until changes are saved', async () => {
  const item = state.inspections[0];
  apply({
    type: 'quality.update',
    inspectionKey: item.key,
    patch: {
      inspectedQuantity: 1,
      processedOn: '2026-01-10',
      marking: 'DEMO',
      length: item.profile.nominalLength,
      width: item.profile.nominalWidth,
      thickness: item.profile.nominalThickness,
      moisture: 10,
      checks: Object.fromEntries(
        CRITERIA.map(c => [
          c.id,
          { verdict: 'pass', reasons: [], comment: '' },
        ]),
      ) as unknown as typeof item.checks,
      photos: [
        {
          fileName: photo.fileName,
          uri: photo.uri,
          category: 'identity',
          caption: 'Mark',
          capturedAt: new Date().toISOString(),
        },
      ],
    },
  });
  await act(async () => tree.update(render()));
  await tap('inspection-tab-decision');
  // Saved metadata changed externally: reopen to discard the intentionally old editor draft.
  await act(async () => {
    tree.unmount();
    tree = create(render());
  });
  await tap('inspection-tab-decision');
  expect(button('quality-release').props.disabled).toBe(false);
  await act(async () =>
    input('inspection-summary').props.onChangeText(
      'Контрольный образец проверен',
    ),
  );
  expect(button('quality-release').props.disabled).toBe(true);
  await tap('summary-save');
  expect(button('quality-release').props.disabled).toBe(false);
  await tap('quality-release');
  expect(state.inspections[0].status).toBe('released');
  expect(
    tree.root.findAllByProps({ testID: 'quality-complete' }).length,
  ).toBeGreaterThan(0);
});

test('canonicalizes comma decimal and zero-padded fields after saving', async () => {
  await act(async () => {
    input('inspection-quantity').props.onChangeText('02');
    input('inspection-moisture').props.onChangeText('10,5');
    input('inspection-length').props.onChangeText('1200.0');
  });
  await tap('inspection-save');
  expect(state.inspections[0].moisture).toBe(10.5);
  expect(button('inspection-next-checks').props.disabled).toBe(false);
  expect(input('inspection-moisture').props.value).toBe('10.5');
});

test('hardware Back returns through steps and guards an unsaved draft', async () => {
  const listener = jest.spyOn(BackHandler, 'addEventListener');
  await act(async () => {
    tree.unmount();
    tree = create(render());
  });
  const hardwareBack = () => {
    const handler = listener.mock.calls.at(-1)?.[1] as
      | (() => boolean)
      | undefined;
    return handler?.();
  };
  await tap('inspection-tab-photos');
  await act(async () => expect(hardwareBack()).toBe(true));
  expect(button('criterion-identity')).toBeDefined();
  expect(back).not.toHaveBeenCalled();
  await tap('inspection-tab-data');
  await act(async () =>
    input('inspection-marking').props.onChangeText('UNSAVED'),
  );
  const alert = jest.spyOn(Alert, 'alert');
  await act(async () => expect(hardwareBack()).toBe(true));
  expect(alert).toHaveBeenCalled();
  expect(back).not.toHaveBeenCalled();
  expect(input('inspection-marking').props.value).toBe('UNSAVED');
});

test('hardware Back cannot leave while a native camera operation is pending', async () => {
  const listener = jest.spyOn(BackHandler, 'addEventListener');
  await act(async () => {
    tree.unmount();
    tree = create(render());
  });
  let finish!: (value: null) => void;
  native.capturePhoto.mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  await tap('inspection-tab-photos');
  let pending: Promise<void>;
  await act(async () => {
    pending = button('photo-capture').props.onPress();
  });
  await act(async () => {
    const handler = listener.mock.calls.at(-1)?.[1] as
      | (() => boolean)
      | undefined;
    expect(handler?.()).toBe(true);
  });
  expect(button('photo-capture')).toBeDefined();
  expect(back).not.toHaveBeenCalled();
  await act(async () => {
    finish(null);
    await pending;
  });
});

test('scrolling data cannot scroll away the step controls or save action', () => {
  const workspace = tree.root
    .findAllByType(ScrollView)
    .find(node => node.props.testID === 'workspace-scroll')!;
  expect(workspace.props.testID).toBe('workspace-scroll');
  expect(workspace.findAllByProps({ testID: 'inspection-save' })).toHaveLength(
    0,
  );
  expect(
    workspace.findAllByProps({ testID: 'inspection-tab-photos' }),
  ).toHaveLength(0);
  expect(button('inspection-save')).toBeDefined();
});

test('criterion blocks dismissing or duplicate saving while persistence is pending', async () => {
  let finish!: (saved: boolean) => void;
  const saveCriterion = jest.fn(
    () =>
      new Promise<boolean>(resolve => {
        finish = resolve;
      }),
  );
  const close = jest.fn();
  await act(async () => {
    tree.unmount();
    tree = create(
      <CriterionModal
        id="cracks"
        value={{ verdict: 'pass', reasons: [], comment: '' }}
        busy={false}
        onClose={close}
        onSave={saveCriterion}
      />,
    );
  });
  let pending: Promise<void>;
  await act(async () => {
    pending = button('criterion-save').props.onPress();
  });
  await act(async () => tree.root.findByType(Modal).props.onRequestClose());
  expect(close).not.toHaveBeenCalled();
  expect(button('criterion-cancel').props.disabled).toBe(true);
  await act(async () => button('criterion-save').props.onPress());
  expect(saveCriterion).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish(true);
    await pending;
  });
  expect(close).toHaveBeenCalledTimes(1);
});

test('unaccepted scanner input and a photo caption are protected when leaving the inspection', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  await act(async () =>
    input('scanner-input').props.onChangeText('PENDING-SCAN'),
  );
  await tap('inspection-back');
  expect(alert).toHaveBeenCalledTimes(1);
  expect(back).not.toHaveBeenCalled();
  await act(async () => input('scanner-input').props.onChangeText(''));
  await tap('inspection-tab-photos');
  await act(async () =>
    input('photo-caption').props.onChangeText('Uncaptured detail'),
  );
  await tap('inspection-back');
  expect(alert).toHaveBeenCalledTimes(2);
  expect(back).not.toHaveBeenCalled();
  expect(dirty).toHaveBeenLastCalledWith(true);
  await tap('inspection-tab-decision');
  expect(button('quality-hold').props.disabled).toBe(true);
});

test('inline evidence stays with its inspection criterion and persists across section changes', async () => {
  native.capturePhoto.mockResolvedValue(photo);
  await tap('inspection-tab-checks');
  await tap('check-section-surface');
  await tap('evidence-cracks-add');
  expect(state.inspections[0].photos[0]).toMatchObject({
    category: 'cracks',
    uri: photo.uri,
  });
  await tap('check-section-trace');
  expect(
    tree.root.findAllByProps({ testID: 'evidence-identity-photo-0' }),
  ).toHaveLength(0);
  await tap('check-section-surface');
  expect(
    tree.root.findAllByProps({ testID: 'evidence-cracks-photo-0' }).length,
  ).toBeGreaterThan(0);
});

test('inline pass persists once, while a deviation opens reasons without silently accepting it', async () => {
  await tap('inspection-tab-checks');
  await tap('check-pass-identity');
  expect(state.inspections[0].checks.identity.verdict).toBe('pass');
  await tap('check-fail-identity');
  expect(state.inspections[0].checks.identity.verdict).toBe('pass');
  expect(button('criterion-save').props.disabled).toBe(true);
  await tap('reason-0');
  await tap('criterion-save');
  expect(state.inspections[0].checks.identity).toMatchObject({
    verdict: 'fail',
    reasons: [CRITERIA[0].reasons[0]],
  });
});
