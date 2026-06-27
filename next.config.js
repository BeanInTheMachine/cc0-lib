/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    dangerouslyAllowSVG: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.cloudnouns.com",
      },
    ],
  },
};

module.exports = nextConfig;
