import sharp from 'sharp';

import {
  correctMimeType,
  detectImageMimeFromBuffer,
  getExtension,
  getFileCategory,
  isAllowedUpload,
  isSvg,
  validateUploadBuffer,
  withFileMeta,
} from '../fileType';

describe('fileType — extension parsing', () => {
  it('extracts extensions case-insensitively and ignores query strings', () => {
    expect(getExtension('photo.JPG')).toBe('jpg');
    expect(getExtension('https://cdn.example.com/media/2026/01/abc.webp?v=2')).toBe('webp');
    expect(getExtension('no-extension')).toBe('');
    expect(getExtension('')).toBe('');
  });
});

describe('fileType — isAllowedUpload', () => {
  const cases: Array<[string, string]> = [
    ['image/jpeg', 'photo.jpg'],
    ['image/png', 'photo.png'],
    ['image/gif', 'animation.gif'],
    ['image/webp', 'photo.webp'],
    ['image/svg+xml', 'icon.svg'],
    ['image/avif', 'photo.avif'],
    ['image/bmp', 'photo.bmp'],
    ['image/x-icon', 'favicon.ico'],
    ['image/heic', 'photo.heic'],
    ['image/heif', 'photo.heif'],
    ['video/mp4', 'clip.mp4'],
    ['video/webm', 'clip.webm'],
    ['video/quicktime', 'clip.mov'],
    ['application/pdf', 'doc.pdf'],
    ['application/msword', 'doc.doc'],
    [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'doc.docx',
    ],
    ['application/vnd.ms-excel', 'sheet.xls'],
    [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'sheet.xlsx',
    ],
    ['text/csv', 'data.csv'],
    ['text/plain', 'notes.txt'],
    ['application/zip', 'archive.zip'],
    ['application/vnd.rar', 'archive.rar'],
    ['application/x-7z-compressed', 'archive.7z'],
  ];

  it.each(cases)('allows %s for %s', (mime, name) => {
    expect(isAllowedUpload(mime, name)).toBe(true);
  });

  it('allows real-world MIME variants clients report for the same extension', () => {
    expect(isAllowedUpload('application/octet-stream', 'photo.heic')).toBe(true);
    expect(isAllowedUpload('application/octet-stream', 'photo.avif')).toBe(true);
    expect(isAllowedUpload('application/x-rar-compressed', 'archive.rar')).toBe(true);
    expect(isAllowedUpload('application/x-zip-compressed', 'archive.zip')).toBe(true);
    expect(isAllowedUpload('application/csv', 'data.csv')).toBe(true);
  });

  it('rejects genuinely unsupported types', () => {
    expect(isAllowedUpload('application/x-msdownload', 'installer.exe')).toBe(false);
    expect(isAllowedUpload('application/octet-stream', 'archive.tar')).toBe(false);
  });
});

describe('fileType — getFileCategory', () => {
  it('classifies every supported extension into the right bucket', () => {
    expect(getFileCategory('image/jpeg', 'a.jpg')).toBe('image');
    expect(getFileCategory('image/gif', 'a.gif')).toBe('image');
    expect(getFileCategory('image/webp', 'a.webp')).toBe('image');
    expect(getFileCategory('image/svg+xml', 'a.svg')).toBe('image');
    expect(getFileCategory('image/avif', 'a.avif')).toBe('image');
    expect(getFileCategory('image/heic', 'a.heic')).toBe('image');
    expect(getFileCategory('video/mp4', 'a.mp4')).toBe('video');
    expect(getFileCategory('video/webm', 'a.webm')).toBe('video');
    expect(getFileCategory('video/quicktime', 'a.mov')).toBe('video');
    expect(getFileCategory('application/pdf', 'a.pdf')).toBe('document');
    expect(getFileCategory('application/msword', 'a.doc')).toBe('document');
    expect(getFileCategory('text/csv', 'a.csv')).toBe('document');
    expect(getFileCategory('text/plain', 'a.txt')).toBe('document');
    expect(getFileCategory('application/zip', 'a.zip')).toBe('archive');
    expect(getFileCategory('application/vnd.rar', 'a.rar')).toBe('archive');
    expect(getFileCategory('application/x-7z-compressed', 'a.7z')).toBe('archive');
  });

  it('falls back to MIME-prefix classification when the extension is unknown', () => {
    expect(getFileCategory('image/png', 'blob')).toBe('image');
    expect(getFileCategory('video/mp4', 'blob')).toBe('video');
    expect(getFileCategory('application/octet-stream', 'blob')).toBe('other');
  });

  it('never crashes or mis-categorizes zip/rar/7z as an image', () => {
    for (const ext of ['zip', 'rar', '7z']) {
      expect(getFileCategory('application/octet-stream', `archive.${ext}`)).toBe('archive');
    }
  });
});

describe('fileType — correctMimeType', () => {
  it('replaces a generic/empty MIME with the canonical one when the extension is known', () => {
    expect(correctMimeType('application/octet-stream', 'photo.heic')).toBe('image/heic');
    expect(correctMimeType('application/octet-stream', 'photo.avif')).toBe('image/avif');
    expect(correctMimeType('', 'archive.7z')).toBe('application/x-7z-compressed');
  });

  it('leaves an already-correct or already-specific MIME untouched', () => {
    expect(correctMimeType('image/png', 'photo.png')).toBe('image/png');
    expect(correctMimeType('application/pdf', 'doc.pdf')).toBe('application/pdf');
  });
});

