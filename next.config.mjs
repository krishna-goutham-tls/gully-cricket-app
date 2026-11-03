// Netlify sets COMMIT_REF. A local build falls back to the build time, pinned
// in the environment so every config load in the same build agrees.
process.env.APP_VERSION ||= process.env.COMMIT_REF || String(Date.now());
const APP_VERSION = process.env.APP_VERSION;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Each deploy's version, so a saved app can tell a newer build is live.
  env: { NEXT_PUBLIC_APP_VERSION: APP_VERSION },
  // Shared match links are public by link only — never indexed.
  // The pages also say so in a meta tag; this covers their preview images.
  async headers() {
    return ["/m/:path*"].map((source) => ({
      source,
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    }));
  },
  async redirects() {
    return [
      {
        source: "/feed",
        destination: "/release-notes",
        permanent: true,
      },
      {
        source: "/feed/:path*",
        destination: "/release-notes",
        permanent: true,
      },
      // The trophies moved into Records. Anybody with the old page bookmarked
      // or open in a standalone PWA window lands where they meant to go.
      {
        source: "/shelf",
        destination: "/records",
        permanent: true,
      },
      // Community Settings folded into Settings. /community/visitors stays.
      {
        source: "/community",
        destination: "/settings",
        permanent: false,
      },
      // Who's in? polls left the app. Old poll links in WhatsApp land on Home.
      {
        source: "/p/:path*",
        destination: "/home",
        permanent: false,
      },
      {
        source: "/match-stories",
        destination: "/release-notes",
        permanent: true,
      },
      {
        source: "/match-stories/:path*",
        destination: "/release-notes",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
