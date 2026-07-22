import { Request, Response } from 'express';
import { HTTP_STATUS } from '../config/constants';
import { getRequestId } from './requestId';

export function notFound(req: Request, res: Response): void {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    success: false,
    requestId: getRequestId(req),
    error: {
      code: 'NOT_FOUND',
      message: 'The requested resource was not found',
    },
  });
}
