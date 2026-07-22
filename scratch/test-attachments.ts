import { validateAttachment } from '../src/modules/mail/mail-attachment.service';

function runTest(filename: string, size: number) {
  try {
    validateAttachment(filename, size);
    console.log(`[PASS] "${filename}" (${(size / 1024).toFixed(1)} KB) - Passed validation.`);
  } catch (err: any) {
    console.log(`[BLOCK] "${filename}" (${(size / 1024).toFixed(1)} KB) - Blocked correctly: "${err.message}"`);
  }
}

async function main() {
  console.log('Testing Attachment Validator Rules...');
  
  // Valid files
  runTest('invoice.pdf', 1024 * 1024); // 1MB
  runTest('photo.png', 500 * 1024); // 500KB
  runTest('doc.docx', 200 * 1024); // 200KB
  runTest('spread.xlsx', 150 * 1024); // 150KB
  runTest('archive.zip', 5 * 1024 * 1024); // 5MB

  // Blocked extensions
  runTest('malware.exe', 500);
  runTest('script.js', 300);
  runTest('trojan.bat', 200);
  runTest('virus.sh', 400);

  // Exceeds size limit (15MB)
  runTest('movie.mp4', 16 * 1024 * 1024); // 16MB
}

main().catch(console.error);
