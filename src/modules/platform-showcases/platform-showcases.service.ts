import { AppError } from '../../utils/AppError';
import type { AuditContext } from '../../utils/audit';
import { auditCreate, auditDelete, auditUpdate } from '../../utils/audit';
import { invalidatePlatformShowcasePublicCache } from '../homepage-public/homepage-public.service';
import * as repo from './platform-showcases.repository';
import type { ItemUpdate, ItemWrite, LinkUpdate, LinkWrite, Reorder, SectionUpdate, SectionWrite } from './platform-showcases.types';

// Central Auth principals are deliberately not mirrored into BPA's users table.
// Preserve their identity in AuditLog via the full AuditContext, but only write
// the optional relational actor columns when the principal is a real local user.
async function actor(c: AuditContext) {
  const id = c.actorId;
  return id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) && await repo.localUserExists(id) ? id : undefined;
}
async function assertMedia(ids: Array<string|null|undefined>) { const unique=[...new Set(ids.filter((x):x is string=>!!x))]; if(unique.length && await repo.mediaCount(unique)!==unique.length) throw AppError.badRequest('One or more media IDs do not exist','INVALID_MEDIA'); }
export const listSections=repo.listSections;
export async function getSection(id:string){const x=await repo.getSection(id);if(!x)throw AppError.notFound('Platform showcase section');return x;}
export async function createSection(d:SectionWrite,c:AuditContext){await assertMedia([d.logoMediaId]);const x=await repo.createSection(d,await actor(c));invalidatePlatformShowcasePublicCache();await auditCreate('platform_showcase_section',x.id,{key:x.key},c);return x;}
export async function updateSection(id:string,d:SectionUpdate,c:AuditContext){const old=await getSection(id);await assertMedia([d.logoMediaId]);const x=await repo.updateSection(id,d,await actor(c));invalidatePlatformShowcasePublicCache();await auditUpdate('platform_showcase_section',id,{status:old.status},{...d},c);return x;}
export async function deleteSection(id:string,c:AuditContext){const old=await getSection(id);if(old.status!=='archived')throw AppError.conflict('Only archived showcase sections can be deleted','ARCHIVE_REQUIRED');await repo.deleteSection(id);invalidatePlatformShowcasePublicCache();await auditDelete('platform_showcase_section',id,{key:old.key},c);}
export async function reorderSections(d:Reorder,c:AuditContext){await Promise.all(d.items.map(i=>getSection(i.id)));await repo.reorderSections(d,await actor(c));return listSections({limit:100});}

export const listItems=repo.listItems;
export async function getItem(id:string){const x=await repo.getItem(id);if(!x)throw AppError.notFound('Platform showcase item');return x;}
export async function createItem(sectionId:string,d:ItemWrite,c:AuditContext){await getSection(sectionId);await assertMedia([d.logoMediaId,d.primaryPreviewMediaId,d.secondaryPreviewMediaId]);if(d.featured)await repo.clearFeaturedItems(sectionId);const x=await repo.createItem(sectionId,d,await actor(c));invalidatePlatformShowcasePublicCache();await auditCreate('platform_showcase_item',x.id,{platformKey:x.platformKey},c);return x;}
export async function updateItem(id:string,d:ItemUpdate,c:AuditContext){const old=await getItem(id);await assertMedia([d.logoMediaId,d.primaryPreviewMediaId,d.secondaryPreviewMediaId]);if(d.featured)await repo.clearFeaturedItems(old.sectionId,id);const x=await repo.updateItem(id,d,await actor(c));invalidatePlatformShowcasePublicCache();await auditUpdate('platform_showcase_item',id,{},d,c);return x;}
export async function deleteItem(id:string,c:AuditContext){const old=await getItem(id);if(old.isActive)throw AppError.conflict('Only inactive showcase items can be deleted','DEACTIVATE_REQUIRED');await repo.deleteItem(id);invalidatePlatformShowcasePublicCache();await auditDelete('platform_showcase_item',id,{platformKey:old.platformKey},c);}
export async function reorderItems(d:Reorder,c:AuditContext){await Promise.all(d.items.map(i=>getItem(i.id)));await repo.reorderItems(d,await actor(c));return d.items;}

export async function createLink(itemId:string,d:LinkWrite,c:AuditContext){const item=await getItem(itemId);if(item.links.some(x=>x.type===d.type&&x.url===d.url))throw AppError.conflict('This link type and destination already exists for the item','DUPLICATE_LINK');const x=await repo.createLink(itemId,d,await actor(c));invalidatePlatformShowcasePublicCache();await auditCreate('platform_showcase_link',x.id,{type:x.type},c);return x;}
export async function updateLink(id:string,d:LinkUpdate,c:AuditContext){const old=await repo.getLink(id);if(!old)throw AppError.notFound('Platform showcase link');const item=await getItem(old.itemId);const type=d.type??old.type,url=d.url??old.url;if(item.links.some(x=>x.id!==id&&x.type===type&&x.url===url))throw AppError.conflict('This link type and destination already exists for the item','DUPLICATE_LINK');const x=await repo.updateLink(id,d,await actor(c));invalidatePlatformShowcasePublicCache();await auditUpdate('platform_showcase_link',id,{},d,c);return x;}
export async function deleteLink(id:string,c:AuditContext){const old=await repo.getLink(id);if(!old)throw AppError.notFound('Platform showcase link');if(old.isActive)throw AppError.conflict('Only inactive showcase links can be deleted','DEACTIVATE_REQUIRED');await repo.deleteLink(id);invalidatePlatformShowcasePublicCache();await auditDelete('platform_showcase_link',id,{type:old.type},c);}
export async function reorderLinks(d:Reorder,c:AuditContext){for(const i of d.items)if(!await repo.getLink(i.id))throw AppError.notFound('Platform showcase link');await repo.reorderLinks(d,await actor(c));return d.items;}
