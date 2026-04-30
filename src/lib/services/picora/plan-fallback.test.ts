import { describe, it, expect } from 'vitest';
import { PLAN_LIMITS_FALLBACK, getFallbackPlanLimits } from './plan-fallback';

describe('PLAN_LIMITS_FALLBACK', () => {
  it('exposes all four known plan tiers', () => {
    expect(Object.keys(PLAN_LIMITS_FALLBACK).sort()).toEqual(['none', 'pro', 'pro_plus', 'trial']);
  });

  it('none has zero limits across the board', () => {
    const limits = PLAN_LIMITS_FALLBACK.none;
    expect(limits.imgStorageBytes).toBe(0);
    expect(limits.imgUploadMonth).toBe(0);
    expect(limits.docCount).toBe(0);
    expect(limits.audioStorageBytes).toBe(0);
    expect(limits.videoStorageBytes).toBe(0);
    expect(limits.kbCount).toBe(0);
  });

  it('trial limits are smaller than pro limits', () => {
    expect(PLAN_LIMITS_FALLBACK.trial.imgStorageBytes).toBeLessThan(PLAN_LIMITS_FALLBACK.pro.imgStorageBytes);
    expect(PLAN_LIMITS_FALLBACK.trial.docCount).toBeLessThan(PLAN_LIMITS_FALLBACK.pro.docCount);
    expect(PLAN_LIMITS_FALLBACK.trial.kbCount).toBeLessThan(PLAN_LIMITS_FALLBACK.pro.kbCount);
  });

  it('pro_plus has the largest limits', () => {
    expect(PLAN_LIMITS_FALLBACK.pro_plus.imgStorageBytes).toBeGreaterThan(PLAN_LIMITS_FALLBACK.pro.imgStorageBytes);
    expect(PLAN_LIMITS_FALLBACK.pro_plus.docCount).toBeGreaterThan(PLAN_LIMITS_FALLBACK.pro.docCount);
    expect(PLAN_LIMITS_FALLBACK.pro_plus.videoStorageBytes).toBeGreaterThan(PLAN_LIMITS_FALLBACK.pro.videoStorageBytes);
  });

  it('trial has 0 video storage (consistent with Picora policy)', () => {
    expect(PLAN_LIMITS_FALLBACK.trial.videoStorageBytes).toBe(0);
  });

  it('pro grants 5 GB image storage', () => {
    expect(PLAN_LIMITS_FALLBACK.pro.imgStorageBytes).toBe(5 * 1024 * 1024 * 1024);
  });
});

describe('getFallbackPlanLimits', () => {
  it('returns fallback limits for known plan', () => {
    const r = getFallbackPlanLimits('pro');
    expect(r.imgUploadMonth).toBe(50_000);
  });

  it('returns "none" tier for unknown plan name', () => {
    const r = getFallbackPlanLimits('enterprise');
    expect(r).toBe(PLAN_LIMITS_FALLBACK.none);
  });

  it('returns "none" tier for empty string', () => {
    expect(getFallbackPlanLimits('')).toBe(PLAN_LIMITS_FALLBACK.none);
  });
});
