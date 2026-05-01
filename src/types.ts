export interface ProcessingStats {
  filesProcessed: number;
  imagesProcessed: number;
  imagesSkipped: number;
  totalOriginalSize: number;
  totalCompressedSize: number;
  fileStats: Map<string, FileStats>;
}

export interface FileStats {
  originalSize: number;
  compressedSize: number;
  imagesProcessed: number;
  imagesSkipped: number;
  savings: number;
}

export interface ProcessorOptions {
  outputDir: string;
  quality: number;
  recursive: boolean;
  skipExisting: boolean;
  parallel: boolean;
  renameOriginal: boolean;
  moveOriginal: boolean;
  raiseException: boolean;
  targetHeight?: number;
}

export interface ImageInfo {
  data: Buffer;
  name: string;
  originalSize: number;
}

export type ProgressCallback = (current: number, total: number) => void;

export class ImageSkippedError extends Error {
  constructor(
    public readonly imageName: string,
    public readonly reason: string,
  ) {
    super(`Image skipped during processing: ${imageName} (${reason})`);
    this.name = "ImageSkippedError";
  }
}
