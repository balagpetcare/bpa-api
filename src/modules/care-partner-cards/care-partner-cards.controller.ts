import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response';
import { auditContextFromRequest, auditUpdate } from '../../utils/audit';
import * as svc from './care-partner-cards.service';
import type { RevokeCardDto, ReactivateCardDto, CardListQuery, VerifyCardQuery, VerificationLogListQuery } from './care-partner-cards.types';

// ─── Admin ───────────────────────────────────────────────────────

export async function listCardsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listCards(req.query as never as CardListQuery);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getCardHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getCard(req.params.id));
  } catch (err) { next(err); }
}

export async function revokeCardHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as RevokeCardDto;
    const card = await svc.revokeCard(req.params.id, dto);
    auditUpdate('care_partner_cards', req.params.id, {}, { status: 'revoked', revocationReason: dto.revocationReason }, auditContextFromRequest(req));
    sendSuccess(res, card);
  } catch (err) { next(err); }
}

export async function reactivateCardHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as ReactivateCardDto;
    const card = await svc.reactivateCard(req.params.id, dto);
    auditUpdate('care_partner_cards', req.params.id, {}, { status: 'active', reason: dto.reason }, auditContextFromRequest(req));
    sendSuccess(res, card);
  } catch (err) { next(err); }
}

export async function listVerificationLogsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listVerificationLogs(req.query as never as VerificationLogListQuery);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getVerificationLogHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getVerificationLog(req.params.id));
  } catch (err) { next(err); }
}

// ─── Public ──────────────────────────────────────────────────────

export async function verifyCardHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.query as never as VerifyCardQuery;
    const ipAddress = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const result = await svc.verifyCard(query, ipAddress, userAgent);
    sendSuccess(res, result);
  } catch (err) { next(err); }
}
