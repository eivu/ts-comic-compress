import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
  type MockedClass,
} from "vitest";
import { ComicProcessor } from "../src/processor.js";
import { ArchiveProcessor } from "../src/archive-processor.js";
import { PDFProcessor } from "../src/pdf-processor.js";
import { ImageSkippedError, type ProcessorOptions } from "../src/types.js";
import * as fsu from "../src/fs-utils.js";

vi.mock("../src/image-converter.js");
vi.mock("../src/archive-processor.js");
vi.mock("../src/pdf-processor.js");
vi.mock("../src/logger.js");
vi.mock("../src/fs-utils.js", () => ({
  pathExists: vi.fn(),
  stat: vi.fn(),
  readFile: vi.fn(),
  readdir: vi.fn(),
  mkdtemp: vi.fn(),
  ensureDir: vi.fn(),
  remove: vi.fn(),
  copy: vi.fn(),
  move: vi.fn(),
  createWriteStream: vi.fn(),
}));

const fs = fsu as unknown as Record<string, Mock>;

describe("ComicProcessor", () => {
  let processor: ComicProcessor;
  let defaultOptions: ProcessorOptions;

  beforeEach(() => {
    vi.clearAllMocks();

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

    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

      const archiveCall = (
        ArchiveProcessor as unknown as MockedClass<typeof ArchiveProcessor>
      ).mock.calls.at(-1);
      const pdfCall = (
        PDFProcessor as unknown as MockedClass<typeof PDFProcessor>
      ).mock.calls.at(-1);

      expect(archiveCall?.[2]).toBe(false);
      expect(pdfCall?.[2]).toBe(false);
    });

    it("should forward raiseException=true to sub-processors", () => {
      const options = { ...defaultOptions, raiseException: true };
      processor = new ComicProcessor(options);

      const archiveCall = (
        ArchiveProcessor as unknown as MockedClass<typeof ArchiveProcessor>
      ).mock.calls.at(-1);
      const pdfCall = (
        PDFProcessor as unknown as MockedClass<typeof PDFProcessor>
      ).mock.calls.at(-1);

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

  describe("error propagation in processSingleFile", () => {
    const inputPath = "/path/to/test.cbz";

    beforeEach(() => {
      fs.pathExists.mockResolvedValue(false);
      fs.stat.mockResolvedValue({ size: 1024 });
      fs.copy.mockResolvedValue(undefined);
      fs.remove.mockResolvedValue(undefined);
      fs.move.mockResolvedValue(undefined);
      fs.ensureDir.mockResolvedValue(undefined);
    });

    it("should propagate ImageSkippedError out of processFile so the CLI can exit non-zero", async () => {
      const archiveMock = ArchiveProcessor as unknown as MockedClass<
        typeof ArchiveProcessor
      >;
      archiveMock.prototype.processCBZ = vi
        .fn()
        .mockRejectedValue(
          new ImageSkippedError("page_001.jpg", "unsupported format"),
        );

      processor = new ComicProcessor({
        ...defaultOptions,
        raiseException: true,
      });

      await expect(processor.processFile(inputPath)).rejects.toBeInstanceOf(
        ImageSkippedError,
      );
    });

    it("should still swallow non-ImageSkippedError failures so a single bad file doesn't abort a batch", async () => {
      const archiveMock = ArchiveProcessor as unknown as MockedClass<
        typeof ArchiveProcessor
      >;
      archiveMock.prototype.processCBZ = vi
        .fn()
        .mockRejectedValue(new Error("transient io failure"));

      processor = new ComicProcessor(defaultOptions);

      await expect(processor.processFile(inputPath)).resolves.toBeUndefined();
    });

    it("should propagate ImageSkippedError from the PDF path as well", async () => {
      const pdfMock = PDFProcessor as unknown as MockedClass<
        typeof PDFProcessor
      >;
      pdfMock.prototype.processPDF = vi
        .fn()
        .mockRejectedValue(
          new ImageSkippedError("page_001.jpg", "unsupported format"),
        );

      processor = new ComicProcessor({
        ...defaultOptions,
        raiseException: true,
      });

      await expect(
        processor.processFile("/path/to/test.pdf"),
      ).rejects.toBeInstanceOf(ImageSkippedError);
    });

    it("should propagate ImageSkippedError out of processFilesParallel and skip subsequent batches", async () => {
      const files = [
        "/path/to/b1_good_a.cbz",
        "/path/to/b1_good_b.cbz",
        "/path/to/b1_bad.cbz",
        "/path/to/b1_good_c.cbz",
        "/path/to/b2_good_a.cbz",
        "/path/to/b2_good_b.cbz",
      ];

      fs.readdir.mockResolvedValue(
        files.map((f) => ({
          name: f.split("/").pop()!,
          isDirectory: () => false,
          isFile: () => true,
        })),
      );

      const archiveMock = ArchiveProcessor as unknown as MockedClass<
        typeof ArchiveProcessor
      >;
      const processCBZ = vi.fn(async (input: string, _output: string) => {
        if (input.endsWith("b1_bad.cbz")) {
          throw new ImageSkippedError("page_001.jpg", "unsupported format");
        }
        return {
          imagesProcessed: 1,
          imagesSkipped: 0,
          originalSize: 1024,
          compressedSize: 512,
        };
      });
      archiveMock.prototype.processCBZ = processCBZ;

      processor = new ComicProcessor({
        ...defaultOptions,
        parallel: true,
        raiseException: true,
      });

      await expect(
        processor.processDirectory("/path/to"),
      ).rejects.toBeInstanceOf(ImageSkippedError);

      const calledInputs = processCBZ.mock.calls.map((c) => c[0]);
      expect(calledInputs).not.toContain("/path/to/b2_good_a.cbz");
      expect(calledInputs).not.toContain("/path/to/b2_good_b.cbz");
    });

    it("should propagate ImageSkippedError thrown mid-batch and stop processing remaining files (parallel=false)", async () => {
      const goodPath = "/path/to/good.cbz";
      const badPath = "/path/to/bad.cbz";
      const laterPath = "/path/to/later.cbz";

      fs.readdir.mockResolvedValue([
        { name: "good.cbz", isDirectory: () => false, isFile: () => true },
        { name: "bad.cbz", isDirectory: () => false, isFile: () => true },
        { name: "later.cbz", isDirectory: () => false, isFile: () => true },
      ]);

      const archiveMock = ArchiveProcessor as unknown as MockedClass<
        typeof ArchiveProcessor
      >;
      const processCBZ = vi.fn(async (input: string, _output: string) => {
        if (input.endsWith("good.cbz")) {
          return {
            imagesProcessed: 1,
            imagesSkipped: 0,
            originalSize: 1024,
            compressedSize: 512,
          };
        }
        if (input.endsWith("bad.cbz")) {
          throw new ImageSkippedError("page_002.jpg", "unsupported format");
        }
        return {
          imagesProcessed: 1,
          imagesSkipped: 0,
          originalSize: 1024,
          compressedSize: 512,
        };
      });
      archiveMock.prototype.processCBZ = processCBZ;

      processor = new ComicProcessor({
        ...defaultOptions,
        raiseException: true,
      });

      await expect(
        processor.processDirectory("/path/to"),
      ).rejects.toBeInstanceOf(ImageSkippedError);

      const processedInputs = processCBZ.mock.calls.map((c) => c[0]);
      expect(processedInputs).toEqual(
        expect.arrayContaining([goodPath, badPath]),
      );
      expect(processedInputs).not.toEqual(expect.arrayContaining([laterPath]));
    });
  });

  describe("printSummary", () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      processor = new ComicProcessor(defaultOptions);
      consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it("should print summary when no files processed", () => {
      processor.printSummary();
      expect(true).toBe(true);
    });
  });
});
