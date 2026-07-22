/**
 * Centralized raster-image normalization pipeline, applied to every upload
 * that passes through `middlewares/upload.ts` (media library, campaign
 * media, pet-census photos — every route sharing that middleware). This is
 * the single place that decides what bytes actually get written to disk
 * for an image upload, so no individual controller needs its own
 * resize/re-encode logic.
 *
 * What it does, in order:
 * 1. Re-decodes the already magic-byte-validated buffer with sharp,
 *    which doubles as "verify decodable by the backend image library
 *    before serving" — a buffer that passes signature sniffing but is
 *    truncated/corrupted mid-stream fails here and is rejected.
 * 2. Applies EXIF orientation (`.rotate()` with no args auto-orients from
 *    the EXIF tag, then the tag itself is dropped from the output).
 * 3. Re-encodes to a normalized, mobile-safe output format:
 *    - PNG when the source has an alpha channel (logos, transparent art)
 *    - JPEG otherwise (photographic banners/covers/gallery images)
 *    Re-encoding through sharp with no `.withMetadata()` call strips
 *    EXIF/ICC/XMP by default — exactly the "strip problematic metadata"
 *    requirement — while `.rotate()` has already burned the correct
 *    visual orientation into the pixels first.
 * 4. Bounds both output dimensions to a sane maximum (post-rotation) so a
 *    12MP phone photo isn't stored — and later decoded on a mobile device —
 *    at full resolution for what's usually a card/banner image. The resize
 *    is applied after `.rotate()` and bounds width and height together via
 *    `fit: 'inside'`, so a swapped aspect ratio from a 90°/270° EXIF
 *    orientation can't push either axis past the cap.
 */

import sharp from 'sharp';
import { createHash } from 'crypto';

export interface ProcessedImage {
  buffer: Buffer;
  mimeType: string;
  extension: 'png' | 'jpg';
  width: number;
  height: number;
  sizeBytes: number;
  checksum: string;
}

export interface ImagePipelineOptions {
  /** Longest-edge cap in pixels. Originals larger than this are downscaled; never upscaled. */
  maxDimension?: number;
  /** JPEG quality (source has no alpha). */
  jpegQuality?: number;
}

const DEFAULT_MAX_DIMENSION = 2400;
const DEFAULT_JPEG_QUALITY = 85;

export class ImageProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageProcessingError';
  }
}

/**
 * Normalizes a raster image buffer. Throws {@link ImageProcessingError} if
 * the buffer cannot be decoded by sharp — callers should map that to a 400
 * validation error, never store the input, and never report success.
 */
export async function processImageUpload(
  input: Buffer,
  options: ImagePipelineOptions = {},
): Promise<ProcessedImage> {
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const jpegQuality = options.jpegQuality ?? DEFAULT_JPEG_QUALITY;

  let pipeline: sharp.Sharp;
  let metadata: sharp.Metadata;
  try {
    pipeline = sharp(input, { failOn: 'error' });
    metadata = await pipeline.metadata();
  } catch (e) {
    throw new ImageProcessingError(
      `Image could not be decoded: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (!metadata.width || !metadata.height) {
    throw new ImageProcessingError('Image has no readable dimensions.');
  }

  const hasAlpha = metadata.hasAlpha === true;
  const outputFormat: 'png' | 'jpeg' = hasAlpha ? 'png' : 'jpeg';

  // .rotate() (no args) auto-orients from the EXIF tag and drops it. This
  // must happen *before* the resize decision below: `metadata.width` /
  // `metadata.height` are the pre-rotation dimensions, and for orientations
  // 5-8 (90°/270° rotation) the visual width/height are swapped relative to
  // those values. Bounding a swapped axis against the un-swapped metadata
  // let one axis exceed `maxDimension` after rotation. Passing width AND
  // height into a single `fit: 'inside'` resize (rather than picking one
  // axis based on pre-rotation orientation) bounds both axes regardless of
  // any rotation applied upstream in the same pipeline.
  let working = sharp(input, { failOn: 'error' }).rotate();

  working = working.resize({
    width: maxDimension,
    height: maxDimension,
    fit: 'inside',
    withoutEnlargement: true,
  });

  working = working.toColorspace('srgb');
  working =
    outputFormat === 'png'
      ? working.png({ compressionLevel: 9 })
      // mozjpeg:true forces progressive output on this sharp/libvips build
      // regardless of an explicit progressive:false alongside it — verified
      // empirically (Command 15). Dropping mozjpeg keeps the standard
      // libjpeg encoder, where progressive:false reliably yields baseline.
      : working.jpeg({ quality: jpegQuality, progressive: false, chromaSubsampling: '4:2:0' });

  let outputBuffer: Buffer;
  let outputInfo: sharp.OutputInfo;
  try {
    const result = await working.toBuffer({ resolveWithObject: true });
    outputBuffer = result.data;
    outputInfo = result.info;
  } catch (e) {
    throw new ImageProcessingError(
      `Image could not be re-encoded: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // Re-encoding is also the final decode-verification pass: sharp will not
  // produce output bytes for a stream it can't fully decode, so reaching
  // here means the image is genuinely valid end to end.
  if (outputBuffer.length === 0) {
    throw new ImageProcessingError('Re-encoded image is empty.');
  }

  return {
    buffer: outputBuffer,
    mimeType: outputFormat === 'png' ? 'image/png' : 'image/jpeg',
    extension: outputFormat === 'png' ? 'png' : 'jpg',
    width: outputInfo.width,
    height: outputInfo.height,
    sizeBytes: outputBuffer.length,
    checksum: createHash('sha256').update(outputBuffer).digest('hex'),
  };
}
