import type { MetadataRoute } from 'next';

import { buildAbsoluteUrl, getSiteUrl } from '@/lib/metadata/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/auth/'],
    },
    sitemap: buildAbsoluteUrl('/sitemap.xml'),
    host: getSiteUrl(),
  };
}
