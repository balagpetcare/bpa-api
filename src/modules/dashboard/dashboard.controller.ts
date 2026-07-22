import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response';
import {
  fetchDashboardSummary,
  fetchPendingActions,
  fetchRecentActivity,
  fetchSystemHealth,
} from './dashboard.service';

export async function handleSummary(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await fetchDashboardSummary()); } catch (err) { next(err); }
}

export async function handlePendingActions(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await fetchPendingActions()); } catch (err) { next(err); }
}

export async function handleRecentActivity(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await fetchRecentActivity()); } catch (err) { next(err); }
}

export async function handleSystemHealth(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await fetchSystemHealth()); } catch (err) { next(err); }
}
