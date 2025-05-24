/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['nextjs.org'],
  },
  webpack: (config, { isServer }) => {
    // Si estamos en el cliente (navegador), añadimos los módulos de Node.js a la lista de módulos ignorados
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        fs: false,
        dns: false,
        child_process: false,
        aws4: false,
      };
    }
    return config;
  },
  experimental: {
    esmExternals: 'loose', // Para mejor compatibilidad con módulos que pueden ser usados tanto en cliente como servidor
  },
}

module.exports = nextConfig 