import { AppError } from '../../utils/AppError';
import * as repo from './pets.repository';
import type { CreatePetOwnerDto, UpdatePetOwnerDto, CreatePetDto, UpdatePetDto, PetListQuery, PetOwnerListQuery } from './pets.types';

// ─── Pet Owners ──────────────────────────────────────────────────

export async function createPetOwner(dto: CreatePetOwnerDto) {
  return repo.createPetOwner(dto);
}

export async function listPetOwners(query: PetOwnerListQuery) {
  return repo.listPetOwners(query);
}

export async function getPetOwner(id: string) {
  const owner = await repo.getPetOwnerById(id);
  if (!owner) throw AppError.notFound('Pet owner not found');
  return owner;
}

export async function updatePetOwner(id: string, dto: UpdatePetOwnerDto) {
  await getPetOwner(id);
  return repo.updatePetOwner(id, dto);
}

// ─── Pets ────────────────────────────────────────────────────────

export async function createPet(dto: CreatePetDto) {
  const owner = await repo.getPetOwnerById(dto.ownerId);
  if (!owner) throw AppError.notFound('Pet owner not found');
  return repo.createPet(dto);
}

export async function listPets(query: PetListQuery) {
  return repo.listPets(query);
}

export async function getPet(id: string) {
  const pet = await repo.getPetById(id);
  if (!pet) throw AppError.notFound('Pet not found');
  return pet;
}

export async function updatePet(id: string, dto: UpdatePetDto) {
  await getPet(id);
  return repo.updatePet(id, dto);
}
