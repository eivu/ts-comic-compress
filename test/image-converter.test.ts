import { describe, it, expect, beforeEach, vi } from "vitest";
import { ImageConverter } from "../src/image-converter.js";
import { ImageInfo } from "../src/types.js";
import sharp from "sharp";

vi.mock("sharp", () => {
  const sharpFn = vi.fn();
  // sharp.kernel.lanczos3 is read by ImageConverter for resize options.
  (sharpFn as unknown as { kernel: Record<string, string> }).kernel = {
    lanczos3: "lanczos3",
  };
  return { default: sharpFn };
});

describe("ImageConverter", () => {
  let converter: ImageConverter;
  let mockSharpInstance: {
    metadata: ReturnType<typeof vi.fn>;
    resize: ReturnType<typeof vi.fn>;
    webp: ReturnType<typeof vi.fn>;
    toBuffer: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockSharpInstance = {
      metadata: vi.fn(),
      resize: vi.fn(),
      webp: vi.fn(),
      toBuffer: vi.fn(),
    };

    mockSharpInstance.resize.mockReturnValue(mockSharpInstance);
    mockSharpInstance.webp.mockReturnValue(mockSharpInstance);
    mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from("webp-data"));

    (sharp as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSharpInstance,
    );
  });

  describe("constructor", () => {
    it("should create converter with default quality", () => {
      converter = new ImageConverter();
      expect(converter).toBeInstanceOf(ImageConverter);
    });

    it("should create converter with custom quality", () => {
      converter = new ImageConverter(85);
      expect(converter).toBeInstanceOf(ImageConverter);
    });

    it("should create converter with custom quality and target height", () => {
      converter = new ImageConverter(85, 1080);
      expect(converter).toBeInstanceOf(ImageConverter);
    });
  });

  describe("convertToWebP", () => {
    beforeEach(() => {
      converter = new ImageConverter(75, 1080);
    });

    it("should convert image without resizing when no target height", async () => {
      converter = new ImageConverter(75);
      const image: ImageInfo = {
        data: Buffer.from("test-image"),
        name: "test.jpg",
        originalSize: 1000,
      };

      const result = await converter.convertToWebP(image);

      expect(sharp).toHaveBeenCalledWith(image.data);
      expect(mockSharpInstance.resize).not.toHaveBeenCalled();
      expect(mockSharpInstance.webp).toHaveBeenCalledWith({ quality: 75 });
      expect(result).toEqual(Buffer.from("webp-data"));
    });

    it("should resize image when height exceeds target", async () => {
      mockSharpInstance.metadata.mockResolvedValue({
        height: 2160,
        width: 1440,
      });

      const image: ImageInfo = {
        data: Buffer.from("test-image"),
        name: "test.jpg",
        originalSize: 1000,
      };

      const result = await converter.convertToWebP(image);

      expect(sharp).toHaveBeenCalledWith(image.data);
      expect(mockSharpInstance.metadata).toHaveBeenCalled();
      expect(mockSharpInstance.resize).toHaveBeenCalledWith(undefined, 1080, {
        kernel: "lanczos3",
        withoutEnlargement: true,
      });
      expect(mockSharpInstance.webp).toHaveBeenCalledWith({ quality: 75 });
      expect(result).toEqual(Buffer.from("webp-data"));
    });

    it("should not resize image when height is below target", async () => {
      mockSharpInstance.metadata.mockResolvedValue({ height: 720, width: 480 });

      const image: ImageInfo = {
        data: Buffer.from("test-image"),
        name: "test.jpg",
        originalSize: 1000,
      };

      const result = await converter.convertToWebP(image);

      expect(mockSharpInstance.metadata).toHaveBeenCalled();
      expect(mockSharpInstance.resize).not.toHaveBeenCalled();
      expect(result).toEqual(Buffer.from("webp-data"));
    });

    it("should use specified quality setting", async () => {
      converter = new ImageConverter(90);
      const image: ImageInfo = {
        data: Buffer.from("test-image"),
        name: "test.jpg",
        originalSize: 1000,
      };

      await converter.convertToWebP(image);

      expect(mockSharpInstance.webp).toHaveBeenCalledWith({ quality: 90 });
    });
  });

  describe("shouldProcess", () => {
    beforeEach(() => {
      converter = new ImageConverter(75);
    });

    it("should return true for JPEG images", async () => {
      mockSharpInstance.metadata.mockResolvedValue({ format: "jpeg" });

      const image: ImageInfo = {
        data: Buffer.from("test-image"),
        name: "test.jpg",
        originalSize: 1000,
      };

      const result = await converter.shouldProcess(image);

      expect(result).toBe(true);
    });

    it("should return true for PNG images", async () => {
      mockSharpInstance.metadata.mockResolvedValue({ format: "png" });

      const image: ImageInfo = {
        data: Buffer.from("test-image"),
        name: "test.png",
        originalSize: 1000,
      };

      const result = await converter.shouldProcess(image);

      expect(result).toBe(true);
    });

    it("should return false for WebP images", async () => {
      mockSharpInstance.metadata.mockResolvedValue({ format: "webp" });

      const image: ImageInfo = {
        data: Buffer.from("test-image"),
        name: "test.webp",
        originalSize: 1000,
      };

      const result = await converter.shouldProcess(image);

      expect(result).toBe(false);
    });

    it("should return false for unsupported formats", async () => {
      mockSharpInstance.metadata.mockResolvedValue({ format: "gif" });

      const image: ImageInfo = {
        data: Buffer.from("test-image"),
        name: "test.gif",
        originalSize: 1000,
      };

      const result = await converter.shouldProcess(image);

      expect(result).toBe(false);
    });

    it("should return false when metadata extraction fails", async () => {
      mockSharpInstance.metadata.mockRejectedValue(new Error("Invalid image"));

      const image: ImageInfo = {
        data: Buffer.from("invalid-image"),
        name: "test.jpg",
        originalSize: 1000,
      };

      const result = await converter.shouldProcess(image);

      expect(result).toBe(false);
    });
  });
});