describe('fileType — isSvg', () => {
  it('detects SVG by MIME or extension', () => {
    expect(isSvg('image/svg+xml', 'icon.png')).toBe(true);
    expect(isSvg('application/octet-stream', 'icon.svg')).toBe(true);
    expect(isSvg('image/png', 'photo.png')).toBe(false);
  });
});

describe('fileType — withFileMeta', () => {
  it('enriches a stored media record with extension + fileCategory without mutating other fields', () => {
    const mediaFile = {
      id: 'abc-123',
      url: 'https://cdn.example.com/media/2026/01/x.webp',
      filename: 'media/2026/01/x.webp',
      originalName: 'campaign-hero.webp',
      mimeType: 'image/webp',
      sizeBytes: 12345n,
    };
    const result = withFileMeta(mediaFile);
    expect(result).toMatchObject({
      ...mediaFile,
      extension: 'webp',
      fileCategory: 'image',
    });
  });

  it('classifies a document (pdf) media record correctly', () => {
    const mediaFile = {
      id: 'doc-1',
      url: 'https://cdn.example.com/uploads/booking-slip.pdf',
      filename: 'booking-slip.pdf',
      originalName: 'booking-slip.pdf',
      mimeType: 'application/pdf',
    };
    expect(withFileMeta(mediaFile)).toMatchObject({ extension: 'pdf', fileCategory: 'document' });
  });

  it('classifies an archive (zip) media record correctly', () => {
    const mediaFile = {
      id: 'zip-1',
      url: 'https://cdn.example.com/uploads/gallery.zip',
      filename: 'gallery.zip',
      originalName: 'gallery.zip',
      mimeType: 'application/zip',
    };
    expect(withFileMeta(mediaFile)).toMatchObject({ extension: 'zip', fileCategory: 'archive' });
  });
});

describe('fileType — detectImageMimeFromBuffer (binary signature sniffing)', () => {
  it('detects a real PNG by its magic bytes', () => {
    const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    expect(detectImageMimeFromBuffer(pngSig)).toBe('image/png');
  });

  it('detects a real JPEG by its magic bytes', () => {
    const jpgSig = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectImageMimeFromBuffer(jpgSig)).toBe('image/jpeg');
  });

  it('returns null for an empty buffer', () => {
    expect(detectImageMimeFromBuffer(Buffer.alloc(0))).toBeNull();
  });

  it('returns null for HTML content', () => {
    expect(detectImageMimeFromBuffer(Buffer.from('<!DOCTYPE html><html></html>'))).toBeNull();
  });

  it('returns null for JSON content', () => {
    expect(detectImageMimeFromBuffer(Buffer.from('{"success":false,"message":"error"}'))).toBeNull();
  });

  it('returns null for unrecognized binary data', () => {
    expect(detectImageMimeFromBuffer(Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]))).toBeNull();
  });
});

describe('fileType — validateUploadBuffer', () => {
  const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  const validJpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

  it('accepts a genuine PNG with a .png extension', () => {
    expect(validateUploadBuffer(validPng, 'photo.png')).toMatchObject({
      ok: true,
      detectedMime: 'image/png',
    });
  });

  it('accepts a genuine JPG with a .jpg extension', () => {
    expect(validateUploadBuffer(validJpg, 'photo.jpg')).toMatchObject({
      ok: true,
      detectedMime: 'image/jpeg',
    });
  });

  it('rejects a zero-byte file', () => {
    const result = validateUploadBuffer(Buffer.alloc(0), 'photo.png');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/empty/i);
  });

  it('rejects HTML content saved with a .png extension', () => {
    const html = Buffer.from('<html><body>404 Not Found</body></html>');
    const result = validateUploadBuffer(html, 'photo.png');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/does not match/i);
  });

  it('rejects a JSON error body saved with a .png extension', () => {
    const json = Buffer.from(JSON.stringify({ success: false, message: 'error' }));
    const result = validateUploadBuffer(json, 'photo.png');
    expect(result.ok).toBe(false);
  });

  it('rejects a corrupt/truncated PNG (bad signature)', () => {
    const corrupt = Buffer.from([0x89, 0x50, 0x4e, 0x00, 0x00, 0x00]);
    const result = validateUploadBuffer(corrupt, 'photo.png');
    expect(result.ok).toBe(false);
  });

  it('accepts supported raster bytes even when the extension is mislabeled', () => {
    const result = validateUploadBuffer(validJpg, 'photo.png');
    expect(result).toMatchObject({ ok: true, detectedMime: 'image/jpeg' });
  });

  it('allows non-image extensions through unchanged (documents/archives are not sniffed)', () => {
    expect(validateUploadBuffer(Buffer.from('not really a pdf'), 'file.pdf')).toEqual({ ok: true });
  });

  it('allows SVG through unchanged (text-based, no binary signature)', () => {
    expect(validateUploadBuffer(Buffer.from('<svg></svg>'), 'icon.svg')).toEqual({ ok: true });
  });

  it('accepts WebP bytes with a .jpg extension and reports the detected MIME', async () => {
    const webp = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .webp()
      .toBuffer();
    expect(validateUploadBuffer(webp, 'photo.jpg')).toMatchObject({
      ok: true,
      detectedMime: 'image/webp',
    });
  });

  it('accepts AVIF bytes with a .jpg extension and reports the detected MIME', async () => {
    const avif = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 20, g: 30, b: 40 } },
    })
      .avif()
      .toBuffer();
    expect(validateUploadBuffer(avif, 'photo.jpg')).toMatchObject({
      ok: true,
      detectedMime: 'image/avif',
    });
  });
});
