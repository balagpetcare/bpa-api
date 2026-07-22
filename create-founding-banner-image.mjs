import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const BACKEND_URL = process.env.BACKEND_URL || 'http://192.168.10.111:4000';
const BANNER_ID = '20000000-0000-0000-0000-000000000401';

// On-brand creative (BPA green gradient + wordmark), matching the app's
// existing hero fallback palette (AppColors.primaryGreen/primaryGreenDark)
// -- not a stock/unrelated photo, just a real designed asset in place of
// the removed placehold.co placeholder.
const svg = `
<svg width="1600" height="800" viewBox="0 0 1600 800" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0F7A2D"/>
      <stop offset="55%" stop-color="#1F9A41"/>
      <stop offset="100%" stop-color="#EAF6ED"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="800" fill="url(#bg)"/>
  <circle cx="1360" cy="180" r="220" fill="#FFFFFF" opacity="0.08"/>
  <circle cx="120" cy="700" r="260" fill="#FFFFFF" opacity="0.06"/>
  <text x="90" y="430" font-family="Arial, sans-serif" font-size="72" font-weight="700" fill="#FFFFFF">
    Founding Care Partner
  </text>
  <text x="90" y="500" font-family="Arial, sans-serif" font-size="72" font-weight="700" fill="#FFFFFF">
    Launch
  </text>
  <text x="90" y="560" font-family="Arial, sans-serif" font-size="34" font-weight="500" fill="#EAF6ED">
    Bangladesh Pet Alliance
  </text>
</svg>
`;

async function main() {
  const inputBuffer = Buffer.from(svg);

  // Fully decode + re-encode through Sharp so the stored file is a real,
  // verified-decodable raster image (not raw SVG passthrough).
  const pipeline = sharp(inputBuffer, { failOn: 'error' }).jpeg({
    quality: 88,
    progressive: false,
    chromaSubsampling: '4:2:0',
  });

  const { data: outputBuffer, info } = await pipeline.toBuffer({
    resolveWithObject: true,
  });

  if (
    outputBuffer.length < 3 ||
    outputBuffer[0] !== 0xff ||
    outputBuffer[1] !== 0xd8 ||
    outputBuffer[2] !== 0xff
  ) {
    throw new Error('Output buffer is not a valid JPEG (bad signature)');
  }

  const filename = `${crypto.randomUUID()}_founding_care_partner_${Date.now()}.jpg`;
  const outPath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(outPath, outputBuffer);
  console.log(`Wrote new file: ${outPath} (${info.width}x${info.height} ${info.format})`);

  // Verify by re-decoding from disk (mirrors what the live server does).
  const verifyMeta = await sharp(outPath, { failOn: 'error' }).metadata();
  console.log(`Re-decoded from disk OK: ${verifyMeta.format} ${verifyMeta.width}x${verifyMeta.height}`);

  const newUrl = `${BACKEND_URL}/uploads/${filename}`;

  const updated = await prisma.appBanner.update({
    where: { id: BANNER_ID },
    data: {
      imageUrl: newUrl,
      mobileImageUrl: null,
    },
  });

  console.log(`Updated AppBanner ${BANNER_ID}`);
  console.log(`  new imageUrl: ${updated.imageUrl}`);
  console.log(`  mobileImageUrl: ${updated.mobileImageUrl}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
