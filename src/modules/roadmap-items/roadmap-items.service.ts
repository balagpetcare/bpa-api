import { AppError } from '../../utils/AppError';
import * as repo from './roadmap-items.repository';
import type { CreateRoadmapItemDto, UpdateRoadmapItemDto, RoadmapItemListQuery } from './roadmap-items.types';

export async function createRoadmapItem(dto: CreateRoadmapItemDto) {
  return repo.createRoadmapItem(dto);
}

export async function listRoadmapItems(query: RoadmapItemListQuery) {
  return repo.listRoadmapItems(query);
}

export async function listActiveRoadmapItemsPublic() {
  return repo.listActiveRoadmapItemsPublic();
}

export async function getRoadmapItem(id: string) {
  const item = await repo.getRoadmapItemById(id);
  if (!item) throw AppError.notFound('Roadmap item');
  return item;
}

export async function updateRoadmapItem(id: string, dto: UpdateRoadmapItemDto) {
  await getRoadmapItem(id);
  return repo.updateRoadmapItem(id, dto);
}

export async function deleteRoadmapItem(id: string) {
  await getRoadmapItem(id);
  return repo.deleteRoadmapItem(id);
}
