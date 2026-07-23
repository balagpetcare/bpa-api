export const SUPPORTED_VIDEO_SOURCE_TYPES = ['youtube', 'vimeo', 'upload'] as const;

export type SupportedVideoSourceType = (typeof SUPPORTED_VIDEO_SOURCE_TYPES)[number];

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID_PATTERN = /^\d+$/;

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeVideoSourceType(value: string | null | undefined): SupportedVideoSourceType | null {
  const normalized = trimToNull(value)?.toLowerCase();
  if (!normalized) return null;
  if (SUPPORTED_VIDEO_SOURCE_TYPES.includes(normalized as SupportedVideoSourceType)) {
    return normalized as SupportedVideoSourceType;
  }
  if (normalized === 'youtube-embed' || normalized.includes('youtube')) return 'youtube';
  if (normalized === 'vimeo-embed' || normalized.includes('vimeo')) return 'vimeo';
  if (normalized === 'file' || normalized.includes('upload')) return 'upload';
  return null;
}

function parseYouTubeId(input: string): string | null {
  const direct = trimToNull(input);
  if (!direct) return null;
  if (YOUTUBE_ID_PATTERN.test(direct)) return direct;

  try {
    const url = new URL(direct);
    const host = url.hostname.toLowerCase();
    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id && YOUTUBE_ID_PATTERN.test(id) ? id : null;
    }

    if (host.endsWith('youtube.com')) {
      const v = url.searchParams.get('v');
      if (v && YOUTUBE_ID_PATTERN.test(v)) return v;

      const parts = url.pathname.split('/').filter(Boolean);
      const candidate = parts.length >= 2 && ['embed', 'shorts', 'live'].includes(parts[0]) ? parts[1] : null;
      return candidate && YOUTUBE_ID_PATTERN.test(candidate) ? candidate : null;
    }
  } catch {
    return null;
  }

  return null;
}

function parseVimeoId(input: string): string | null {
  const direct = trimToNull(input);
  if (!direct) return null;
  if (VIMEO_ID_PATTERN.test(direct)) return direct;

  try {
    const url = new URL(direct);
    const host = url.hostname.toLowerCase();
    if (!host.endsWith('vimeo.com')) return null;

    const parts = url.pathname.split('/').filter(Boolean);
    const candidate = parts[0] === 'video' ? parts[1] : parts[parts.length - 1];
    return candidate && VIMEO_ID_PATTERN.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function normalizeExternalVideoUrl(
  sourceType: SupportedVideoSourceType | null | undefined,
  value: string | null | undefined,
): string | null {
  const normalizedType = normalizeVideoSourceType(sourceType);
  const normalizedValue = trimToNull(value);
  if (!normalizedType || !normalizedValue) return normalizedValue;

  if (normalizedType === 'youtube') {
    const id = parseYouTubeId(normalizedValue);
    return id ? `https://www.youtube.com/watch?v=${id}` : null;
  }

  if (normalizedType === 'vimeo') {
    const id = parseVimeoId(normalizedValue);
    return id ? `https://vimeo.com/${id}` : null;
  }

  return normalizedValue;
}

export function normalizeVideoSourceFields(input: {
  videoSourceType?: string | null;
  videoUrl?: string | null;
  videoProvider?: string | null;
}) {
  const videoSourceType = normalizeVideoSourceType(input.videoSourceType);
  const trimmedVideoUrl = trimToNull(input.videoUrl);
  const normalizedVideoUrl =
    videoSourceType === 'youtube' || videoSourceType === 'vimeo'
      ? normalizeExternalVideoUrl(videoSourceType, trimmedVideoUrl)
      : trimmedVideoUrl;

  return {
    videoSourceType,
    videoUrl: normalizedVideoUrl,
    videoProvider: videoSourceType === 'youtube' || videoSourceType === 'vimeo' ? videoSourceType : null,
  };
}
