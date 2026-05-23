import { z } from "zod";
import { PackageSchema, PackageSummarySchema } from "../schemas/package";
import type { Package, PackageSummary } from "../schemas/package";
import { SettingsSchema } from "../schemas/settings";
import type { Settings } from "../schemas/settings";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const TIMEOUT_MS = 10_000;

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export async function fetchPackages(): Promise<PackageSummary[]> {
  const response = await fetchWithTimeout(`${BASE_URL}/packages`);
  if (!response.ok) {
    throw new Error(`Failed to fetch packages: ${response.status}`);
  }
  const data: unknown = await response.json();
  return z.array(PackageSummarySchema).parse(data);
}

export async function fetchPackage(id: string): Promise<Package> {
  const encodedId = encodeURIComponent(id);
  const response = await fetchWithTimeout(`${BASE_URL}/packages/${encodedId}`);
  if (response.status === 404) {
    throw new Error(`Package '${id}' not found`);
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch package '${id}': ${response.status}`);
  }
  const data: unknown = await response.json();
  return PackageSchema.parse(data);
}

export async function fetchSettings(): Promise<Settings> {
  const response = await fetchWithTimeout(`${BASE_URL}/api/settings`);
  if (!response.ok) {
    throw new Error(`Failed to fetch settings: ${response.status}`);
  }
  const data: unknown = await response.json();
  return SettingsSchema.parse(data);
}
