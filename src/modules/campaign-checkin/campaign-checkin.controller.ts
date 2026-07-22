import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response';
import * as svc from './campaign-checkin.service';
import type { ScanQrDto, SearchBookingDto, VaccinateDto, VaccinationRecordListQuery } from './campaign-checkin.types';

export async function scanQr(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as Request & { user?: { id: string } }).user!.id;
    const ip = req.ip ?? req.socket.remoteAddress;
    const booking = await svc.scanQr(req.body as ScanQrDto, userId, ip);
    sendSuccess(res, booking);
  } catch (err) { next(err); }
}

export async function searchBookings(req: Request, res: Response, next: NextFunction) {
  try {
    const results = await svc.searchBookings(req.query as SearchBookingDto);
    sendSuccess(res, results);
  } catch (err) { next(err); }
}

export async function getPetBooking(req: Request, res: Response, next: NextFunction) {
  try {
    const booking = await svc.getPetBooking(req.params.petBookingId);
    sendSuccess(res, booking);
  } catch (err) { next(err); }
}

export async function checkIn(req: Request, res: Response, next: NextFunction) {
  try {
    const booking = await svc.checkIn(req.params.petBookingId);
    sendSuccess(res, booking);
  } catch (err) { next(err); }
}

export async function vaccinate(req: Request, res: Response, next: NextFunction) {
  try {
    const booking = await svc.vaccinate(req.params.petBookingId, req.body as VaccinateDto);
    sendSuccess(res, booking);
  } catch (err) { next(err); }
}

export async function getPetVaccinationHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const history = await svc.getPetVaccinationHistory(req.params.petId);
    sendSuccess(res, history);
  } catch (err) { next(err); }
}

export async function listVaccinationRecords(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await svc.listVaccinationRecords(req.query as VaccinationRecordListQuery);
    sendSuccess(res, result);
  } catch (err) { next(err); }
}
