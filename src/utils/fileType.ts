/**
 * Centralized file-type classification shared by the upload middleware,
 * the media library, and campaign media endpoints. Keeping the
 * extension/MIME allow-list in one place means every upload entry point
 * (media.router, campaigns.router, pet-census.router) accepts and reports
 * the same set of formats.
 */

export type FileCategory = 'image' | 'video' | 'document' | 'archive' | 'other';

interface ExtInfo {
  mime: string;
  category: FileCategory;
}

// Canonical extension -> { mime, category } table. This is the source of
// truth for "what formats does BPA support" across images, documents,
// archives, and video.
const EXTENSION_MAP: Record<string, ExtInfo> = {
  // Images
  jpg: { mime: 'image/jpeg', category: 'image' },
  jpeg: { mime: 'image/jpeg', category: 'image' },
  png: { mime: 'image/png', category: 'image' },
  gif: { mime: 'image/gif', category: 'image' },
  webp: { mime: 'image/webp', category: 'image' },
  svg: { mime: 'image/svg+xml', category: 'image' },
  avif: { mime: 'image/avif', category: 'image' },
  bmp: { mime: 'image/bmp', category: 'image' },
  ico: { mime: 'image/x-icon', category: 'image' },
  heic: { mime: 'image/heic', category: 'image' },
  heif: { mime: 'image/heif', category: 'image' },
  // Video
  mp4: { mime: 'video/mp4', category: 'video' },
  webm: { mime: 'video/webm', category: 'video' },
  mov: { mime: 'video/quicktime', category: 'video' },
  m4v: { mime: 'video/x-m4v', category: 'video' },
  // Documents
  pdf: { mime: 'application/pdf', category: 'document' },
  doc: { mime: 'application/msword', category: 'document' },
  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    category: 'document',
  },
  xls: { mime: 'application/vnd.ms-excel', category: 'document' },
  xlsx: {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    category: 'document',
  },
  csv: { mime: 'text/csv', category: 'document' },
  txt: { mime: 'text/plain', category: 'document' },
  // Archives
  zip: { mime: 'application/zip', category: 'archive' },
  rar: { mime: 'application/vnd.rar', category: 'archive' },
  '7z': { mime: 'application/x-7z-compressed', category: 'archive' },
};

// Additional MIME strings different browsers/OSes/devices send for the
// same extensions above (Windows reports .rar as x-rar-compressed, iOS
// often reports HEIC/AVIF as octet-stream, some CSV exporters use
// application/csv, etc). Upload validation accepts any of these as long
// as the file's extension is also one we recognize.
const EXTRA_ALLOWED_MIME = new Set([
  'image/jpg',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
  'application/octet-stream',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/csv',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.rar',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
]);

const KNOWN_MIME_TYPES = new Set(Object.values(EXTENSION_MAP).map((i) => i.mime));

export function getExtension(nameOrUrl: string): string {
  if (!nameOrUrl) return '';
  const clean = nameOrUrl.split('?')[0].split('#')[0];
  const idx = clean.lastIndexOf('.');
  if (idx === -1) return '';
  return clean.slice(idx + 1).toLowerCase();
}

/**
 * True when the (mimeType, originalName) pair matches one of BPA's
 * supported formats. The extension is checked against EXTENSION_MAP; the
 * MIME is allowed if it's either the canonical one for that extension or
 * one of the many real-world variants clients report (EXTRA_ALLOWED_MIME).
 */
export function isAllowedUpload(mimeType: string, originalName: string): boolean {
  const ext = getExtension(originalName);
  const info = EXTENSION_MAP[ext];
  if (info) {
    if (info.category === 'image') {
      return info.mime === mimeType || EXTRA_ALLOWED_MIME.has(mimeType) || mimeType.startsWith('image/');
    }
    return info.mime === mimeType || EXTRA_ALLOWED_MIME.has(mimeType);
  }
  // No recognized extension (e.g. no extension at all) — fall back to a
  // strict MIME check against the canonical set only.
  return KNOWN_MIME_TYPES.has(mimeType);
}

