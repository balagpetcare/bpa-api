import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { AppError } from '../../utils/AppError';
import { RESOURCES, ACTIONS } from '../../config/constants';
import { importClinicsHandler } from './clinic-import.controller';

const XLSX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (XLSX_MIME_TYPES.has(file.mimetype) || file.originalname.toLowerCase().endsWith('.xlsx')) {
      cb(null, true);
    } else {
      cb(new AppError(400, 'UNSUPPORTED_MEDIA_TYPE', 'Only .xlsx workbooks are accepted'));
    }
  },
});

const router = Router();

router.use(authenticate);

// `?commit=true` performs the write; omitted/false is always a dry-run
// preview, so an admin can review insert/update/skip/invalid counts first.
router.post(
  '/',
  authorize(RESOURCES.CLINIC_IMPORTS, ACTIONS.MANAGE),
  upload.single('file'),
  importClinicsHandler,
);

export default router;
