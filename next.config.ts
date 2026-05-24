/** @type {import('next').NextConfig} */
const { execSync } = require('child_process');

let buildNumber = 'v0.0.0-unknown';
let buildTime = new Date().toISOString();

try {
  // 1. Get the latest Git tag/commit version hash synchronously
  buildNumber = execSync('git describe --tags --always').toString().trim();
} catch (e) {
  console.log('⚠️ Git not initialized or no tags found, falling back to commit hash');
  try {
    buildNumber = execSync('git rev-parse --short HEAD').toString().trim();
  } catch (err) {
    buildNumber = 'v0.9.0-fallback';
  }
}

try {
  // 2. Format a clean timestamp string
  const now = new Date();
  buildTime = now.toISOString().replace('T', ' ').substring(0, 16);
} catch (e) {
  // Fallback safely if date manipulation fails
}

console.log('🚀 VERCEL BUILD ENGINES ACTIVE:', { buildNumber, buildTime });

const nextConfig = {
  // 3. Bake the values directly into Next.js environment bundle layer 
  env: {
    NEXT_PUBLIC_BUILD_NUMBER: buildNumber,
    NEXT_PUBLIC_BUILD_TIME: buildTime,
  },
  // Keep your normal settings (images, redirects, rewrites, etc.) down here...
};

module.exports = nextConfig;