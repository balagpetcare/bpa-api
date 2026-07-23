import { isLocallyManagedUrl } from '../media.service';

// Regression test for the "File Missing" false-positive bug: records whose
// `url` already points at a genuine external host (seed/demo data using
// placehold.co, images.unsplash.com, etc.) were being run through the
// local-disk existence check anyway, which always fails for them (there is
// no local file — by design, they were never uploaded to our storage) and
// incorrectly flagged live, working images as "File Missing".
describe('isLocallyManagedUrl', () => {
  it('treats our own local dev host as locally managed', () => {
    expect(isLocallyManagedUrl('http://localhost:4000/uploads/file.jpg')).toBe(true);
    expect(isLocallyManagedUrl('http://127.0.0.1:4000/uploads/file.jpg')).toBe(true);
  });

  it('treats known LAN/emulator dev-host variants as locally managed', () => {
    expect(isLocallyManagedUrl('http://192.168.10.111:4000/uploads/file.jpg')).toBe(true);
    expect(isLocallyManagedUrl('http://10.0.2.2:4000/uploads/file.jpg')).toBe(true);
  });

  it('treats a bare relative path as locally managed', () => {
    expect(isLocallyManagedUrl('/uploads/file.jpg')).toBe(true);
  });

  it('treats genuine external hosts as NOT locally managed', () => {
    expect(isLocallyManagedUrl('https://placehold.co/400x400/jpeg?text=BPA')).toBe(false);
    expect(isLocallyManagedUrl('https://images.unsplash.com/photo-123?w=800')).toBe(false);
    expect(isLocallyManagedUrl('https://www.w3.org/some/file.pdf')).toBe(false);
  });
});
