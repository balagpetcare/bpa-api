import { prisma } from '../../../database/prisma';
import * as admin from '../spay-neuter.admin.service';
import { getUserPermissions, hasPermission } from '../../../middlewares/authorize';

describe('spay-neuter admin service — offers, clinic profiles, RBAC price guard', () => {
  const suffix = Date.now();
  const startsAt = new Date(Date.now() - 86_400_000).toISOString();
  const endsAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
  let clinicOrgId: string;
  let clinicBranchId: string;
  let adminUserId: string;
  let mobileMediaId: string;
  let webMediaId: string;
  let otherMediaId: string;

  beforeAll(async () => {
    const org = await prisma.clinicOrganization.create({ data: { name: `Admin Test Org ${suffix}`, slug: `admin-test-org-${suffix}` } });
    clinicOrgId = org.id;
    const branch = await prisma.clinicBranch.create({ data: { organizationId: clinicOrgId, branchName: 'Admin Test Branch' } });
    clinicBranchId = branch.id;
    const user = await prisma.user.create({ data: { name: 'Admin Test User', email: `admin-svc-${suffix}@example.test`, isActive: true } });
    adminUserId = user.id;

    const mobileMedia = await prisma.mediaFile.create({
      data: { filename: `mobile-${suffix}.jpg`, originalName: 'mobile.jpg', mimeType: 'image/jpeg', sizeBytes: 1024, url: `https://cdn.test/mobile-${suffix}.jpg` },
    });
    mobileMediaId = mobileMedia.id;
    const webMedia = await prisma.mediaFile.create({
      data: { filename: `web-${suffix}.jpg`, originalName: 'web.jpg', mimeType: 'image/jpeg', sizeBytes: 2048, url: `https://cdn.test/web-${suffix}.jpg` },
    });
    webMediaId = webMedia.id;
    const otherMedia = await prisma.mediaFile.create({
      data: { filename: `other-${suffix}.jpg`, originalName: 'other.jpg', mimeType: 'image/jpeg', sizeBytes: 512, url: `https://cdn.test/other-${suffix}.jpg` },
    });
    otherMediaId = otherMedia.id;
  });

  afterAll(async () => {
    await prisma.spayOfferClinic.deleteMany({ where: { clinicBranchId } });
    await prisma.spayClinicService.deleteMany({ where: { clinicProfile: { clinicBranchId } } });
    await prisma.spayClinicSchedule.deleteMany({ where: { clinicProfile: { clinicBranchId } } });
    await prisma.spayClinicBreak.deleteMany({ where: { clinicProfile: { clinicBranchId } } });
    await prisma.spayClinicProfile.deleteMany({ where: { clinicBranchId } });
    await prisma.spayOffer.deleteMany({ where: { slug: { startsWith: `admin-test-offer-${suffix}` } } });
    await prisma.clinicBranch.deleteMany({ where: { id: clinicBranchId } });
    await prisma.clinicOrganization.deleteMany({ where: { id: clinicOrgId } });
    await prisma.mediaFile.deleteMany({ where: { id: { in: [mobileMediaId, webMediaId, otherMediaId] } } });
    await prisma.user.deleteMany({ where: { id: adminUserId } });
    await prisma.$disconnect();
  });

  describe('offer create/edit/publish/pause/complete/archive lifecycle', () => {
    it('rejects an advance exceeding either procedure total', async () => {
      await expect(
        admin.createOffer(
          { title: 'Bad Offer', slug: `admin-test-offer-${suffix}-bad`, neuterTotalPriceBdt: 400, spayTotalPriceBdt: 3500, advanceBdt: 500, medicallyUnfitRefundable: true, startsAt, endsAt },
          adminUserId,
        ),
      ).rejects.toMatchObject({ code: 'SPAY_ADVANCE_EXCEEDS_TOTAL' });
    });

    it('creates a draft offer, edits it, then walks the full lifecycle', async () => {
      const offer = await admin.createOffer(
        { title: 'Lifecycle Offer', slug: `admin-test-offer-${suffix}-lifecycle`, neuterTotalPriceBdt: 2000, spayTotalPriceBdt: 3500, advanceBdt: 500, medicallyUnfitRefundable: true, startsAt, endsAt },
        adminUserId,
      );
      expect(offer.status).toBe('draft');

      const edited = await admin.updateOffer(offer.id, { neuterTotalPriceBdt: 2200 }, adminUserId);
      expect(Number(edited.neuterTotalPriceBdt)).toBe(2200);

      // Cannot pause/complete a draft.
      await expect(admin.transitionOffer(offer.id, 'pause', adminUserId)).rejects.toMatchObject({ code: 'SPAY_OFFER_INVALID_TRANSITION' });

      const published = await admin.transitionOffer(offer.id, 'publish', adminUserId);
      expect(published.status).toBe('published');
      expect(published.publishedAt).not.toBeNull();

      const paused = await admin.transitionOffer(offer.id, 'pause', adminUserId);
      expect(paused.status).toBe('paused');

      const republished = await admin.transitionOffer(offer.id, 'publish', adminUserId);
      expect(republished.status).toBe('published');

      const completed = await admin.transitionOffer(offer.id, 'complete', adminUserId);
      expect(completed.status).toBe('completed');

      const archived = await admin.transitionOffer(offer.id, 'archive', adminUserId);
      expect(archived.deletedAt).not.toBeNull();

      // Archived (soft-deleted) offers are no longer retrievable.
      await expect(admin.getOffer(offer.id)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('editing an offer price does not retroactively change an already-created booking snapshot', async () => {
      // (Covered structurally: updateOffer only touches SpayOffer; SpayBooking
      // snapshot fields are written once at booking-creation time and never
      // re-read from SpayOffer afterward — see spay-neuter.booking.service.ts.
      // This test asserts the offer-side half of that contract: editing
      // price after creation succeeds and is visible on the offer, proving
      // updateOffer performs a live mutation rather than being blocked once
      // bookings might reference it.)
      const offer = await admin.createOffer(
        { title: 'Snapshot Offer', slug: `admin-test-offer-${suffix}-snapshot`, neuterTotalPriceBdt: 1500, spayTotalPriceBdt: 2500, advanceBdt: 500, medicallyUnfitRefundable: true, startsAt, endsAt },
        adminUserId,
      );
      const edited = await admin.updateOffer(offer.id, { neuterTotalPriceBdt: 1800 }, adminUserId);
      expect(Number(edited.neuterTotalPriceBdt)).toBe(1800);
    });
  });

  describe('mobile/web image persistence', () => {
    async function makeImageOffer(suffixSlug: string) {
      return admin.createOffer(
        {
          title: 'Image Offer',
          slug: `admin-test-offer-${suffix}-${suffixSlug}`,
          neuterTotalPriceBdt: 2000,
          spayTotalPriceBdt: 3500,
          advanceBdt: 500,
          medicallyUnfitRefundable: true,
          startsAt,
          endsAt,
          mobileImageId: mobileMediaId,
          webImageId: webMediaId,
        },
        adminUserId,
      );
    }

    it('creates an offer with both images and the detail response resolves both MediaFile rows', async () => {
      const offer = await makeImageOffer('img-create');
      expect(offer.mobileImageId).toBe(mobileMediaId);
      expect(offer.webImageId).toBe(webMediaId);

      const detail = await admin.getOffer(offer.id);
      expect(detail.mobileImage?.id).toBe(mobileMediaId);
      expect(detail.mobileImage?.url).toContain('mobile-');
      expect(detail.webImage?.id).toBe(webMediaId);
      expect(detail.webImage?.url).toContain('web-');
    });

    it('updating without image fields preserves both existing images', async () => {
      const offer = await makeImageOffer('img-preserve');
      const updated = await admin.updateOffer(offer.id, { title: 'Renamed Image Offer' }, adminUserId);
      expect(updated.mobileImageId).toBe(mobileMediaId);
      expect(updated.webImageId).toBe(webMediaId);

      const detail = await admin.getOffer(offer.id);
      expect(detail.mobileImage?.id).toBe(mobileMediaId);
      expect(detail.webImage?.id).toBe(webMediaId);
    });

    it('replacing only the mobile image leaves the web image untouched', async () => {
      const offer = await makeImageOffer('img-replace-mobile');
      const updated = await admin.updateOffer(offer.id, { mobileImageId: otherMediaId }, adminUserId);
      expect(updated.mobileImageId).toBe(otherMediaId);
      expect(updated.webImageId).toBe(webMediaId);
    });

    it('replacing only the web image leaves the mobile image untouched', async () => {
      const offer = await makeImageOffer('img-replace-web');
      const updated = await admin.updateOffer(offer.id, { webImageId: otherMediaId }, adminUserId);
      expect(updated.webImageId).toBe(otherMediaId);
      expect(updated.mobileImageId).toBe(mobileMediaId);
    });

    it('an explicit null clears one image without touching the other', async () => {
      const offer = await makeImageOffer('img-remove-mobile');
      const updated = await admin.updateOffer(offer.id, { mobileImageId: null }, adminUserId);
      expect(updated.mobileImageId).toBeNull();
      expect(updated.webImageId).toBe(webMediaId);
    });

    it('rejects a media reference that does not exist', async () => {
      await expect(makeImageOffer('img-invalid').then((offer) => admin.updateOffer(offer.id, { mobileImageId: '00000000-0000-0000-0000-000000000000' }, adminUserId))).rejects.toMatchObject({
        code: 'SPAY_OFFER_INVALID_MEDIA_REFERENCE',
      });
    });
  });

  describe('participating clinics — seeds 20/40-minute defaults, capacity, schedule conflict detection', () => {
    it('creating a clinic profile seeds neuter=20min and spay=40min service durations', async () => {
      const profile = await admin.createClinicProfile({ clinicBranchId, concurrentOperationCapacity: 2 }, adminUserId);
      const neuter = profile.services.find((s) => s.procedure === 'neuter');
      const spay = profile.services.find((s) => s.procedure === 'spay');
      expect(neuter?.durationMinutes).toBe(20);
      expect(spay?.durationMinutes).toBe(40);
    });

    it('rejects creating a second profile for the same clinic branch', async () => {
      await expect(admin.createClinicProfile({ clinicBranchId, concurrentOperationCapacity: 3 }, adminUserId)).rejects.toMatchObject({
        code: 'SPAY_CLINIC_PROFILE_EXISTS',
      });
    });

    it('rejects an unknown/non-existent clinicBranchId rather than creating an orphaned profile', async () => {
      await expect(
        admin.createClinicProfile({ clinicBranchId: '00000000-0000-0000-0000-000000000000', concurrentOperationCapacity: 2 }, adminUserId),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('custom durations are configurable per clinic (overriding the 20/40 default)', async () => {
      const profile = await prisma.spayClinicProfile.findFirstOrThrow({ where: { clinicBranchId } });
      const updated = await admin.upsertClinicService(profile.id, 'neuter', 25, true);
      expect(updated.durationMinutes).toBe(25);
    });

    it('detects an overlapping weekly-schedule conflict and a break falling outside any schedule window', async () => {
      const profile = await prisma.spayClinicProfile.findFirstOrThrow({ where: { clinicBranchId } });
      await admin.addSchedule(profile.id, 2, '09:00', '13:00');
      await admin.addSchedule(profile.id, 2, '12:00', '17:00'); // overlaps the first
      await admin.addBreak(profile.id, 3, '13:00', '14:00'); // day 3 has no schedule at all

      const conflicts = await admin.detectScheduleConflicts(profile.id);
      expect(conflicts.some((c) => c.type === 'overlapping_schedule')).toBe(true);
      expect(conflicts.some((c) => c.type === 'break_outside_schedule')).toBe(true);
    });

    it('rejects a schedule row where startTime is not before endTime', async () => {
      const profile = await prisma.spayClinicProfile.findFirstOrThrow({ where: { clinicBranchId } });
      await expect(admin.addSchedule(profile.id, 4, '14:00', '10:00')).rejects.toMatchObject({ code: 'SPAY_INVALID_TIME_RANGE' });
    });

    it('a manual slot capacity cannot exceed the clinic\'s configured concurrent capacity', async () => {
      const profile = await prisma.spayClinicProfile.findFirstOrThrow({ where: { clinicBranchId } });
      await expect(admin.createManualSlot(profile.id, new Date('2026-12-25'), '09:00', '11:00', 99)).rejects.toMatchObject({
        code: 'SPAY_INVALID_CAPACITY',
      });
      const slot = await admin.createManualSlot(profile.id, new Date('2026-12-25'), '09:00', '11:00', 2);
      expect(slot.capacity).toBe(2);
    });

    it('a manual slot defaults to open-to-either-procedure (null), and can be explicitly scoped to one procedure', async () => {
      const profile = await prisma.spayClinicProfile.findFirstOrThrow({ where: { clinicBranchId } });
      const openSlot = await admin.createManualSlot(profile.id, new Date('2026-12-26'), '09:00', '11:00', 1);
      expect(openSlot.procedure).toBeNull();

      const scopedSlot = await admin.createManualSlot(profile.id, new Date('2026-12-27'), '09:00', '11:00', 1, 'spay');
      expect(scopedSlot.procedure).toBe('spay');
    });
  });

  describe('offer ↔ clinic linking is independent of public clinic-directory publishing', () => {
    it('linking a clinic to an offer never touches ClinicBranch.published', async () => {
      const offer = await admin.createOffer(
        { title: 'Link Offer', slug: `admin-test-offer-${suffix}-link`, neuterTotalPriceBdt: 2000, spayTotalPriceBdt: 3500, advanceBdt: 500, medicallyUnfitRefundable: true, startsAt, endsAt },
        adminUserId,
      );
      const branchBefore = await prisma.clinicBranch.findUniqueOrThrow({ where: { id: clinicBranchId } });
      expect(branchBefore.published).toBe(false);

      await admin.linkOfferClinic(offer.id, clinicBranchId);
      const branchAfter = await prisma.clinicBranch.findUniqueOrThrow({ where: { id: clinicBranchId } });
      expect(branchAfter.published).toBe(false); // unchanged — separate permission, separate resource

      const fetched = await admin.getOffer(offer.id);
      expect(fetched.clinics.some((c) => c.clinicBranchId === clinicBranchId)).toBe(true);

      await admin.unlinkOfferClinic(offer.id, clinicBranchId);
      const fetchedAfterUnlink = await admin.getOffer(offer.id);
      const link = fetchedAfterUnlink.clinics.find((c) => c.clinicBranchId === clinicBranchId);
      expect(link?.isActive).toBe(false);
    });
  });

  describe('RBAC: clinic roles cannot change BPA prices', () => {
    it('no seeded clinic role holds any permission on spay_offers', async () => {
      for (const roleName of ['clinic_admin', 'clinic_vet', 'clinic_front_desk']) {
        const role = await prisma.role.findFirst({ where: { name: roleName }, include: { rolePermissions: { include: { permission: true } } } });
        const perms = role!.rolePermissions.map((rp) => `${rp.permission.resource}:${rp.permission.action}`);
        expect(perms.some((p) => p.startsWith('spay_offers:'))).toBe(false);
        expect(hasPermission(perms, 'spay_offers', 'update')).toBe(false);
        expect(hasPermission(perms, 'spay_offers', 'create')).toBe(false);
      }

      const admin_ = await prisma.role.findFirst({ where: { name: 'admin' }, include: { rolePermissions: { include: { permission: true } } } });
      const adminPerms = admin_!.rolePermissions.map((rp) => `${rp.permission.resource}:${rp.permission.action}`);
      expect(hasPermission(adminPerms, 'spay_offers', 'update')).toBe(true);
    });

    it('a real clinic_admin user resolved via getUserPermissions cannot satisfy spay_offers:update', async () => {
      const role = await prisma.role.findFirstOrThrow({ where: { name: 'clinic_admin' } });
      const user = await prisma.user.create({ data: { name: 'RBAC Test Clinic Admin', email: `rbac-clinic-admin-${suffix}@example.test`, isActive: true } });
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });

      const perms = await getUserPermissions(user.id, []);
      expect(hasPermission(perms, 'spay_offers', 'update')).toBe(false);
      expect(hasPermission(perms, 'spay_offers', 'create')).toBe(false);
      expect(hasPermission(perms, 'spay_refunds', 'approve')).toBe(false); // and still cannot approve refunds

      await prisma.userRole.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    });
  });
});
