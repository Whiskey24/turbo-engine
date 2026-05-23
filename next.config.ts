import type { NextConfig } from "next";

const path = require('path');
const dotenv = require('dotenv');

// 1. Manually load your build environment file right at the start
dotenv.config({ path: path.resolve(process.cwd(), '.env.build') });

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_NUMBER: process.env.NEXT_PUBLIC_BUILD_NUMBER,
    NEXT_PUBLIC_BUILD_TIME: process.env.NEXT_PUBLIC_BUILD_TIME,
  },
};

export default nextConfig;
