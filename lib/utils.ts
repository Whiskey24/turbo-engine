import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatIBAN(iban: string) {
  if (!iban) return "";
  const clean = iban.replace(/\s+/g, "").toUpperCase();
  const country = clean.substring(0, 2);

  // Common bank code lengths in IBAN structure (positions starting at index 4)
  const bankCodeLengths: Record<string, number> = {
    NL: 4, DE: 8, BE: 3, FR: 5, ES: 4, GB: 4, AT: 5
  };

  const len = bankCodeLengths[country] || 4;
  const first4 = clean.substring(0, 4);
  const bankCode = clean.substring(4, 4 + len);
  const rest = clean.substring(4 + len);
  const restFormatted = rest.match(/.{1,4}/g)?.join(" ") || "";

  return `${first4} ${bankCode} ${restFormatted}`.trim().replace(/\s+/g, " ");
}