import sharp from 'sharp';
import { ImageProcessingError, processImageUpload } from '../imagePipeline';

async function makePng(opts: { width: number; height: number; alpha?: boolean }): Promise<Buffer> {
  return sharp({
    create: {
      width: opts.width,
      height: opts.height,
      channels: opts.alpha ? 4 : 3,
      background: opts.alpha ? { r: 10, g: 20, b: 30, alpha: 0 } : { r: 10, g: 20, b: 30 },
    },
  })
    .png()
    .toBuffer();
}

async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .jpeg()
    .toBuffer();
}

async function makeProgressiveJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .jpeg({ progressive: true })
    .toBuffer();
}

async function makeWebp(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 20, g: 40, b: 60 } },
  })
    .webp()
    .toBuffer();
}

async function makeAvif(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 30, g: 60, b: 90 } },
  })
    .avif()
    .toBuffer();
}

/** EXIF-tagged JPEG whose stored (pre-rotation) dimensions are `width` x `height`,
 * with an orientation tag that requires a 90°/270° visual rotation. */
async function makeExifRotatedJpeg(
  width: number,
  height: number,
  orientation: number,
): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 60, g: 120, b: 180 } },
  })
    .withMetadata({ orientation })
    .jpeg()
    .toBuffer();
}

describe('imagePipeline — processImageUpload', () => {
  it('normalizes an opaque PNG to JPEG output', async () => {
    const input = await makePng({ width: 100, height: 80, alpha: false });
    const result = await processImageUpload(input);
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.extension).toBe('jpg');
    expect(result.width).toBe(100);
    expect(result.height).toBe(80);
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(result.checksum).toHaveLength(64);
  });

  it('preserves transparency by keeping PNG output for images with alpha', async () => {
    const input = await makePng({ width: 60, height: 60, alpha: true });
    const result = await processImageUpload(input);
    expect(result.mimeType).toBe('image/png');
    expect(result.extension).toBe('png');

    const decoded = await sharp(result.buffer).metadata();
    expect(decoded.hasAlpha).toBe(true);
  });

  it('re-encodes a JPEG (round-trips through the pipeline unchanged in format)', async () => {
    const input = await makeJpeg(120, 90);
    const result = await processImageUpload(input);
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.width).toBe(120);
    expect(result.height).toBe(90);
  });

  it('normalizes a WebP input to a mobile-safe JPEG output', async () => {
    const input = await makeWebp(120, 90);
    const result = await processImageUpload(input);
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.extension).toBe('jpg');
  });

  it('normalizes an AVIF input to a mobile-safe JPEG output', async () => {
    const input = await makeAvif(120, 90);
    const result = await processImageUpload(input);
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.extension).toBe('jpg');
  });

  it('downscales an oversized image to the configured max dimension', async () => {
    const input = await makeJpeg(4000, 2000);
    const result = await processImageUpload(input, { maxDimension: 1000 });
    expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(1000);
    // aspect ratio preserved (2:1)
    expect(result.width).toBe(1000);
    expect(result.height).toBe(500);
  });

  it('does not upscale a small image past its original size', async () => {
    const input = await makeJpeg(50, 40);
    const result = await processImageUpload(input, { maxDimension: 2000 });
    expect(result.width).toBe(50);
    expect(result.height).toBe(40);
  });

  it('rejects HTML content disguised as an image', async () => {
    const html = Buffer.from('<!DOCTYPE html><html><body>404</body></html>');
    await expect(processImageUpload(html)).rejects.toThrow(ImageProcessingError);
  });

  it('rejects a truncated/corrupt PNG', async () => {
    const validPng = await makePng({ width: 100, height: 100 });
    const truncated = validPng.subarray(0, Math.floor(validPng.length / 3));
    await expect(processImageUpload(truncated)).rejects.toThrow(ImageProcessingError);
  });

  it('rejects a zero-byte buffer', async () => {
    await expect(processImageUpload(Buffer.alloc(0))).rejects.toThrow(ImageProcessingError);
  });

  it('produces a valid, independently-decodable PNG signature and pixels for alpha input', async () => {
    const input = await makePng({ width: 32, height: 32, alpha: true });
    const result = await processImageUpload(input);
    expect(result.buffer.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    // Full pixel decode must succeed — this is the same check that
    // catches the "valid header, garbage body" class of corruption.
    const raw = await sharp(result.buffer).raw().toBuffer();
    expect(raw.length).toBeGreaterThan(0);
  });

  it('re-encodes a progressive JPEG input as baseline sRGB output', async () => {
    const input = await makeProgressiveJpeg(300, 200);
    const inputMeta = await sharp(input).metadata();
    expect(inputMeta.isProgressive).toBe(true); // sanity check on the fixture itself

    const result = await processImageUpload(input);
    const outputMeta = await sharp(result.buffer).metadata();
    expect(outputMeta.isProgressive).toBe(false);
    expect(outputMeta.space).toBe('srgb');
  });

  it('auto-rotates EXIF orientation 6 and bounds both axes to maxDimension', async () => {
    // Stored (pre-rotation) as 4000x3000; orientation 6 means a 90° CW
    // visual rotation, so the correctly-oriented image is 3000x4000.
    const input = await makeExifRotatedJpeg(4000, 3000, 6);
    const result = await processImageUpload(input, { maxDimension: 2400 });

    expect(result.width).toBeLessThanOrEqual(2400);
    expect(result.height).toBeLessThanOrEqual(2400);
    // Visual orientation after rotation is portrait (taller than wide),
    // matching the swapped 3000x4000 dimensions, not the stored 4000x3000.
    expect(result.height).toBeGreaterThan(result.width);

    // EXIF orientation tag must be dropped after being burned into pixels.
    const outputMeta = await sharp(result.buffer).metadata();
    expect(outputMeta.orientation).toBeUndefined();
  });

  it('bounds a large landscape image within 2400x2400', async () => {
    const input = await makeJpeg(5000, 2500);
    const result = await processImageUpload(input, { maxDimension: 2400 });
    expect(result.width).toBeLessThanOrEqual(2400);
    expect(result.height).toBeLessThanOrEqual(2400);
    expect(result.width).toBeGreaterThan(result.height);
  });

  it('bounds a large portrait image within 2400x2400', async () => {
    const input = await makeJpeg(2500, 5000);
    const result = await processImageUpload(input, { maxDimension: 2400 });
    expect(result.width).toBeLessThanOrEqual(2400);
    expect(result.height).toBeLessThanOrEqual(2400);
    expect(result.height).toBeGreaterThan(result.width);
  });

  it('does not enlarge a small image past the maxDimension cap', async () => {
    const input = await makeJpeg(200, 150);
    const result = await processImageUpload(input, { maxDimension: 2400 });
    expect(result.width).toBe(200);
    expect(result.height).toBe(150);
  });

  it('rejects corrupt input and never returns a storable result', async () => {
    const corrupt = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x6e, 0x6f, 0x74, 0x61, 0x6a, 0x70, 0x65, 0x67]);
    await expect(processImageUpload(corrupt)).rejects.toThrow(ImageProcessingError);
    // processImageUpload never touches disk itself — rejecting before
    // returning is the only guarantee needed for "no orphan file written",
    // since the caller (middlewares/upload.ts) only writes on success.
  });
});
