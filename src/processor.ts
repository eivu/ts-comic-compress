import * as path from "node:path";
import {
  copy,
  ensureDir,
  move,
  pathExists,
  readdir,
  remove,
  stat,
} from "./fs-utils.js";
import { ImageConverter } from "./image-converter.js";
import { ArchiveProcessor } from "./archive-processor.js";
import { PDFProcessor } from "./pdf-processor.js";
import { ImageSkippedError } from "./types.js";
import type {
  ProcessorOptions,
  ProcessingStats,
  FileStats,
} from "./types.js";
import { Logger } from "./logger.js";
import chalk from "chalk";

export class ComicProcessor {
  private stats: ProcessingStats;
  private logger: Logger;
  private imageConverter: ImageConverter;
  private archiveProcessor: ArchiveProcessor;
  private pdfProcessor: PDFProcessor;
  private filesToProcess: string[] = [];

  constructor(private options: ProcessorOptions) {
    this.logger = new Logger();
    this.imageConverter = new ImageConverter(
      options.quality,
      options.targetHeight,
    );
    this.archiveProcessor = new ArchiveProcessor(
      this.imageConverter,
      this.createProgressCallback.bind(this),
      options.raiseException,
    );
    this.pdfProcessor = new PDFProcessor(
      this.imageConverter,
      this.createProgressCallback.bind(this),
      options.raiseException,
    );
    this.stats = {
      filesProcessed: 0,
      imagesProcessed: 0,
      imagesSkipped: 0,
      totalOriginalSize: 0,
      totalCompressedSize: 0,
      fileStats: new Map(),
    };
  }

  private currentFileName: string = "";

  private createProgressCallback(current: number, total: number): void {
    if (total === 0) return;

    if (current === 0) {
      process.stdout.write(
        `\r  Total pages: ${total} - ${this.currentFileName}\n`,
      );
      return;
    }

    const percentage = Math.round((current / total) * 100);
    process.stdout.write(
      `\r  Processing page ${current}/${total} (${percentage}%) - ${this.currentFileName}`,
    );
    if (current === total) {
      process.stdout.write("\r" + " ".repeat(100) + "\r");
    }
  }

  async processDirectory(dirPath: string): Promise<void> {
    const files = await this.collectFiles(dirPath);
    this.filesToProcess = files;

    if (this.options.parallel) {
      await this.processFilesParallel(files);
    } else {
      await this.processFilesSequential(files);
    }
  }

  async processFile(filePath: string): Promise<void> {
    await this.processFilesSequential([filePath]);
  }

