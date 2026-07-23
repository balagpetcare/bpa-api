import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../utils/AppError';
import { sendSuccess } from '../../utils/response';
import { auditContextFromRequest, auditCreate } from '../../utils/audit';
import { importClinicDirectory } from './clinic-import.service';

export async function importClinicsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const file = req.file;
    if (!file) throw AppError.badRequest('An .xlsx workbook file is required');

    const commit = req.query.commit === 'true';
    const report = await importClinicDirectory(file.buffer, { commit });

    if (commit) {
      await auditCreate(
        'clinic_import_batch',
        `import-${Date.now()}`,
        {
          fileName: file.originalname,
          totalRows: report.totalRows,
          inserted: report.inserted,
          updated: report.updated,
          unchanged: report.unchanged,
          skipped: report.skipped,
          invalid: report.invalid,
        },
        auditContextFromRequest(req),
      );
    }

    sendSuccess(res, report);
  } catch (err) { next(err); }
}
