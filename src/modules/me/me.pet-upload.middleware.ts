import { NextFunction, Request, Response } from 'express';
import { uploadSingle } from '../../middlewares/upload';
import { AppError } from '../../utils/AppError';

export function uploadPetAsset(req: Request, res: Response, next: NextFunction): void {
  uploadSingle(req, res, (err?: unknown) => {
    if (err instanceof AppError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(new AppError(413, 'PAYLOAD_TOO_LARGE', err.message, err.details));
        return;
      }

      if (err.code === 'UNSUPPORTED_MEDIA_TYPE') {
        next(new AppError(415, err.code, err.message, err.details));
        return;
      }

      if (err.code === 'INVALID_FILE_CONTENT') {
        next(new AppError(422, err.code, err.message, err.details));
        return;
      }
    }

    next(err as any);
  });
}