  private async collectFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];

    async function walkDir(
      currentPath: string,
      recursive: boolean,
    ): Promise<void> {
      const entries = await readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);

        if (entry.isDirectory() && recursive) {
          await walkDir(fullPath, recursive);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if ([".cbr", ".cbz", ".pdf"].includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    }

    await walkDir(dirPath, this.options.recursive);
    return files;
  }

  private async processFilesSequential(files: string[]): Promise<void> {
    for (const filePath of files) {
      await this.processSingleFile(filePath);
    }
  }

  private async processFilesParallel(files: string[]): Promise<void> {
    const batchSize = 4;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      await Promise.all(batch.map((file) => this.processSingleFile(file)));
    }
  }

  private async processSingleFile(filePath: string): Promise<void> {
    try {
      const ext = path.extname(filePath).toLowerCase();
      const fileName = path.basename(filePath);

      const outputPath = this.getOutputPath(filePath);

      if (this.options.skipExisting && (await pathExists(outputPath))) {
        this.logger.info(`Skipping ${fileName} (already exists)`);
        return;
      }

      const originalStats = await stat(filePath);
      const originalSize = originalStats.size;

      this.currentFileName = fileName;
      this.logger.info(`Processing: ${fileName}`);

      let result: {
        imagesProcessed: number;
        imagesSkipped: number;
        originalSize: number;
        compressedSize: number;
      };
      let finalOutputPath = outputPath;
      const isPDF = ext === ".pdf";

      if (isPDF) {
        result = await this.pdfProcessor.processPDF(filePath, outputPath);
        finalOutputPath = outputPath.replace(/\.pdf$/i, ".cbz");
      } else if (ext === ".cbz") {
        result = await this.archiveProcessor.processCBZ(filePath, outputPath);
      } else if (ext === ".cbr") {
        result = await this.archiveProcessor.processCBR(filePath, outputPath);
      } else {
        this.logger.warn(`Unsupported file type: ${filePath}`);
        this.currentFileName = "";
        return;
      }

      this.currentFileName = "";

      let finalCompressedSize = result.compressedSize;
      const originalWasBetter = result.compressedSize > originalSize;

      if (originalWasBetter) {
        if (await pathExists(finalOutputPath)) {
          await remove(finalOutputPath);
        }
        if (isPDF) {
          await copy(filePath, outputPath);
          finalOutputPath = outputPath;
        } else {
          await copy(filePath, finalOutputPath);
        }
        finalCompressedSize = originalSize;
        this.logger.info(
          `  Original file is smaller (${(originalSize / (1024 * 1024)).toFixed(
            2,
          )} MB vs ${(result.compressedSize / (1024 * 1024)).toFixed(
            2,
          )} MB), using original instead`,
        );
      }

      const savings =
        originalSize > 0
          ? ((originalSize - finalCompressedSize) / originalSize) * 100
          : 0;

      this.stats.filesProcessed++;
      this.stats.imagesProcessed += result.imagesProcessed;
      this.stats.imagesSkipped += result.imagesSkipped;
      this.stats.totalOriginalSize += originalSize;
      this.stats.totalCompressedSize += finalCompressedSize;

      const fileStats: FileStats = {
        originalSize,
        compressedSize: finalCompressedSize,
        imagesProcessed: result.imagesProcessed,
        imagesSkipped: result.imagesSkipped,
        savings,
      };

      this.stats.fileStats.set(filePath, fileStats);

      // Handle move original if requested (only if processing was successful)
      // Success means: images were processed (result.imagesProcessed > 0) and no errors occurred
      if (this.options.moveOriginal && result.imagesProcessed > 0) {
        if (await pathExists(filePath)) {
          const fileDir = path.dirname(filePath);
          const doneDir = path.join(fileDir, "done");
          await ensureDir(doneDir);
          const fileName = path.basename(filePath);
          const donePath = path.join(doneDir, fileName);
          await move(filePath, donePath);
          this.logger.info(`  Moved original file to: ${donePath}`);
        }
      } else if (this.options.renameOriginal && !originalWasBetter) {
        // Skip renaming when we already copied the original to the output path.
        const originalBackupPath = filePath.replace(
          /(\.[^.]+)$/,
          "_original$1",
        );
        await move(filePath, originalBackupPath);
      }

      if (originalWasBetter) {
        this.logger.success(
          `✓ ${fileName}: Original file kept (compressed file was larger, ${result.imagesProcessed} images processed)`,
        );
      } else {
        this.logger.success(
          `✓ ${fileName}: ${savings.toFixed(1)}% savings (${
            result.imagesProcessed
          } images processed, ${result.imagesSkipped} skipped)`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to process ${filePath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      // ImageSkippedError signals the user explicitly opted into hard-failing
      // via --raise-exception; propagate so the CLI exits non-zero instead of
      // silently continuing and printing a misleading summary.
      if (error instanceof ImageSkippedError) {
        throw error;
      }
    }
  }

  private getOutputPath(inputPath: string): string {
    const baseName = path.basename(inputPath);

    const ext = path.extname(baseName);
    const nameWithoutExt = baseName.slice(0, -ext.length) || baseName;
    const compressedBaseName = `${nameWithoutExt}.eivu_compressed${ext}`;

    const resolvedOutputDir = path.resolve(this.options.outputDir);

    if (!this.options.recursive) {
      return path.join(resolvedOutputDir, compressedBaseName);
    }

    const resolvedInput = path.resolve(inputPath);

    try {
      const relativePath = path.relative(process.cwd(), resolvedInput);

      if (relativePath.startsWith("..")) {
        return path.join(resolvedOutputDir, baseName);
      }

      const dir = path.dirname(relativePath);
      if (dir === "." || dir === "") {
        return path.join(resolvedOutputDir, compressedBaseName);
      } else {
        return path.join(resolvedOutputDir, dir, compressedBaseName);
      }
    } catch {
      return path.join(resolvedOutputDir, baseName);
    }
  }

  printSummary(): void {
    if (this.stats.filesProcessed === 0) {
      this.logger.warn("No files were processed.");
      return;
    }

    console.log("\n" + chalk.cyan("📊 Processing Summary:"));
    console.log(chalk.gray("─".repeat(50)));

    for (const [filePath, fileStat] of this.stats.fileStats.entries()) {
      const fileName = path.basename(filePath);
      const savingsMB = (
        (fileStat.originalSize - fileStat.compressedSize) /
        (1024 * 1024)
      ).toFixed(2);

      console.log(
        chalk.yellow(`📖 ${fileName}:`) +
          ` ${fileStat.savings.toFixed(1)}% savings ` +
          `(${fileStat.imagesProcessed} images processed, ${fileStat.imagesSkipped} skipped) ` +
          chalk.gray(`(${savingsMB} MB saved)`),
      );
    }

    const overallSavings =
      this.stats.totalOriginalSize > 0
        ? ((this.stats.totalOriginalSize - this.stats.totalCompressedSize) /
            this.stats.totalOriginalSize) *
          100
        : 0;

    const totalOriginalMB = (
      this.stats.totalOriginalSize /
      (1024 * 1024)
    ).toFixed(2);
    const totalCompressedMB = (
      this.stats.totalCompressedSize /
      (1024 * 1024)
    ).toFixed(2);
    const totalSavedMB = (
      (this.stats.totalOriginalSize - this.stats.totalCompressedSize) /
      (1024 * 1024)
    ).toFixed(2);

    console.log("\n" + chalk.cyan("🎯 Overall Results:"));
    console.log(`   Total files processed: ${this.stats.filesProcessed}`);
    console.log(`   Total images processed: ${this.stats.imagesProcessed}`);
    console.log(`   Total images skipped: ${this.stats.imagesSkipped}`);
    console.log(`   Overall size reduction: ${overallSavings.toFixed(1)}%`);
    console.log(`   Original size: ${totalOriginalMB} MB`);
    console.log(`   Compressed size: ${totalCompressedMB} MB`);
    console.log(`   Space saved: ${totalSavedMB} MB`);
    console.log();
  }
}
