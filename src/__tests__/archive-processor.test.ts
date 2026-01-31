import { ArchiveProcessor } from "../archive-processor";
import { ImageConverter } from "../image-converter";
import { ProgressCallback } from "../types";

// Mock dependencies
jest.mock("../image-converter");

const mockImageConverter = {
  shouldProcess: jest.fn(),
  convertToWebP: jest.fn(),
} as unknown as jest.Mocked<ImageConverter>;

const mockProgressCallback = jest.fn() as jest.Mock<ProgressCallback>;

describe("ArchiveProcessor", () => {
  let archiveProcessor: ArchiveProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    archiveProcessor = new ArchiveProcessor(
      mockImageConverter,
      mockProgressCallback,
    );
  });

  describe("constructor", () => {
    it("should create an instance", () => {
      expect(archiveProcessor).toBeInstanceOf(ArchiveProcessor);
    });

    it("should accept image converter and progress callback", () => {
      const processor = new ArchiveProcessor(
        mockImageConverter,
        mockProgressCallback,
      );
      expect(processor).toBeDefined();
    });
  });

  describe("integration", () => {
    it("should have processCBZ method", () => {
      expect(typeof archiveProcessor.processCBZ).toBe("function");
    });

    it("should have processCBR method", () => {
      expect(typeof archiveProcessor.processCBR).toBe("function");
    });

    it("should have processRAR method", () => {
      expect(typeof archiveProcessor.processRAR).toBe("function");
    });
  });
});
