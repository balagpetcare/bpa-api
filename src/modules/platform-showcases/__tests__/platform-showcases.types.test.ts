import { itemWriteSchema, linkWriteSchema, reorderSchema, safeUrlSchema, sectionWriteSchema } from '../platform-showcases.types';

describe('platform showcase validation', () => {
  it.each(['javascript:alert(1)', 'data:text/html,test', 'ftp://example.com/a', 'not a url', 'https://user:pass@example.com'])('rejects unsafe URL %s', (url) => {
    expect(safeUrlSchema.safeParse(url).success).toBe(false);
  });
  it.each(['https://example.com/app?id=1', 'http://localhost:3000/details'])('accepts HTTP(S) URL %s', (url) => {
    expect(safeUrlSchema.parse(`  ${url}  `)).toBe(url);
  });
  it('normalizes text and rejects invalid platform and sort order', () => {
    const section = sectionWriteSchema.parse({ key: 'digital-ecosystem', title: '  Ecosystem  ' });
    expect(section.title).toBe('Ecosystem');
    expect(section.layout).toBe('PREVIEW_LEFT');
    expect(itemWriteSchema.parse({ platformKey:'bpa',brandKey:'bpa',platformType:'APP',name:'BPA' }).previewMode).toBe('RAW_IMAGE');
    expect(itemWriteSchema.safeParse({ platformKey:'bpa',brandKey:'bpa',platformType:'APP',name:'BPA',previewMode:'PHONE' }).success).toBe(false);
    expect(sectionWriteSchema.safeParse({ key: 'x', title: 'X', layout: 'stacked' }).success).toBe(false);
    expect(sectionWriteSchema.safeParse({ key: 'x', title: 'X', theme: 'brand-purple' }).success).toBe(false);
    expect(itemWriteSchema.safeParse({ platformKey:'bpa',brandKey:'bpa',platformType:'DESKTOP',name:'BPA' }).success).toBe(false);
    expect(linkWriteSchema.safeParse({type:'WEBSITE',label:'Site',url:'https://example.com',sortOrder:-1}).success).toBe(false);
  });
  it('rejects duplicate reorder IDs', () => {
    const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    expect(reorderSchema.safeParse({items:[{id,sortOrder:0},{id,sortOrder:1}]}).success).toBe(false);
  });
  it.each(['not-a-uuid', '/var/www/media/logo.png', '00000000-0000-4000-8000-00000000000Z'])('rejects malformed media ID %s', (logoMediaId) => {
    expect(sectionWriteSchema.safeParse({ key: 'x', title: 'X', logoMediaId }).success).toBe(false);
    expect(itemWriteSchema.safeParse({ platformKey: 'bpa', brandKey: 'bpa', platformType: 'APP', name: 'BPA', primaryPreviewMediaId: logoMediaId }).success).toBe(false);
  });
});
