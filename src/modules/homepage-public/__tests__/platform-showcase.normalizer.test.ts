import { normalizePlatformShowcase } from '../homepage-public.normalizers';

describe('normalizePlatformShowcase', () => {
  it('normalizes media, brands/platforms, empty states and strips malformed destinations/internal media keys', () => {
    const dto=normalizePlatformShowcase({
      key:'ecosystem',eyebrow:null,title:'Digital ecosystem',subtitle:null,description:null,layout:'default',theme:'default',
      logoMedia:{id:'m1',url:'https://cdn.example/logo.png',altText:'Logo'},items:[
        {platformKey:'bpa',brandKey:'bpa',platformType:'APP',name:'BPA',badgeText:null,heading:null,subheading:null,description:null,featureBullets:[],ctaText:null,ctaUrl:'javascript:bad',layoutOverride:null,featured:true,logoMedia:null,primaryPreviewMedia:null,secondaryPreviewMedia:null,links:[
          {type:'GOOGLE_PLAY',label:'Play',url:'https://play.google.com/app',qrEnabled:true,qrCaption:null,openInNewTab:true},
          {type:'OTHER',label:'Bad',url:'data:text/html,bad',qrEnabled:true,qrCaption:null,openInNewTab:false},
        ]},
        {platformKey:'furtail',brandKey:'furtail',platformType:'WEBSITE',name:'Furtail',badgeText:null,heading:null,subheading:null,description:null,featureBullets:[],ctaText:null,ctaUrl:null,layoutOverride:null,featured:false,logoMedia:null,primaryPreviewMedia:null,secondaryPreviewMedia:null,links:[]},
      ],
    } as never);
    expect(dto.logo).toEqual({id:'m1',url:'https://cdn.example/logo.png',altText:'Logo'});
    expect(dto.items.map(x=>[x.brandKey,x.platformType])).toEqual([['bpa','APP'],['furtail','WEBSITE']]);
    expect(dto.items[0].ctaUrl).toBeNull(); expect(dto.items[0].links).toHaveLength(1); expect(dto.items[1].links).toEqual([]);
    expect(dto).not.toHaveProperty('logoMedia'); expect(dto.items[0]).not.toHaveProperty('primaryPreviewMedia');
  });

  it('keeps all five required brand/platform combinations independent in one section', () => {
    const combinations = [
      ['bpa-app', 'bpa', 'APP'],
      ['bpa-website', 'bpa', 'WEBSITE'],
      ['furtail-app', 'furtail', 'APP'],
      ['furtail-website', 'furtail', 'WEBSITE'],
      ['wpa-website', 'wpa', 'WEBSITE'],
    ] as const;
    const dto = normalizePlatformShowcase({
      key: 'pet-ecosystem', eyebrow: null, title: 'Pet ecosystem', subtitle: null, description: null,
      layout: 'PREVIEW_LEFT', theme: 'default', logoMedia: null,
      items: combinations.map(([platformKey, brandKey, platformType], index) => ({
        platformKey, brandKey, platformType, name: platformKey, badgeText: null, heading: null,
        subheading: null, description: null, featureBullets: [`feature-${index}`], ctaText: 'Open',
        ctaUrl: `https://${brandKey}.example/${platformKey}`, layoutOverride: null, previewMode: 'RAW_IMAGE',
        featured: index === 0, logoMedia: null, primaryPreviewMedia: null, secondaryPreviewMedia: null,
        links: [{ type: platformType === 'APP' ? 'GOOGLE_PLAY' : 'WEBSITE', label: 'Open', url: `https://links.example/${platformKey}`, qrEnabled: false, qrCaption: null, openInNewTab: true }],
      })),
    } as never);

    expect(dto.items.map(({ platformKey, brandKey, platformType }) => ({ platformKey, brandKey, platformType }))).toEqual(
      combinations.map(([platformKey, brandKey, platformType]) => ({ platformKey, brandKey, platformType })),
    );
    expect(dto.items.map((item) => item.links[0].url)).toHaveLength(5);
  });
});
