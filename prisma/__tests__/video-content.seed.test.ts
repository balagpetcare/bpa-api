jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(),
}));

import { SAMPLE_VIDEO_CONTENT } from '../seed/data/video-content.seed-data';
import { seedVideoContent } from '../seed/video-content.seed';

describe('sample video content seed', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, ENABLE_SAMPLE_VIDEO_CONTENT: 'true', NODE_ENV: 'test' };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  it('upserts sample videos without duplicates on repeated runs', async () => {
    const upsert = jest.fn(async () => undefined);
    const findUnique = jest.fn(async ({ where }: any) => ({ id: `category:${where.slug}` }));
    const findFirst = jest.fn(async () => ({ id: 'user:seed-author' }));

    const prisma = {
      user: { findFirst },
      contentCategory: { findUnique },
      contentPost: { upsert },
    } as any;

    const first = await seedVideoContent(prisma);
    const second = await seedVideoContent(prisma);

    expect(first.skipped).toBe(false);
    expect(first.attempted).toBe(SAMPLE_VIDEO_CONTENT.length);
    expect(first.upserted).toBe(SAMPLE_VIDEO_CONTENT.length);
    expect(second.upserted).toBe(SAMPLE_VIDEO_CONTENT.length);
    expect(upsert).toHaveBeenCalledTimes(SAMPLE_VIDEO_CONTENT.length * 2);
    expect(findUnique).toHaveBeenCalledTimes(SAMPLE_VIDEO_CONTENT.length * 2);
  });
});
