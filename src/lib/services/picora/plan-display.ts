/**
 * Plan key normalization for Picora subscription tiers.
 *
 * Picora API returns lowercase snake_case keys (`'none' | 'trial' | 'pro' | 'pro_plus'`).
 * Moraya UI uses i18n-resolved labels with badge colors. Unknown values fall back to
 * the raw key for forward compatibility (e.g. future `'enterprise'`).
 */

export type PicoraPlanKey = 'none' | 'trial' | 'pro' | 'pro_plus';

export const KNOWN_PLAN_KEYS: readonly PicoraPlanKey[] = ['none', 'trial', 'pro', 'pro_plus'];

export type PlanBadgeColor = 'gray' | 'blue' | 'purple' | 'gold';

export interface PlanDisplay {
  /** i18n key under settings.picora.plan.* — falls back to raw value if unknown. */
  i18nKey: string;
  /** Badge color for the UI badge component. */
  color: PlanBadgeColor;
  /** Whether this is a known plan key. Unknown plans display the raw key with gray badge. */
  isKnown: boolean;
  /** Raw API value (preserved for tooltips / debugging). */
  raw: string;
}

const PLAN_BADGE_COLOR: Record<PicoraPlanKey, PlanBadgeColor> = {
  none: 'gray',
  trial: 'blue',
  pro: 'purple',
  pro_plus: 'gold',
};

export function normalizePlanKey(value: string | null | undefined): PlanDisplay {
  const raw = (value ?? '').trim();
  const known = (KNOWN_PLAN_KEYS as readonly string[]).includes(raw);
  if (known) {
    const key = raw as PicoraPlanKey;
    return {
      i18nKey: `settings.picora.plan.${key}`,
      color: PLAN_BADGE_COLOR[key],
      isKnown: true,
      raw,
    };
  }
  return {
    i18nKey: '',
    color: 'gray',
    isKnown: false,
    raw,
  };
}

/** CTA target for the upgrade link based on current plan. */
export function upgradeCtaForPlan(plan: string): 'activate' | 'pro' | 'pro_plus' | 'sales' {
  switch (plan) {
    case 'none':
      return 'activate';
    case 'trial':
      return 'pro';
    case 'pro':
      return 'pro_plus';
    case 'pro_plus':
      return 'sales';
    default:
      return 'activate';
  }
}
