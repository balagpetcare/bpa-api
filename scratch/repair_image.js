const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function repairImage() {
  const uploadDir = path.join(__dirname, '../uploads');
  const oldFileName = '911e5748-246e-487c-9442-a3acd5cdd7ca.jpg';
  const oldPath = path.join(uploadDir, oldFileName);
  const newFileName = '911e5748-246e-487c-9442-a3acd5cdd7ca_repaired.jpg';
  const newPath = path.join(uploadDir, newFileName);
  
  if (!fs.existsSync(oldPath)) {
    console.log("Original file missing");
    return;
  }
  
  try {
    const buffer = fs.readFileSync(oldPath);
    await sharp(buffer)
      .withMetadata(false) // strip unsafe metadata
      .rotate() // auto-rotate
      .resize(800, 432, { fit: 'inside', withoutEnlargement: true }) // bounded dimensions suitable for hero slider (aspect 1.85)
      .toColorspace('srgb') // sRGB colorspace
      .jpeg({
        progressive: false, // baseline/non-progressive
        chromaSubsampling: '4:2:0',
        mozjpeg: false
      })
      .toFile(newPath);
      
    console.log("Repaired image saved to", newPath);
    
    // Update DB
    const bannerId = '5998143d-dc7f-4a7b-91d7-324550af7511';
    const newUrl = `http://192.168.10.111:4000/uploads/${newFileName}`;
    
    await prisma.appBanner.update({
      where: { id: bannerId },
      data: { imageUrl: newUrl }
    });
    console.log(`Updated banner ${bannerId} imageUrl to ${newUrl}`);
    
  } catch (err) {
    console.error("Error repairing image:", err);
  }
}
repairImage().finally(() => prisma.$disconnect());
