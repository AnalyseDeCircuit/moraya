import { describe, it, expect } from 'vitest';
import { normalizePlanKey, upgradeCtaForPlan, KNOWN_PLAN_KEYS } from './plan-display';

describe('normalizePlanKey', () => {
  it('returns isKnown=true for "none" with gray badge', () => {
    const r = normalizePlanKey('none');
    expect(r.isKnown).toBe(true);
    expect(r.color).toBe('gray');
    expect(r.i18nKey).toBe('settings.picora.plan.none');
    expect(r.raw).toBe('none');
  });

  it('returns blue badge for "trial"', () => {
    const r = normalizePlanKey('trial');
    expect(r.isKnown).toBe(true);
    expect(r.color).toBe('blue');
    expect(r.i18nKey).toBe('settings.picora.plan.trial');
  });

  it('returns purple badge for "pro"', () => {
    expect(normalizePlanKey('pro').color).toBe('purple');
  });

  it('returns gold badge for "pro_plus"', () => {
    const r = normalizePlanKey('pro_plus');
    expect(r.color).toBe('gold');
    expect(r.i18nKey).toBe('settings.picora.plan.pro_plus');
  });

  it('returns isKnown=false for unknown plan with raw value preserved', () => {
    const r = normalizePlanKey('enterprise');
    expect(r.isKnown).toBe(false);
    expect(r.color).toBe('gray');
    expect(r.i18nKey).toBe('');
    expect(r.raw).toBe('enterprise');
  });

  it('handles null and undefined as unknown empty raw', () => {
    expect(normalizePlanKey(null).isKnown).toBe(false);
    expect(normalizePlanKey(undefined).isKnown).toBe(false);
    expect(normalizePlanKey(null).raw).toBe('');
  });

  it('trims whitespace before matching', () => {
    expect(normalizePlanKey('  pro  ').isKnown).toBe(true);
    expect(normalizePlanKey('  pro  ').color).toBe('purple');
  });

  it('exposes the four known keys via KNOWN_PLAN_KEYS', () => {
    expect(KNOWN_PLAN_KEYS).toEqual(['none', 'trial', 'pro', 'pro_plus']);
  });
});

describe('upgradeCtaForPlan', () => {
  it('none → activate', () => {
    expect(upgradeCtaForPlan('none')).toBe('activate');
  });
  it('trial → pro', () => {
    expect(upgradeCtaForPlan('trial')).toBe('pro');
  });
  it('pro → pro_plus', () => {
    expect(upgradeCtaForPlan('pro')).toBe('pro_plus');
  });
  it('pro_plus → sales', () => {
    expect(upgradeCtaForPlan('pro_plus')).toBe('sales');
  });
  it('unknown plan → activate (safe default)', () => {
    expect(upgradeCtaForPlan('enterprise')).toBe('activate');
  });
});
