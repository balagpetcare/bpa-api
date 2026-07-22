import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated } from '../../utils/response';
import * as svc from './campaign-registrations.service';
import * as repo from './campaign-registrations.repository';
import { streamBookingSlipPdf } from './booking-slip.pdf';
import { AppError } from '../../utils/AppError';
import type { RegisterCampaignDto, JoinWaitlistDto, RegistrationListQuery, WaitlistListQuery } from './campaign-registrations.types';

// ─── Public ───────────────────────────────────────────────────────

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await svc.registerForCampaign(req.body as RegisterCampaignDto);
    sendCreated(res, result);
  } catch (err) { next(err); }
}

export async function joinWaitlist(req: Request, res: Response, next: NextFunction) {
  try {
    const entry = await svc.joinWaitlist(req.body as JoinWaitlistDto);
    sendCreated(res, entry);
  } catch (err) { next(err); }
}

export async function getByBookingNumber(req: Request, res: Response, next: NextFunction) {
  try {
    const reg = await svc.getRegistrationByBookingNumber(req.params.bookingNumber);
    sendSuccess(res, reg);
  } catch (err) { next(err); }
}

export async function getBookingSlipPdf(req: Request, res: Response, next: NextFunction) {
  try {
    const reg = await repo.getRegistrationByBookingNumber(req.params.bookingNumber);
    if (!reg) throw AppError.notFound('Booking');

    // Ensure staffQrToken exists for older bookings created before this field was added
    if (!reg.staffQrToken) {
      await repo.ensureStaffQrToken(reg.id);
      // Re-fetch to get the token
      const updated = await repo.getRegistrationByBookingNumber(req.params.bookingNumber);
      if (!updated) throw AppError.notFound('Booking');
      Object.assign(reg, { staffQrToken: updated.staffQrToken });
    }

    const filename = `BPA-Booking-Slip-${reg.bookingNumber}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');

    await streamBookingSlipPdf(reg, res);
  } catch (err) { next(err); }
}

// ─── Admin ────────────────────────────────────────────────────────

export async function listRegistrations(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await svc.listRegistrations(req.query as RegistrationListQuery);
    sendSuccess(res, result);
  } catch (err) { next(err); }
}

export async function getRegistration(req: Request, res: Response, next: NextFunction) {
  try {
    const reg = await svc.getRegistrationById(req.params.id);
    sendSuccess(res, reg);
  } catch (err) { next(err); }
}

export async function listWaitlist(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await svc.listWaitlist(req.query as WaitlistListQuery);
    sendSuccess(res, result);
  } catch (err) { next(err); }
}

export async function cancelWaitlist(req: Request, res: Response, next: NextFunction) {
  try {
    const entry = await svc.removeFromWaitlist(req.params.id);
    sendSuccess(res, entry);
  } catch (err) { next(err); }
}

export async function confirmManualPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await svc.confirmManualPayment(req.params.id);
    sendSuccess(res, result);
  } catch (err) { next(err); }
}

export async function cancelRegistration(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await svc.cancelRegistration(req.params.id);
    sendSuccess(res, result);
  } catch (err) { next(err); }
}
