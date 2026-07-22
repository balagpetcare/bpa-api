import multer, { FileFilterCallback } from 'multer';
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import {
  getFileCategory,
  humanAllowedFormatsMessage,
  isAllowedUpload,
  isSvg,
  validateUploadBuffer,
} from '../utils/fileType';
import { ImageProcessingError, processImageUpload } from '../utils/imagePipeline';

// Default limits
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB for images/documents
const MAX_VIDEO_SIZE = (process.env.MAX_VIDEO_UPLOAD_MB ? parseInt(process.env.MAX_VIDEO_UPLOAD_MB, 10) : 200) * 1024 * 1024; // Default to 200 MB for videos

function isVideoMime(mime: string, originalName: string): boolean {
  return getFileCategory(mime, originalName) === 'video';
}

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
): void {
  if (isAllowedUpload(file.mimetype, file.originalname)) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        400,
        'UNSUPPORTED_MEDIA_TYPE',
        `File type "${file.mimetype}" is not allowed. ${humanAllowedFormatsMessage()}`,
      ),
    );
  }
}

const storage = multer.memoryStorage();

// Set multer statically to the maximum threshold (video size)
// We will down-enforce the 25MB limit for non-videos inside the middleware wrapper.
const multerSingle = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_VIDEO_SIZE },
}).single('file');

const multerMultiple = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_VIDEO_SIZE, files: 20 },
}).array('files', 20);

// Helper to check and map multer errors to clean 400 AppError
function handleMulterError(err: any): any {
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const maxVideoMb = process.env.MAX_VIDEO_UPLOAD_MB ? parseInt(process.env.MAX_VIDEO_UPLOAD_MB, 10) : 200;
      return new AppError(
        400,
        'LIMIT_FILE_SIZE',
        `File size exceeds the limit. Max allowed is ${maxVideoMb}MB for videos and 25MB for images/documents.`,
      );
    }
    return new AppError(400, 'UPLOAD_ERROR', `File upload error: ${err.message}`);
  }
  return err;
}

/**
 * Runs the centralized normalization pipeline on a single multer file when
 * it's a raster image (skips SVG — vector, not sniffable/re-encodable by
 * sharp — and non-image categories like video/document/archive, which are
 * stored as-is). Mutates the multer file object in place so every
 * downstream consumer (storage.service, media.service, campaign media,
 * pet-census) transparently gets the normalized bytes/filename/mimetype
 * without needing its own processing step.
 *
 * Throws {@link AppError} (400) if the file claims to be a raster image but
 * sharp cannot decode/re-encode it — that's the "never save an invalid
 * upload and then return success" guarantee.
 */
async function normalizeIfRasterImage(file: Express.Multer.File): Promise<void> {
  const category = getFileCategory(file.mimetype, file.originalname);
  if (category !== 'image' || isSvg(file.mimetype, file.originalname)) return;

  try {
    const processed = await processImageUpload(file.buffer);
    const baseName = file.originalname.replace(/\.[^./\\]+$/, '') || 'image';
    file.buffer = processed.buffer;
    file.mimetype = processed.mimeType;
    file.size = processed.sizeBytes;
    file.originalname = `${baseName}.${processed.extension}`;
  } catch (e) {
    if (e instanceof ImageProcessingError) {
      throw new AppError(400, 'INVALID_FILE_CONTENT', `File "${file.originalname}": ${e.message}`);
    }
    throw e;
  }
}

export function uploadSingle(req: Request, res: Response, next: NextFunction): void {
  multerSingle(req, res, async (err) => {
    if (err) {
      return next(handleMulterError(err));
    }

    try {
      if (req.file) {
        const mime = req.file.mimetype;
        if (!isVideoMime(mime, req.file.originalname) && req.file.size > MAX_FILE_SIZE) {
          return next(
            new AppError(
              400,
              'LIMIT_FILE_SIZE',
              `File size exceeds the limit. Images and documents must be smaller than 25MB.`,
            ),
          );
        }

        const validation = validateUploadBuffer(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype,
        );
        if (!validation.ok) {
          return next(new AppError(400, 'INVALID_FILE_CONTENT', validation.reason!));
        }
        if (validation.detectedMime != null) {
          req.file.mimetype = validation.detectedMime;
        }

        await normalizeIfRasterImage(req.file);
      }

      next();
    } catch (e) {
      next(e);
    }
  });
}

export function uploadMultiple(req: Request, res: Response, next: NextFunction): void {
  multerMultiple(req, res, async (err) => {
    if (err) {
      return next(handleMulterError(err));
    }

    try {
      if (req.files && Array.isArray(req.files)) {
        for (const file of req.files) {
          const mime = file.mimetype;
          if (!isVideoMime(mime, file.originalname) && file.size > MAX_FILE_SIZE) {
            return next(
              new AppError(
                400,
                'LIMIT_FILE_SIZE',
                `File "${file.originalname}" exceeds the size limit. Images and documents must be smaller than 25MB.`,
              ),
            );
          }

          const validation = validateUploadBuffer(
            file.buffer,
            file.originalname,
            file.mimetype,
          );
          if (!validation.ok) {
            return next(
              new AppError(400, 'INVALID_FILE_CONTENT', `File "${file.originalname}": ${validation.reason}`),
            );
          }
          if (validation.detectedMime != null) {
            file.mimetype = validation.detectedMime;
          }

          await normalizeIfRasterImage(file);
        }
      }

      next();
    } catch (e) {
      next(e);
    }
  });
}
