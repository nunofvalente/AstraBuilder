import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pphqxjttokwymgemkqvh.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'assets.echoesofastra.com',
      },
    ],
    unoptimized: true,
  },
};

export default nextConfig;
