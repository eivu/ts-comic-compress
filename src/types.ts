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
  targetHeight?: number;
}

export interface ImageInfo {
  data: Buffer;
  name: string;
  originalSize: number;
}

