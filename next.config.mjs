/** @type {import('next').NextConfig} */
const nextConfig = {
  // Shared match and poll links are public by link only — never indexed.
  // The pages also say so in a meta tag; this covers their preview images.
  async headers() {
    return ["/m/:path*", "/p/:path*"].map((source) => ({
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
