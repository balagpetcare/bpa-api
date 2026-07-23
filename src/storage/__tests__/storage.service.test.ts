import fs from 'fs';
import path from 'path';
import { verifyFileExists } from '../storage.service';

// Exercises the local-driver "missing file" detection directly against the
// real configured uploads directory (STORAGE_DRIVER=local in test/dev env).
// Self-cleaning: creates and removes its own temp file, never touches any
// pre-existing media.
describe('verifyFileExists (local driver)', () => {
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const tempFilename = `__test_verify_file_exists_${Date.now()}.txt`;
  const tempPath = path.join(uploadsDir, tempFilename);

  afterEach(() => {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  });

  it('returns false for a filename that genuinely has no file on disk', () => {
    expect(verifyFileExists('this-file-does-not-exist-anywhere.jpg')).toBe(false);
  });

  it('returns true once the file is actually present, then false again after removal', () => {
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(tempPath, 'test content');
    expect(verifyFileExists(tempFilename)).toBe(true);

    fs.unlinkSync(tempPath);
    expect(verifyFileExists(tempFilename)).toBe(false);
  });

  it('resolves nested object-key prefixes to the flattened uploads root (matches upload/write behavior)', () => {
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(tempPath, 'test content');
    // Object keys are stored with a nested-looking prefix (e.g. media/2026/07/<file>)
    // but the local driver flattens via path.basename() on both write and
    // read, so a "nested" key pointing at the same basename must resolve.
    expect(verifyFileExists(`media/2026/07/${tempFilename}`)).toBe(true);
  });
});
