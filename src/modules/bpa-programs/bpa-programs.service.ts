import { AppError } from '../../utils/AppError';
import * as repo from './bpa-programs.repository';
import type { CreateBpaProgramDto, UpdateBpaProgramDto, BpaProgramListQuery } from './bpa-programs.types';

export async function createBpaProgram(dto: CreateBpaProgramDto) {
  return repo.createBpaProgram(dto);
}

export async function listBpaPrograms(query: BpaProgramListQuery) {
  return repo.listBpaPrograms(query);
}

export async function getBpaProgram(id: string) {
  const item = await repo.getBpaProgramById(id);
  if (!item) throw AppError.notFound('BPA program');
  return item;
}

export async function updateBpaProgram(id: string, dto: UpdateBpaProgramDto) {
  await getBpaProgram(id);
  return repo.updateBpaProgram(id, dto);
}

export async function deleteBpaProgram(id: string) {
  await getBpaProgram(id);
  return repo.deleteBpaProgram(id);
}
