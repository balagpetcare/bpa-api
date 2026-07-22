const fs = require('fs');
const buffer = fs.readFileSync('uploads/911e5748-246e-487c-9442-a3acd5cdd7ca.jpg');
console.log('Last 2 bytes:', buffer.subarray(buffer.length - 2).toString('hex'));
