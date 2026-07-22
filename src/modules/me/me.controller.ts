import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated } from '../../utils/response';
import {
  getDashboardSummary,
  getLocalProfile,
  updateProfile,
  listMyDonations,
  listMyVaccinationCards,
  listMyPetCensusEntries,
  listMyEventPasses,
  listMyElections,
} from './me.service';
import {
  createMyPet,
  createMyPetDewormingRecord,
  createMyPetMedicalHistoryRecord,
  createMyPetVaccination,
  createMyPetWeightRecord,
  deleteMyPet,
  deleteMyPetDocument,
  deleteMyPetDewormingRecord,
  deleteMyPetMedicalHistoryRecord,
  deleteMyPetVaccination,
  deleteMyPetWeightRecord,
  getMyPet,
  getMyPetDocument,
  getMyPetDewormingRecord,
  getMyPetMedicalHistory,
  getMyPetMedicalHistoryRecord,
  getMyPetVaccination,
  getMyPetWeightRecord,
  listMyPetDocuments,
  listMyPetDewormingRecords,
  listMyPetMedicalHistoryRecords,
  listMyPets,
  listMyPetVaccinations,
  listMyPetWeightRecords,
  removeMyPetProfileImage,
  updateMyPet,
  updateMyPetDocument,
  updateMyPetDewormingRecord,
  updateMyPetMedicalHistoryRecord,
  updateMyPetVaccination,
  updateMyPetWeightRecord,
  uploadMyPetDocument,
  uploadMyPetProfileImage,
} from './me.pets.service';
import type {
  CreateDewormingRecordDto,
  CreateMedicalHistoryRecordDto,
  CreateMyPetDto,
  CreatePetVaccinationDto,
  CreateWeightRecordDto,
  UpdateDewormingRecordDto,
  UpdateMedicalHistoryRecordDto,
  UpdateMyPetDto,
  UpdatePetDocumentMetadataDto,
  UpdatePetVaccinationDto,
  UpdateWeightRecordDto,
} from './me.pets.types';

function idempotencyHeader(req: Request): string | undefined {
  const raw = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
  const value = typeof raw === 'string' ? raw.trim() : '';
  return value || undefined;
}

function requestIdHeader(req: Request): string | undefined {
  const requestId = req.requestId?.trim();
  if (requestId) return requestId;
  const raw = req.headers['x-request-id'];
  const value = typeof raw === 'string' ? raw.trim() : '';
  return value || undefined;
}

export async function dashboardHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.sub;
    const data = await getDashboardSummary(userId);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function updateProfileHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await updateProfile(req.user!.sub, req.body);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function getProfileHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getLocalProfile(req.user!.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function listMyDonationsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await listMyDonations(req.user!.sub, req.query);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) {
    next(err);
  }
}

export async function listMyVaccinationCardsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendSuccess(res, await listMyVaccinationCards(req.user!.sub));
  } catch (err) {
    next(err);
  }
}

export async function listMyPetCensusEntriesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await listMyPetCensusEntries(req.user!.sub, req.query);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) {
    next(err);
  }
}

export async function listMyEventPassesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await listMyEventPasses(req.user!.sub, req.query);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) {
    next(err);
  }
}

export async function listMyElectionsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendSuccess(res, await listMyElections(req.user!.sub));
  } catch (err) {
    next(err);
  }
}

export async function listMyPetsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendSuccess(
      res,
      await listMyPets(req.user!.sub, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function createMyPetHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const pet = await createMyPet(
      {
        sub: req.user!.sub,
        email: req.user!.email,
        token: req.headers.authorization,
        idempotencyKey: idempotencyHeader(req),
        requestId: requestIdHeader(req),
      },
      req.body as CreateMyPetDto,
    );
    sendCreated(res, pet);
  } catch (err) {
    next(err);
  }
}

export async function getMyPetHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendSuccess(
      res,
      await getMyPet(req.user!.sub, req.params.petId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function updateMyPetHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendSuccess(
      res,
      await updateMyPet(req.user!.sub, req.params.petId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }, req.body as UpdateMyPetDto),
    );
  } catch (err) {
    next(err);
  }
}

