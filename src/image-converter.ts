import sharp from "sharp";
import type { ImageInfo } from "./types.js";

export class ImageConverter {
  constructor(
    private quality: number = 75,
    private targetHeight?: number
  ) {}

  async convertToWebP(image: ImageInfo): Promise<Buffer> {
    let pipeline = sharp(image.data);

    // Resize if target height is specified
    if (this.targetHeight) {
      const metadata = await pipeline.metadata();
      if (metadata.height && metadata.height > this.targetHeight) {
        pipeline = pipeline.resize(undefined, this.targetHeight, {
          kernel: sharp.kernel.lanczos3,
          withoutEnlargement: true,
        });
      }
    }

    // Convert to WebP
    const webpBuffer = await pipeline
      .webp({ quality: this.quality })
      .toBuffer();

    return webpBuffer;
  }

  async shouldProcess(image: ImageInfo): Promise<boolean> {
    try {
      const metadata = await sharp(image.data).metadata();
      const format = metadata.format;

      // Skip if already WebP
      if (format === 'webp') {
        return false;
      }

      // Process JPG, PNG, JPEG
      return format === 'jpeg' || format === 'jpg' || format === 'png';
    } catch {
      return false;
    }
  }
}

