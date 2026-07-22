const fs = require('fs');
const sharp = require('sharp');
const input = fs.readFileSync('uploads/911e5748-246e-487c-9442-a3acd5cdd7ca.jpg');

sharp(input).jpeg({ progressive: false }).withMetadata({ density: 72 }).toBuffer().then(buf => console.log('withMetadata density:', buf.subarray(0, 16).toString('hex')));
