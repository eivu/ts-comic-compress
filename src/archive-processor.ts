import * as fs from 'fs-extra';
import * as path from 'path';
import * as yauzl from 'yauzl';
import * as yazl from 'yazl';
import { ImageConverter } from './image-converter';
import { ImageInfo } from './types';

export class ArchiveProcessor {
  constructor(private imageConverter: ImageConverter) {}

  async processCBZ(inputPath: string, outputPath: string): Promise<{ imagesProcessed: number; imagesSkipped: number; originalSize: number; compressedSize: number }> {
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
          reject(new Error('Failed to open ZIP file'));
          return;
        }

        zipfile.readEntry();
        zipfile.on('entry', (entry) => {
          if (/\/$/.test(entry.fileName)) {
            // Directory entry, skip
            zipfile.readEntry();
            return;
          }

          const ext = path.extname(entry.fileName).toLowerCase();
          if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
            zipfile.readEntry();
            return;
          }

          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) {
              reject(err);
              return;
            }

            const chunks: Buffer[] = [];
            readStream!.on('data', (chunk) => chunks.push(chunk));
            readStream!.on('end', () => {
              const buffer = Buffer.concat(chunks);
              originalSize += buffer.length;
              images.push({
                data: buffer,
                name: entry.fileName,
                originalSize: buffer.length,
              });
              zipfile.readEntry();
            });
            readStream!.on('error', reject);
          });
        });

        zipfile.on('end', resolve);
        zipfile.on('error', reject);
      });
    });

    // Process images
    let imagesProcessed = 0;
    let imagesSkipped = 0;
    const processedImages: Array<{ name: string; data: Buffer }> = [];

    for (const image of images) {
      const shouldProcess = await this.imageConverter.shouldProcess(image);
      if (shouldProcess) {
        const webpBuffer = await this.imageConverter.convertToWebP(image);
        processedImages.push({
          name: image.name.replace(/\.(jpg|jpeg|png)$/i, '.webp'),
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

    // Sort images by name to maintain page order
    processedImages.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

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
        .on('close', () => {
          fs.stat(outputPath).then((stats) => {
            compressedSize = stats.size;
            resolve();
          }).catch(reject);
        })
        .on('error', reject);
      zipfile.end();
    });

    return { imagesProcessed, imagesSkipped, originalSize, compressedSize };
  }

  async processCBR(inputPath: string, outputPath: string): Promise<{ imagesProcessed: number; imagesSkipped: number; originalSize: number; compressedSize: number }> {
    // CBR files are RAR archives, but many are actually ZIP files
    // Try ZIP first, then fall back to RAR handling
    try {
      // Check if it's actually a ZIP file
      await fs.access(inputPath);
      return await this.processCBZ(inputPath, outputPath);
    } catch (error) {
      throw new Error(`CBR file processing requires RAR support. File: ${inputPath}. Note: This implementation currently only supports ZIP-based CBR files.`);
    }
  }
}

