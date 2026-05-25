import { UAParser } from "ua-parser-js";

export function parseUserAgent(userAgent: string | null) {
  if (!userAgent) return "Unknown";
  
  const parser = new UAParser(userAgent);
  const result = parser.getResult();
  
  const browser = result.browser.name || "Unknown Browser";
  const os = result.os.name || "Unknown OS";
  const device = result.device.model || result.device.type || "Unknown Device";
  
  return `${browser} on ${os}${device ? ` (${device})` : ''}`;
}