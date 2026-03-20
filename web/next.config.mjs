/* global process */
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@workspace/ui"],
  rewrites: async () => ({
    afterFiles: [
      {
        source: "/api/v1/:path*",
        destination: `${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000"}/api/v1/:path*`,
      },
    ],
  }),
}

export default nextConfig
