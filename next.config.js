const { withPlaiceholder } = require("@plaiceholder/next");

/**
 * @type {import('next').NextConfig}
 */
module.exports = withPlaiceholder({
  experimental: {
    appDir: true,
    scrollRestoration: true,
    transpilePackages: ["unified", "plaiceholder", "unist-util-visit"],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  distDir: "build",
  async redirects() {
    return [
      {
        source: "/projects/winamp2-js{/}?",
        destination: "https://webamp.org",
        permanent: true,
      },
    ];
  },
  images: {
    domains: [
      "jordaneldredge.com",
      // Avatars from GitHub comments
      "avatars.githubusercontent.com",
    ],
  },
  async rewrites() {
    return [
      {
        source: "/projects/curl-proof/install/",
        destination: "/api/curl-proof",
      },
    ];
  },
  trailingSlash: true,
  swcMinify: true,
});
