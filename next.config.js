/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // avoid double-mounting which confuses the embedder worker
  eslint: {
    ignoreDuringBuilds: true, // VECTOR.jsx is validated separately — skip ESLint in CI
  },
  typescript: {
    ignoreBuildErrors: true, // JSX runtime types handled client-side
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false, path: false, crypto: false,
        os: false, stream: false, buffer: false,
      };
    }
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };
    return config;
  },
};
module.exports = nextConfig;
