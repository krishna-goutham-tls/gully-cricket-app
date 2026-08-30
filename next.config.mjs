/** @type {import('next').NextConfig} */
const nextConfig = {
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
