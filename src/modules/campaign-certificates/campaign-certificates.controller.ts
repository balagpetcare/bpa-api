import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response';
import * as svc from './campaign-certificates.service';
import type { IssueCertificateDto, CertificateListQuery } from './campaign-certificates.types';

export async function issueCertificate(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as Request & { user?: { id: string } }).user!.id;
    const cert = await svc.issueCertificate(req.body as IssueCertificateDto, userId);
    sendSuccess(res, cert, 201);
  } catch (err) { next(err); }
}

export async function reissueCertificate(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as Request & { user?: { id: string } }).user!.id;
    const cert = await svc.reissueCertificate(req.params.petBookingId, userId);
    sendSuccess(res, cert);
  } catch (err) { next(err); }
}

export async function getCertificateByPetBooking(req: Request, res: Response, next: NextFunction) {
  try {
    const cert = await svc.getCertificateByPetBooking(req.params.petBookingId);
    sendSuccess(res, cert);
  } catch (err) { next(err); }
}

export async function listCertificates(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await svc.listCertificates(req.query as unknown as CertificateListQuery);
    sendSuccess(res, result);
  } catch (err) { next(err); }
}

export async function verifyByToken(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await svc.verifyByToken(req.params.verifyToken);
    sendSuccess(res, result);
  } catch (err) { next(err); }
}

export async function verifyByCertNumber(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await svc.verifyByCertNumber(req.params.certNumber);
    sendSuccess(res, result);
  } catch (err) { next(err); }
}

export async function getCertificateHtml(req: Request, res: Response, next: NextFunction) {
  try {
    const html = await svc.getCertificateHtml(req.params.verifyToken);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) { next(err); }
}

export async function getCertificatePdf(req: Request, res: Response, next: NextFunction) {
  try {
    const { html, filename } = await svc.getCertificatePdfHtml(req.params.verifyToken);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(html);
  } catch (err) { next(err); }
}
