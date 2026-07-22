import { Request, Response, NextFunction } from 'express';
import { buildPaginationMeta, parsePaginationQuery, sendSuccess } from '../../utils/response';
import {
  getNotificationsList,
  getUnreadNotificationCount,
  readNotification,
  dismissOneNotification,
  readAllNotifications,
} from './notifications.service';
import { listNotificationsSchema, markAllReadSchema } from './notifications.types';

export async function handleListNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = listNotificationsSchema.parse(req.query);
    const { total, items } = await getNotificationsList(parsed);
    const { page, limit } = parsePaginationQuery(req.query.page, req.query.limit);
    sendSuccess(res, items, 200, buildPaginationMeta(total, page, limit));
  } catch (err) { next(err); }
}

export async function handleUnreadCount(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const count = await getUnreadNotificationCount();
    sendSuccess(res, { count });
  } catch (err) { next(err); }
}

export async function handleMarkRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await readNotification(req.params.id);
    sendSuccess(res, result);
  } catch (err) { next(err); }
}

export async function handleDismiss(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await dismissOneNotification(req.params.id);
    sendSuccess(res, result);
  } catch (err) { next(err); }
}

export async function handleMarkAllRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = markAllReadSchema.parse(req.body ?? {});
    const result = await readAllNotifications(dto);
    sendSuccess(res, result);
  } catch (err) { next(err); }
}
