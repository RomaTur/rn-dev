import type { Inspection, InspectionFields } from '../../../quality/types';

export type Draft = {
  quantity: string;
  processedOn: string;
  marking: string;
  moisture: string;
  length: string;
  width: string;
  thickness: string;
  summary: string;
};
export function toDraft(item: Inspection): Draft {
  return {
    quantity: String(item.inspectedQuantity || ''),
    processedOn: item.processedOn,
    marking: item.marking,
    moisture: item.moisture === null ? '' : String(item.moisture),
    length: item.length === null ? '' : String(item.length),
    width: item.width === null ? '' : String(item.width),
    thickness: item.thickness === null ? '' : String(item.thickness),
    summary: item.summary,
  };
}
export type DraftChange = (key: keyof Draft) => (value: string) => void;

function numeric(value: string): number | null {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed.replace(',', '.')) : null;
}

export function draftPatch(draft: Draft): Partial<InspectionFields> {
  return {
    inspectedQuantity: Number(draft.quantity),
    processedOn: draft.processedOn,
    marking: draft.marking.trim(),
    moisture: numeric(draft.moisture),
    length: numeric(draft.length),
    width: numeric(draft.width),
    thickness: numeric(draft.thickness),
    summary: draft.summary.trim(),
  };
}
