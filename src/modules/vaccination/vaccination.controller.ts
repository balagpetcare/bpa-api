import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response';
import * as service from './vaccination.service';
import type { CheckInDto, MarkVaccinatedDto, IssueCertificateDto, RevokeCertificateDto } from './vaccination.types';

export async function scanTokenHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token } = req.params;
    const actorId = req.user?.sub ?? 'unknown';
    const query = {
      venueId: req.query.venueId as string | undefined,
      sessionId: req.query.sessionId as string | undefined,
    };
    const ipAddress = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.socket.remoteAddress;

    const result = await service.scanToken(token, actorId, query, ipAddress);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function checkInHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as CheckInDto;
    const actorId = req.user?.sub ?? 'unknown';
    const ipAddress = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.socket.remoteAddress;

    const result = await service.checkIn(dto, actorId, ipAddress);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function markVaccinatedHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as MarkVaccinatedDto;
    const actorId = req.user?.sub ?? 'unknown';
    const ipAddress = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.socket.remoteAddress;

    const result = await service.markVaccinated(dto, actorId, ipAddress);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function issueCertificateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as IssueCertificateDto;
    const actorId = req.user?.sub ?? 'unknown';
    const ipAddress = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.socket.remoteAddress;

    const result = await service.issueCertificate(dto, actorId, ipAddress);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function revokeCertificateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as RevokeCertificateDto;
    const actorId = req.user?.sub ?? 'unknown';
    const ipAddress = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.socket.remoteAddress;

    const result = await service.revokeCertificate(dto, actorId, ipAddress);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function verifyCertificatePubliclyHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token } = req.params;
    const result = await service.verifyCertificatePublicly(token);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
