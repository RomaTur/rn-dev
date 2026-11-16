export type CriterionId =
  | 'identity'
  | 'cracks'
  | 'chips'
  | 'stains'
  | 'dimensions'
  | 'moisture'
  | 'finish'
  | 'protection';
export type Assessment = {
  verdict: 'pending' | 'pass' | 'fail';
  reasons: string[];
  comment: string;
};
export type PhotoEvidence = {
  fileName: string;
  uri: string;
  category: CriterionId;
  caption: string;
  capturedAt: string;
};
export type QualityProfile = {
  label: string;
  moistureMin: number;
  moistureMax: number;
  nominalLength: number;
  nominalWidth: number;
  nominalThickness: number;
  tolerance: number;
};
export type InspectionFields = {
  inspectedQuantity: number;
  processedOn: string;
  marking: string;
  moisture: number | null;
  length: number | null;
  width: number | null;
  thickness: number | null;
  checks: Record<CriterionId, Assessment>;
  photos: PhotoEvidence[];
  summary: string;
};
export type Inspection = InspectionFields & {
  key: string;
  subjectKind: 'job' | 'lot';
  subjectKey: string;
  title: string;
  reference: string;
  inspector: string;
  openedAt: string;
  updatedAt: string;
  profile: QualityProfile;
  subjectFingerprint: string;
  status: 'draft' | 'released' | 'hold';
  signedAt: string | null;
};
export type QualityCommand =
  | {
      type: 'quality.start';
      subjectKind: 'job' | 'lot';
      subjectKey: string;
      inspector: string;
    }
  | {
      type: 'quality.update';
      inspectionKey: string;
      patch: Partial<InspectionFields>;
    }
  | {
      type: 'quality.sign';
      inspectionKey: string;
      decision: 'released' | 'hold';
    };
