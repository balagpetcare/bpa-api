import { prisma } from '../../database/prisma';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';
import type { CertificateListQuery } from './campaign-certificates.types';

// ─── Certificate number generator ────────────────────────────────
// Format: BPA-CERT-YYYYMMDD-NNNNN (daily sequential, zero-padded)

export async function generateCertificateNumber(): Promise<string> {
  const today = new Date();
  const datePart = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `BPA-CERT-${datePart}-`;

  const last = await prisma.certificate.findFirst({
    where: { certificateNumber: { startsWith: prefix } },
    orderBy: { certificateNumber: 'desc' },
    select: { certificateNumber: true },
  });

  let seq = 1;
  if (last) {
    const lastSeq = parseInt(last.certificateNumber.slice(-5), 10);
    seq = lastSeq + 1;
  }

  return `${prefix}${String(seq).padStart(5, '0')}`;
}

// ─── Reads ───────────────────────────────────────────────────────

export const certificateInclude = {
  petBooking: {
    include: {
      pet: {
        include: {
          owner: { select: { id: true, ownerName: true, mobile: true, email: true } },
        },
      },
      session: {
        select: {
          id: true,
          sessionDate: true,
          startTime: true,
          endTime: true,
          venue: { select: { name: true, address: true } },
        },
      },
      registration: {
        select: {
          id: true,
          bookingNumber: true,
          campaignId: true,
          campaign: { select: { id: true, title: true, campaignType: true } },
        },
      },
      vaccinationRecords: {
        select: {
          id: true,
          vaccineName: true,
          batchNumber: true,
          administeredAt: true,
          nextDueDate: true,
          doctor: { select: { name: true } },
        },
      },
    },
  },
  issuedBy: { select: { id: true, name: true } },
} as const;

export async function findCertificateByPetBookingId(petBookingId: string) {
  return prisma.certificate.findFirst({
    where: { petBookingId, supersededAt: null },
    include: certificateInclude,
  });
}

export async function findCertificateByVerifyToken(verifyToken: string) {
  return prisma.certificate.findUnique({
    where: { verifyToken },
    include: certificateInclude,
  });
}

export async function findCertificateByCertNumber(certificateNumber: string) {
  return prisma.certificate.findUnique({
    where: { certificateNumber },
    include: certificateInclude,
  });
}

export async function listCertificates(query: CertificateListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);

  const where = query.campaignId
    ? { petBooking: { registration: { campaignId: query.campaignId } } }
    : {};

  const [items, total] = await Promise.all([
    prisma.certificate.findMany({
      where,
      skip,
      take: limit,
      orderBy: { issuedAt: 'desc' },
      include: certificateInclude,
    }),
    prisma.certificate.count({ where }),
  ]);

  return { items, meta: buildPaginationMeta(total, page, limit) };
}

// ─── Writes ──────────────────────────────────────────────────────

export async function createCertificate(params: {
  certificateNumber: string;
  petBookingId: string;
  verifyToken: string;
  issuedById: string;
}) {
  return prisma.certificate.create({
    data: {
      certificateNumber: params.certificateNumber,
      petBookingId: params.petBookingId,
      verifyToken: params.verifyToken,
      issuedById: params.issuedById,
      issuedAt: new Date(),
    },
    include: certificateInclude,
  });
}

export async function supersedeCertificate(id: string) {
  return prisma.certificate.update({
    where: { id },
    data: { supersededAt: new Date() },
  });
}
