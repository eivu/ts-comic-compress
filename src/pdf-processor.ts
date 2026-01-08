import * as fs from "fs-extra";
import * as path from "path";
import * as pdfjsLib from "pdfjs-dist";
import { ImageConverter } from "./image-converter";
import { ImageInfo, ProgressCallback } from "./types";
import * as yazl from "yazl";

// Configure pdfjs worker for Node.js
const workerPath = require.resolve("pdfjs-dist/build/pdf.worker.min.mjs");
pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;

export class PDFProcessor {
  constructor(
    private imageConverter: ImageConverter,
    private progressCallback?: ProgressCallback
  ) {}

  async processPDF(
    inputPath: string,
    outputPath: string
  ): Promise<{
    imagesProcessed: number;
    imagesSkipped: number;
    originalSize: number;
    compressedSize: number;
  }> {
    const data = await fs.readFile(inputPath);
    const loadingTask = pdfjsLib.getDocument({
      data,
      useSystemFonts: true,
      verbosity: 0,
    });
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

        // Check for image rendering operations
        // OPS.paintImageXObject = 60, OPS.paintJpegXObject = 61
        if (op === 60 || op === 61) {
          const imageRef = args[0];
          if (imageRef !== undefined && !imageMap.has(imageRef)) {
            try {
              const imageObj = await page.objs.get(imageRef);
              if (imageObj && (imageObj as any).data) {
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
        const imgData = (imageObj as any).data;
        if (imgData) {
          let imageBuffer: Buffer;

          if (imgData instanceof Uint8Array) {
            imageBuffer = Buffer.from(imgData);
          } else if (imgData instanceof ArrayBuffer) {
            imageBuffer = Buffer.from(imgData);
          } else if (Buffer.isBuffer(imgData)) {
            imageBuffer = imgData;
          } else if (typeof imgData === "string") {
            imageBuffer = Buffer.from(imgData, "base64");
          } else {
            continue;
          }

          if (imageBuffer.length > 0) {
            originalSize += imageBuffer.length;
            const ext =
              (imageObj as any).ext || (imageObj as any).fileType || "jpg";
            images.push({
              data: imageBuffer,
              name: `page_${String(pageNum).padStart(
                4,
                "0"
              )}_img_${ref}.${ext}`,
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
      return {
        imagesProcessed: 0,
        imagesSkipped: 0,
        originalSize: 0,
        compressedSize: 0,
      };
    }

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
        try {
          const webpBuffer = await this.imageConverter.convertToWebP(image);
          processedImages.push({
            name: image.name.replace(/\.(jpg|jpeg|png)$/i, ".webp"),
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

    // Images are already sorted from the original array, just ensure processed images maintain order
    // (They should already be in order since we process them in order)

    // Create new CBZ file (convert PDF to CBZ)
    const zipfile = new yazl.ZipFile();
    for (const img of processedImages) {
      zipfile.addBuffer(img.data, img.name);
    }

    const outputDir = path.dirname(outputPath);
    await fs.ensureDir(outputDir);

    // Change extension to .cbz
    const cbzPath = outputPath.replace(/\.pdf$/i, ".cbz");

    let compressedSize = 0;
    await new Promise<void>((resolve, reject) => {
      zipfile.outputStream
        .pipe(fs.createWriteStream(cbzPath))
        .on("close", () => {
          fs.stat(cbzPath)
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
}
