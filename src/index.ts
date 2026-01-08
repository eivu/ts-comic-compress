#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs-extra';
import { ComicProcessor } from './processor';
import { Logger } from './logger';

const program = new Command();

program
  .name('comic-compress')
  .description('Compresses comic books (CBR or CBZ extension) by using webp and decreasing the target height')
  .version('1.0.0')
  .requiredOption('-i, --input <FILE/FOLDER>', 'The file or folder to convert')
  .option('-o, --output <FOLDER>', 'Base path of the output (will be in output/subfolders if the recursive option is enabled)', 'converted_comics')
  .option('-r, --recursive', 'Recursively traverse the input folder (include all subfolders)', false)
  .option('-s, --skip', 'Skip processing file if it already exists in the output folder', false)
  .option('-q, --quality <number>', 'Quality to use for the webp files (0-100)', '75')
  .option('-p, --parallel', 'Run in parallel, utilizing all computing resources', false)
  .option('--rename-original', 'Rename original files to *_original instead of copying', false)
  .option('-m, --move-original', 'Move original files to a "done" subdirectory after successful compression', false)
  .option('--height <number>', 'Target height for images (maintains aspect ratio). If not specified, images are not resized', '')
  .parse(process.argv);

const options = program.opts();

async function main() {
  const logger = new Logger();
  const processor = new ComicProcessor({
    outputDir: options.output,
    quality: parseInt(options.quality, 10),
    recursive: options.recursive,
    skipExisting: options.skip,
    parallel: options.parallel,
    renameOriginal: options.renameOriginal,
    moveOriginal: options.moveOriginal,
    targetHeight: options.height ? parseInt(options.height, 10) : undefined,
  });

  try {
    const inputPath = path.resolve(options.input);
    
    if (!(await fs.pathExists(inputPath))) {
      logger.error(`Input path does not exist: ${inputPath}`);
      process.exit(1);
    }

    const stats = await fs.stat(inputPath);
    
    if (stats.isFile()) {
      await processor.processFile(inputPath);
    } else if (stats.isDirectory()) {
      await processor.processDirectory(inputPath);
    } else {
      logger.error(`Input path is neither a file nor a directory: ${inputPath}`);
      process.exit(1);
    }

    processor.printSummary();
  } catch (error) {
    logger.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      logger.error(error.stack);
    }
    process.exit(1);
  }
}

main();

