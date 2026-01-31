import { PDFProcessor } from "../pdf-processor";
import { ImageConverter } from "../image-converter";
import { ProgressCallback } from "../types";

// Mock dependencies
jest.mock("../image-converter");

const mockImageConverter = {
  shouldProcess: jest.fn(),
  convertToWebP: jest.fn(),
} as unknown as jest.Mocked<ImageConverter>;

const mockProgressCallback = jest.fn() as jest.Mock<ProgressCallback>;

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
  });

  describe("integration", () => {
    it("should have processPDF method", () => {
      expect(typeof pdfProcessor.processPDF).toBe("function");
    });
  });
});