export async function deleteMyPetHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendSuccess(
      res,
      await deleteMyPet(req.user!.sub, req.params.petId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function listMyPetVaccinationsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendSuccess(
      res,
      await listMyPetVaccinations(req.user!.sub, req.params.petId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function getMyPetVaccinationHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendSuccess(
      res,
      await getMyPetVaccination(req.user!.sub, req.params.petId, req.params.vaccinationId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function createMyPetVaccinationHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendCreated(
      res,
      await createMyPetVaccination(
        req.user!.sub,
        req.params.petId,
        {
          token: req.headers.authorization,
          requestId: requestIdHeader(req),
          idempotencyKey: idempotencyHeader(req),
        },
        {
          ...(req.body as CreatePetVaccinationDto),
          idempotencyKey: idempotencyHeader(req) || (req.body as CreatePetVaccinationDto).idempotencyKey,
        },
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function getMyPetMedicalHistoryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendSuccess(
      res,
      await getMyPetMedicalHistory(req.user!.sub, req.params.petId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function updateMyPetVaccinationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(
      res,
      await updateMyPetVaccination(req.user!.sub, req.params.petId, req.params.vaccinationId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }, req.body as UpdatePetVaccinationDto),
    );
  } catch (err) {
    next(err);
  }
}

export async function deleteMyPetVaccinationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(
      res,
      await deleteMyPetVaccination(req.user!.sub, req.params.petId, req.params.vaccinationId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function listMyPetMedicalHistoryRecordsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(
      res,
      await listMyPetMedicalHistoryRecords(req.user!.sub, req.params.petId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function getMyPetMedicalHistoryRecordHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(
      res,
      await getMyPetMedicalHistoryRecord(req.user!.sub, req.params.petId, req.params.recordId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function createMyPetMedicalHistoryRecordHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendCreated(
      res,
      await createMyPetMedicalHistoryRecord(req.user!.sub, req.params.petId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }, req.body as CreateMedicalHistoryRecordDto),
    );
  } catch (err) {
    next(err);
  }
}

export async function updateMyPetMedicalHistoryRecordHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(
      res,
      await updateMyPetMedicalHistoryRecord(req.user!.sub, req.params.petId, req.params.recordId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }, req.body as UpdateMedicalHistoryRecordDto),
    );
  } catch (err) {
    next(err);
  }
}

export async function deleteMyPetMedicalHistoryRecordHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(
      res,
      await deleteMyPetMedicalHistoryRecord(req.user!.sub, req.params.petId, req.params.recordId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function listMyPetDewormingRecordsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(
      res,
      await listMyPetDewormingRecords(req.user!.sub, req.params.petId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function getMyPetDewormingRecordHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(
      res,
      await getMyPetDewormingRecord(req.user!.sub, req.params.petId, req.params.recordId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function createMyPetDewormingRecordHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendCreated(
      res,
      await createMyPetDewormingRecord(req.user!.sub, req.params.petId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }, req.body as CreateDewormingRecordDto),
    );
  } catch (err) {
    next(err);
  }
}

export async function updateMyPetDewormingRecordHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(
      res,
      await updateMyPetDewormingRecord(req.user!.sub, req.params.petId, req.params.recordId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }, req.body as UpdateDewormingRecordDto),
    );
  } catch (err) {
    next(err);
  }
}

export async function deleteMyPetDewormingRecordHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(
      res,
      await deleteMyPetDewormingRecord(req.user!.sub, req.params.petId, req.params.recordId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function listMyPetWeightRecordsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(
      res,
      await listMyPetWeightRecords(req.user!.sub, req.params.petId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function getMyPetWeightRecordHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(
      res,
      await getMyPetWeightRecord(req.user!.sub, req.params.petId, req.params.recordId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function createMyPetWeightRecordHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendCreated(
      res,
      await createMyPetWeightRecord(req.user!.sub, req.params.petId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }, req.body as CreateWeightRecordDto),
    );
  } catch (err) {
    next(err);
  }
}

export async function updateMyPetWeightRecordHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(
      res,
      await updateMyPetWeightRecord(req.user!.sub, req.params.petId, req.params.recordId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }, req.body as UpdateWeightRecordDto),
    );
  } catch (err) {
    next(err);
  }
}

export async function deleteMyPetWeightRecordHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(
      res,
      await deleteMyPetWeightRecord(req.user!.sub, req.params.petId, req.params.recordId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function listMyPetDocumentsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(
      res,
      await listMyPetDocuments(req.user!.sub, req.params.petId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function getMyPetDocumentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(
      res,
      await getMyPetDocument(req.user!.sub, req.params.petId, req.params.documentId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function uploadMyPetDocumentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendCreated(
      res,
      await uploadMyPetDocument(req.user!.sub, req.params.petId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }, req.file, req.body as any),
    );
  } catch (err) {
    next(err);
  }
}

export async function updateMyPetDocumentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(
      res,
      await updateMyPetDocument(req.user!.sub, req.params.petId, req.params.documentId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }, req.body as UpdatePetDocumentMetadataDto),
    );
  } catch (err) {
    next(err);
  }
}

export async function deleteMyPetDocumentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(
      res,
      await deleteMyPetDocument(req.user!.sub, req.params.petId, req.params.documentId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function uploadMyPetProfileImageHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(
      res,
      await uploadMyPetProfileImage(req.user!.sub, req.params.petId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }, req.file),
    );
  } catch (err) {
    next(err);
  }
}

export async function removeMyPetProfileImageHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(
      res,
      await removeMyPetProfileImage(req.user!.sub, req.params.petId, {
        token: req.headers.authorization,
        requestId: requestIdHeader(req),
      }),
    );
  } catch (err) {
    next(err);
  }
}
