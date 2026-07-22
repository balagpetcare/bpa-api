const fs = require('fs');
const path = require('path');
async function checkFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const last2 = buffer.subarray(buffer.length - 2).toString('hex');
  console.log(`Last 2 bytes: ${last2}`);
}
checkFile(path.join(__dirname, '../uploads/911e5748-246e-487c-9442-a3acd5cdd7ca.jpg'));
