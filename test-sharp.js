const fs = require('fs');
const sharp = require('sharp');
const input = fs.readFileSync('uploads/911e5748-246e-487c-9442-a3acd5cdd7ca.jpg');
sharp(input, { failOn: 'error' }).metadata().then(console.log).catch(console.error);
sharp(input, { failOn: 'truncated' }).metadata().then(() => console.log('truncated OK')).catch(console.error);
