import { PDFProcessor } from "../src/pdf-processor";
import { ImageConverter } from "../src/image-converter";
import { ImageSkippedError, ProgressCallback } from "../src/types";
import * as pdfjsLib from "pdfjs-dist";

// Mock dependencies
jest.mock("../src/image-converter");
jest.mock("fs-extra");

const fs = require("fs-extra");

const mockImageConverter = {
  shouldProcess: jest.fn(),
  convertToWebP: jest.fn(),
} as unknown as jest.Mocked<ImageConverter>;

const mockProgressCallback = jest.fn() as jest.Mock<ProgressCallback>;

// Helper function to create a mock write stream that immediately fires "close"
function createMockWriteStream(): any {
  const stream: any = {
    on: jest.fn((event: string, callback: any) => {
      if (event === "close") {
        callback();
      }
      return stream;
    }),
    once: jest.fn(() => stream),
    emit: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    destroy: jest.fn(),
    pipe: jest.fn(),
  };
  return stream;
}

interface FakeImage {
  ref: number;
  name: string;
  data: Uint8Array;
}

function buildFakePdf(pages: FakeImage[][]) {
  const fakePages = pages.map((images) => ({
    getOperatorList: jest.fn().mockResolvedValue({
      // op code 60 == paintImageXObject; arg[0] is the image ref id
      fnArray: images.map(() => 60),
      argsArray: images.map((img) => [img.ref]),
    }),
    objs: {
      get: jest.fn(async (ref: number) => {
        const match = images.find((img) => img.ref === ref);
        return match
          ? { data: match.data, ext: "jpg" }
          : null;
      }),
    },
  }));

  const fakePdf = {
    numPages: pages.length,
    getPage: jest.fn(async (pageNum: number) => fakePages[pageNum - 1]),
  };

  (pdfjsLib.getDocument as jest.Mock).mockReturnValue({
    promise: Promise.resolve(fakePdf),
  });
}

describe("PDFProcessor", () => {
  let pdfProcessor: PDFProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    pdfProcessor = new PDFProcessor(mockImageConverter, mockProgressCallback);
  });

  describe("constructor", () => {
    it("should create an instance", () => {
      expect(pdfProcessor).toBeInstanceOf(PDFProcessor);
    });

    it("should accept image converter and progress callback", () => {
      const processor = new PDFProcessor(
        mockImageConverter,
        mockProgressCallback,
      );
      expect(processor).toBeDefined();
    });

    it("should accept the raiseException flag", () => {
      const processor = new PDFProcessor(
        mockImageConverter,
        mockProgressCallback,
        true,
      );
      expect(processor).toBeDefined();
    });
  });

  describe("integration", () => {
    it("should have processPDF method", () => {
      expect(typeof pdfProcessor.processPDF).toBe("function");
    });
  });

  describe("raiseException option", () => {
    const inputPath = "/path/to/test.pdf";
    const outputPath = "/path/to/output.pdf";

    beforeEach(() => {
      jest.clearAllMocks();
      fs.readFile.mockResolvedValue(Buffer.from("mock pdf data"));
      fs.ensureDir.mockResolvedValue(undefined);
      fs.stat.mockResolvedValue({ size: 1000 });
      fs.createWriteStream.mockReturnValue(createMockWriteStream());
    });

    it("should not throw when raiseException is false and an image is skipped", async () => {
      buildFakePdf([
        [{ ref: 1, name: "img1", data: new Uint8Array([1, 2, 3]) }],
      ]);
      mockImageConverter.shouldProcess.mockResolvedValue(false);

      const processor = new PDFProcessor(
        mockImageConverter,
        mockProgressCallback,
        false,
      );

      const result = await processor.processPDF(inputPath, outputPath);

      expect(result.imagesProcessed).toBe(0);
      expect(result.imagesSkipped).toBe(1);
    });

    it("should throw ImageSkippedError when raiseException is true and an image is skipped", async () => {
      buildFakePdf([
        [{ ref: 1, name: "img1", data: new Uint8Array([1, 2, 3]) }],
      ]);
      mockImageConverter.shouldProcess.mockResolvedValue(false);

      const processor = new PDFProcessor(
        mockImageConverter,
        mockProgressCallback,
        true,
      );

      await expect(processor.processPDF(inputPath, outputPath)).rejects.toThrow(
        ImageSkippedError,
      );
    });

    it("should throw ImageSkippedError when WebP conversion fails and raiseException is true", async () => {
      buildFakePdf([
        [{ ref: 1, name: "img1", data: new Uint8Array([1, 2, 3]) }],
      ]);
      mockImageConverter.shouldProcess.mockResolvedValue(true);
      mockImageConverter.convertToWebP.mockRejectedValue(
        new Error("sharp failure"),
      );

      const processor = new PDFProcessor(
        mockImageConverter,
        mockProgressCallback,
        true,
      );

      await expect(
        processor.processPDF(inputPath, outputPath),
      ).rejects.toMatchObject({
        name: "ImageSkippedError",
        reason: expect.stringContaining("WebP conversion failed"),
      });
    });

    it("should swallow WebP conversion failures when raiseException is false", async () => {
      buildFakePdf([
        [{ ref: 1, name: "img1", data: new Uint8Array([1, 2, 3]) }],
      ]);
      mockImageConverter.shouldProcess.mockResolvedValue(true);
      mockImageConverter.convertToWebP.mockRejectedValue(
        new Error("sharp failure"),
      );

      const processor = new PDFProcessor(
        mockImageConverter,
        mockProgressCallback,
        false,
      );

      const result = await processor.processPDF(inputPath, outputPath);

      expect(result.imagesProcessed).toBe(0);
      expect(result.imagesSkipped).toBe(1);
    });

    it("should not throw when all images are processable even with raiseException=true", async () => {
      buildFakePdf([
        [{ ref: 1, name: "img1", data: new Uint8Array([1, 2, 3]) }],
        [{ ref: 2, name: "img2", data: new Uint8Array([4, 5, 6]) }],
      ]);
      mockImageConverter.shouldProcess.mockResolvedValue(true);
      mockImageConverter.convertToWebP.mockResolvedValue(Buffer.from("webp"));

      const processor = new PDFProcessor(
        mockImageConverter,
        mockProgressCallback,
        true,
      );

      const result = await processor.processPDF(inputPath, outputPath);

      expect(result.imagesProcessed).toBe(2);
      expect(result.imagesSkipped).toBe(0);
    });

    it("should default raiseException to false when omitted", async () => {
      buildFakePdf([
        [{ ref: 1, name: "img1", data: new Uint8Array([1, 2, 3]) }],
      ]);
      mockImageConverter.shouldProcess.mockResolvedValue(false);

      const processor = new PDFProcessor(
        mockImageConverter,
        mockProgressCallback,
      );

      await expect(
        processor.processPDF(inputPath, outputPath),
      ).resolves.toMatchObject({ imagesSkipped: 1 });
    });
  });
});
