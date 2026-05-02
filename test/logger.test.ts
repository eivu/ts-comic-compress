import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { Logger } from "../src/logger.js";
import chalk from "chalk";

describe("Logger", () => {
  let logger: Logger;
  let consoleErrorSpy: MockInstance;
  let consoleLogSpy: MockInstance;
  let consoleWarnSpy: MockInstance;

  beforeEach(() => {
    logger = new Logger();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe("error", () => {
    it("should log error messages with red color and error emoji", () => {
      const message = "Test error message";
      logger.error(message);
      expect(consoleErrorSpy).toHaveBeenCalledWith(chalk.red(`❌ ${message}`));
    });
  });

  describe("info", () => {
    it("should log info messages with blue color and info emoji", () => {
      const message = "Test info message";
      logger.info(message);
      expect(consoleLogSpy).toHaveBeenCalledWith(chalk.blue(`ℹ️  ${message}`));
    });
  });

  describe("success", () => {
    it("should log success messages with green color and success emoji", () => {
      const message = "Test success message";
      logger.success(message);
      expect(consoleLogSpy).toHaveBeenCalledWith(chalk.green(`✅ ${message}`));
    });
  });

  describe("warn", () => {
    it("should log warning messages with yellow color and warning emoji", () => {
      const message = "Test warning message";
      logger.warn(message);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        chalk.yellow(`⚠️  ${message}`),
      );
    });
  });

  describe("log", () => {
    it("should log plain messages without color", () => {
      const message = "Test plain message";
      logger.log(message);
      expect(consoleLogSpy).toHaveBeenCalledWith(message);
    });
  });
});
