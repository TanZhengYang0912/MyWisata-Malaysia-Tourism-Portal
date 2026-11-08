import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAPABILITY_REGISTRY, capabilityContext, findCapability } from '../capabilities';
import { STAFF_WORKFLOWS, workflowsForGuide } from '../workflows';

const EM_DASH = '—';

describe('Staff Help workflows and lifecycles', () => {
  it('points every workflow step at an existing guide', () => {
    const names = new Set(CAPABILITY_REGISTRY.map((capability) => capability.name));
    for (const workflow of STAFF_WORKFLOWS) for (const step of workflow.steps) expect(names, `${workflow.slug}: ${step.guide}`).toContain(step.guide);
  });

  it('documents the lifecycle of the pages that run a whole activity', () => {
    for (const name of ['withdrawals', 'refund_review', 'kyc_review']) {
      expect(findCapability(name)?.lifecycle?.length, name).toBeGreaterThan(3);
    }
  });

  it('finds a guide\'s position in a workflow', () => {
    expect(workflowsForGuide('event_registrations')).toEqual([{ workflow: STAFF_WORKFLOWS[0], index: 1 }]);
    expect(workflowsForGuide('withdrawals')).toEqual([]);
  });

  it('gives the AI assistant the lifecycle and workflow position', () => {
    expect(capabilityContext(findCapability('withdrawals')!)).toContain('Status lifecycle, in order:');
    expect(capabilityContext(findCapability('event_registrations')!)).toContain('Part of the Event lifecycle workflow, step 2 of 6; before this: event_campaigns; next: orders.');
  });

  it('keeps em dashes and admin addresses out of everything Staff Help shows', () => {
    const shown = [
      ...CAPABILITY_REGISTRY.flatMap((capability) => [
        capability.title ?? '', capability.description, ...capability.actions, ...(capability.notes ?? []),
        ...(capability.lifecycle ?? []).flatMap((stage) => [stage.status, stage.by, stage.detail]),
      ]),
      ...STAFF_WORKFLOWS.flatMap((workflow) => [workflow.title, workflow.summary, ...workflow.steps.flatMap((step) => [step.by, step.what])]),
      ...['en', 'ms', 'zh-CN'].flatMap((locale) => Object.values(
        (JSON.parse(readFileSync(resolve(process.cwd(), `app/i18n/locales/${locale}/admin.json`), 'utf8')) as { staffHelp: Record<string, string> }).staffHelp,
      )),
    ];
    expect(shown.filter((text) => text.includes(EM_DASH))).toEqual([]);
    // Staff reach pages by name and the Open this page button, never by typing an address.
    expect(shown.filter((text) => text.includes('/admin/'))).toEqual([]);
  });
});
