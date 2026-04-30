import { ArchiveProcessor } from "../src/archive-processor";
import { ImageConverter } from "../src/image-converter";
import { ImageSkippedError, ProgressCallback } from "../src/types";
import * as path from "path";

// Mock dependencies
jest.mock("../src/image-converter");
jest.mock("fs-extra");
jest.mock("os");
jest.mock("node-unrar-js");

// Import mocked modules
const fs = require("fs-extra");
const os = require("os");

const mockImageConverter = {
  shouldProcess: jest.fn(),
  convertToWebP: jest.fn(),
} as unknown as jest.Mocked<ImageConverter>;

const mockProgressCallback = jest.fn() as jest.Mock<ProgressCallback>;

// Helper function to create a mock write stream
function createMockWriteStream(): any {
  const stream: any = {
    on: jest.fn((event: string, callback: any) => {
      if (event === "close") {
        callback();
      }
      return stream;
    }),
    once: jest.fn((event: string, callback: any) => {
      return stream;
    }),
    emit: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    destroy: jest.fn(),
    pipe: jest.fn(),
  };
  return stream;
}

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

  describe("processRAR", () => {
    const mockInputPath = "/path/to/test.rar";
    const mockOutputPath = "/path/to/output.cbz";
    const mockTempDir = "/tmp/rar-extract-test123";

    beforeEach(() => {
      // Reset all mocks
      jest.clearAllMocks();

      // Mock os.tmpdir
      os.tmpdir.mockReturnValue("/tmp");

      // Mock fs.mkdtemp
      fs.mkdtemp.mockResolvedValue(mockTempDir);

      // Mock fs.ensureDir
      fs.ensureDir.mockResolvedValue(undefined);

      // Mock fs.stat for output file
      fs.stat.mockResolvedValue({ size: 1000 });

      // Mock fs.remove
      fs.remove.mockResolvedValue(undefined);

      // Mock image converter
      mockImageConverter.shouldProcess.mockResolvedValue(false);
    });

    it("should use in-memory extraction for files under 2GB", async () => {
      const { createExtractorFromData } = require("node-unrar-js");

      // Mock file size under 2GB
      fs.stat.mockResolvedValueOnce({ size: 1024 * 1024 * 1024 }); // 1GB

      // Mock RAR file buffer
      const mockBuffer = Buffer.from("mock rar data");
      fs.readFile.mockResolvedValue(mockBuffer);

      // Mock extractor
      const mockExtractor = {
        getFileList: jest.fn().mockReturnValue({
          fileHeaders: [
            { name: "image1.jpg", flags: { directory: false } },
            { name: "image2.jpg", flags: { directory: false } },
          ],
        }),
        extract: jest.fn().mockReturnValue({
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

      createExtractorFromData.mockResolvedValue(mockExtractor);

      // Mock fs.createWriteStream
      fs.createWriteStream.mockReturnValue(createMockWriteStream());

      await archiveProcessor.processRAR(mockInputPath, mockOutputPath);

      // Verify in-memory extraction was used
      expect(createExtractorFromData).toHaveBeenCalled();
      expect(fs.mkdtemp).not.toHaveBeenCalled();
      expect(fs.remove).not.toHaveBeenCalled();
    });

    it("should use file-based extraction for files over 2GB", async () => {
      const { createExtractorFromFile } = require("node-unrar-js");

      // Mock file size over 2GB
      const TWO_GB = 2 * 1024 * 1024 * 1024;
      fs.stat
        .mockResolvedValueOnce({ size: TWO_GB + 1 }) // Input file
        .mockResolvedValue({ size: 1000 }); // Output file

      // Mock extractor
      const mockExtractor = {
        getFileList: jest.fn().mockReturnValue({
          fileHeaders: [
            { name: "image1.jpg", flags: { directory: false } },
            { name: "image2.jpg", flags: { directory: false } },
          ],
        }),
        extract: jest.fn().mockReturnValue({
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

      createExtractorFromFile.mockResolvedValue(mockExtractor);

      // Mock fs.pathExists
      fs.pathExists.mockResolvedValue(true);

      // Mock fs.readFile for extracted files
      fs.readFile.mockResolvedValue(Buffer.from("mock image data"));

      // Mock fs.createWriteStream
      fs.createWriteStream.mockReturnValue(createMockWriteStream());

      await archiveProcessor.processRAR(mockInputPath, mockOutputPath);

      // Verify file-based extraction was used
      expect(createExtractorFromFile).toHaveBeenCalledWith({
        filepath: mockInputPath,
        targetPath: mockTempDir,
      });

      // Verify temp directory was created
      expect(fs.mkdtemp).toHaveBeenCalledWith(
        path.join("/tmp", "rar-extract-"),
      );

      // Verify files were read from disk
      expect(fs.pathExists).toHaveBeenCalledTimes(2);
      expect(fs.readFile).toHaveBeenCalledWith(
        path.join(mockTempDir, "image1.jpg"),
      );
      expect(fs.readFile).toHaveBeenCalledWith(
        path.join(mockTempDir, "image2.jpg"),
      );

      // Verify temp directory was cleaned up
      expect(fs.remove).toHaveBeenCalledWith(mockTempDir);
    });

    it("should clean up temp directory even if extraction fails", async () => {
      const { createExtractorFromFile } = require("node-unrar-js");

      // Mock file size over 2GB
      const TWO_GB = 2 * 1024 * 1024 * 1024;
      fs.stat.mockResolvedValue({ size: TWO_GB + 1 });

      // Mock extractor that throws an error
      const mockExtractor = {
        getFileList: jest.fn().mockImplementation(() => {
          throw new Error("Extraction failed");
        }),
      };

      createExtractorFromFile.mockResolvedValue(mockExtractor);

      await expect(
        archiveProcessor.processRAR(mockInputPath, mockOutputPath),
      ).rejects.toThrow("Extraction failed");

      // Verify temp directory was still cleaned up
      expect(fs.remove).toHaveBeenCalledWith(mockTempDir);
    });

    it("should report extraction progress to stdout when no callback provided", async () => {
      const { createExtractorFromFile } = require("node-unrar-js");

      // Create processor WITHOUT progress callback
      const processorWithoutCallback = new ArchiveProcessor(
        mockImageConverter as any,
      );

      // Mock file size over 2GB
      const TWO_GB = 2 * 1024 * 1024 * 1024;
      fs.stat
        .mockResolvedValueOnce({ size: TWO_GB + 1 })
        .mockResolvedValue({ size: 1000 });

      const mockExtractor = {
        getFileList: jest.fn().mockReturnValue({
          fileHeaders: [
            { name: "image1.jpg", flags: { directory: false } },
            { name: "image2.jpg", flags: { directory: false } },
            { name: "image3.jpg", flags: { directory: false } },
          ],
        }),
        extract: jest.fn().mockReturnValue({
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

      createExtractorFromFile.mockResolvedValue(mockExtractor);
      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockResolvedValue(Buffer.from("mock image data"));
      fs.createWriteStream.mockReturnValue(createMockWriteStream());

      // Spy on process.stdout.write
      const stdoutSpy = jest
        .spyOn(process.stdout, "write")
        .mockImplementation();

      await processorWithoutCallback.processRAR(mockInputPath, mockOutputPath);

      // Verify extraction progress was displayed
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
      const { createExtractorFromFile } = require("node-unrar-js");

      // Use the default archiveProcessor which HAS a progress callback
      // Mock file size over 2GB
      const TWO_GB = 2 * 1024 * 1024 * 1024;
      fs.stat
        .mockResolvedValueOnce({ size: TWO_GB + 1 })
        .mockResolvedValue({ size: 1000 });

      const mockExtractor = {
        getFileList: jest.fn().mockReturnValue({
          fileHeaders: [
            { name: "image1.jpg", flags: { directory: false } },
            { name: "image2.jpg", flags: { directory: false } },
          ],
        }),
        extract: jest.fn().mockReturnValue({
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

      createExtractorFromFile.mockResolvedValue(mockExtractor);
      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockResolvedValue(Buffer.from("mock image data"));
      fs.createWriteStream.mockReturnValue(createMockWriteStream());

      // Spy on process.stdout.write
      const stdoutSpy = jest
        .spyOn(process.stdout, "write")
        .mockImplementation();

      await archiveProcessor.processRAR(mockInputPath, mockOutputPath);

      // Verify extraction status is shown (extraction status is always shown,
      // it's separate from and doesn't conflict with the image processing callback)
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
      const { createExtractorFromData } = require("node-unrar-js");

      // Mock small file
      fs.stat.mockResolvedValue({ size: 1024 });
      fs.readFile.mockResolvedValue(Buffer.from("mock data"));

      const mockExtractor = {
        getFileList: jest.fn().mockReturnValue({
          fileHeaders: [{ name: "readme.txt", flags: { directory: false } }],
        }),
      };

      createExtractorFromData.mockResolvedValue(mockExtractor);

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
      jest.clearAllMocks();
      os.tmpdir.mockReturnValue("/tmp");
      fs.mkdtemp.mockResolvedValue("/tmp/rar-extract-test123");
      fs.ensureDir.mockResolvedValue(undefined);
      fs.stat.mockResolvedValue({ size: 1024 * 1024 * 1024 }); // 1GB (in-memory path)
      fs.remove.mockResolvedValue(undefined);
      fs.readFile.mockResolvedValue(Buffer.from("mock rar data"));
      fs.createWriteStream.mockReturnValue(createMockWriteStream());
    });

    function buildExtractorWithImages(names: string[]) {
      const { createExtractorFromData } = require("node-unrar-js");
      const headers = names.map((name) => ({
        name,
        flags: { directory: false },
      }));
      const files = names.map((name, idx) => ({
        fileHeader: { name, flags: { directory: false } },
        extraction: new Uint8Array([idx + 1, idx + 2, idx + 3]),
      }));
      const mockExtractor = {
        getFileList: jest.fn().mockReturnValue({ fileHeaders: headers }),
        extract: jest.fn().mockReturnValue({ files }),
      };
      createExtractorFromData.mockResolvedValue(mockExtractor);
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
      // First image is processable, second is skipped, third would also be skipped
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

      // Only the first two images should have been queried; we bail after the second.
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
