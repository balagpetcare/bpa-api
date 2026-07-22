import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const prisma = new PrismaClient();

async function main() {
  const banners = await prisma.appBanner.findMany({
    where: { isActive: true }
  });

  for (const b of banners) {
    console.log(`Banner ID: ${b.id}`);
    console.log(`Title: ${b.title}`);
    console.log(`imageUrl: ${b.imageUrl}`);
    console.log(`mobileImageUrl: ${b.mobileImageUrl}`);
    
    if (b.imageUrl) {
        const filePath = path.join(__dirname, 'uploads', path.basename(b.imageUrl));
        console.log(`Physical file path: ${filePath}`);
        if (fs.existsSync(filePath)) {
            const buf = fs.readFileSync(filePath);
            console.log(`File size (bytes): ${buf.length}`);
            try {
                const meta = await sharp(buf).metadata();
                console.log(`Detected format: ${meta.format}, ${meta.width}x${meta.height}`);
            } catch(e) {
                console.log(`Sharp failed to decode: ${e}`);
            }
        } else {
            console.log('File does not exist on disk.');
        }
    }
    console.log('---');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
