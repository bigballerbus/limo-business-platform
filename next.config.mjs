import { withPayload } from '@payloadcms/next/withPayload';

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

// Payload runs natively inside the Next app; withPayload wires the admin,
// the @payload-config alias and server-only externals.
export default withPayload(nextConfig);
