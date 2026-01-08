import * as fs from 'fs-extra';
import * as path from 'path';
import * as pdfjsLib from 'pdfjs-dist';
import { ImageConverter } from './image-converter';
import { ImageInfo } from './types';
import * as yazl from 'yazl';

// Configure pdfjs worker
if (typeof window === 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs');
}

export class PDFProcessor {
  constructor(private imageConverter: ImageConverter) {}

  async processPDF(inputPath: string, outputPath: string): Promise<{ imagesProcessed: number; imagesSkipped: number; originalSize: number; compressedSize: number }> {
    const data = await fs.readFile(inputPath);
    const loadingTask = pdfjsLib.getDocument({ data, useSystemFonts: true, verbosity: 0 });
    const pdf = await loadingTask.promise;

    const images: ImageInfo[] = [];
    let originalSize = 0;

    // Extract images from all pages
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const operatorList = await page.getOperatorList();

      // Extract images from operator list
      const imageMap = new Map<number, any>();
      
      // First pass: collect all image objects
      for (let i = 0; i < operatorList.fnArray.length; i++) {
        const op = operatorList.fnArray[i];
        const args = operatorList.argsArray[i];
        
        if (op === pdfjsLib.OPS.paintImageXObject || op === pdfjsLib.OPS.paintJpegXObject) {
          const imageRef = args[0];
          if (!imageMap.has(imageRef)) {
            try {
              const imageObj = await page.objs.get(imageRef, true);
              if (imageObj && imageObj.data) {
                imageMap.set(imageRef, imageObj);
              }
            } catch (err) {
              // Skip images that can't be extracted
            }
          }
        }
      }

      // Second pass: extract image data
      for (const [ref, imageObj] of imageMap.entries()) {
        if (imageObj.data) {
          let imageBuffer: Buffer;
          
          if (imageObj.data instanceof Uint8Array) {
            imageBuffer = Buffer.from(imageObj.data);
          } else if (imageObj.data instanceof ArrayBuffer) {
            imageBuffer = Buffer.from(imageObj.data);
          } else if (Buffer.isBuffer(imageObj.data)) {
            imageBuffer = imageObj.data;
          } else if (typeof imageObj.data === 'string') {
            imageBuffer = Buffer.from(imageObj.data, 'base64');
          } else {
            continue;
          }

          if (imageBuffer.length > 0) {
            originalSize += imageBuffer.length;
            const ext = imageObj.ext || (imageObj.fileType || 'jpg');
            images.push({
              data: imageBuffer,
              name: `page_${String(pageNum).padStart(4, '0')}_img_${ref}.${ext}`,
              originalSize: imageBuffer.length,
            });
          }
        }
      }
    }

    // If no images extracted, convert pages to images
    if (images.length === 0) {
      // Fallback: render pages as images (requires canvas)
      // For now, skip PDFs without extractable images
      return { imagesProcessed: 0, imagesSkipped: 0, originalSize: 0, compressedSize: 0 };
    }

    // Process images
    let imagesProcessed = 0;
    let imagesSkipped = 0;
    const processedImages: Array<{ name: string; data: Buffer }> = [];

    for (const image of images) {
      const shouldProcess = await this.imageConverter.shouldProcess(image);
      if (shouldProcess) {
        try {
          const webpBuffer = await this.imageConverter.convertToWebP(image);
          processedImages.push({
            name: image.name.replace(/\.(jpg|jpeg|png)$/i, '.webp'),
            data: webpBuffer,
          });
          imagesProcessed++;
        } catch (error) {
          // If conversion fails, keep original
          processedImages.push({
            name: image.name,
            data: image.data,
          });
          imagesSkipped++;
        }
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

    // Create new CBZ file (convert PDF to CBZ)
    const zipfile = new yazl.ZipFile();
    for (const img of processedImages) {
      zipfile.addBuffer(img.data, img.name);
    }

    const outputDir = path.dirname(outputPath);
    await fs.ensureDir(outputDir);

    // Change extension to .cbz
    const cbzPath = outputPath.replace(/\.pdf$/i, '.cbz');

    let compressedSize = 0;
    await new Promise<void>((resolve, reject) => {
      zipfile.outputStream
        .pipe(fs.createWriteStream(cbzPath))
        .on('close', () => {
          fs.stat(cbzPath).then((stats) => {
            compressedSize = stats.size;
            resolve();
          }).catch(reject);
        })
        .on('error', reject);
      zipfile.end();
    });

    return { imagesProcessed, imagesSkipped, originalSize, compressedSize };
  }
}
