const findMany = jest.fn();
jest.mock('../../../database/prisma', () => ({ prisma: { platformShowcaseSection: { findMany } } }));
import { listPlatformShowcases } from '../homepage-public.repository';

describe('public platform showcase query', () => {
  beforeEach(()=>findMany.mockReset().mockResolvedValue([]));
  it('returns the empty state and enforces publication, activation, link activation and deterministic ordering', async () => {
    await expect(listPlatformShowcases()).resolves.toEqual([]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where:{status:'published',isActive:true}, orderBy:[{sortOrder:'asc'},{createdAt:'asc'},{id:'asc'}],
      select:expect.objectContaining({items:expect.objectContaining({
        where:{isActive:true}, orderBy:[{featured:'desc'},{sortOrder:'asc'},{createdAt:'asc'},{id:'asc'}],
        select:expect.objectContaining({previewMode:true,links:expect.objectContaining({where:{isActive:true},orderBy:[{sortOrder:'asc'},{createdAt:'asc'},{id:'asc'}]})}),
      })}),
    }));
  });
});
