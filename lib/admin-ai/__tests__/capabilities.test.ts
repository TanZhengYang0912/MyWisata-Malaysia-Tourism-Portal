import enAdmin from '@/app/i18n/locales/en/admin.json';
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

  it('routes event and operations how-to questions to their sections', () => {
    expect(matchCapabilityByKeywords('how do I create an event with two locations')?.name).toBe('event_campaigns');
    expect(matchCapabilityByKeywords('how do I cancel a location')?.name).toBe('event_campaigns');
    expect(matchCapabilityByKeywords('where do I assign a booth number')?.name).toBe('event_registrations');
    expect(matchCapabilityByKeywords('how do I pause a promotion')?.name).toBe('event_promotions');
    expect(matchCapabilityByKeywords('how do I send a vendor announcement')?.name).toBe('vendor_announcements');
    expect(matchCapabilityByKeywords('how do I handle an event shortage')?.name).toBe('orders');
    expect(matchCapabilityByKeywords('how do I approve a refund')?.name).toBe('refund_review');
    expect(matchCapabilityByKeywords('what do I do with a pickup overdue case')?.name).toBe('event_exceptions');
    expect(matchCapabilityByKeywords('how do I pause new orders')?.name).toBe('system_settings');
    expect(matchCapabilityByKeywords('I lost my passkey')?.name).toBe('staff_sign_in_security');
  });

  it('gates the super-admin event and money sections', () => {
    for (const name of ['event_campaigns', 'event_registrations', 'refund_review', 'event_exceptions', 'system_settings']) {
      expect(capabilityContext(findCapability(name)!)).toContain('Super Admin only');
    }
    expect(capabilityContext(findCapability('event_promotions')!)).toContain('admin, approver, or super admin');
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

describe('Staff Help coverage', () => {
  const byName = (name: string) => CAPABILITY_REGISTRY.find((capability) => capability.name === name);

  it('has a guide for every admin page that had none', () => {
    expect(byName('wallet_approvers')?.path).toBe('/admin/wallet/approvers');
    expect(byName('staff_notifications')?.path).toBe('/admin/notifications');
    expect(byName('hotel_amenities')?.path).toBe('/admin/catalogue/hotel-amenities');
  });

  it('routes the new guides on the fast path', () => {
    expect(matchCapabilityByKeywords('how do I add a wallet approver')?.name).toBe('wallet_approvers');
    expect(matchCapabilityByKeywords('where are my staff notifications')?.name).toBe('staff_notifications');
    expect(matchCapabilityByKeywords('how do I add hotel amenities')?.name).toBe('hotel_amenities');
    expect(matchCapabilityByKeywords('how does the kyc second reviewer work')?.name).toBe('kyc_review');
    expect(matchCapabilityByKeywords('how do I change the clearance period')?.name).toBe('wallet_settings');
  });

  it('describes the current KYC flow, not only approve and reject', () => {
    const kyc = JSON.stringify(byName('kyc_review'));
    for (const phrase of ['second reviewer', 'identity resolution', 'authenticator', 'security status']) expect(kyc.toLowerCase()).toContain(phrase);
  });

  it('titles renamed pages with their English sidebar label', () => {
    const navigation = (enAdmin as { navigation: Record<string, string> }).navigation;
    expect(byName('reconciliation')?.title).toBe(navigation['Reconciliation']);
    expect(byName('event_campaigns')?.title).toBe(navigation['Promotion Campaigns']);
    expect(byName('event_registrations')?.title).toBe(navigation['Event Registrations']);
    expect(byName('event_promotions')?.title).toBe(navigation['Event Promos']);
    expect(byName('sponsored_placements')?.title).toBe(navigation['Sponsored Placements']);
  });
});
