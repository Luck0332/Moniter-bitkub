import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  basePath: '/monitor',
  env: {
    NEXT_PUBLIC_BASE_PATH: '/monitor',
  },
};

export default nextConfig;
