import type { Prisma } from "@prisma/client";
import { db } from "@/shared/lib/db";

export type SessionLimit = { idleMinutes: number; maxHours: number; devices: number };
export type SessionLimits = { PARENT: SessionLimit & { rememberDays: number }; PUPIL: SessionLimit; STAFF: SessionLimit; ADMIN: SessionLimit; VIEW_AS: { idleMinutes: number; maxMinutes: number } };

export type Settings = {
  bank: { accountName: string; bankName: string; accountNumber: string };
  autoCancelHours: number;
  feeBearer: "school" | "parent";
  currentTerm: string;
  sessionLimits: SessionLimits;
};

export const DEFAULT_SETTINGS: Settings = {
  bank: { accountName: "Nazareth School", bankName: "Your bank", accountNumber: "0000000000" },
  autoCancelHours: 72,
  feeBearer: "school",
  currentTerm: "First term 2026/2027",
  sessionLimits: {
    PARENT: { idleMinutes: 60, maxHours: 12, devices: 1, rememberDays: 30 },
    PUPIL: { idleMinutes: 30, maxHours: 8, devices: 1 },
    STAFF: { idleMinutes: 15, maxHours: 10, devices: 1 },
    ADMIN: { idleMinutes: 15, maxHours: 8, devices: 1 },
    VIEW_AS: { idleMinutes: 10, maxMinutes: 30 },
  },
};

let cache: { at: number; value: Settings } | null = null;

export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < 30_000) return cache.value;
  const rows = await db.setting.findMany();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Partial<Settings>;
  const value: Settings = {
    ...DEFAULT_SETTINGS,
    ...map,
    bank: { ...DEFAULT_SETTINGS.bank, ...(map.bank ?? {}) },
    sessionLimits: { ...DEFAULT_SETTINGS.sessionLimits, ...(map.sessionLimits ?? {}) },
  };
  cache = { at: Date.now(), value };
  return value;
}

export async function saveSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  await db.setting.upsert({ where: { key }, create: { key, value: value as Prisma.InputJsonValue }, update: { value: value as Prisma.InputJsonValue } });
  cache = null;
}
