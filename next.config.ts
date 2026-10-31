import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 档案 JPG 批量上传易超默认体积限制
    middlewareClientMaxBodySize: "200mb",
    serverActions: {
      bodySizeLimit: "200mb",
    },
  },
};

export default nextConfig;
