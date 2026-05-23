import { z } from "zod";
import { PackageSchema, PackageSummarySchema } from "../schemas/package";
import type { Package, PackageSummary } from "../schemas/package";
import { SettingsSchema } from "../schemas/settings";
import type { Settings } from "../schemas/settings";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const TIMEOUT_MS = 10_000;
const ADMIN_TOKEN_KEY = "lle_admin_token";

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

function getAdminHeaders(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Admin-Token": token,
  };
}

export function getAdminToken(): string | null {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

export async function validateAdminToken(token: string): Promise<boolean> {
  const response = await fetchWithTimeout(`${BASE_URL}/admin/settings`, {
    headers: getAdminHeaders(token),
  });

  return response.ok;
}

export async function fetchAdminSettings(token: string): Promise<Settings> {
  const response = await fetchWithTimeout(`${BASE_URL}/admin/settings`, {
    headers: getAdminHeaders(token),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch admin settings: ${response.status}`);
  }
  const data: unknown = await response.json();
  return SettingsSchema.parse(data);
}

export async function updateAdminSettings(
  token: string,
  settings: Settings,
): Promise<Settings> {
  const response = await fetchWithTimeout(`${BASE_URL}/admin/settings`, {
    method: "PUT",
    headers: getAdminHeaders(token),
    body: JSON.stringify(settings),
  });

  if (!response.ok) {
    throw new Error(`Failed to update admin settings: ${response.status}`);
  }

  const data: unknown = await response.json();
  return SettingsSchema.parse(data);
}

export async function fetchAdminPackages(token: string): Promise<PackageSummary[]> {
  const response = await fetchWithTimeout(`${BASE_URL}/admin/packages`, {
    headers: getAdminHeaders(token),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch admin packages: ${response.status}`);
  }

  const data: unknown = await response.json();
  return z.array(PackageSummarySchema).parse(data);
}

export async function updateAdminPackage(
  token: string,
  packageId: string,
  patch: { enabled?: boolean; xp_threshold?: number | null },
): Promise<PackageSummary> {
  const encodedId = encodeURIComponent(packageId);
  const response = await fetchWithTimeout(`${BASE_URL}/admin/packages/${encodedId}`, {
    method: "PATCH",
    headers: getAdminHeaders(token),
    body: JSON.stringify(patch),
  });

  if (!response.ok) {
    throw new Error(`Failed to update package '${packageId}': ${response.status}`);
  }

  const data: unknown = await response.json();
  return PackageSummarySchema.parse(data);
}
