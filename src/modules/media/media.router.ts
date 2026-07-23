import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { uploadSingle } from '../../middlewares/upload';
import { RESOURCES, ACTIONS } from '../../config/constants';
import { updateMediaSchema, mediaListQuerySchema, mediaIdParamSchema, cropMediaSchema } from './media.types';
import {
  listMediaHandler, getMediaHandler,
  uploadFileHandler, updateMediaHandler, deleteMediaHandler,
  cropMediaHandler,
} from './media.controller';

const router = Router();

router.use(authenticate);

router.get('/', authorize(RESOURCES.MEDIA, ACTIONS.READ), validate(mediaListQuerySchema, 'query'), listMediaHandler);
router.get('/:id', authorize(RESOURCES.MEDIA, ACTIONS.READ), validate(mediaIdParamSchema, 'params'), getMediaHandler);
router.post('/upload', authorize(RESOURCES.MEDIA, ACTIONS.CREATE), uploadSingle, uploadFileHandler);
router.patch('/:id', authorize(RESOURCES.MEDIA, ACTIONS.UPDATE), validate(mediaIdParamSchema, 'params'), validate(updateMediaSchema), updateMediaHandler);
router.post('/:id/crop', authorize(RESOURCES.MEDIA, ACTIONS.CREATE), validate(mediaIdParamSchema, 'params'), validate(cropMediaSchema), cropMediaHandler);
router.delete('/:id', authorize(RESOURCES.MEDIA, ACTIONS.DELETE), validate(mediaIdParamSchema, 'params'), deleteMediaHandler);

export default router;
