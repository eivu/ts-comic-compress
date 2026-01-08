import * as fs from 'fs-extra';
import * as path from 'path';
import { ImageConverter } from './image-converter';
import { ArchiveProcessor } from './archive-processor';
import { PDFProcessor } from './pdf-processor';
import { ProcessorOptions, ProcessingStats, FileStats } from './types';
import { Logger } from './logger';
import chalk from 'chalk';

export class ComicProcessor {
  private stats: ProcessingStats;
  private logger: Logger;
  private imageConverter: ImageConverter;
  private archiveProcessor: ArchiveProcessor;
  private pdfProcessor: PDFProcessor;
  private filesToProcess: string[] = [];

  constructor(private options: ProcessorOptions) {
    this.logger = new Logger();
    this.imageConverter = new ImageConverter(options.quality, options.targetHeight);
    this.archiveProcessor = new ArchiveProcessor(this.imageConverter);
    this.pdfProcessor = new PDFProcessor(this.imageConverter);
    this.stats = {
      filesProcessed: 0,
      imagesProcessed: 0,
      imagesSkipped: 0,
      totalOriginalSize: 0,
      totalCompressedSize: 0,
      fileStats: new Map(),
    };
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

    async function walkDir(currentPath: string, recursive: boolean): Promise<void> {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);

        if (entry.isDirectory() && recursive) {
          await walkDir(fullPath, recursive);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (['.cbr', '.cbz', '.pdf'].includes(ext)) {
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
    // Process files in parallel batches
    const batchSize = 4; // Limit concurrent file processing
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      await Promise.all(batch.map((file) => this.processSingleFile(file)));
    }
  }

  private async processSingleFile(filePath: string): Promise<void> {
    try {
      const ext = path.extname(filePath).toLowerCase();
      const fileName = path.basename(filePath);
      
      // Determine output path
      const outputPath = this.getOutputPath(filePath);

      // Check if should skip
      if (this.options.skipExisting && await fs.pathExists(outputPath)) {
        this.logger.info(`Skipping ${fileName} (already exists)`);
        return;
      }

      // Get original file size
      const originalStats = await fs.stat(filePath);
      const originalSize = originalStats.size;

      this.logger.info(`Processing: ${fileName}`);

      let result: { imagesProcessed: number; imagesSkipped: number; originalSize: number; compressedSize: number };
      let finalOutputPath = outputPath;

      if (ext === '.pdf') {
        result = await this.pdfProcessor.processPDF(filePath, outputPath);
        finalOutputPath = outputPath.replace(/\.pdf$/i, '.cbz');
      } else if (ext === '.cbz') {
        result = await this.archiveProcessor.processCBZ(filePath, outputPath);
      } else if (ext === '.cbr') {
        result = await this.archiveProcessor.processCBR(filePath, outputPath);
      } else {
        this.logger.warn(`Unsupported file type: ${filePath}`);
        return;
      }

      // Calculate savings
      const savings = originalSize > 0 
        ? ((originalSize - result.compressedSize) / originalSize) * 100 
        : 0;

      // Update stats
      this.stats.filesProcessed++;
      this.stats.imagesProcessed += result.imagesProcessed;
      this.stats.imagesSkipped += result.imagesSkipped;
      this.stats.totalOriginalSize += originalSize;
      this.stats.totalCompressedSize += result.compressedSize;

      const fileStats: FileStats = {
        originalSize,
        compressedSize: result.compressedSize,
        imagesProcessed: result.imagesProcessed,
        imagesSkipped: result.imagesSkipped,
        savings,
      };

      this.stats.fileStats.set(filePath, fileStats);

      // Handle rename original if requested
      if (this.options.renameOriginal) {
        const originalBackupPath = filePath.replace(/(\.[^.]+)$/, '_original$1');
        await fs.move(filePath, originalBackupPath);
      }

      this.logger.success(
        `✓ ${fileName}: ${savings.toFixed(1)}% savings (${result.imagesProcessed} images processed, ${result.imagesSkipped} skipped)`
      );
    } catch (error) {
      this.logger.error(`Failed to process ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private getOutputPath(inputPath: string): string {
    const relativePath = path.relative(process.cwd(), inputPath);
    const dir = path.dirname(relativePath);
    const baseName = path.basename(inputPath);
    
    if (dir === '.' || dir === '') {
      return path.join(this.options.outputDir, baseName);
    } else {
      return path.join(this.options.outputDir, dir, baseName);
    }
  }

  printSummary(): void {
    if (this.stats.filesProcessed === 0) {
      this.logger.warn('No files were processed.');
      return;
    }

    console.log('\n' + chalk.cyan('📊 Processing Summary:'));
    console.log(chalk.gray('─'.repeat(50)));

    // Print per-file stats
    for (const [filePath, fileStat] of this.stats.fileStats.entries()) {
      const fileName = path.basename(filePath);
      const sizeMB = (fileStat.originalSize / (1024 * 1024)).toFixed(2);
      const savingsMB = ((fileStat.originalSize - fileStat.compressedSize) / (1024 * 1024)).toFixed(2);
      
      console.log(
        chalk.yellow(`📖 ${fileName}:`) +
        ` ${fileStat.savings.toFixed(1)}% savings ` +
        `(${fileStat.imagesProcessed} images processed, ${fileStat.imagesSkipped} skipped) ` +
        chalk.gray(`(${savingsMB} MB saved)`)
      );
    }

    // Print overall stats
    const overallSavings = this.stats.totalOriginalSize > 0
      ? ((this.stats.totalOriginalSize - this.stats.totalCompressedSize) / this.stats.totalOriginalSize) * 100
      : 0;

    const totalOriginalMB = (this.stats.totalOriginalSize / (1024 * 1024)).toFixed(2);
    const totalCompressedMB = (this.stats.totalCompressedSize / (1024 * 1024)).toFixed(2);
    const totalSavedMB = ((this.stats.totalOriginalSize - this.stats.totalCompressedSize) / (1024 * 1024)).toFixed(2);

    console.log('\n' + chalk.cyan('🎯 Overall Results:'));
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

