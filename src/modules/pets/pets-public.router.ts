import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PetType, PetGender } from '@prisma/client';
import { validate } from '../../middlewares/validate';
import { publicFormLimiter } from '../../middlewares/rateLimiter';
import { sendCreated } from '../../utils/response';
import { prisma } from '../../database/prisma';

const router = Router();

const guestPetSchema = z.object({
  name: z.string().min(1).max(120),
  petType: z.nativeEnum(PetType),
  gender: z.nativeEnum(PetGender),
  approxAge: z.number().int().min(0).optional(),
  breed: z.string().max(120).optional(),
  color: z.string().max(80).optional(),
  weightKg: z.number().positive().optional(),
});

const optUuid = z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined);

const guestBatchSchema = z.object({
  ownerName: z.string().min(1).max(120),
  mobile: z.string().min(7).max(20),
  email: z.string().email().max(255).optional(),
  address: z.string().max(500).optional(),
  // Optional location tree FK fields
  divisionId: optUuid,
  districtId: optUuid,
  upazilaId: optUuid,
  unionId: optUuid,
  cityCorporationId: optUuid,
  cityZoneId: optUuid,
  wardId: optUuid,
  pets: z.array(guestPetSchema).min(1).max(10),
});

// POST /api/v1/public/pets/guest
// Creates (or finds) a guest owner and creates the pets, returning petIds.
router.post(
  '/guest',
  publicFormLimiter,
  validate(guestBatchSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = req.body as z.infer<typeof guestBatchSchema>;

      const locationFields = {
        divisionId: dto.divisionId ?? null,
        districtId: dto.districtId ?? null,
        upazilaId: dto.upazilaId ?? null,
        unionId: dto.unionId ?? null,
        cityCorporationId: dto.cityCorporationId ?? null,
        cityZoneId: dto.cityZoneId ?? null,
        wardId: dto.wardId ?? null,
      };

      // Find or create owner by mobile
      let owner = await prisma.petOwner.findFirst({ where: { mobile: dto.mobile } });
      if (!owner) {
        owner = await prisma.petOwner.create({
          data: {
            ownerName: dto.ownerName,
            mobile: dto.mobile,
            email: dto.email,
            address: dto.address,
            isGuest: true,
            ...locationFields,
          },
        });
      } else if (dto.divisionId) {
        // Update location if provided and owner already exists
        owner = await prisma.petOwner.update({
          where: { id: owner.id },
          data: locationFields,
        });
      }

      // Create pets sequentially (small N, no need for parallel)
      const petIds: string[] = [];
      for (const p of dto.pets) {
        const pet = await prisma.pet.create({
          data: {
            ownerId: owner.id,
            name: p.name,
            petType: p.petType,
            gender: p.gender,
            approxAge: p.approxAge,
            breed: p.breed,
            color: p.color,
            weightKg: p.weightKg,
          },
        });
        petIds.push(pet.id);
      }

      sendCreated(res, { ownerId: owner.id, petIds });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
