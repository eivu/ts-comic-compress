import { describe, it, expect } from "vitest";
import { ImageSkippedError } from "../src/types.js";

describe("ImageSkippedError", () => {
  it("should be an instance of Error", () => {
    const err = new ImageSkippedError("page_001.jpg", "unsupported format");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ImageSkippedError);
  });

  it("should expose the offending image name and reason", () => {
    const err = new ImageSkippedError("page_001.jpg", "unsupported format");
    expect(err.imageName).toBe("page_001.jpg");
    expect(err.reason).toBe("unsupported format");
  });

  it("should have a descriptive message that includes both fields", () => {
    const err = new ImageSkippedError("page_001.jpg", "unsupported format");
    expect(err.message).toContain("page_001.jpg");
    expect(err.message).toContain("unsupported format");
  });

  it("should set the error name to 'ImageSkippedError'", () => {
    const err = new ImageSkippedError("any.jpg", "any reason");
    expect(err.name).toBe("ImageSkippedError");
  });
});
