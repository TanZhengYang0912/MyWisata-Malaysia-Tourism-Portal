import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { localEnv } from './demo';
import { accessControlFixtureSql } from '../../../scripts/lib/access-control-e2e-management.mjs';

export type PortalAccount = { id: string; email: string; password: string; role: 'customer' | 'super_admin' | 'approver' | 'staff' };
type OwnedRow = { table: string; id: string; ownerId: string };
type OwnedStaffRole = { name: string; createdBy: string };
type Journal = { runId: string; projectRef: string; accounts: string[]; rows: OwnedRow[]; staffRoles?: OwnedStaffRole[] };
const ROW_OWNERS: Record<string, string> = { trips: 'user_id', support_tickets: 'user_id', vendor_recommendations: 'recommender_id', vendors: 'owner_id', vendor_event_promotions: 'submitted_by' };
const activeFixtures = new Set<PortalFixture>();

export function portalTarget() {
  const url = localEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = localEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const serviceKey = localEnv('SUPABASE_SERVICE_ROLE_KEY');
  const projectRef = url ? new URL(url).hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1] : undefined;
  if (!url || !anonKey || !serviceKey || !projectRef || localEnv('PORTAL_E2E_TEST_DB_CONFIRM') !== projectRef) {
    throw new Error('PORTAL_E2E_TEST_DB_CONFIRM must identify the exact authorized test project.');
  }
  return { url, anonKey, serviceKey, projectRef };
}

function fail(operation: string, error: { code?: string; name?: string } | null) {
  if (error) throw new Error(`${operation} failed (${error.code ?? error.name ?? 'database_error'})`);
}

/** Every mutation belongs to this journal; no shared demo users or broad seed cleanup. */
export class PortalFixture {
  readonly target = portalTarget();
  readonly runId = randomUUID();
  readonly service: SupabaseClient;
  readonly journalPath = join(tmpdir(), `mywisata-portal-qa-${this.runId}.json`);
  private readonly accounts: string[] = [];
  private readonly rows: OwnedRow[] = [];
  private readonly staffRoles: OwnedStaffRole[] = [];
  readonly retainedAuditActors: string[] = [];
  private cleaned = false;
  private cleanupPromise: Promise<void> | null = null;
  private readonly signalHandler = () => { void this.cleanup().then(() => process.exit(130), () => process.exit(1)); };

