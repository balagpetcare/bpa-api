import { AppError } from '../../utils/AppError';
import * as repo from './public-documents-admin.repository';
import type {
  CreatePublicDocumentDto,
  UpdatePublicDocumentDto,
  PublicDocumentAdminListQuery,
} from './public-documents-admin.types';

export async function createPublicDocument(dto: CreatePublicDocumentDto) {
  return repo.createPublicDocument(dto);
}

export async function listPublicDocuments(query: PublicDocumentAdminListQuery) {
  return repo.listPublicDocuments(query);
}

export async function getPublicDocument(id: string) {
  const item = await repo.getPublicDocumentById(id);
  if (!item) throw AppError.notFound('Document');
  return item;
}

export async function updatePublicDocument(id: string, dto: UpdatePublicDocumentDto) {
  await getPublicDocument(id);
  return repo.updatePublicDocument(id, dto);
}

export async function deletePublicDocument(id: string) {
  await getPublicDocument(id);
  return repo.deletePublicDocument(id);
}
