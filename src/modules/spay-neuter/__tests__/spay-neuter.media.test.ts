import { prisma } from '../../../database/prisma';
import { createOfferVideo, updateOfferVideo, addOfferMedia, removeOfferMedia } from '../spay-neuter.admin.service';

describe('Spay & Neuter Admin Media / Video management', () => {
  let offerId: string;
  let mediaFileId: string;

  beforeAll(async () => {
    const offer = await prisma.spayOffer.create({
      data: {
        title: 'Media Test Offer',
        slug: `media-test-${Date.now()}`,
        neuterTotalPriceBdt: 1000,
        spayTotalPriceBdt: 1500,
        advanceBdt: 500,
      },
    });
    offerId = offer.id;

    const media = await prisma.mediaFile.create({
      data: {
        filename: 'test-image.jpg',
        originalName: 'test-image.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1000,
        url: 'https://example.com/test-image.jpg',
      },
    });
    mediaFileId = media.id;
  });

  afterAll(async () => {
    await prisma.spayOffer.delete({ where: { id: offerId } });
    await prisma.mediaFile.delete({ where: { id: mediaFileId } });
    await prisma.$disconnect();
  });

  describe('Gallery', () => {
    it('adds a gallery image', async () => {
      const media = await addOfferMedia(offerId, mediaFileId, { altText: 'Test Alt', caption: 'Test Caption' }, 'actor-123');
      expect(media.offerId).toBe(offerId);
      expect(media.mediaFileId).toBe(mediaFileId);
      expect(media.altText).toBe('Test Alt');
    });

    it('removes a gallery image without deleting central media', async () => {
      const existing = await prisma.spayOfferMedia.findFirst({ where: { offerId, mediaFileId } });
      expect(existing).not.toBeNull();
      
      await removeOfferMedia(existing!.id);
      
      const afterDelete = await prisma.spayOfferMedia.findFirst({ where: { offerId, mediaFileId } });
      expect(afterDelete).toBeNull();

      const centralMedia = await prisma.mediaFile.findUnique({ where: { id: mediaFileId } });
      expect(centralMedia).not.toBeNull();
    });
  });

  describe('Videos', () => {
    it('creates a YouTube video and normalizes the URL', async () => {
      const video = await createOfferVideo(offerId, {
        urlOrId: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Rickroll',
        customThumbnailMediaId: mediaFileId,
      }, 'actor-123');
      expect(video.videoId).toBe('dQw4w9WgXcQ');
      expect(video.title).toBe('Rickroll');
      expect(video.isActive).toBe(true);
      expect(video.customThumbnailMediaId).toBe(mediaFileId);
      expect(video.sortOrder).toBe(0);
    });

    it('rejects invalid YouTube URLs', async () => {
      await expect(createOfferVideo(offerId, {
        urlOrId: 'https://vimeo.com/123456789',
        title: 'Vimeo Video',
      }, 'actor-123')).rejects.toMatchObject({ name: 'AppError', statusCode: 400 });
    });

    it('updates a video and re-normalizes the URL', async () => {
      const existing = await prisma.spayOfferVideo.findFirst({ where: { offerId } });
      const updated = await updateOfferVideo(existing!.id, {
        urlOrId: 'https://youtu.be/jNQXAC9IVRw',
        title: 'Me at the zoo',
        isActive: false,
        customThumbnailMediaId: null,
      }, 'actor-123');
      expect(updated.videoId).toBe('jNQXAC9IVRw');
      expect(updated.title).toBe('Me at the zoo');
      expect(updated.isActive).toBe(false);
      expect(updated.customThumbnailMediaId).toBeNull();
    });
  });
});
