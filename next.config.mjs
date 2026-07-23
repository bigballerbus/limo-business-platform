/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Explicit dimensions are enforced on every image (CLS control); the
  // optimizer is configured with the modern formats the spec requires.
  images: {
    formats: ['image/avif', 'image/webp'],
    // Remote asset host (Cloudflare R2) is added in a later sprint when the
    // bucket exists; kept empty here so the build has no placeholder hosts.
    remotePatterns: [],
  },
  experimental: {
    // Payload's local API and the domain layer stay server-only.
    serverActions: { bodySizeLimit: '2mb' },
  },
};

// Payload wraps the Next config via withPayload(); that wiring lands in the
// Payload sprint. Until then the app is a standard Next.js application.
export default nextConfig;
