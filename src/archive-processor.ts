import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import * as yauzl from "yauzl";
import * as yazl from "yazl";
import {
  createExtractorFromData,
  createExtractorFromFile,
} from "node-unrar-js";
import { ImageConverter } from "./image-converter";
import { ImageInfo, ProgressCallback } from "./types";

export class ArchiveProcessor {
  constructor(
    private imageConverter: ImageConverter,
    private progressCallback?: ProgressCallback,
  ) {}

  async processCBZ(
    inputPath: string,
    outputPath: string,
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
      }),
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
    outputPath: string,
  ): Promise<{
    imagesProcessed: number;
    imagesSkipped: number;
    originalSize: number;
    compressedSize: number;
  }> {
    const images: ImageInfo[] = [];
    let originalSize = 0;

    // Check file size to determine extraction method
    const stats = await fs.stat(inputPath);
    const TWO_GB = 2 * 1024 * 1024 * 1024; // 2GB in bytes
    const useFileExtractor = stats.size > TWO_GB;

    let tempDir: string | null = null;

    try {
      let extractor;
      if (useFileExtractor) {
        // For large files (>2GB), use file-based extraction which writes to disk
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rar-extract-"));
        extractor = await createExtractorFromFile({
          filepath: inputPath,
          targetPath: tempDir,
        });
      } else {
        // For smaller files, use in-memory extraction
        const rarBuffer = await fs.readFile(inputPath);
        // Convert Buffer to ArrayBuffer
        const rarData = rarBuffer.buffer.slice(
          rarBuffer.byteOffset,
          rarBuffer.byteOffset + rarBuffer.byteLength,
        );
        extractor = await createExtractorFromData({
          data: rarData,
        });
      }

      const fileList = extractor.getFileList();
      const fileHeaders = [...fileList.fileHeaders];

      // Filter for image files only
      const imageFiles = fileHeaders.filter((fileHeader) => {
        const ext = path.extname(fileHeader.name).toLowerCase();
        return [".jpg", ".jpeg", ".png", ".webp"].includes(ext);
      });

      if (imageFiles.length === 0) {
        // No image files found, return empty result
        return {
          imagesProcessed: 0,
          imagesSkipped: 0,
          originalSize: 0,
          compressedSize: 0,
        };
      }

      // Extract all image files
      const imageFileNames = imageFiles.map((fileHeader) => fileHeader.name);
      const extracted = extractor.extract({ files: imageFileNames });
      const extractedFiles = [...extracted.files];

      // Process extracted files differently based on extraction method
      if (useFileExtractor && tempDir) {
        // File-based extraction: files are written to disk, read them from temp directory
        const totalFiles = extractedFiles.length;
        let extractedCount = 0;

        for (const file of extractedFiles) {
          if (!file.fileHeader.flags.directory) {
            extractedCount++;
            const percentage = Math.round((extractedCount / totalFiles) * 100);

            // Report extraction progress
            if (this.progressCallback) {
              process.stdout.write(
                `\r  Extracting image ${extractedCount}/${totalFiles} (${percentage}%) - ${path.basename(inputPath)}`,
              );
            }

            const extractedFilePath = path.join(tempDir, file.fileHeader.name);
            if (await fs.pathExists(extractedFilePath)) {
              const buffer = await fs.readFile(extractedFilePath);
              originalSize += buffer.length;
              images.push({
                data: buffer,
                name: file.fileHeader.name,
                originalSize: buffer.length,
              });
            }
          }
        }

        // Clear the extraction progress line
        if (this.progressCallback && extractedCount > 0) {
          process.stdout.write("\n");
        }
      } else {
        // In-memory extraction: extraction field contains Uint8Array with file data
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
      }

      // Sort images by name to maintain page order before processing
      images.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
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
    } finally {
      // Clean up temporary directory if it was created
      if (tempDir) {
        await fs.remove(tempDir);
      }
    }
  }

  async processCBR(
    inputPath: string,
    outputPath: string,
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
