import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
  type Mock,
} from "vitest";
import { ArchiveProcessor } from "../src/archive-processor.js";
import { ImageConverter } from "../src/image-converter.js";
import { ImageSkippedError, type ProgressCallback } from "../src/types.js";
import * as path from "node:path";

import * as fsu from "../src/fs-utils.js";
import * as nodeUnrar from "node-unrar-js";

const { tmpdirMock } = vi.hoisted(() => ({
  tmpdirMock: vi.fn<() => string>(() => "/tmp"),
}));

vi.mock("../src/image-converter.js");
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
vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return {
    ...actual,
    tmpdir: tmpdirMock,
    default: { ...actual, tmpdir: tmpdirMock },
  };
});
vi.mock("node-unrar-js", () => ({
  createExtractorFromData: vi.fn(),
  createExtractorFromFile: vi.fn(),
}));

const fs = fsu as unknown as Record<string, Mock>;
const createExtractorFromDataMock =
  nodeUnrar.createExtractorFromData as unknown as Mock;
const createExtractorFromFileMock =
  nodeUnrar.createExtractorFromFile as unknown as Mock;

const mockImageConverter = {
  shouldProcess: vi.fn(),
  convertToWebP: vi.fn(),
} as unknown as ImageConverter & {
  shouldProcess: Mock;
  convertToWebP: Mock;
};

const mockProgressCallback = vi.fn() as unknown as ProgressCallback;

function createMockWriteStream(): {
  on: Mock;
  once: Mock;
  emit: Mock;
  write: Mock;
  end: Mock;
  destroy: Mock;
  pipe: Mock;
} {
  const stream: {
    on: Mock;
    once: Mock;
    emit: Mock;
    write: Mock;
    end: Mock;
    destroy: Mock;
    pipe: Mock;
  } = {
    on: vi.fn(),
    once: vi.fn(),
    emit: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    destroy: vi.fn(),
    pipe: vi.fn(),
  };
  stream.on.mockImplementation((event: string, callback: () => void) => {
    if (event === "close") {
      callback();
    }
    return stream;
  });
  stream.once.mockImplementation(() => stream);
  return stream;
}

