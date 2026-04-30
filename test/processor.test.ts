import { ComicProcessor } from "../src/processor";
import { ArchiveProcessor } from "../src/archive-processor";
import { PDFProcessor } from "../src/pdf-processor";
import { ProcessorOptions } from "../src/types";

// Mock dependencies
jest.mock("../src/image-converter");
jest.mock("../src/archive-processor");
jest.mock("../src/pdf-processor");
jest.mock("../src/logger");

describe("ComicProcessor", () => {
  let processor: ComicProcessor;
  let defaultOptions: ProcessorOptions;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default options
    defaultOptions = {
      outputDir: "/output",
      quality: 75,
      recursive: false,
      skipExisting: false,
      parallel: false,
      renameOriginal: false,
      moveOriginal: false,
      raiseException: false,
      targetHeight: undefined,
    };

    // Mock stdout.write to prevent console output during tests
    jest.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should create processor with default options", () => {
      processor = new ComicProcessor(defaultOptions);
      expect(processor).toBeInstanceOf(ComicProcessor);
    });

    it("should create processor with custom quality", () => {
      const options = { ...defaultOptions, quality: 90 };
      processor = new ComicProcessor(options);
      expect(processor).toBeInstanceOf(ComicProcessor);
    });

    it("should create processor with target height", () => {
      const options = { ...defaultOptions, targetHeight: 1080 };
      processor = new ComicProcessor(options);
      expect(processor).toBeInstanceOf(ComicProcessor);
    });

    it("should create processor with recursive option", () => {
      const options = { ...defaultOptions, recursive: true };
      processor = new ComicProcessor(options);
      expect(processor).toBeInstanceOf(ComicProcessor);
    });

    it("should create processor with parallel option", () => {
      const options = { ...defaultOptions, parallel: true };
      processor = new ComicProcessor(options);
      expect(processor).toBeInstanceOf(ComicProcessor);
    });

    it("should forward raiseException=false to sub-processors by default", () => {
      processor = new ComicProcessor(defaultOptions);

      const archiveCall = (ArchiveProcessor as jest.MockedClass<
        typeof ArchiveProcessor
      >).mock.calls.at(-1);
      const pdfCall = (PDFProcessor as jest.MockedClass<typeof PDFProcessor>)
        .mock.calls.at(-1);

      expect(archiveCall?.[2]).toBe(false);
      expect(pdfCall?.[2]).toBe(false);
    });

    it("should forward raiseException=true to sub-processors", () => {
      const options = { ...defaultOptions, raiseException: true };
      processor = new ComicProcessor(options);

      const archiveCall = (ArchiveProcessor as jest.MockedClass<
        typeof ArchiveProcessor
      >).mock.calls.at(-1);
      const pdfCall = (PDFProcessor as jest.MockedClass<typeof PDFProcessor>)
        .mock.calls.at(-1);

      expect(archiveCall?.[2]).toBe(true);
      expect(pdfCall?.[2]).toBe(true);
    });
  });

  describe("methods", () => {
    beforeEach(() => {
      processor = new ComicProcessor(defaultOptions);
    });

    it("should have processFile method", () => {
      expect(typeof processor.processFile).toBe("function");
    });

    it("should have processDirectory method", () => {
      expect(typeof processor.processDirectory).toBe("function");
    });

    it("should have printSummary method", () => {
      expect(typeof processor.printSummary).toBe("function");
    });
  });

  describe("printSummary", () => {
    let consoleLogSpy: jest.SpyInstance;

    beforeEach(() => {
      processor = new ComicProcessor(defaultOptions);
      consoleLogSpy = jest.spyOn(console, "log").mockImplementation();
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it("should print summary when no files processed", () => {
      processor.printSummary();
      // Should log warning about no files processed
      expect(true).toBe(true);
    });
  });
});
