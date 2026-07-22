const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const filePath = path.join(__dirname, 'uploads', '911e5748-246e-487c-9442-a3acd5cdd7ca.jpg');
const buffer = fs.readFileSync(filePath);

console.log('File size:', buffer.length);
console.log('First 16 bytes:', buffer.subarray(0, 16).toString('hex'));
console.log('First 16 bytes (ASCII):', buffer.subarray(0, 16).toString('ascii'));

sharp(buffer)
  .metadata()
  .then(info => {
    console.log('Sharp metadata:', info);
  })
  .catch(err => {
    console.error('Sharp error:', err.message);
  });
