# Testing Documentation

This document describes the testing setup and how to run tests for the TypeScript Comic Compressor project.

## Test Framework

This project uses **Jest** with **ts-jest** for testing TypeScript code.

## Running Tests

### Run all tests

```bash
npm test
```

### Run tests in watch mode

```bash
npm run test:watch
```

### Run tests with coverage report

```bash
npm run test:coverage
```

## Test Structure

Tests are located in `src/__tests__/` directory:

```
src/__tests__/
├── logger.test.ts              # Logger utility tests
├── image-converter.test.ts     # Image conversion tests
├── archive-processor.test.ts   # Archive processing tests
├── pdf-processor.test.ts       # PDF processing tests
├── processor.test.ts           # Main processor tests
└── __mocks__/                  # Mock implementations
    └── pdfjs-dist.ts          # pdfjs-dist mock
```

## Test Coverage

Current test coverage focuses on:

- **Logger**: 100% coverage - Tests all logging methods
- **ImageConverter**: 100% coverage - Tests image processing logic, format detection, and WebP conversion
- **ArchiveProcessor**: Basic integration tests
- **PDFProcessor**: Basic integration tests
- **ComicProcessor**: Basic integration tests

## Writing Tests

### Test File Naming

Test files should follow the pattern: `[module-name].test.ts`

### Example Test

```typescript
import { Logger } from "../logger";

describe("Logger", () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger();
  });

  it("should log info messages", () => {
    const spy = jest.spyOn(console, "log");
    logger.info("Test message");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("Test message"));
    spy.mockRestore();
  });
});
```

## Mocking

### External Dependencies

External dependencies are mocked using Jest's mocking capabilities:

```typescript
jest.mock("sharp");
jest.mock("fs-extra");
```

### pdfjs-dist

The `pdfjs-dist` library is mocked in `src/__tests__/__mocks__/pdfjs-dist.ts` to avoid ESM module issues during testing.

## CI/CD Integration

To integrate tests into your CI/CD pipeline:

```yaml
# Example GitHub Actions workflow
- name: Run tests
  run: npm test

- name: Generate coverage report
  run: npm run test:coverage
```

## Troubleshooting

### Common Issues

1. **Module not found errors**: Make sure all dependencies are installed with `npm install`
2. **TypeScript compilation errors**: Ensure `tsconfig.json` is properly configured
3. **Mock issues**: Check that mocks are properly set up in `beforeEach` and cleared in `afterEach`

### Debugging Tests

To debug a specific test:

```bash
# Run a specific test file
npx jest src/__tests__/logger.test.ts

# Run tests matching a pattern
npx jest --testNamePattern="should log info"

# Run with verbose output
npx jest --verbose
```

## Future Improvements

Potential areas for expanding test coverage:

1. Add integration tests with real file operations (using temporary directories)
2. Add end-to-end tests for complete file processing workflows
3. Add performance tests for large files
4. Add tests for error handling and edge cases
5. Increase coverage for archive and PDF processing modules

## Resources

- [Jest Documentation](https://jestjs.io/)
- [ts-jest Documentation](https://kulshekhar.github.io/ts-jest/)
- [Testing TypeScript Guide](https://jestjs.io/docs/getting-started#using-typescript)
