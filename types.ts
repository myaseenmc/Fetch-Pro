
export interface Segment {
  url: string;
  duration: number;
  index: number;
}

export interface Variant {
  url: string;
  resolution?: string;
  bandwidth?: number;
  name?: string;
}

export interface PlaylistInfo {
  url: string;
  type: 'master' | 'media';
  variants?: Variant[];
  segments?: Segment[];
  totalDuration?: number;
  id: string;
  selectedVariantUrl?: string;
}

export enum DownloadStatus {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  READY = 'READY',
  DOWNLOADING = 'DOWNLOADING',
  PAUSED = 'PAUSED',
  MERGING = 'MERGING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export type ExportFormat = 'ts' | 'mp4';

export interface ProgressState {
  total: number;
  downloaded: number;
  percentage: number;
  errors: number;
  failedIndices: number[];
  currentJobIndex: number;
  totalJobs: number;
}
