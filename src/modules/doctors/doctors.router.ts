import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { RESOURCES, ACTIONS } from '../../config/constants';
import { createDoctorSchema, updateDoctorSchema, doctorListQuerySchema } from './doctors.types';
import { createDoctorHandler, listDoctorsHandler, getDoctorHandler, updateDoctorHandler, deactivateDoctorHandler } from './doctors.controller';

const router = Router();

router.use(authenticate);

router.get('/', authorize(RESOURCES.DOCTORS, ACTIONS.READ), validate(doctorListQuerySchema, 'query'), listDoctorsHandler);
router.post('/', authorize(RESOURCES.DOCTORS, ACTIONS.CREATE), validate(createDoctorSchema), createDoctorHandler);
router.get('/:id', authorize(RESOURCES.DOCTORS, ACTIONS.READ), getDoctorHandler);
router.patch('/:id', authorize(RESOURCES.DOCTORS, ACTIONS.UPDATE), validate(updateDoctorSchema), updateDoctorHandler);
router.delete('/:id', authorize(RESOURCES.DOCTORS, ACTIONS.DELETE), deactivateDoctorHandler);

export default router;
