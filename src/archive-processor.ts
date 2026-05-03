import * as path from "node:path";
import * as os from "node:os";
import {
  createWriteStream,
  ensureDir,
  mkdtemp,
  pathExists,
  readFile,
  remove,
  stat,
} from "./fs-utils.js";
import yauzl from "yauzl";
import yazl from "yazl";
import {
  createExtractorFromData,
  createExtractorFromFile,
} from "node-unrar-js";
import type { ImageConverter } from "./image-converter.js";
import { ImageSkippedError } from "./types.js";
import type { ImageInfo, ProgressCallback } from "./types.js";

export class ArchiveProcessor {
  constructor(
    private imageConverter: ImageConverter,
    private progressCallback?: ProgressCallback,
    private raiseException: boolean = false,
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

    images.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );

    let imagesProcessed = 0;
    let imagesSkipped = 0;
    const processedImages: Array<{ name: string; data: Buffer }> = [];
    const totalPages = images.length;

    if (this.progressCallback && totalPages > 0) {
      this.progressCallback(0, totalPages);
    }

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const currentPage = i + 1;

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
        if (this.raiseException) {
          throw new ImageSkippedError(
            image.name,
            "image format is not eligible for WebP conversion",
          );
        }
        processedImages.push({
          name: image.name,
          data: image.data,
        });
        imagesSkipped++;
      }
    }

    const zipfile = new yazl.ZipFile();
    for (const img of processedImages) {
      zipfile.addBuffer(img.data, img.name);
    }

    const outputDir = path.dirname(outputPath);
    await ensureDir(outputDir);

    let compressedSize = 0;
    await new Promise<void>((resolve, reject) => {
      zipfile.outputStream
        .pipe(createWriteStream(outputPath))
        .on("close", () => {
          stat(outputPath)
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

    const stats = await stat(inputPath);
    const TWO_GB = 2 * 1024 * 1024 * 1024;
    const useFileExtractor = stats.size > TWO_GB;

    let tempDir: string | null = null;

    try {
      process.stdout.write(
        `  Opening RAR archive (${(stats.size / (1024 * 1024)).toFixed(1)} MB)...\n`,
      );

      let extractor;
      if (useFileExtractor) {
        tempDir = await mkdtemp(path.join(os.tmpdir(), "rar-extract-"));
        extractor = await createExtractorFromFile({
          filepath: inputPath,
          targetPath: tempDir,
        });
      } else {
        const rarBuffer = await readFile(inputPath);
        const rarData = rarBuffer.buffer.slice(
          rarBuffer.byteOffset,
          rarBuffer.byteOffset + rarBuffer.byteLength,
        );
        extractor = await createExtractorFromData({
          data: rarData,
        });
      }

      process.stdout.write(`  Analyzing archive contents...\n`);

      const fileList = extractor.getFileList();
      const fileHeaders = [...fileList.fileHeaders];

      const imageFiles = fileHeaders.filter((fileHeader) => {
        const ext = path.extname(fileHeader.name).toLowerCase();
        return [".jpg", ".jpeg", ".png", ".webp"].includes(ext);
      });

      if (imageFiles.length === 0) {
        return {
          imagesProcessed: 0,
          imagesSkipped: 0,
          originalSize: 0,
          compressedSize: 0,
        };
      }

      process.stdout.write(
        `  Found ${imageFiles.length} image file${imageFiles.length !== 1 ? "s" : ""}...\n`,
      );

      const imageFileNames = imageFiles.map((fileHeader) => fileHeader.name);
      const extracted = extractor.extract({ files: imageFileNames });
      const extractedFiles = [...extracted.files];

      if (useFileExtractor && tempDir) {
        process.stdout.write(`  Extracting files to disk...\n`);

        const totalFiles = extractedFiles.length;
        let extractedCount = 0;

        for (const file of extractedFiles) {
          if (!file.fileHeader.flags.directory) {
            extractedCount++;
            const percentage = Math.round((extractedCount / totalFiles) * 100);

            process.stdout.write(
              `\r  Extracting image ${extractedCount}/${totalFiles} (${percentage}%)`,
            );

            const extractedFilePath = path.join(tempDir, file.fileHeader.name);
            if (await pathExists(extractedFilePath)) {
              const buffer = await readFile(extractedFilePath);
              originalSize += buffer.length;
              images.push({
                data: buffer,
                name: file.fileHeader.name,
                originalSize: buffer.length,
              });
            }
          }
        }

        if (extractedCount > 0) {
          process.stdout.write(
            `\r  Extracted ${extractedCount} image${extractedCount !== 1 ? "s" : ""} successfully\n`,
          );
        }
      } else {
        process.stdout.write(`  Loading images into memory...\n`);

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

      images.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      );

      let imagesProcessed = 0;
      let imagesSkipped = 0;
      const processedImages: Array<{ name: string; data: Buffer }> = [];
      const totalPages = images.length;

      if (this.progressCallback && totalPages > 0) {
        this.progressCallback(0, totalPages);
      }

      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        const currentPage = i + 1;

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
          if (this.raiseException) {
            throw new ImageSkippedError(
              image.name,
              "image format is not eligible for WebP conversion",
            );
          }
          processedImages.push({
            name: image.name,
            data: image.data,
          });
          imagesSkipped++;
        }
      }

      const zipfile = new yazl.ZipFile();
      for (const img of processedImages) {
        zipfile.addBuffer(img.data, img.name);
      }

      const outputDir = path.dirname(outputPath);
      await ensureDir(outputDir);

      let compressedSize = 0;
      await new Promise<void>((resolve, reject) => {
        zipfile.outputStream
          .pipe(createWriteStream(outputPath))
          .on("close", () => {
            stat(outputPath)
              .then((s) => {
                compressedSize = s.size;
                resolve();
              })
              .catch(reject);
          })
          .on("error", reject);
        zipfile.end();
      });

      return { imagesProcessed, imagesSkipped, originalSize, compressedSize };
    } finally {
      if (tempDir) {
        await remove(tempDir);
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
    // CBR files can be either ZIP or RAR archives; many "CBR" files are
    // actually ZIPs, so try ZIP first and fall back to the RAR path.
    const isZip = await this.isZipFile(inputPath);

    if (isZip) {
      return await this.processCBZ(inputPath, outputPath);
    } else {
      return await this.processRAR(inputPath, outputPath);
    }
  }
}
