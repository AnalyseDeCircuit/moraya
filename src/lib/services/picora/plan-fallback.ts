/**
 * Client-side PLAN_LIMITS fallback.
 *
 * Used when the Picora server doesn't return `planLimits` (older Picora < v0.17.1 Part B,
 * or 5xx errors on /me/usage). Values come from `@picora/shared` v0.17.1
 * `packages/shared/src/constants/plans.ts`. Keep in sync with each Picora release.
 */

import type { PicoraPlanKey } from './plan-display';

const MB = 1024 * 1024;
const GB = 1024 * 1024 * 1024;

export interface PlanLimits {
  imgStorageBytes: number;
  imgUploadMonth: number;
  docCount: number;
  audioStorageBytes: number;
  videoStorageBytes: number;
  kbCount: number;
}

export const PLAN_LIMITS_FALLBACK: Record<PicoraPlanKey, PlanLimits> = {
  none: {
    imgStorageBytes: 0,
    imgUploadMonth: 0,
    docCount: 0,
    audioStorageBytes: 0,
    videoStorageBytes: 0,
    kbCount: 0,
  },
  trial: {
    imgStorageBytes: 100 * MB,
    imgUploadMonth: 1000,
    docCount: 20,
    audioStorageBytes: 500 * MB,
    videoStorageBytes: 0,
    kbCount: 5,
  },
  pro: {
    imgStorageBytes: 5 * GB,
    imgUploadMonth: 50_000,
    docCount: 1000,
    audioStorageBytes: 5 * GB,
    videoStorageBytes: 10 * GB,
    kbCount: 50,
  },
  pro_plus: {
    imgStorageBytes: 50 * GB,
    imgUploadMonth: 200_000,
    docCount: 10_000,
    audioStorageBytes: 50 * GB,
    videoStorageBytes: 100 * GB,
    kbCount: 500,
  },
};

export function getFallbackPlanLimits(plan: string): PlanLimits {
  if (plan in PLAN_LIMITS_FALLBACK) {
    return PLAN_LIMITS_FALLBACK[plan as PicoraPlanKey];
  }
  return PLAN_LIMITS_FALLBACK.none;
}
