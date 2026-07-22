import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const prisma = new PrismaClient();
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

function localFilePathFor(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!u.pathname.startsWith('/uploads/')) return null;
    return path.join(UPLOADS_DIR, decodeURIComponent(u.pathname.replace('/uploads/', '')));
  } catch {
    return null;
  }
}

async function inspectUrl(label, url) {
  const result = {
    label,
    url,
    httpStatus: null,
    contentType: null,
    physicalFileExists: null,
    sharpDecode: null,
  };

  if (!url) {
    result.httpStatus = 'N/A (empty)';
    result.contentType = 'N/A';
    result.physicalFileExists = 'N/A';
    result.sharpDecode = 'N/A (no URL)';
    return result;
  }

  const localPath = localFilePathFor(url);
  if (localPath) {
    result.physicalFileExists = fs.existsSync(localPath);
  } else {
    result.physicalFileExists = 'N/A (not a local /uploads URL)';
  }

  try {
    const res = await fetch(url);
    result.httpStatus = res.status;
    result.contentType = res.headers.get('content-type');
    const buf = Buffer.from(await res.arrayBuffer());
    try {
      const meta = await sharp(buf, { failOn: 'error' }).metadata();
      result.sharpDecode = `OK (${meta.format}, ${meta.width}x${meta.height})`;
    } catch (e) {
      result.sharpDecode = `FAILED: ${e.message}`;
    }
  } catch (e) {
    result.httpStatus = `FETCH ERROR: ${e.message}`;
  }

  return result;
}

async function main() {
  const now = new Date();
  const all = await prisma.appBanner.findMany({
    orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
  });

  const active = all.filter((b) => {
    if (!b.isActive) return false;
    if (b.status !== 'published') return false;
    if (b.startsAt && b.startsAt > now) return false;
    if (b.endsAt && b.endsAt < now) return false;
    return true;
  });

  console.log(`Total banners in DB: ${all.length}`);
  console.log(`Active (visible) banners: ${active.length}`);
  console.log('='.repeat(80));

  for (const b of active) {
    console.log(`\nBanner id=${b.id}`);
    console.log(`  title: ${b.title}`);
    console.log(`  imageUrl: ${b.imageUrl}`);
    console.log(`  mobileImageUrl: ${b.mobileImageUrl}`);

    const imageResult = await inspectUrl('imageUrl', b.imageUrl);
    console.log(`  [imageUrl]        HTTP status: ${imageResult.httpStatus}`);
    console.log(`  [imageUrl]        content-type: ${imageResult.contentType}`);
    console.log(`  [imageUrl]        physical file exists: ${imageResult.physicalFileExists}`);
    console.log(`  [imageUrl]        sharp decode: ${imageResult.sharpDecode}`);

    const mobileResult = await inspectUrl('mobileImageUrl', b.mobileImageUrl);
    console.log(`  [mobileImageUrl]  HTTP status: ${mobileResult.httpStatus}`);
    console.log(`  [mobileImageUrl]  content-type: ${mobileResult.contentType}`);
    console.log(`  [mobileImageUrl]  physical file exists: ${mobileResult.physicalFileExists}`);
    console.log(`  [mobileImageUrl]  sharp decode: ${mobileResult.sharpDecode}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