describe("ArchiveProcessor", () => {
  let archiveProcessor: ArchiveProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpdirMock.mockReturnValue("/tmp");
    mockImageConverter.shouldProcess = vi.fn();
    mockImageConverter.convertToWebP = vi.fn();
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

  describe("processRAR", () => {
    const mockInputPath = "/path/to/test.rar";
    const mockOutputPath = "/path/to/output.cbz";
    const mockTempDir = "/tmp/rar-extract-test123";

    beforeEach(() => {
      vi.clearAllMocks();
      tmpdirMock.mockReturnValue("/tmp");

      fs.mkdtemp.mockResolvedValue(mockTempDir);
      fs.ensureDir.mockResolvedValue(undefined);
      fs.stat.mockResolvedValue({ size: 1000 });
      fs.remove.mockResolvedValue(undefined);

      mockImageConverter.shouldProcess = vi.fn().mockResolvedValue(false);
      mockImageConverter.convertToWebP = vi.fn();
    });

    it("should use in-memory extraction for files under 2GB", async () => {
      fs.stat.mockResolvedValueOnce({ size: 1024 * 1024 * 1024 });

      const mockBuffer = Buffer.from("mock rar data");
      fs.readFile.mockResolvedValue(mockBuffer);

      const mockExtractor = {
        getFileList: vi.fn().mockReturnValue({
          fileHeaders: [
            { name: "image1.jpg", flags: { directory: false } },
            { name: "image2.jpg", flags: { directory: false } },
          ],
        }),
        extract: vi.fn().mockReturnValue({
          files: [
            {
              fileHeader: { name: "image1.jpg", flags: { directory: false } },
              extraction: new Uint8Array([1, 2, 3]),
            },
            {
              fileHeader: { name: "image2.jpg", flags: { directory: false } },
              extraction: new Uint8Array([4, 5, 6]),
            },
          ],
        }),
      };

      createExtractorFromDataMock.mockResolvedValue(mockExtractor);

      fs.createWriteStream.mockReturnValue(createMockWriteStream());

      await archiveProcessor.processRAR(mockInputPath, mockOutputPath);

      expect(createExtractorFromDataMock).toHaveBeenCalled();
      expect(fs.mkdtemp).not.toHaveBeenCalled();
      expect(fs.remove).not.toHaveBeenCalled();
    });

    it("should use file-based extraction for files over 2GB", async () => {
      const TWO_GB = 2 * 1024 * 1024 * 1024;
      fs.stat
        .mockResolvedValueOnce({ size: TWO_GB + 1 })
        .mockResolvedValue({ size: 1000 });

      const mockExtractor = {
        getFileList: vi.fn().mockReturnValue({
          fileHeaders: [
            { name: "image1.jpg", flags: { directory: false } },
            { name: "image2.jpg", flags: { directory: false } },
          ],
        }),
        extract: vi.fn().mockReturnValue({
          files: [
            {
              fileHeader: { name: "image1.jpg", flags: { directory: false } },
              extraction: null,
            },
            {
              fileHeader: { name: "image2.jpg", flags: { directory: false } },
              extraction: null,
            },
          ],
        }),
      };

      createExtractorFromFileMock.mockResolvedValue(mockExtractor);

      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockResolvedValue(Buffer.from("mock image data"));
      fs.createWriteStream.mockReturnValue(createMockWriteStream());

      await archiveProcessor.processRAR(mockInputPath, mockOutputPath);

      expect(createExtractorFromFileMock).toHaveBeenCalledWith({
        filepath: mockInputPath,
        targetPath: mockTempDir,
      });

      expect(fs.mkdtemp).toHaveBeenCalledWith(
        path.join("/tmp", "rar-extract-"),
      );

      expect(fs.pathExists).toHaveBeenCalledTimes(2);
      expect(fs.readFile).toHaveBeenCalledWith(
        path.join(mockTempDir, "image1.jpg"),
      );
      expect(fs.readFile).toHaveBeenCalledWith(
        path.join(mockTempDir, "image2.jpg"),
      );

      expect(fs.remove).toHaveBeenCalledWith(mockTempDir);
    });

    it("should clean up temp directory even if extraction fails", async () => {
      const TWO_GB = 2 * 1024 * 1024 * 1024;
      fs.stat.mockResolvedValue({ size: TWO_GB + 1 });

      const mockExtractor = {
        getFileList: vi.fn().mockImplementation(() => {
          throw new Error("Extraction failed");
        }),
      };

      createExtractorFromFileMock.mockResolvedValue(mockExtractor);

      await expect(
        archiveProcessor.processRAR(mockInputPath, mockOutputPath),
      ).rejects.toThrow("Extraction failed");

      expect(fs.remove).toHaveBeenCalledWith(mockTempDir);
    });

    it("should report extraction progress to stdout when no callback provided", async () => {
      const processorWithoutCallback = new ArchiveProcessor(
        mockImageConverter,
      );

      const TWO_GB = 2 * 1024 * 1024 * 1024;
      fs.stat
        .mockResolvedValueOnce({ size: TWO_GB + 1 })
        .mockResolvedValue({ size: 1000 });

      const mockExtractor = {
        getFileList: vi.fn().mockReturnValue({
          fileHeaders: [
            { name: "image1.jpg", flags: { directory: false } },
            { name: "image2.jpg", flags: { directory: false } },
            { name: "image3.jpg", flags: { directory: false } },
          ],
        }),
        extract: vi.fn().mockReturnValue({
          files: [
            {
              fileHeader: { name: "image1.jpg", flags: { directory: false } },
              extraction: null,
            },
            {
              fileHeader: { name: "image2.jpg", flags: { directory: false } },
              extraction: null,
            },
            {
              fileHeader: { name: "image3.jpg", flags: { directory: false } },
              extraction: null,
            },
          ],
        }),
      };

      createExtractorFromFileMock.mockResolvedValue(mockExtractor);
      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockResolvedValue(Buffer.from("mock image data"));
      fs.createWriteStream.mockReturnValue(createMockWriteStream());

      const stdoutSpy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);

      await processorWithoutCallback.processRAR(mockInputPath, mockOutputPath);

      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining("Extracting image 1/3"),
      );
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining("Extracting image 2/3"),
      );
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining("Extracting image 3/3"),
      );

      stdoutSpy.mockRestore();
    });

    it("should show extraction status even when callback is provided", async () => {
      const TWO_GB = 2 * 1024 * 1024 * 1024;
      fs.stat
        .mockResolvedValueOnce({ size: TWO_GB + 1 })
        .mockResolvedValue({ size: 1000 });

      const mockExtractor = {
        getFileList: vi.fn().mockReturnValue({
          fileHeaders: [
            { name: "image1.jpg", flags: { directory: false } },
            { name: "image2.jpg", flags: { directory: false } },
          ],
        }),
        extract: vi.fn().mockReturnValue({
          files: [
            {
              fileHeader: { name: "image1.jpg", flags: { directory: false } },
              extraction: null,
            },
            {
              fileHeader: { name: "image2.jpg", flags: { directory: false } },
              extraction: null,
            },
          ],
        }),
      };

      createExtractorFromFileMock.mockResolvedValue(mockExtractor);
      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockResolvedValue(Buffer.from("mock image data"));
      fs.createWriteStream.mockReturnValue(createMockWriteStream());

      const stdoutSpy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);

      await archiveProcessor.processRAR(mockInputPath, mockOutputPath);

      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining("Opening RAR archive"),
      );
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining("Analyzing archive contents"),
      );
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining("Found 2 image files"),
      );

      stdoutSpy.mockRestore();
    });

    it("should return empty result when no image files found", async () => {
      fs.stat.mockResolvedValue({ size: 1024 });
      fs.readFile.mockResolvedValue(Buffer.from("mock data"));

      const mockExtractor = {
        getFileList: vi.fn().mockReturnValue({
          fileHeaders: [{ name: "readme.txt", flags: { directory: false } }],
        }),
      };

      createExtractorFromDataMock.mockResolvedValue(mockExtractor);

      const result = await archiveProcessor.processRAR(
        mockInputPath,
        mockOutputPath,
      );

      expect(result).toEqual({
        imagesProcessed: 0,
        imagesSkipped: 0,
        originalSize: 0,
        compressedSize: 0,
      });
    });
  });

  describe("raiseException option", () => {
    const mockInputPath = "/path/to/test.rar";
    const mockOutputPath = "/path/to/output.cbz";

    beforeEach(() => {
      vi.clearAllMocks();
      tmpdirMock.mockReturnValue("/tmp");
      fs.mkdtemp.mockResolvedValue("/tmp/rar-extract-test123");
      fs.ensureDir.mockResolvedValue(undefined);
      fs.stat.mockResolvedValue({ size: 1024 * 1024 * 1024 });
      fs.remove.mockResolvedValue(undefined);
      fs.readFile.mockResolvedValue(Buffer.from("mock rar data"));
      fs.createWriteStream.mockReturnValue(createMockWriteStream());

      mockImageConverter.shouldProcess = vi.fn();
      mockImageConverter.convertToWebP = vi.fn();
    });

    function buildExtractorWithImages(names: string[]) {
      const headers = names.map((name) => ({
        name,
        flags: { directory: false },
      }));
      const files = names.map((name, idx) => ({
        fileHeader: { name, flags: { directory: false } },
        extraction: new Uint8Array([idx + 1, idx + 2, idx + 3]),
      }));
      const mockExtractor = {
        getFileList: vi.fn().mockReturnValue({ fileHeaders: headers }),
        extract: vi.fn().mockReturnValue({ files }),
      };
      createExtractorFromDataMock.mockResolvedValue(mockExtractor);
      return mockExtractor;
    }

    it("should not throw when raiseException is false and image is skipped", async () => {
      buildExtractorWithImages(["image1.jpg", "image2.jpg"]);
      mockImageConverter.shouldProcess.mockResolvedValue(false);

      const processor = new ArchiveProcessor(
        mockImageConverter,
        mockProgressCallback,
        false,
      );

      const result = await processor.processRAR(mockInputPath, mockOutputPath);

      expect(result.imagesProcessed).toBe(0);
      expect(result.imagesSkipped).toBe(2);
    });

    it("should throw ImageSkippedError when raiseException is true and an image is skipped", async () => {
      buildExtractorWithImages(["image1.jpg", "image2.jpg"]);
      mockImageConverter.shouldProcess.mockResolvedValue(false);

      const processor = new ArchiveProcessor(
        mockImageConverter,
        mockProgressCallback,
        true,
      );

      await expect(
        processor.processRAR(mockInputPath, mockOutputPath),
      ).rejects.toThrow(ImageSkippedError);
    });

    it("should include the offending image name in the thrown error", async () => {
      buildExtractorWithImages(["page_001.jpg", "page_002.jpg"]);
      mockImageConverter.shouldProcess.mockResolvedValue(false);

      const processor = new ArchiveProcessor(
        mockImageConverter,
        mockProgressCallback,
        true,
      );

      await expect(
        processor.processRAR(mockInputPath, mockOutputPath),
      ).rejects.toMatchObject({
        name: "ImageSkippedError",
        imageName: "page_001.jpg",
      });
    });

    it("should not throw when all images are processable even with raiseException=true", async () => {
      buildExtractorWithImages(["image1.jpg", "image2.jpg"]);
      mockImageConverter.shouldProcess.mockResolvedValue(true);
      mockImageConverter.convertToWebP.mockResolvedValue(Buffer.from("webp"));

      const processor = new ArchiveProcessor(
        mockImageConverter,
        mockProgressCallback,
        true,
      );

      const result = await processor.processRAR(mockInputPath, mockOutputPath);

      expect(result.imagesProcessed).toBe(2);
      expect(result.imagesSkipped).toBe(0);
    });

    it("should throw on the first skipped image and stop processing the rest", async () => {
      buildExtractorWithImages(["image1.jpg", "image2.jpg", "image3.jpg"]);
      mockImageConverter.shouldProcess
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false);
      mockImageConverter.convertToWebP.mockResolvedValue(Buffer.from("webp"));

      const processor = new ArchiveProcessor(
        mockImageConverter,
        mockProgressCallback,
        true,
      );

      await expect(
        processor.processRAR(mockInputPath, mockOutputPath),
      ).rejects.toMatchObject({
        name: "ImageSkippedError",
        imageName: "image2.jpg",
      });

      expect(mockImageConverter.shouldProcess).toHaveBeenCalledTimes(2);
    });

    it("should default raiseException to false when omitted", async () => {
      buildExtractorWithImages(["image1.jpg"]);
      mockImageConverter.shouldProcess.mockResolvedValue(false);

      const processor = new ArchiveProcessor(
        mockImageConverter,
        mockProgressCallback,
      );

      await expect(
        processor.processRAR(mockInputPath, mockOutputPath),
      ).resolves.toMatchObject({ imagesSkipped: 1 });
    });
  });
});
