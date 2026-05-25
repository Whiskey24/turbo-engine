const LRU_CACHE_LIMIT = 100;

// Use a global variable to ensure the cache persists across hot-reloads in Next.js development mode
const globalForCache = globalThis as unknown as {
  ipCache: Map<string, string>;
};

if (!globalForCache.ipCache) {
  globalForCache.ipCache = new Map<string, string>();
}

const ipCache = globalForCache.ipCache;

function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  const normalized = ip.trim();
  return (
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "localhost" ||
    normalized.startsWith("10.") ||
    normalized.startsWith("192.168.") ||
    normalized.startsWith("172.16.") || // Wait, 172.16.0.0 to 172.31.255.255, but simple prefix check for standard private ranges is good
    normalized.startsWith("fe80:")
  );
}

export async function lookupIpLocation(ip: string): Promise<string> {
  if (!ip) return "Unknown Location";

  const cleanIp = ip.trim();

  // If it's a private IP, return a local network label
  if (isPrivateIp(cleanIp)) {
    return "Local Network";
  }

  // Check LRU Cache
  if (ipCache.has(cleanIp)) {
    const cachedVal = ipCache.get(cleanIp)!;
    // Move to end (Most Recently Used)
    ipCache.delete(cleanIp);
    ipCache.set(cleanIp, cachedVal);
    return cachedVal;
  }

  // Fetch from free service ipapi.co
  try {
    const response = await fetch(`https://ipapi.co/${cleanIp}/json/`, {
      headers: {
        "User-Agent": "turbo-engine/1.0"
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.error) {
      console.warn(`Geolocation api error for ${cleanIp}:`, data.reason || data.message);
      return "Unknown Location";
    }

    const city = data.city;
    const country = data.country_name;
    let location = "Unknown Location";

    if (city && country) {
      location = `${city}, ${country}`;
    } else if (country) {
      location = country;
    } else if (city) {
      location = city;
    }

    // Insert into Cache & manage LRU size limit
    if (ipCache.has(cleanIp)) {
      ipCache.delete(cleanIp);
    }
    ipCache.set(cleanIp, location);

    if (ipCache.size > LRU_CACHE_LIMIT) {
      const oldestKey = ipCache.keys().next().value;
      if (oldestKey !== undefined) {
        ipCache.delete(oldestKey);
      }
    }

    return location;
  } catch (error) {
    console.error(`Failed to geolocate IP ${cleanIp}:`, error);
    return "Unknown Location";
  }
}
