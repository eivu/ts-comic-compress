import * as fs from "fs-extra";
import * as path from "path";
import * as yauzl from "yauzl";
import * as yazl from "yazl";
import { createExtractorFromData } from "node-unrar-js";
import { ImageConverter } from "./image-converter";
import { ImageInfo, ProgressCallback } from "./types";

export class ArchiveProcessor {
  constructor(
    private imageConverter: ImageConverter,
    private progressCallback?: ProgressCallback
  ) {}

  async processCBZ(
    inputPath: string,
    outputPath: string
  ): Promise<{
    imagesProcessed: number;
    imagesSkipped: number;
    originalSize: number;
    compressedSize: number;
  }> {
    const images: ImageInfo[] = [];
    let originalSize = 0;

    // Extract images from CBZ (ZIP)
    await new Promise<void>((resolve, reject) => {
      yauzl.open(inputPath, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          reject(err);
          return;
        }

        if (!zipfile) {
          reject(new Error("Failed to open ZIP file"));
          return;
        }

        zipfile.readEntry();
        zipfile.on("entry", (entry) => {
          if (/\/$/.test(entry.fileName)) {
            // Directory entry, skip
            zipfile.readEntry();
            return;
          }

          const ext = path.extname(entry.fileName).toLowerCase();
          if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
            zipfile.readEntry();
            return;
          }

          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) {
              reject(err);
              return;
            }

            const chunks: Buffer[] = [];
            readStream!.on("data", (chunk) => chunks.push(chunk));
            readStream!.on("end", () => {
              const buffer = Buffer.concat(chunks);
              originalSize += buffer.length;
              images.push({
                data: buffer,
                name: entry.fileName,
                originalSize: buffer.length,
              });
              zipfile.readEntry();
            });
            readStream!.on("error", reject);
          });
        });

        zipfile.on("end", resolve);
        zipfile.on("error", reject);
      });
    });

    // Sort images by name to maintain page order before processing
    images.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );

    // Process images
    let imagesProcessed = 0;
    let imagesSkipped = 0;
    const processedImages: Array<{ name: string; data: Buffer }> = [];
    const totalPages = images.length;

    // Report initial progress (0 of total) to show total page count
    if (this.progressCallback && totalPages > 0) {
      this.progressCallback(0, totalPages);
    }

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const currentPage = i + 1;

      // Report progress
      if (this.progressCallback) {
        this.progressCallback(currentPage, totalPages);
      }

      const shouldProcess = await this.imageConverter.shouldProcess(image);
      if (shouldProcess) {
        const webpBuffer = await this.imageConverter.convertToWebP(image);
        processedImages.push({
          name: image.name.replace(/\.(jpg|jpeg|png)$/i, ".webp"),
          data: webpBuffer,
        });
        imagesProcessed++;
      } else {
        processedImages.push({
          name: image.name,
          data: image.data,
        });
        imagesSkipped++;
      }
    }

    // Images are already sorted from the original array, just ensure processed images maintain order
    // (They should already be in order since we process them in order)

    // Create new CBZ file
    const zipfile = new yazl.ZipFile();
    for (const img of processedImages) {
      zipfile.addBuffer(img.data, img.name);
    }

    const outputDir = path.dirname(outputPath);
    await fs.ensureDir(outputDir);

    let compressedSize = 0;
    await new Promise<void>((resolve, reject) => {
      zipfile.outputStream
        .pipe(fs.createWriteStream(outputPath))
        .on("close", () => {
          fs.stat(outputPath)
            .then((stats) => {
              compressedSize = stats.size;
              resolve();
            })
            .catch(reject);
        })
        .on("error", reject);
      zipfile.end();
    });

    return { imagesProcessed, imagesSkipped, originalSize, compressedSize };
  }

  private async isZipFile(filePath: string): Promise<boolean> {
    try {
      // Try to open as ZIP - if it succeeds, it's a ZIP file
      return new Promise((resolve) => {
        yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
          if (err || !zipfile) {
            resolve(false);
          } else {
            zipfile.close();
            resolve(true);
          }
        });
      });
    } catch {
      return false;
    }
  }

  async processRAR(
    inputPath: string,
    outputPath: string
  ): Promise<{
    imagesProcessed: number;
    imagesSkipped: number;
    originalSize: number;
    compressedSize: number;
  }> {
    const images: ImageInfo[] = [];
    let originalSize = 0;

    // Read RAR file into memory
    const rarBuffer = await fs.readFile(inputPath);
    // Convert Buffer to ArrayBuffer
    const rarData = rarBuffer.buffer.slice(rarBuffer.byteOffset, rarBuffer.byteOffset + rarBuffer.byteLength);

    // Extract images from RAR using node-unrar-js (in-memory extraction)
    const extractor = await createExtractorFromData({
      data: rarData,
    });

    const fileList = extractor.getFileList();
    const fileHeaders = [...fileList.fileHeaders];

    // Filter for image files only
    const imageFiles = fileHeaders.filter((fileHeader) => {
      const ext = path.extname(fileHeader.name).toLowerCase();
      return [".jpg", ".jpeg", ".png", ".webp"].includes(ext);
    });

    if (imageFiles.length === 0) {
      // No image files found, return empty result
      return { imagesProcessed: 0, imagesSkipped: 0, originalSize: 0, compressedSize: 0 };
    }

    // Extract all image files at once (in-memory extraction returns actual file data)
    const imageFileNames = imageFiles.map((fileHeader) => fileHeader.name);
    const extracted = extractor.extract({ files: imageFileNames });
    const extractedFiles = [...extracted.files];

    // Process extracted files - extraction field contains Uint8Array with file data
    for (const file of extractedFiles) {
      if (file.extraction && !file.fileHeader.flags.directory) {
        const buffer = Buffer.from(file.extraction);
        originalSize += buffer.length;
        images.push({
          data: buffer,
          name: file.fileHeader.name,
          originalSize: buffer.length,
        });
      }
    }

    // Sort images by name to maintain page order before processing
    images.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );

    // Process images (same logic as processCBZ)
    let imagesProcessed = 0;
    let imagesSkipped = 0;
    const processedImages: Array<{ name: string; data: Buffer }> = [];
    const totalPages = images.length;

    // Report initial progress (0 of total) to show total page count
    if (this.progressCallback && totalPages > 0) {
      this.progressCallback(0, totalPages);
    }

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const currentPage = i + 1;

      // Report progress
      if (this.progressCallback) {
        this.progressCallback(currentPage, totalPages);
      }

      const shouldProcess = await this.imageConverter.shouldProcess(image);
      if (shouldProcess) {
        const webpBuffer = await this.imageConverter.convertToWebP(image);
        processedImages.push({
          name: image.name.replace(/\.(jpg|jpeg|png)$/i, ".webp"),
          data: webpBuffer,
        });
        imagesProcessed++;
      } else {
        processedImages.push({
          name: image.name,
          data: image.data,
        });
        imagesSkipped++;
      }
    }

    // Create new CBZ file (convert CBR to CBZ)
    const zipfile = new yazl.ZipFile();
    for (const img of processedImages) {
      zipfile.addBuffer(img.data, img.name);
    }

    const outputDir = path.dirname(outputPath);
    await fs.ensureDir(outputDir);

    let compressedSize = 0;
    await new Promise<void>((resolve, reject) => {
      zipfile.outputStream
        .pipe(fs.createWriteStream(outputPath))
        .on("close", () => {
          fs.stat(outputPath)
            .then((stats) => {
              compressedSize = stats.size;
              resolve();
            })
            .catch(reject);
        })
        .on("error", reject);
      zipfile.end();
    });

    return { imagesProcessed, imagesSkipped, originalSize, compressedSize };
  }

  async processCBR(
    inputPath: string,
    outputPath: string
  ): Promise<{
    imagesProcessed: number;
    imagesSkipped: number;
    originalSize: number;
    compressedSize: number;
  }> {
    // CBR files can be either ZIP or RAR archives
    // Try ZIP first (many CBR files are actually ZIP files), then try RAR
    const isZip = await this.isZipFile(inputPath);
    
    if (isZip) {
      // It's a ZIP file, process as CBZ
      return await this.processCBZ(inputPath, outputPath);
    } else {
      // It's a RAR file, process with node-unrar-js
      return await this.processRAR(inputPath, outputPath);
    }
  }
}
