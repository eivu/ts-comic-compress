#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import * as path from "node:path";

export { ComicProcessor } from "./processor.js";
export { ImageConverter } from "./image-converter.js";
export { ArchiveProcessor } from "./archive-processor.js";
export { PDFProcessor } from "./pdf-processor.js";
export { Logger } from "./logger.js";
export { ImageSkippedError } from "./types.js";
export type {
  ProcessorOptions,
  ProcessingStats,
  FileStats,
  ImageInfo,
  ProgressCallback,
} from "./types.js";

import { Command } from "commander";
import { pathExists, stat } from "./fs-utils.js";
import { ComicProcessor } from "./processor.js";
import { Logger } from "./logger.js";

/**
 * Resolve and run the comic-compress CLI. Exported so consumers (and tests)
 * can drive it programmatically; invoked automatically when this module is
 * executed as a script (e.g. via the `comic-compress` bin).
 */
export async function runCli(argv: string[] = process.argv): Promise<void> {
  const program = new Command();

  program
    .name("comic-compress")
    .description(
      "Compresses comic books (CBR or CBZ extension) by using webp and decreasing the target height",
    )
    .version("2.0.0")
    .requiredOption(
      "-i, --input <FILE/FOLDER>",
      "The file or folder to convert",
    )
    .option(
      "-o, --output <FOLDER>",
      "Base path of the output (will be in output/subfolders if the recursive option is enabled)",
      "converted_comics",
    )
    .option(
      "-r, --recursive",
      "Recursively traverse the input folder (include all subfolders)",
      false,
    )
    .option(
      "-s, --skip",
      "Skip processing file if it already exists in the output folder",
      false,
    )
    .option(
      "-q, --quality <number>",
      "Quality to use for the webp files (0-100)",
      "75",
    )
    .option(
      "-p, --parallel",
      "Run in parallel, utilizing all computing resources",
      false,
    )
    .option(
      "--rename-original",
      "Rename original files to *_original instead of copying",
      false,
    )
    .option(
      "-e, --raise-exception",
      "Raise an exception when an image is skipped during processing",
      false,
    )
    .option(
      "-m, --move-original",
      'Move original files to a "done" subdirectory after successful compression',
      false,
    )
    .option(
      "--height <number>",
      "Target height for images (maintains aspect ratio). If not specified, images are not resized",
      "",
    )
    .parse(argv);

  const options = program.opts();
  const logger = new Logger();
  const processor = new ComicProcessor({
    outputDir: options.output,
    quality: parseInt(options.quality, 10),
    recursive: options.recursive,
    skipExisting: options.skip,
    parallel: options.parallel,
    renameOriginal: options.renameOriginal,
    moveOriginal: options.moveOriginal,
    raiseException: options.raiseException,
    targetHeight: options.height ? parseInt(options.height, 10) : undefined,
  });

  try {
    const inputPath = path.resolve(options.input);

    if (!(await pathExists(inputPath))) {
      logger.error(`Input path does not exist: ${inputPath}`);
      process.exit(1);
    }

    const stats = await stat(inputPath);

    if (stats.isFile()) {
      await processor.processFile(inputPath);
    } else if (stats.isDirectory()) {
      await processor.processDirectory(inputPath);
    } else {
      logger.error(
        `Input path is neither a file nor a directory: ${inputPath}`,
      );
      process.exit(1);
    }

    processor.printSummary();
  } catch (error) {
    logger.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    if (error instanceof Error && error.stack) {
      logger.error(error.stack);
    }
    process.exit(1);
  }
}

// Auto-run the CLI when executed directly (e.g. `node dist/index.js` or via
// the `comic-compress` bin) but NOT when imported as a library.
function isMainModule(): boolean {
  if (!process.argv[1]) return false;
  try {
    const invokedScript = realpathSync(process.argv[1]);
    const thisFile = realpathSync(fileURLToPath(import.meta.url));
    return invokedScript === thisFile;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  void runCli();
}
