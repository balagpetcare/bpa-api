const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const filePath = path.join(__dirname, 'uploads', '911e5748-246e-487c-9442-a3acd5cdd7ca.jpg');
const outPath = path.join(__dirname, 'uploads', '911e5748-246e-487c-9442-a3acd5cdd7ca_repaired_v2.jpg');

sharp(filePath)
  .jpeg({
    progressive: false,
    chromaSubsampling: '4:2:0',
    mozjpeg: false
  })
  .toFile(outPath)
  .then(() => {
    const buffer = fs.readFileSync(outPath);
    console.log('Repaired first 16 bytes:', buffer.subarray(0, 16).toString('hex'));
  });
