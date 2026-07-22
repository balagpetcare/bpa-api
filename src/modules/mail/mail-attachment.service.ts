import path from 'path';
import { uploadBufferToStorage } from '../../storage/storage.service';
import { AppError } from '../../utils/AppError';

const BLOCKED_EXTENSIONS = ['.exe', '.js', '.sh', '.bat', '.cmd', '.scr', '.msi', '.vbs', '.com'];
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB default limit

export function validateAttachment(filename: string, size: number) {
  const ext = path.extname(filename).toLowerCase();
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    throw AppError.badRequest(`File type "${ext}" is blocked for security reasons.`);
  }
  if (size > MAX_FILE_SIZE) {
    throw AppError.badRequest(`Attachment exceeds the maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB.`);
  }
}

export async function uploadAttachment(
  filename: string,
  contentType: string,
  buffer: Buffer,
  cid?: string | null
) {
  // 1. Validate extension and size
  validateAttachment(filename, buffer.length);

  // 2. Upload to S3/MinIO/Local driver via Centralized Storage Service
  const uploadResult = await uploadBufferToStorage(buffer, filename, contentType);

  return {
    filename,
    contentType,
    size: buffer.length,
    storagePath: uploadResult.objectKey,
    url: uploadResult.url,
    cid: cid || null,
  };
}
