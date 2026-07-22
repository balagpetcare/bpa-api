import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated } from '../../utils/response';
import { auditContextFromRequest, auditCreate, auditUpdate } from '../../utils/audit';
import * as svc from './pets.service';
import type { CreatePetOwnerDto, UpdatePetOwnerDto, CreatePetDto, UpdatePetDto, PetListQuery, PetOwnerListQuery } from './pets.types';

// ─── Pet Owners ──────────────────────────────────────────────────

export async function createPetOwnerHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as CreatePetOwnerDto;
    const owner = await svc.createPetOwner(dto);
    await auditCreate('pet_owner', owner.id, { name: dto.ownerName, mobile: dto.mobile }, auditContextFromRequest(req));
    sendCreated(res, owner);
  } catch (err) { next(err); }
}

export async function listPetOwnersHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listPetOwners(req.query as never as PetOwnerListQuery);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getPetOwnerHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getPetOwner(req.params.id));
  } catch (err) { next(err); }
}

export async function updatePetOwnerHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as UpdatePetOwnerDto;
    const updated = await svc.updatePetOwner(req.params.id, dto);
    await auditUpdate('pet_owner', req.params.id, {}, dto as Record<string, unknown>, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

// ─── Pets ────────────────────────────────────────────────────────

export async function createPetHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as CreatePetDto;
    const pet = await svc.createPet(dto);
    await auditCreate('pet', pet.id, { name: dto.name, petType: dto.petType }, auditContextFromRequest(req));
    sendCreated(res, pet);
  } catch (err) { next(err); }
}

export async function listPetsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listPets(req.query as never as PetListQuery);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getPetHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getPet(req.params.id));
  } catch (err) { next(err); }
}

export async function updatePetHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as UpdatePetDto;
    const updated = await svc.updatePet(req.params.id, dto);
    await auditUpdate('pet', req.params.id, {}, dto as Record<string, unknown>, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}
