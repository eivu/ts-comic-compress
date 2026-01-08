declare module "node-unrar-js" {
  export interface FileHeader {
    name: string;
    flags: {
      encrypted: boolean;
      solid: boolean;
      continued: boolean;
      password: boolean;
      firstVolume: boolean;
      [key: string]: boolean;
    };
    unpSize: number;
    packSize: number;
    hostOS: string;
    fileCRC: number;
    fileTime: number;
    unpVer: number;
    method: number;
    fileAttr: number;
  }

  export interface Extractor {
    getFileList(): {
      arcHeader: any;
      fileHeaders: FileHeader[];
    };
    extract(options: { files?: string[] }): {
      files: Array<{
        fileHeader: FileHeader;
        extraction: Uint8Array | null;
      }>;
    };
  }

  export interface ExtractorFromFileOptions {
    filepath: string;
  }

  export function createExtractorFromFile(
    options: ExtractorFromFileOptions
  ): Promise<Extractor>;
}

