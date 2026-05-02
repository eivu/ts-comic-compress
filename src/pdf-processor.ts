import * as path from "node:path";
import { createRequire } from "node:module";
import { createWriteStream, ensureDir, readFile, stat } from "./fs-utils.js";
import * as pdfjsLib from "pdfjs-dist";
import type { ImageConverter } from "./image-converter.js";
import { ImageSkippedError } from "./types.js";
import type { ImageInfo, ProgressCallback } from "./types.js";
import yazl from "yazl";

// pdfjs-dist@4 is ESM-only and ships its worker as an ESM module. In Node we
// need to point GlobalWorkerOptions.workerSrc at that worker file so pdfjs's
// fake-worker loader can dynamically import it. Resolving via createRequire
// works under both NodeNext ESM and the test runner without depending on
// import.meta.resolve (which still requires a flag on Node < 20.6).
const requireFromHere = createRequire(import.meta.url);
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = requireFromHere.resolve(
    "pdfjs-dist/build/pdf.worker.mjs",
  );
} catch {
  // Some test environments mock pdfjs-dist and the worker file may not be
  // resolvable; leaving workerSrc unset is fine because getDocument is mocked.
}

export class PDFProcessor {
  constructor(
    private imageConverter: ImageConverter,
    private progressCallback?: ProgressCallback,
    private raiseException: boolean = false,
  ) {}

  async processPDF(
    inputPath: string,
    outputPath: string,
  ): Promise<{
    imagesProcessed: number;
    imagesSkipped: number;
    originalSize: number;
    compressedSize: number;
  }> {
    const data = await readFile(inputPath);
    const loadingTask = pdfjsLib.getDocument({
      data,
      useSystemFonts: true,
      verbosity: 0,
    });
    const pdf = await loadingTask.promise;

    const images: ImageInfo[] = [];
    let originalSize = 0;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const operatorList = await page.getOperatorList();

      const imageMap = new Map<number, unknown>();

      for (let i = 0; i < operatorList.fnArray.length; i++) {
        const op = operatorList.fnArray[i];
        const args = operatorList.argsArray[i];

        // OPS.paintImageXObject = 60, OPS.paintJpegXObject = 61
        if (op === 60 || op === 61) {
          const imageRef = args[0];
          if (imageRef !== undefined && !imageMap.has(imageRef)) {
            try {
              const imageObj = await page.objs.get(imageRef);
              if (imageObj && (imageObj as { data?: unknown }).data) {
                imageMap.set(imageRef, imageObj);
              }
            } catch {
              // Skip images that can't be extracted
            }
          }
        }
      }

      for (const [ref, imageObj] of imageMap.entries()) {
        const imgData = (imageObj as { data?: unknown }).data;
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
              (imageObj as { ext?: string; fileType?: string }).ext ||
              (imageObj as { ext?: string; fileType?: string }).fileType ||
              "jpg";
            images.push({
              data: imageBuffer,
              name: `page_${String(pageNum).padStart(
                4,
                "0",
              )}_img_${ref}.${ext}`,
              originalSize: imageBuffer.length,
            });
          }
        }
      }
    }

    if (images.length === 0) {
      // Fallback path (rendering pages as images) is not implemented; PDFs
      // without extractable raster images are skipped.
      return {
        imagesProcessed: 0,
        imagesSkipped: 0,
        originalSize: 0,
        compressedSize: 0,
      };
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
        try {
          const webpBuffer = await this.imageConverter.convertToWebP(image);
          processedImages.push({
            name: image.name.replace(/\.(jpg|jpeg|png)$/i, ".webp"),
            data: webpBuffer,
          });
          imagesProcessed++;
        } catch (error) {
          if (this.raiseException) {
            throw new ImageSkippedError(
              image.name,
              `WebP conversion failed: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
          processedImages.push({
            name: image.name,
            data: image.data,
          });
          imagesSkipped++;
        }
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

    const cbzPath = outputPath.replace(/\.pdf$/i, ".cbz");

    let compressedSize = 0;
    await new Promise<void>((resolve, reject) => {
      zipfile.outputStream
        .pipe(createWriteStream(cbzPath))
        .on("close", () => {
          stat(cbzPath)
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
  }
}
