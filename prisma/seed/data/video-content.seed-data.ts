export type VideoContentSeedRecord = Readonly<{
  slug: string;
  titleEn: string;
  titleBn: string;
  summaryEn: string;
  summaryBn: string;
  bodyEn: string;
  bodyBn: string;
  type: 'VIDEO';
  status: 'draft' | 'published';
  videoSourceType: 'youtube';
  videoUrl: string;
  videoProvider: 'youtube';
  thumbnailUrl: string;
  videoPosterUrl: string;
  durationSeconds: number;
  categorySlug: string;
  tags: readonly string[];
  showOnHomepage: boolean;
  isFeatured: boolean;
  isPinned: boolean;
  homepagePriority: number;
  publishedAt: string | null;
}>;

export const SAMPLE_VIDEO_CONTENT: readonly VideoContentSeedRecord[] = [
  {
    slug: 'sample-video-pet-care-health-overview',
    titleEn: 'Sample Video — Pet Care Health Overview',
    titleBn: 'স্যাম্পল ভিডিও — পেট কেয়ার স্বাস্থ্য পরিচিতি',
    summaryEn: 'Development sample video for verifying public video-category visibility.',
    summaryBn: 'পাবলিক ভিডিও-ক্যাটাগরি দৃশ্যমানতা যাচাইয়ের জন্য ডেভেলপমেন্ট স্যাম্পল ভিডিও।',
    bodyEn: 'This is a BPA development sample record used only for non-production seed verification.',
    bodyBn: 'এটি কেবল নন-প্রোডাকশন সিড যাচাইয়ের জন্য ব্যবহৃত BPA ডেভেলপমেন্ট স্যাম্পল রেকর্ড।',
    type: 'VIDEO',
    status: 'published',
    videoSourceType: 'youtube',
    videoUrl: 'https://www.youtube.com/watch?v=ysz5S6PUM-U',
    videoProvider: 'youtube',
    thumbnailUrl: 'https://i.ytimg.com/vi/ysz5S6PUM-U/hqdefault.jpg',
    videoPosterUrl: 'https://i.ytimg.com/vi/ysz5S6PUM-U/hqdefault.jpg',
    durationSeconds: 32,
    categorySlug: 'pet-care-health',
    tags: ['sample', 'development', 'pet-care'],
    showOnHomepage: true,
    isFeatured: true,
    isPinned: false,
    homepagePriority: 100,
    publishedAt: '2026-07-22T00:00:00.000Z',
  },
  {
    slug: 'sample-video-vaccination-prevention-explainer',
    titleEn: 'Sample Video — Vaccination Prevention Explainer',
    titleBn: 'স্যাম্পল ভিডিও — ভ্যাকসিনেশন প্রতিরোধ ব্যাখ্যা',
    summaryEn: 'Development sample video for verifying published video categories.',
    summaryBn: 'পাবলিশড ভিডিও ক্যাটাগরি যাচাইয়ের জন্য ডেভেলপমেন্ট স্যাম্পল ভিডিও।',
    bodyEn: 'This is a BPA development sample record used only for non-production seed verification.',
    bodyBn: 'এটি কেবল নন-প্রোডাকশন সিড যাচাইয়ের জন্য ব্যবহৃত BPA ডেভেলপমেন্ট স্যাম্পল রেকর্ড।',
    type: 'VIDEO',
    status: 'published',
    videoSourceType: 'youtube',
    videoUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    videoProvider: 'youtube',
    thumbnailUrl: 'https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg',
    videoPosterUrl: 'https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg',
    durationSeconds: 19,
    categorySlug: 'vaccination-prevention',
    tags: ['sample', 'development', 'vaccination'],
    showOnHomepage: false,
    isFeatured: false,
    isPinned: false,
    homepagePriority: 90,
    publishedAt: '2026-07-22T00:00:00.000Z',
  },
  {
    slug: 'sample-video-emergency-first-aid-draft',
    titleEn: 'Sample Video — Emergency First Aid Draft',
    titleBn: 'স্যাম্পল ভিডিও — জরুরি ফার্স্ট এইড ড্রাফট',
    summaryEn: 'Development draft sample video used to verify exclusion from public categories.',
    summaryBn: 'পাবলিক ক্যাটাগরি থেকে বাদ পড়া যাচাইয়ের জন্য ডেভেলপমেন্ট ড্রাফট স্যাম্পল ভিডিও।',
    bodyEn: 'This is a BPA development sample draft record used only for non-production seed verification.',
    bodyBn: 'এটি কেবল নন-প্রোডাকশন সিড যাচাইয়ের জন্য ব্যবহৃত BPA ডেভেলপমেন্ট ড্রাফট স্যাম্পল রেকর্ড।',
    type: 'VIDEO',
    status: 'draft',
    videoSourceType: 'youtube',
    videoUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    videoProvider: 'youtube',
    thumbnailUrl: 'https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg',
    videoPosterUrl: 'https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg',
    durationSeconds: 596,
    categorySlug: 'emergency-first-aid',
    tags: ['sample', 'development', 'first-aid'],
    showOnHomepage: false,
    isFeatured: false,
    isPinned: false,
    homepagePriority: 10,
    publishedAt: null,
  },
] as const;
