import { Router } from 'express';
import { ACTIONS, RESOURCES } from '../../config/constants';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { validateUuid } from '../../middlewares/validateUuid';
import {
  appAuditLogListQuerySchema,
  appControlListQuerySchema,
  appControlPublishSchema,
  appControlReorderSchema,
  appControlUpdateSchema,
  appControlWriteSchema,
  appThemeSettingUpdateSchema,
  appThemeSettingWriteSchema,
  appTutorialGuideUpdateSchema,
  appTutorialGuideWriteSchema,
  appVersionSettingUpdateSchema,
  appVersionSettingWriteSchema,
} from './app-control.types';
import {
  createResourceHandler,
  deleteResourceHandler,
  getAuditLogHandler,
  getResourceHandler,
  listAuditLogsHandler,
  listResourceHandler,
  publishResourceHandler,
  reorderResourceHandler,
  updateResourceHandler,
} from './app-control.controller';

const RESOURCE_KEYS = [
  'home-sections',
  'banners',
  'quick-actions',
  'featured-services',
  'offers',
  'navigation-items',
  'page-contents',
  'theme-settings',
  'version-settings',
  'popup-notices',
  'tutorials-guides',
] as const;

function writeSchemaFor(resource: string) {
  if (resource === 'theme-settings') return appThemeSettingWriteSchema;
  if (resource === 'version-settings') return appVersionSettingWriteSchema;
  if (resource === 'tutorials-guides') return appTutorialGuideWriteSchema;
  return appControlWriteSchema;
}

function updateSchemaFor(resource: string) {
  if (resource === 'theme-settings') return appThemeSettingUpdateSchema;
  if (resource === 'version-settings') return appVersionSettingUpdateSchema;
  if (resource === 'tutorials-guides') return appTutorialGuideUpdateSchema;
  return appControlUpdateSchema;
}

export const appControlAdminRouter = Router();
appControlAdminRouter.use(authenticate);

for (const resource of RESOURCE_KEYS) {
  appControlAdminRouter.get(`/${resource}`, authorize(RESOURCES.APP_CONTROL, ACTIONS.READ), validate(appControlListQuerySchema, 'query'), listResourceHandler(resource));
  appControlAdminRouter.post(`/${resource}`, authorize(RESOURCES.APP_CONTROL, ACTIONS.MANAGE), validate(writeSchemaFor(resource)), createResourceHandler(resource));
  appControlAdminRouter.patch(`/${resource}/reorder`, authorize(RESOURCES.APP_CONTROL, ACTIONS.MANAGE), validate(appControlReorderSchema), reorderResourceHandler(resource));
  appControlAdminRouter.get(`/${resource}/:id`, validateUuid('id'), authorize(RESOURCES.APP_CONTROL, ACTIONS.READ), getResourceHandler(resource));
  appControlAdminRouter.patch(`/${resource}/:id`, validateUuid('id'), authorize(RESOURCES.APP_CONTROL, ACTIONS.MANAGE), validate(updateSchemaFor(resource)), updateResourceHandler(resource));
  appControlAdminRouter.patch(`/${resource}/:id/publish`, validateUuid('id'), authorize(RESOURCES.APP_CONTROL, ACTIONS.PUBLISH), validate(appControlPublishSchema), publishResourceHandler(resource));
  appControlAdminRouter.delete(`/${resource}/:id`, validateUuid('id'), authorize(RESOURCES.APP_CONTROL, ACTIONS.DELETE), deleteResourceHandler(resource));
}

appControlAdminRouter.get('/audit-logs', authorize(RESOURCES.APP_CONTROL, ACTIONS.READ), validate(appAuditLogListQuerySchema, 'query'), listAuditLogsHandler);
appControlAdminRouter.get('/audit-logs/:id', validateUuid('id'), authorize(RESOURCES.APP_CONTROL, ACTIONS.READ), getAuditLogHandler);
