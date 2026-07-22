import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import * as rolesService from './roles.service';

export async function listRolesHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const roles = await rolesService.listRoles();
    sendSuccess(res, roles);
  } catch (err) {
    next(err);
  }
}

export async function getRoleHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const role = await rolesService.getRoleById(req.params.id);
    sendSuccess(res, role);
  } catch (err) {
    next(err);
  }
}

export async function createRoleHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const role = await rolesService.createRole(req.body);
    sendCreated(res, role);
  } catch (err) {
    next(err);
  }
}

export async function updateRoleHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const role = await rolesService.updateRole(req.params.id, req.body);
    sendSuccess(res, role);
  } catch (err) {
    next(err);
  }
}

export async function deleteRoleHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await rolesService.deleteRole(req.params.id);
    sendNoContent(res);
  } catch (err) {
    next(err);
  }
}

export async function listPermissionsHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const permissions = await rolesService.listPermissions();
    sendSuccess(res, permissions);
  } catch (err) {
    next(err);
  }
}
