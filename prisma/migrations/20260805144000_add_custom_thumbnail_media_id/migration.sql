-- AlterTable
ALTER TABLE "spay_offer_videos" ADD COLUMN "custom_thumbnail_media_id" UUID;

-- AddForeignKey
ALTER TABLE "spay_offer_videos" ADD CONSTRAINT "spay_offer_videos_custom_thumbnail_media_id_fkey" FOREIGN KEY ("custom_thumbnail_media_id") REFERENCES "media_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
