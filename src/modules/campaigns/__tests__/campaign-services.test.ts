import { CampaignStatus, CampaignType, LocationType, PetGender, PetType } from '@prisma/client';
import { prisma } from '../../../database/prisma';
import { createVenue } from '../../locations/locations.repository';
import { createRegistration } from '../../campaign-registrations/campaign-registrations.repository';
import { deleteService, listServices, updateService } from '../campaigns.service';
import { getCampaignBySlug } from '../campaigns.repository';

describe('Campaign services admin safety', () => {
  let userId: string;
  let venueId: string;
  let locationId: string;

  const campaignIds: string[] = [];
  const serviceIds: string[] = [];
  const registrationIds: string[] = [];
  const petIds: string[] = [];
  const ownerIds: string[] = [];

  async function createTestCampaign(title: string) {
    const campaign = await prisma.campaign.create({
      data: {
        slug: `${title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title,
        campaignType: CampaignType.vaccination,
        status: CampaignStatus.draft,
        startDate: new Date(Date.now() + 86400000),
        endDate: new Date(Date.now() + 172800000),
        createdById: userId,
      },
    });
    campaignIds.push(campaign.id);
    return campaign;
  }

  async function createTestService(campaignId: string, name: string) {
    const service = await prisma.campaignService.create({
      data: {
        campaignId,
        name,
        description: `${name} description`,
        priceBdt: 200,
        sortOrder: 1,
        isRequired: false,
      },
    });
    serviceIds.push(service.id);
    return service;
  }

  async function createUsedService(campaignId: string, serviceId: string) {
    const owner = await prisma.petOwner.create({
      data: {
        ownerName: 'Service Test Owner',
        mobile: `017${String(Date.now()).slice(-8)}`,
        email: 'owner@example.com',
        isGuest: true,
      },
    });
    ownerIds.push(owner.id);

    const pet = await prisma.pet.create({
      data: {
        ownerId: owner.id,
        name: 'Service Test Pet',
        petType: PetType.cat,
        gender: PetGender.unknown,
        isActive: true,
      },
    });
    petIds.push(pet.id);

    const session = await prisma.campaignSession.create({
      data: {
        campaignId,
        venueId,
        sessionDate: new Date(Date.now() + 86400000),
        startTime: '09:00',
        endTime: '12:00',
        capacity: 20,
      },
    });

    const registration = await createRegistration({
      bookingNumber: `BPA-BK-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      campaignId,
      sessionId: session.id,
      ownerId: owner.id,
      totalAmountBdt: 0,
      isGuest: true,
      petIds: [pet.id],
      campaignServiceIds: [serviceId],
    });
    registrationIds.push(registration.id);
  }

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { name: 'Campaign Service Test User', role: 'ADMIN' } });
    userId = user.id;

    const location = await prisma.location.create({
      data: {
        type: LocationType.DIVISION,
        nameEn: 'Service Test Division',
        slug: `service-test-division-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      },
    });
    locationId = location.id;

    const venue = await createVenue({
      name: 'Service Test Venue',
      address: 'Service Test Address',
      locationId: location.id,
    });
    venueId = venue.id;
  });

  afterAll(async () => {
    if (registrationIds.length > 0) {
      await prisma.campaignRegistration.deleteMany({ where: { id: { in: registrationIds } } });
    }
    if (petIds.length > 0) {
      await prisma.pet.deleteMany({ where: { id: { in: petIds } } });
    }
    if (ownerIds.length > 0) {
      await prisma.petOwner.deleteMany({ where: { id: { in: ownerIds } } });
    }
    if (campaignIds.length > 0) {
      await prisma.campaignService.deleteMany({ where: { campaignId: { in: campaignIds } } });
      await prisma.campaignSession.deleteMany({ where: { campaignId: { in: campaignIds } } });
      await prisma.campaign.deleteMany({ where: { id: { in: campaignIds } } });
    }
    if (venueId) {
      await prisma.venue.deleteMany({ where: { id: venueId } });
    }
    if (locationId) {
      await prisma.location.deleteMany({ where: { id: locationId } });
    }
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('physically deletes an unused service', async () => {
    const campaign = await createTestCampaign('Unused Service Campaign');
    const service = await createTestService(campaign.id, 'Unused Vaccine');

    const result = await deleteService(campaign.id, service.id);

    expect(result.action).toBe('deleted');
    expect(await prisma.campaignService.findUnique({ where: { id: service.id } })).toBeNull();
  });

  it('soft-deletes a service that is already used by a booking', async () => {
    const campaign = await createTestCampaign('Used Service Campaign');
    const service = await createTestService(campaign.id, 'Used Vaccine');
    await createUsedService(campaign.id, service.id);

    const result = await deleteService(campaign.id, service.id);

    expect(result.action).toBe('deactivated');
    const stored = await prisma.campaignService.findUnique({ where: { id: service.id } });
    expect(stored?.isActive).toBe(false);
    expect(stored?.deletedAt).toBeTruthy();
    expect(await listServices(campaign.id)).toEqual([]);
    expect((await listServices(campaign.id, true))).toHaveLength(1);

    const publicCampaign = await getCampaignBySlug(campaign.slug);
    expect(publicCampaign?.services).toEqual([]);
  });

  it('blocks unsafe price changes when the service is already used', async () => {
    const campaign = await createTestCampaign('Unsafe Edit Campaign');
    const service = await createTestService(campaign.id, 'Unsafe Edit Vaccine');
    await createUsedService(campaign.id, service.id);

    await expect(
      updateService(campaign.id, service.id, { priceBdt: 999 }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('allows safe edits on an active service', async () => {
    const campaign = await createTestCampaign('Safe Edit Campaign');
    const service = await createTestService(campaign.id, 'Safe Edit Vaccine');

    const updated = await updateService(campaign.id, service.id, {
      name: 'Safe Edit Vaccine Updated',
      description: 'Updated description',
      sortOrder: 4,
      priceBdt: 250,
    });

    expect(updated.name).toBe('Safe Edit Vaccine Updated');
    expect(updated.description).toBe('Updated description');
    expect(updated.sortOrder).toBe(4);
    expect(updated.priceBdt).toBe(250);
  });

  it('rejects edits for a service that belongs to another campaign', async () => {
    const campaignA = await createTestCampaign('Campaign A');
    const campaignB = await createTestCampaign('Campaign B');
    const service = await createTestService(campaignA.id, 'Foreign Campaign Service');

    await expect(
      updateService(campaignB.id, service.id, { name: 'Wrong campaign' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
