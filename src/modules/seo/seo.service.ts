import { AppError } from '../../utils/AppError';
import { AuditContext, auditUpdate } from '../../utils/audit';
import * as repo from './seo.repository';
import { UpsertSeoDto, SeoMetadataResponse } from './seo.types';

type RawSeo = Awaited<ReturnType<typeof repo.findSeoByRoute>>;

function format(s: NonNullable<RawSeo>): SeoMetadataResponse {
  return {
    id: s.id,
    route: s.route,
    title: s.title,
    description: s.description,
    ogTitle: s.ogTitle,
    ogDescription: s.ogDescription,
    ogImageUrl: s.ogImage?.url ?? null,
    schemaJson: s.schemaJson as Record<string, unknown> | null,
    updatedAt: s.updatedAt,
  };
}

export async function listSeo(): Promise<SeoMetadataResponse[]> {
  const rows = await repo.findAllSeo();
  return rows.map(format);
}

export async function getSeoByRoute(route: string): Promise<SeoMetadataResponse | null> {
  const s = await repo.findSeoByRoute(route);
  return s ? format(s) : null;
}

export async function upsertSeo(
  route: string,
  dto: UpsertSeoDto,
  userId: string,
  ctx: AuditContext,
): Promise<SeoMetadataResponse> {
  const existing = await repo.findSeoByRoute(route);

  const s = await repo.upsertSeo(
    route,
    {
      title: dto.title,
      description: dto.description,
      ogTitle: dto.ogTitle,
      ogDescription: dto.ogDescription,
      schemaJson: dto.schemaJson !== undefined ? (dto.schemaJson as import('@prisma/client').Prisma.InputJsonValue) : undefined,
      ...(dto.ogImageId !== undefined && {
        ogImage: dto.ogImageId ? { connect: { id: dto.ogImageId } } : { disconnect: true },
      }),
    },
    userId,
  );

  await auditUpdate(
    'seo_metadata',
    route,
    existing ? { title: existing.title } : {},
    { title: s.title },
    ctx,
  );

  return format(s);
}

export async function deleteSeo(route: string, ctx: AuditContext): Promise<void> {
  const existing = await repo.findSeoByRoute(route);
  if (!existing) throw AppError.notFound('SeoMetadata');
  await repo.deleteSeo(route);
  await auditUpdate('seo_metadata', route, { route }, {}, ctx);
}