export function getFileCategory(mimeType: string, nameOrUrl: string): FileCategory {
  const ext = getExtension(nameOrUrl);
  const info = EXTENSION_MAP[ext];
  if (info) return info.category;

  const mime = (mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (
    mime.includes('zip') ||
    mime.includes('rar') ||
    mime.includes('7z') ||
    mime.includes('compressed')
  ) {
    return 'archive';
  }
  if (
    mime === 'application/pdf' ||
    mime.includes('word') ||
    mime.includes('excel') ||
    mime.includes('spreadsheet') ||
    mime.startsWith('text/')
  ) {
    return 'document';
  }
  return 'other';
}

/**
 * Some clients upload with a generic/incorrect Content-Type (commonly
 * `application/octet-stream` for HEIC/AVIF/7z from mobile share sheets).
 * When we have a confident extension match, prefer the canonical MIME
 * over a generic/empty one so downstream consumers get a usable type.
 */
export function correctMimeType(mimeType: string, nameOrUrl: string): string {
  const ext = getExtension(nameOrUrl);
  const info = EXTENSION_MAP[ext];
  if (info && (!mimeType || mimeType === 'application/octet-stream')) {
    return info.mime;
  }
  return mimeType;
}

export function isSvg(mimeType: string, nameOrUrl: string): boolean {
  return mimeType === 'image/svg+xml' || getExtension(nameOrUrl) === 'svg';
}

/**
 * Magic-byte signatures for the binary raster formats we accept. Detection
 * is intentionally conservative: only formats we can reliably fingerprint
 * from the first few bytes are covered here. Text-based (SVG) and
 * container-ambiguous formats (HEIC/AVIF's ISO-BMFF `ftyp` box) are handled
 * by their own checks below rather than this table.
 */
const IMAGE_SIGNATURES: Array<{ mime: string; match: (buf: Buffer) => boolean }> = [
  {
    mime: 'image/png',
    match: (buf) =>
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a,
  },
  {
    mime: 'image/jpeg',
    match: (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  },
  {
    mime: 'image/gif',
    match: (buf) =>
      buf.length >= 6 &&
      (buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a'),
  },
  {
    mime: 'image/webp',
    match: (buf) =>
      buf.length >= 12 &&
      buf.toString('ascii', 0, 4) === 'RIFF' &&
      buf.toString('ascii', 8, 12) === 'WEBP',
  },
  {
    mime: 'image/bmp',
    match: (buf) => buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d,
  },
  {
    mime: 'image/x-icon',
    match: (buf) => buf.length >= 4 && buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00,
  },
];

/**
 * Detects HEIC/HEIF/AVIF via the ISO-BMFF `ftyp` box: bytes 4-7 are always
 * "ftyp", followed by a 4-char major brand that tells us which of the two
 * formats it actually is.
 */
function detectIsoBmffImage(buf: Buffer): string | null {
  if (buf.length < 12 || buf.toString('ascii', 4, 8) !== 'ftyp') return null;
  const brand = buf.toString('ascii', 8, 12);
  if (['avif', 'avis'].includes(brand)) return 'image/avif';
  if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return 'image/heic';
  return null;
}

/**
 * Sniffs the actual binary type of a raster image from its bytes,
 * independent of the filename/extension or client-reported Content-Type.
 * Returns null when the buffer doesn't match any known raster signature
 * (including empty/zero-byte buffers, HTML/JSON bodies, or truncated data).
 */
export function detectImageMimeFromBuffer(buf: Buffer): string | null {
  if (!buf || buf.length === 0) return null;
  for (const sig of IMAGE_SIGNATURES) {
    if (sig.match(buf)) return sig.mime;
  }
  return detectIsoBmffImage(buf);
}

export interface UploadValidationResult {
  ok: boolean;
  reason?: string;
  detectedMime?: string | null;
}

/**
 * Validates an uploaded file's *actual bytes* against the extension it
 * claims to be, for formats we can fingerprint (raster images). This is
 * the check that catches zero-byte files, truncated uploads, and
 * HTML/JSON error pages saved with an image extension — none of which the
 * filename/MIME-only `isAllowedUpload` check above can detect.
 *
 * SVG (text/XML, no binary signature) and formats outside our fingerprint
 * table (documents, archives, video) are accepted here and left to
 * `isAllowedUpload`'s extension/MIME check, since sniffing those reliably
 * would require format-specific parsers this codebase doesn't otherwise
 * need.
 */
export function validateUploadBuffer(
  buf: Buffer,
  originalName: string,
  mimeType = '',
): UploadValidationResult {
  if (!buf || buf.length === 0) {
    return { ok: false, reason: 'File is empty (0 bytes).' };
  }

  const ext = getExtension(originalName);
  const info = EXTENSION_MAP[ext];
  const isImageExt = info?.category === 'image';
  const isImageMime = mimeType.toLowerCase().startsWith('image/');
  if ((!isImageExt && !isImageMime) || isSvg(mimeType, originalName)) {
    return { ok: true };
  }

  const detected = detectImageMimeFromBuffer(buf);
  if (!detected) {
    return {
      ok: false,
      reason: `File content does not match a recognized image format${info != null ? ` (expected ${info.mime})` : ''}.`,
    };
  }
  return { ok: true, detectedMime: detected };
}

export function humanAllowedFormatsMessage(): string {
  return 'Allowed: JPG, PNG, GIF, WebP, SVG, AVIF, BMP, ICO, HEIC/HEIF images; ' +
    'MP4/WebM/MOV/M4V video; PDF, DOC/DOCX, XLS/XLSX, CSV, TXT documents; ZIP, RAR, 7Z archives.';
}

/**
 * Shape returned by `withFileMeta` — the extra, derived fields every media
 * API response should carry alongside the persisted MediaFile columns.
 */
export interface FileMeta {
  extension: string;
  fileCategory: FileCategory;
}

/**
 * Enriches a stored media record with `extension`/`fileCategory` derived
 * from its (already persisted) mimeType/filename — no schema change
 * needed since both are computable from data we already store.
 */
export function withFileMeta<
  T extends { mimeType: string; filename?: string | null; originalName?: string | null; url?: string | null },
>(file: T): T & FileMeta {
  const nameForExt = file.originalName || file.filename || file.url || '';
  return {
    ...file,
    extension: getExtension(nameForExt),
    fileCategory: getFileCategory(file.mimeType, nameForExt),
  };
}
