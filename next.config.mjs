/** @type {import('next').NextConfig} */
// Round 74: basic browser safety rules on every page. Nobody else may show Crumbs inside a frame
// (stops "click-jacking"), files are only read as what they say they are, other sites learn only
// that a visitor came from Crumbs (not which page), and the page may use location and the camera
// itself but can't hand them, or the microphone, to anything embedded.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(self), microphone=()' },
]

const nextConfig = {
  // Round 74: type errors stop a build again (the type check has been clean since Round 39).
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