  constructor() {
    this.service = createClient(this.target.url, this.target.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(20_000)]) }) },
    });
    this.saveJournal();
    activeFixtures.add(this);
    process.once('SIGINT', this.signalHandler);
    process.once('SIGTERM', this.signalHandler);
  }

  private saveJournal() {
    writeFileSync(this.journalPath, JSON.stringify({ runId: this.runId, projectRef: this.target.projectRef, accounts: this.accounts, rows: this.rows, staffRoles: this.staffRoles } satisfies Journal), { mode: 0o600 });
  }

  async createAccount(role: PortalAccount['role'] = 'customer'): Promise<PortalAccount> {
    const account = { id: randomUUID(), email: `portal-qa-${role}-${this.runId}-${this.accounts.length}@demo.local`, password: `Qa-${randomUUID()}!`, role };
    // Pre-register the client-generated ID so an ambiguous create timeout remains recoverable.
    this.accounts.push(account.id); this.saveJournal();
    const created = await this.service.auth.admin.createUser({ id: account.id, email: account.email, password: account.password, email_confirm: true, user_metadata: { full_name: `Portal QA ${role}`, qa_run: this.runId } });
    fail('Create temporary Auth identity', created.error);
    expect(created.data.user?.id).toBe(account.id);
    if (role !== 'customer') {
      const lookup = await this.service.from('roles').select('id').eq('name', role).single();
      fail('Resolve temporary staff role', lookup.error);
      const customerRole = await this.service.from('user_roles').delete().eq('user_id', account.id);
      fail('Remove default Customer role only from the new staff fixture', customerRole.error);
      const assignment = await this.service.from('user_roles').insert({ user_id: account.id, role_id: lookup.data!.id });
      fail('Assign temporary staff role', assignment.error);
    }
    return account;
  }

  /** Register the exact creation intent before UI submission, including ambiguous response failures. */
  registerStaffRole(name: string, creator: PortalAccount) {
    if (!this.accounts.includes(creator.id) || creator.role !== 'super_admin' || name !== `QA ${this.runId.slice(0, 8)}`) throw new Error('Staff role is outside this run');
    this.staffRoles.push({ name, createdBy: creator.id }); this.saveJournal();
  }

  async insert(table: string, values: Record<string, unknown>) {
    const ownerId = values[ROW_OWNERS[table]];
    if (!ROW_OWNERS[table] || typeof ownerId !== 'string' || !this.accounts.includes(ownerId)) throw new Error(`Table or owner is outside the nonfinancial portal fixture: ${table}`);
    const id = randomUUID(); this.rows.push({ table, id, ownerId }); this.saveJournal();
    const result = await this.service.from(table).insert({ ...values, id }).select('id').single();
    fail(`Create run-owned ${table}`, result.error);
    expect(result.data?.id).toBe(id);
    return id;
  }

  async authenticateCustomer(context: BrowserContext, account: PortalAccount, baseURL: string) {
    expect(this.accounts).toContain(account.id);
    expect(account.role).toBe('customer');
    expect(['localhost', '127.0.0.1']).toContain(new URL(baseURL).hostname);
    // Synthetic browsing must not increment the shared catalogue's paid metrics.
    // Reuse the existing Trip fixture contract; these metrics are not under test.
    await context.route('**/api/sponsored-placements/*/events', route => route.fulfill({ status: 201, json: { data: { accepted: true } } }));
    const generated = await this.service.auth.admin.generateLink({ type: 'magiclink', email: account.email });
    fail('Create temporary customer session', generated.error);
    const jar = new Map<string, string>();
    const client = createServerClient(this.target.url, this.target.anonKey, { cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: cookies => { for (const cookie of cookies) jar.set(cookie.name, cookie.value); },
    } });
    const verified = await client.auth.verifyOtp({ token_hash: generated.data.properties!.hashed_token, type: 'magiclink' });
    fail('Verify temporary customer session', verified.error);
    expect(verified.data.user?.id).toBe(account.id);
    await context.addCookies([...jar].map(([name, value]) => ({ name, value, url: new URL(baseURL).origin, sameSite: 'Lax' as const })));
  }

  async browserClient(page: Page) {
    const jar = new Map((await page.context().cookies()).map(cookie => [cookie.name, cookie.value]));
    const changed = new Map<string, string>();
    const client = createServerClient(this.target.url, this.target.anonKey, { cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: cookies => { for (const cookie of cookies) { jar.set(cookie.name, cookie.value); changed.set(cookie.name, cookie.value); } },
    } });
    const sync = async () => {
      await page.context().addCookies([...changed].map(([name, value]) => ({ name, value, url: new URL(page.url()).origin, sameSite: 'Lax' as const })));
    };
    return { client, sync };
  }

  cleanup(): Promise<void> {
    if (this.cleaned) return Promise.resolve();
    if (!this.cleanupPromise) this.cleanupPromise = this.cleanupOwned().catch(error => { this.cleanupPromise = null; throw error; });
    return this.cleanupPromise;
  }

  private async cleanupOwned() {
    const failures: string[] = [];
    for (const staffRole of this.staffRoles) {
      // Staff RBAC tables intentionally deny service-role DELETE. Use a narrow
      // management cleanup, preserving the append-only audit table and its actors.
      const ownedUsers = this.accounts.map(id => `'${id}'::uuid`).join(',');
      await accessControlFixtureSql(this.target.projectRef, `DO $cleanup$
        DECLARE target uuid;
        BEGIN
          SELECT id INTO target FROM public.staff_roles WHERE name='${staffRole.name}' AND created_by='${staffRole.createdBy}'::uuid;
          IF target IS NULL THEN RETURN; END IF;
          IF EXISTS (SELECT 1 FROM public.staff_role_assignments WHERE role_id=target AND (user_id NOT IN (${ownedUsers}) OR assigned_by IS NULL OR assigned_by NOT IN (${ownedUsers})))
            OR EXISTS (SELECT 1 FROM public.staff_invitations WHERE staff_role_id=target) THEN RAISE EXCEPTION 'fixture_role_has_external_references'; END IF;
          DELETE FROM public.staff_role_assignments WHERE role_id=target AND user_id IN (${ownedUsers}) AND assigned_by IN (${ownedUsers});
          DELETE FROM public.staff_roles WHERE id=target AND created_by='${staffRole.createdBy}'::uuid;
        END;
      $cleanup$;`);
      const remaining = await this.service.from('staff_roles').select('id').eq('name', staffRole.name).eq('created_by', staffRole.createdBy);
      if (remaining.error || remaining.data?.length) failures.push('staff_role:remaining');
    }
    for (const row of [...this.rows].reverse()) {
      const result = await this.service.from(row.table).delete().eq('id', row.id).eq(ROW_OWNERS[row.table], row.ownerId);
      if (result.error) failures.push(row.table);
      const remaining = await this.service.from(row.table).select('id').eq('id', row.id);
      if (remaining.error || remaining.data?.length) failures.push(`${row.table}:remaining`);
    }
    // Keep identities available when business-row cleanup needs a recoverable retry.
    if (failures.length) throw new Error(`Portal cleanup incomplete: ${failures.join(',')}; retain the journal.`);
    for (const id of [...this.accounts].reverse()) {
      const audits = await this.service.from('audit_logs').select('id', { count: 'exact', head: true }).eq('actor_id', id);
      fail('Inspect immutable synthetic actor history', audits.error);
      const retainActor = (audits.count ?? 0) > 0;
      for (const table of ['user_roles', 'wallets', 'carts']) {
        const result = await this.service.from(table).delete().eq('user_id', id);
        if (result.error) failures.push(table);
      }
      if (retainActor) {
        try {
          await accessControlFixtureSql(this.target.projectRef, `DO $cleanup$
            DECLARE affected integer;
            BEGIN
              PERFORM set_config('app.allow_account_status_write', 'on', true);
              UPDATE public.users SET status='deleted' WHERE id='${id}'::uuid
                AND EXISTS (SELECT 1 FROM public.audit_logs WHERE actor_id='${id}'::uuid);
              GET DIAGNOSTICS affected = ROW_COUNT;
              IF affected <> 1 THEN RAISE EXCEPTION 'fixture_audit_actor_tombstone_unverified'; END IF;
            END;
          $cleanup$;`);
        } catch { failures.push('audit_actor_tombstone'); }
        if (!this.retainedAuditActors.includes(id)) this.retainedAuditActors.push(id);
      } else {
        const result = await this.service.from('users').delete().eq('id', id);
        if (result.error) failures.push('users');
      }
      const removed = await this.service.auth.admin.deleteUser(id);
      if (removed.error && removed.error.status !== 404) failures.push('auth_delete');
      const auth = await this.service.auth.admin.getUserById(id);
      if (auth.error?.status !== 404 || auth.data.user) failures.push('auth_remaining');
      const profile = await this.service.from('users').select('id,status').eq('id', id).maybeSingle();
      if (profile.error || (retainActor ? profile.data?.status !== 'deleted' : profile.data !== null)) failures.push('users:remaining');
      for (const table of ['user_roles', 'wallets', 'carts']) {
        const remaining = await this.service.from(table).select('user_id').eq('user_id', id);
        if (remaining.error || remaining.data?.length) failures.push(`${table}:remaining`);
      }
    }
    if (failures.length) throw new Error(`Portal cleanup incomplete: ${failures.join(',')}; retain the journal.`);
    this.cleaned = true;
    activeFixtures.delete(this);
    process.removeListener('SIGINT', this.signalHandler); process.removeListener('SIGTERM', this.signalHandler);
    unlinkSync(this.journalPath);
  }

  static async recover(journalPath: string) {
    const target = portalTarget();
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as Journal;
    if (journal.projectRef !== target.projectRef || !/^[0-9a-f-]{36}$/.test(journal.runId) ||
      !journal.accounts.every(id => /^[0-9a-f-]{36}$/.test(id)) || !journal.rows.every(row => ROW_OWNERS[row.table] && /^[0-9a-f-]{36}$/.test(row.id) && journal.accounts.includes(row.ownerId))
      || !(journal.staffRoles ?? []).every(role => role.name === `QA ${journal.runId.slice(0, 8)}` && journal.accounts.includes(role.createdBy))) throw new Error('Invalid portal cleanup journal.');
    const fixture = new PortalFixture();
    for (const id of journal.accounts) {
      const identity = await fixture.service.auth.admin.getUserById(id);
      if (identity.data.user && identity.data.user.user_metadata.qa_run !== journal.runId) throw new Error('Recovery refused an identity outside this run.');
      if (identity.error && identity.error.status !== 404) throw new Error('Recovery could not verify the temporary identity.');
    }
    fixture.accounts.push(...journal.accounts); fixture.rows.push(...journal.rows); fixture.staffRoles.push(...journal.staffRoles ?? []); fixture.saveJournal();
    await fixture.cleanup(); unlinkSync(journalPath);
  }
}

/** Runs independently of a browser context that Playwright may already close. */
export function installPortalFixtureCleanup() {
  test.afterEach(async ({ request: _request }, testInfo) => {
    if (!activeFixtures.size) return;
    testInfo.setTimeout(90_000);
    for (const fixture of [...activeFixtures]) await fixture.cleanup();
  });
}

export function portalArtifacts() {
  const directory = localEnv('PORTAL_E2E_ARTIFACTS') ?? join(tmpdir(), 'mywisata-portal-acceptance');
  mkdirSync(directory, { recursive: true });
  return directory;
}
