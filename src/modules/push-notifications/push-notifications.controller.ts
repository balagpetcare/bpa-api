import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import * as service from './push-notifications.service';

function userId(req: Request): string {
  return req.user.sub;
}

export async function handleRegisterDevice(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.registerDevice(userId(req), req.body);
    sendCreated(res, result);
  } catch (err) {
    next(err);
  }
}

export async function handleUpdateDeviceToken(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.updateDeviceToken(userId(req), req.body);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function handleLogoutDevice(req: Request, res: Response, next: NextFunction) {
  try {
    await service.logoutDevice(userId(req), req.body);
    sendNoContent(res);
  } catch (err) {
    next(err);
  }
}

export async function handleGetInbox(req: Request, res: Response, next: NextFunction) {
  try {
    const { items, meta } = await service.getInbox(userId(req), req.query as any);
    sendSuccess(res, items, 200, meta);
  } catch (err) {
    next(err);
  }
}

export async function handleUnreadCount(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.getUnreadCount(userId(req));
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function handleMarkRead(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.markRead(userId(req), req.params.id);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function handleArchive(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.archiveNotification(userId(req), req.params.id);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function handleMarkAllRead(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.markAllRead(userId(req));
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function handleTrackOpen(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.trackOpen(userId(req), req.params.id, req.body);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function handleGetPreferences(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.getPreferences(userId(req));
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function handleUpdatePreferences(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.savePreferences(userId(req), req.body);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
