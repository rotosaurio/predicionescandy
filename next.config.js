/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['nextjs.org'],
  },
  webpack: (config) => {
    config.optimization = {
      ...config.optimization,
      minimize: true,
    }
    return config
  }
}

module.exports = nextConfig 