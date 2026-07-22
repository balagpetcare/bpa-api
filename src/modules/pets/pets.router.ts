import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { RESOURCES, ACTIONS } from '../../config/constants';
import {
  createPetOwnerSchema, updatePetOwnerSchema,
  createPetSchema, updatePetSchema,
  petListQuerySchema, petOwnerListQuerySchema,
} from './pets.types';
import {
  createPetOwnerHandler, listPetOwnersHandler, getPetOwnerHandler, updatePetOwnerHandler,
  createPetHandler, listPetsHandler, getPetHandler, updatePetHandler,
} from './pets.controller';

const router = Router();

router.use(authenticate);

// ─── Pet Owners ──────────────────────────────────────────────────

router.get('/owners', authorize(RESOURCES.PET_OWNERS, ACTIONS.READ), validate(petOwnerListQuerySchema, 'query'), listPetOwnersHandler);
router.post('/owners', authorize(RESOURCES.PET_OWNERS, ACTIONS.CREATE), validate(createPetOwnerSchema), createPetOwnerHandler);
router.get('/owners/:id', authorize(RESOURCES.PET_OWNERS, ACTIONS.READ), getPetOwnerHandler);
router.patch('/owners/:id', authorize(RESOURCES.PET_OWNERS, ACTIONS.UPDATE), validate(updatePetOwnerSchema), updatePetOwnerHandler);

// ─── Pets ────────────────────────────────────────────────────────

router.get('/', authorize(RESOURCES.PETS, ACTIONS.READ), validate(petListQuerySchema, 'query'), listPetsHandler);
router.post('/', authorize(RESOURCES.PETS, ACTIONS.CREATE), validate(createPetSchema), createPetHandler);
router.get('/:id', authorize(RESOURCES.PETS, ACTIONS.READ), getPetHandler);
router.patch('/:id', authorize(RESOURCES.PETS, ACTIONS.UPDATE), validate(updatePetSchema), updatePetHandler);

export default router;
