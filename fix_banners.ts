import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

import sharp from 'sharp';

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`Starting Hero Slider repair...${DRY_RUN ? ' (DRY RUN)' : ''}`);

  const fileToFix = '911e5748-246e-487c-9442-a3acd5cdd7ca_repaired.jpg';
  const filePath = path.join(__dirname, 'uploads', fileToFix);
  
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: Source file not found: ${filePath}`);
    process.exit(1);
  }

  // Generate new filename to bust Flutter cache
  const timestamp = Date.now();
  const newFilename = fileToFix.replace('.jpg', `_repaired_${timestamp}.jpg`);
  const newFilePath = path.join(__dirname, 'uploads', newFilename);

  console.log(`Source file verified: ${filePath}`);
  
  // Read and fully decode the source with Sharp
  const inputBuffer = fs.readFileSync(filePath);
  let working: sharp.Sharp;
  let metadata: sharp.Metadata;
  try {
    working = sharp(inputBuffer, { failOn: 'error' });
    metadata = await working.metadata();
    console.log(`Source decoded successfully: ${metadata.width}x${metadata.height} ${metadata.format}`);
  } catch (e) {
    console.error(`ERROR: Failed to decode source image: ${e}`);
    process.exit(1);
  }

  // Reprocess image (force baseline JPEG, rotate before resize, sRGB, etc.)
  let outputBuffer: Buffer;
  let outputInfo: sharp.OutputInfo;
  try {
    const pipeline = sharp(inputBuffer, { failOn: 'error' })
      .rotate()
      .toColorspace('srgb')
      .jpeg({
        quality: 85,
        progressive: false,
        chromaSubsampling: '4:2:0'
      });
      
    const result = await pipeline.toBuffer({ resolveWithObject: true });
    outputBuffer = result.data;
    outputInfo = result.info;
    console.log(`New image encoded successfully: ${outputInfo.width}x${outputInfo.height} ${outputInfo.format}`);
    
    // Verify valid JPEG signature
    if (outputBuffer.length < 3 || outputBuffer[0] !== 0xff || outputBuffer[1] !== 0xd8 || outputBuffer[2] !== 0xff) {
        throw new Error('Output buffer does not start with valid JPEG signature (FF D8 FF)');
    }
  } catch (e) {
    console.error(`ERROR: Failed to re-encode image: ${e}`);
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would write new file to: ${newFilePath}`);
  } else {
    fs.writeFileSync(newFilePath, outputBuffer);
    console.log(`Wrote new file: ${newFilePath}`);
  }
  
  // Find AppBanners referencing the old file
  const banners = await prisma.appBanner.findMany({
    where: { 
      OR: [
        { imageUrl: { contains: fileToFix } },
        { mobileImageUrl: { contains: fileToFix } }
      ]
    }
  });

  if (banners.length === 0) {
    console.log(`No AppBanner records found containing URL: ${fileToFix}`);
  }

  // Deduplicate URLs to update (assuming oldUrl is the same across them)
  const oldUrls = new Set<string>();
  for (const b of banners) {
      if (b.imageUrl && b.imageUrl.includes(fileToFix)) oldUrls.add(b.imageUrl);
      if (b.mobileImageUrl && b.mobileImageUrl.includes(fileToFix)) oldUrls.add(b.mobileImageUrl);
  }

  for (const oldUrl of oldUrls) {
    const newUrl = oldUrl.replace(fileToFix, newFilename);
    
    console.log(`Found AppBanner URL to update:`);
    console.log(`  Old URL: ${oldUrl}`);
    console.log(`  New URL: ${newUrl}`);

    if (DRY_RUN) {
        console.log(`[DRY RUN] Would update AppBanners transactionally.`);
        continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        // Update Banners referencing this url
        const bannersImage = await tx.appBanner.findMany({
          where: { imageUrl: oldUrl }
        });
        for (const banner of bannersImage) {
          console.log(`  Updating AppBanner (imageUrl): ${banner.id}`);
          await tx.appBanner.update({
            where: { id: banner.id },
            data: { imageUrl: newUrl }
          });
        }

        const bannersMobile = await tx.appBanner.findMany({
          where: { mobileImageUrl: oldUrl }
        });
        for (const banner of bannersMobile) {
          console.log(`  Updating AppBanner (mobileImageUrl): ${banner.id}`);
          await tx.appBanner.update({
            where: { id: banner.id },
            data: { mobileImageUrl: newUrl }
          });
        }
      });
      console.log(`Successfully updated database records transactionally.`);
    } catch (e) {
      console.error(`ERROR: Database transaction failed, rolled back changes: ${e}`);
    }
  }

  console.log('Fix script finished.');
}

main().catch(e => {
  console.error('Unhandled error:', e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
