import { AppError } from '../../utils/AppError';
import * as repo from './app-showcases.repository';
import type { CreateAppShowcaseDto, UpdateAppShowcaseDto, AppShowcaseListQuery } from './app-showcases.types';

export async function createAppShowcase(dto: CreateAppShowcaseDto) {
  return repo.createAppShowcase(dto);
}

export async function listAppShowcases(query: AppShowcaseListQuery) {
  return repo.listAppShowcases(query);
}

export async function getAppShowcase(id: string) {
  const item = await repo.getAppShowcaseById(id);
  if (!item) throw AppError.notFound('App showcase');
  return item;
}

export async function updateAppShowcase(id: string, dto: UpdateAppShowcaseDto) {
  await getAppShowcase(id);
  return repo.updateAppShowcase(id, dto);
}

export async function deleteAppShowcase(id: string) {
  await getAppShowcase(id);
  return repo.deleteAppShowcase(id);
}
