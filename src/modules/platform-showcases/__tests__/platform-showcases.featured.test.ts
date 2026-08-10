const getSection = jest.fn();
const getItem = jest.fn();
const mediaCount = jest.fn();
const clearFeaturedItems = jest.fn();
const createItem = jest.fn();
const updateItem = jest.fn();
const localUserExists = jest.fn();

jest.mock('../platform-showcases.repository', () => ({
  getSection, getItem, mediaCount, clearFeaturedItems, createItem, updateItem, localUserExists,
}));
jest.mock('../../../utils/audit', () => ({ auditCreate: jest.fn(), auditDelete: jest.fn(), auditUpdate: jest.fn() }));

import * as service from '../platform-showcases.service';

const context = { actorId: undefined } as never;
const item = (overrides: Record<string, unknown> = {}) => ({
  id: 'item-1', sectionId: 'section-1', platformKey: 'bpa-app', brandKey: 'bpa', platformType: 'APP',
  name: 'Bangladesh Pet Association App', featured: false, isActive: true, links: [], ...overrides,
});

describe('platform showcase featured selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getSection.mockResolvedValue({ id: 'section-1' });
    getItem.mockResolvedValue(item());
    mediaCount.mockResolvedValue(0);
    localUserExists.mockResolvedValue(false);
    clearFeaturedItems.mockResolvedValue({ count: 1 });
    createItem.mockImplementation(async (_sectionId, dto) => item(dto));
    updateItem.mockImplementation(async (_id, dto) => item(dto));
  });

  it('clears the previous featured item when a new item is created as featured', async () => {
    await service.createItem('section-1', item({ id: undefined, featured: true }) as never, context);
    expect(clearFeaturedItems).toHaveBeenCalledWith('section-1');
    expect(createItem).toHaveBeenCalledWith('section-1', expect.objectContaining({ featured: true }), undefined);
  });

  it('clears other featured items in the same section when selection changes', async () => {
    await service.updateItem('item-1', { featured: true }, context);
    expect(clearFeaturedItems).toHaveBeenCalledWith('section-1', 'item-1');
    expect(updateItem).toHaveBeenCalledWith('item-1', { featured: true }, undefined);
  });

  it('does not affect featured selection for ordinary content edits', async () => {
    await service.updateItem('item-1', { name: 'Updated name' }, context);
    expect(clearFeaturedItems).not.toHaveBeenCalled();
  });

  it('does not persist a Central Auth subject into a local-user foreign key', async () => {
    const centralContext = { actorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', actorEmail: 'admin@central.example' } as never;
    await service.createItem('section-1', item({ id: undefined }) as never, centralContext);
    expect(localUserExists).toHaveBeenCalledWith('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(createItem).toHaveBeenCalledWith('section-1', expect.anything(), undefined);
  });

  it('persists the relational actor when the authenticated subject is a local user', async () => {
    localUserExists.mockResolvedValue(true);
    const localId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    await service.createItem('section-1', item({ id: undefined }) as never, { actorId: localId } as never);
    expect(createItem).toHaveBeenCalledWith('section-1', expect.anything(), localId);
  });
});
