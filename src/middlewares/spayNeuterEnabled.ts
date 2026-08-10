import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { AppError } from '../utils/AppError';

// Emergency kill switch (SPAY_NEUTER_ENABLED, default 'true' — see
// src/config/index.ts). Gates only the entry points that start a new
// money-committing flow: slot holds and booking creation. It deliberately
// does NOT gate reads (offer/availability browsing, booking history,
// receipts), reschedule/cancel of an existing booking, or any admin/clinic
// route — disabling the switch must never hide or block access to data that
// already exists. Per-offer visibility (draft/paused/published) remains a
// separate, independent control via SpayOffer.status.
export function requireSpayNeuterEnabled(_req: Request, _res: Response, next: NextFunction): void {
  if (config.SPAY_NEUTER_ENABLED === 'false') {
    next(
      AppError.serviceUnavailable(
        'Spay & Neuter booking is temporarily unavailable. Please try again later.',
        'SPAY_NEUTER_DISABLED',
      ),
    );
    return;
  }
  next();
}
