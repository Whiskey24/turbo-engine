const { execSync } = require('child_process');

try {
  // Get closest tag
  const tag = execSync('git describe --tags --abbrev=0').toString().trim();
  
  // Get number of commits since tag
  const count = execSync(`git rev-list ${tag}..HEAD --count`).toString().trim();
  
  // Get latest commit hash (short)
  const hash = execSync('git rev-parse --short HEAD').toString().trim();
  
  // Format version string
  const version = `${tag}-${count}-g${hash}`;
  
  // Get current date/time in yyyy-mm-dd hh:mm format
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const buildTime = `${year}-${month}-${day} ${hours}:${minutes}`;
  
  console.log(`NEXT_PUBLIC_BUILD_NUMBER=${version}`);
  console.log(`NEXT_PUBLIC_BUILD_TIME=${buildTime}`);
} catch (error) {
  console.error('Error generating version info:', error.message);
  // Fallback values
  console.log('NEXT_PUBLIC_BUILD_NUMBER=unknown');
  console.log('NEXT_PUBLIC_BUILD_TIME=unknown');
}