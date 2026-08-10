import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { buildPaginationMeta, parsePaginationQuery } from '../../utils/response';
import type { ItemList, ItemUpdate, ItemWrite, LinkUpdate, LinkWrite, Reorder, SectionList, SectionUpdate, SectionWrite } from './platform-showcases.types';

export const mediaSelect = { id: true, url: true, altText: true } as const;
const linkOrder = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }, { id: 'asc' as const }];
const itemInclude = { logoMedia: { select: mediaSelect }, primaryPreviewMedia: { select: mediaSelect }, secondaryPreviewMedia: { select: mediaSelect }, links: { orderBy: linkOrder } } satisfies Prisma.PlatformShowcaseItemInclude;
const sectionInclude = { logoMedia: { select: mediaSelect }, items: { orderBy: [{ featured: 'desc' as const }, { sortOrder: 'asc' as const }, { createdAt: 'asc' as const }, { id: 'asc' as const }], include: itemInclude } } satisfies Prisma.PlatformShowcaseSectionInclude;

export async function mediaCount(ids: string[]) { return prisma.mediaFile.count({ where: { id: { in: ids } } }); }
export async function localUserExists(id: string) { return (await prisma.user.count({ where: { id, deletedAt: null } })) === 1; }
export async function listSections(q: SectionList) { const { page, limit, skip } = parsePaginationQuery(q.page, q.limit); const where: Prisma.PlatformShowcaseSectionWhereInput = { ...(q.status && { status: q.status }), ...(q.isActive && { isActive: q.isActive === 'true' }) }; const [items,total] = await Promise.all([prisma.platformShowcaseSection.findMany({where,skip,take:limit,orderBy:[{sortOrder:'asc'},{createdAt:'asc'},{id:'asc'}],include:sectionInclude}),prisma.platformShowcaseSection.count({where})]); return {items,meta:buildPaginationMeta(total,page,limit)}; }
export const getSection = (id: string) => prisma.platformShowcaseSection.findUnique({ where: { id }, include: sectionInclude });
export const createSection = (d: SectionWrite, actor?: string) => prisma.platformShowcaseSection.create({ data: { ...d, createdById: actor, updatedById: actor }, include: sectionInclude });
export const updateSection = (id: string, d: SectionUpdate, actor?: string) => prisma.platformShowcaseSection.update({ where:{id}, data:{...d,updatedById:actor}, include:sectionInclude });
export const deleteSection = (id: string) => prisma.platformShowcaseSection.delete({where:{id}});
export const reorderSections = (d: Reorder, actor?: string) => prisma.$transaction(d.items.map(i=>prisma.platformShowcaseSection.update({where:{id:i.id},data:{sortOrder:i.sortOrder,updatedById:actor}})));

export async function listItems(q: ItemList) { const {page,limit,skip}=parsePaginationQuery(q.page,q.limit); const where: Prisma.PlatformShowcaseItemWhereInput={...(q.sectionId&&{sectionId:q.sectionId}),...(q.platformType&&{platformType:q.platformType}),...(q.brandKey&&{brandKey:q.brandKey}),...(q.isActive&&{isActive:q.isActive==='true'}),...(q.featured&&{featured:q.featured==='true'})}; const [items,total]=await Promise.all([prisma.platformShowcaseItem.findMany({where,skip,take:limit,orderBy:[{featured:'desc'},{sortOrder:'asc'},{createdAt:'asc'},{id:'asc'}],include:itemInclude}),prisma.platformShowcaseItem.count({where})]);return{items,meta:buildPaginationMeta(total,page,limit)}; }
export const getItem=(id:string)=>prisma.platformShowcaseItem.findUnique({where:{id},include:itemInclude});
export const createItem=(sectionId:string,d:ItemWrite,actor?:string)=>prisma.platformShowcaseItem.create({data:{...d,sectionId,createdById:actor,updatedById:actor},include:itemInclude});
export const updateItem=(id:string,d:ItemUpdate,actor?:string)=>prisma.platformShowcaseItem.update({where:{id},data:{...d,updatedById:actor},include:itemInclude});
export const clearFeaturedItems=(sectionId:string,exceptId?:string)=>prisma.platformShowcaseItem.updateMany({where:{sectionId,featured:true,...(exceptId&&{id:{not:exceptId}})},data:{featured:false}});
export const deleteItem=(id:string)=>prisma.platformShowcaseItem.delete({where:{id}});
export const reorderItems=(d:Reorder,actor?:string)=>prisma.$transaction(d.items.map(i=>prisma.platformShowcaseItem.update({where:{id:i.id},data:{sortOrder:i.sortOrder,updatedById:actor}})));

export const getLink=(id:string)=>prisma.platformShowcaseLink.findUnique({where:{id}});
export const createLink=(itemId:string,d:LinkWrite,actor?:string)=>prisma.platformShowcaseLink.create({data:{...d,itemId,createdById:actor,updatedById:actor}});
export const updateLink=(id:string,d:LinkUpdate,actor?:string)=>prisma.platformShowcaseLink.update({where:{id},data:{...d,updatedById:actor}});
export const deleteLink=(id:string)=>prisma.platformShowcaseLink.delete({where:{id}});
export const reorderLinks=(d:Reorder,actor?:string)=>prisma.$transaction(d.items.map(i=>prisma.platformShowcaseLink.update({where:{id:i.id},data:{sortOrder:i.sortOrder,updatedById:actor}})));
