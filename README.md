# TypeScript Comic Compress

A TypeScript/Node.js command-line tool that compresses comic books (CBR or CBZ extension) by converting images to WebP format and optionally resizing them. Also supports PDF files.

This is a TypeScript port of the Rust-based [compress_comics](https://github.com/erikvullings/compress_comics) project.

## Features

- ✅ Supports CBR and CBZ comic archive formats
- ✅ Supports PDF files (converts to CBZ)
- ✅ Converts images to WebP format for better compression
- ✅ Optional image resizing (maintains aspect ratio)
- ✅ Recursive directory processing
- ✅ Parallel processing support
- ✅ Progress reporting with detailed statistics
- ✅ Skip existing files option
- ✅ Rename original files option

## Installation

```bash
npm install
npm run build
```

Or install globally:

```bash
npm install -g .
```

## Usage

```bash
npm start -- [options]
```

Or if installed globally:

```bash
comic-compress [options]
```

### Command Line Options

```
  -i, --input <FILE/FOLDER>     The file or folder to convert (required)
  -o, --output <FOLDER>         Base path of the output (will be in output/subfolders if the recursive option is enabled), default: converted_comics
  -r, --recursive               Recursively traverse the input folder (include all subfolders)
  -s, --skip                    Skip processing file if it already exists in the output folder
  -q, --quality <number>        Quality to use for the webp files (0-100), default: 75
  -p, --parallel                Run in parallel, utilizing all computing resources
  --rename-original             Rename original files to *_original instead of copying
  --height <number>             Target height for images (maintains aspect ratio). If not specified, images are not resized
  -h, --help                    Display help for command
```

### Examples

#### Process a single file:

```bash
npm start -- -i comic.cbz -o output
```

#### Process a folder recursively:

```bash
npm start -- -i ./comics -o ./compressed -r
```

#### Process with custom quality and resize:

```bash
npm start -- -i comic.cbz -o output -q 80 --height 1200
```

#### Process in parallel and skip existing files:

```bash
npm start -- -i ./comics -o ./compressed -r -p -s
```

#### Rename original files (creates backup):

```bash
npm start -- -i comic.cbz -o output --rename-original
```

## Output

The tool provides detailed progress information and a summary report:

```
📊 Processing Summary:
──────────────────────────────────────────────────
📖 Comic1.cbz: 45.2% savings (23 images processed, 2 skipped) (15.2 MB saved)
📖 Comic2.cbz: 38.7% savings (18 images processed, 1 skipped) (12.8 MB saved)

🎯 Overall Results:
   Total files processed: 2
   Total images processed: 41
   Total images skipped: 3
   Overall size reduction: 42.1%
   Original size: 125.43 MB
   Compressed size: 72.65 MB
   Space saved: 52.78 MB
```

## Technical Details

- **Language**: TypeScript/Node.js
- **Image Processing**: Sharp library (high-quality Lanczos3 resampling)
- **Compression**: WebP lossy compression with configurable quality
- **Archive Format**: ZIP-based CBZ files (universal comic reader compatibility)
- **CBR Support**: Processes ZIP-based CBR files (most CBR files are actually ZIP archives)
- **PDF Support**: Extracts embedded images from PDF files and converts to CBZ format
- **Threading**: Parallel file processing support

## Supported File Formats

### Input Formats
- **CBZ**: ZIP archives containing images
- **CBR**: RAR/ZIP archives containing images (ZIP-based CBR files are supported)
- **PDF**: PDF files with embedded images (converted to CBZ)

### Image Formats (within archives)
- **JPEG/JPG**: Converted to WebP
- **PNG**: Converted to WebP
- **WebP**: Kept as-is (skipped)

## Limitations

- Output uses ZIP compression for CBR files (maintains .cbr extension for compatibility)
- WebP format may not be supported by very old comic readers
- PDF processing only extracts embedded raster images (vector graphics are not rasterized)
- RAR-based CBR files require additional setup (most CBR files are ZIP-based and work fine)

## Building

```bash
npm run build
```

This will compile TypeScript to JavaScript in the `dist/` directory.

## Development

```bash
# Run in development mode
npm run dev -- [options]

# Watch mode (requires ts-node-dev or similar)
npm install -D ts-node-dev
ts-node-dev --respawn src/index.ts [options]
```

## Dependencies

- **commander**: Command-line argument parsing
- **sharp**: High-performance image processing and WebP conversion
- **yauzl**: ZIP file reading
- **yazl**: ZIP file writing
- **pdfjs-dist**: PDF file processing
- **fs-extra**: Enhanced file system operations
- **chalk**: Terminal colors
- **progress**: Progress bar display

## License

MIT

## Credits

Original Rust implementation: [erikvullings/compress_comics](https://github.com/erikvullings/compress_comics)

