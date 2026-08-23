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
