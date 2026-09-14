import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_REGISTRY,
  findCapability,
  matchCapabilityByKeywords,
  capabilityContext,
  capabilityOverviewContext,
  capabilityRegistryDescription,
} from '@/lib/admin-ai/capabilities';

describe('admin capability registry', () => {
  it('has unique names and a path/description/action on every entry', () => {
    const names = CAPABILITY_REGISTRY.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);

    for (const capability of CAPABILITY_REGISTRY) {
      expect(capability.path.startsWith('/admin')).toBe(true);
      expect(capability.description.length).toBeGreaterThan(10);
      expect(capability.actions.length).toBeGreaterThan(0);
      expect(capability.source.length).toBeGreaterThan(0);
    }
  });

  it('reserves the name "overview" for the panel-wide branch', () => {
    // orchestrate.ts routes {"capability":"overview"} to the overview
    // context rather than findCapability() — a registry entry by that name
    // would become unreachable.
    expect(findCapability('overview')).toBeUndefined();
  });

  it('gates the known super-admin-only sections', () => {
    // Mirrors app/admin/layout.tsx's superAdminOnly NAV flags.
    const superAdminOnly = CAPABILITY_REGISTRY.filter((c) => c.role === 'super_admin').map((c) => c.path);
    expect(superAdminOnly).toEqual(
      expect.arrayContaining(['/admin/users', '/admin/wallet/settings', '/admin/reports/payouts', '/admin/ai-assistant']),
    );
  });

  it('states the super-admin gate in the phraser context', () => {
    const users = findCapability('user_management');
    expect(users).toBeDefined();
    const context = capabilityContext(users!);
    expect(context).toContain('Super Admin only');
    expect(context).toContain('/admin/users');
  });

  it('says who can use a non-super-admin section', () => {
    const context = capabilityContext(findCapability('withdrawals')!);
    expect(context).toContain('admin, approver, or super admin');
  });

  it('exposes only names and descriptions to the picker — never source paths', () => {
    const description = capabilityRegistryDescription();
    expect(description).toContain('withdrawals');
    // `source` is internal bookkeeping for maintainers, not model input.
    expect(description).not.toContain('route.ts');
  });

  it('resolves an overlapping phrase to the most specific section', () => {
    // "dual approval threshold" belongs to wallet_settings; the shorter
    // "dual approval" is a withdrawals keyword. Longest match must win, or
    // the admin gets pointed at the wrong (and differently-gated) screen.
    expect(matchCapabilityByKeywords('who can change the dual approval threshold')?.name).toBe('wallet_settings');
    expect(matchCapabilityByKeywords('does this withdrawal need dual approval')?.name).toBe('withdrawals');
  });

  it('matches common how-to phrasings on the fast path', () => {
    expect(matchCapabilityByKeywords('how do I suspend a user account')?.name).toBe('user_management');
    expect(matchCapabilityByKeywords('where do I review kyc submissions')?.name).toBe('kyc_review');
    expect(matchCapabilityByKeywords('how do I handle a reported chat')?.name).toBe('chat_reports');
    expect(matchCapabilityByKeywords('what is the catalogue review page for')?.name).toBe('catalogue_review');
  });

  it('returns null when nothing matches, so the LLM picker still gets a turn', () => {
    expect(matchCapabilityByKeywords('what is the weather in Ipoh')).toBeNull();
    expect(matchCapabilityByKeywords('what can I do in here')).toBeNull();
  });

  it('does not match a keyword embedded inside a longer word', () => {
    // Word-boundary padding, not substring matching — "catalogued" must not
    // trigger the catalogue section.
    expect(matchCapabilityByKeywords('everything is catalogued somewhere')).toBeNull();
  });

  it('routes each newly added section on the fast path', () => {
    expect(matchCapabilityByKeywords('how do I use the shadow report')?.name).toBe('access_control');
    expect(matchCapabilityByKeywords('where is the reconciliation report')?.name).toBe('reconciliation');
    expect(matchCapabilityByKeywords('how do I clear recommendation rewards')?.name).toBe('recommendation_rewards');
    expect(matchCapabilityByKeywords('how do I approve a sponsored placement')?.name).toBe('sponsored_placements');
    expect(matchCapabilityByKeywords('where do I review flagged conduct')?.name).toBe('staff_conduct');
  });

  it('keeps staff conduct and chat reports as distinct, non-colliding sections', () => {
    // Both are about "reported" chats, but different surfaces — a shared
    // keyword here would tie and silently break routing for both.
    expect(matchCapabilityByKeywords('how do I handle a reported chat')?.name).toBe('chat_reports');
    expect(matchCapabilityByKeywords('where do I see flagged conduct notes')?.name).toBe('staff_conduct');
  });

  it('no longer claims staff conduct now that it has its own section', () => {
    const assistant = findCapability('ai_assistant')!;
    expect(assistant.keywords).not.toContain('staff conduct');
    expect(assistant.keywords).not.toContain('conduct flag');
    expect(assistant.actions.join(' ')).not.toMatch(/conduct/i);
  });

  it('splits recommendation review from recommendation reward clearing', () => {
    const recommendations = findCapability('recommendations')!;
    expect(recommendations.actions.join(' ')).not.toMatch(/clearing/i);
    expect(findCapability('recommendation_rewards')?.path).toBe('/admin/recommendations/rewards');
  });

  it('builds an overview that lists paths without leaking internal slugs or sources', () => {
    const overview = capabilityOverviewContext();
    expect(overview).toContain('/admin/withdrawals');
    expect(overview).toContain('/admin/users (Super Admin only)');
    expect(overview).not.toContain('route.ts');
    expect(overview).not.toContain('lib/validation');
  });
});
