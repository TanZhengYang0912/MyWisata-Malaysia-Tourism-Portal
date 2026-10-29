import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { api } from './helpers/demo';
import { installPortalFixtureCleanup, PortalFixture, portalArtifacts } from './helpers/portal-fixture';
import { authenticateStaff, passwordLogin, staffEvidence } from './helpers/staff-auth';

installPortalFixtureCleanup();
type Receipt = { roleId?: string; assignmentId?: string; auditEventId: string; committed: boolean; receiptAvailable: boolean };
type Audit = { id: string; actorId: string; action: string; entityId: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; reason: string | null };

async function waitForNativeCaptchaDisabled(fixture: PortalFixture, account: { email: string; password: string }) {
  const probe = createClient(fixture.target.url, fixture.target.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const result = await probe.auth.signInWithPassword({ email: account.email, password: account.password });
    if (result.data.session) {
      const signedOut = await probe.auth.signOut({ scope: 'local' });
      expect(signedOut.error, 'Close only the temporary CAPTCHA rollout probe session').toBeNull();
      return { disabled: true, attempts: attempt };
    }
    if (result.error?.code !== 'captcha_failed') throw new Error('Native CAPTCHA rollout probe returned an unexpected Auth error');
    if (attempt < 8) await new Promise(resolve => setTimeout(resolve, 10_000));
  }
  throw new Error('Supabase Auth has not applied the temporary CAPTCHA setting');
}

async function waitForNativeCaptchaEnabled(fixture: PortalFixture, account: { email: string; password: string }) {
  const probe = createClient(fixture.target.url, fixture.target.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const result = await probe.auth.signInWithPassword({ email: account.email, password: account.password });
    if (result.error?.code === 'captcha_failed') return { enabled: true, attempts: attempt };
    if (result.data.session) {
      const signedOut = await probe.auth.signOut({ scope: 'local' });
      expect(signedOut.error, 'Close only the temporary CAPTCHA restoration probe session').toBeNull();
    } else {
      throw new Error('Native CAPTCHA restoration probe returned an unexpected Auth error');
    }
    if (attempt < 8) await new Promise(resolve => setTimeout(resolve, 10_000));
  }
  throw new Error('Supabase Auth has not applied the restored CAPTCHA setting');
}

async function confirm(page: Page, label: string) {
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByRole('button', { name: label, exact: true })).toBeDisabled();
  await dialog.getByRole('textbox', { name: 'Type the confirmation phrase' }).fill('CONFIRM');
  await dialog.getByRole('button', { name: label, exact: true }).click();
}

test('a fully authenticated administrator assigns and revokes a role with real audit evidence', async ({ page, browser }) => {
  test.skip(!process.env.PORTAL_E2E_CAPTCHA_WINDOW, 'Use the bounded CAPTCHA acceptance runner.');
  const fixture = new PortalFixture();
  const employeeContext = await browser.newContext();
  const employeePage = await employeeContext.newPage();
  const evidence: Record<string, unknown> = { projectRef: fixture.target.projectRef, runId: fixture.runId, startedAt: new Date().toISOString(), stage: 'setup', authMode: 'real-password+real-totp+virtual-webauthn; CAPTCHA excluded by authorized local provider fixture; native CAPTCHA restored before authorization' };
  const images: Array<{ file: string; label: string }> = [];
  const directory = portalArtifacts();
  async function capture(target: Page | Locator, file: string, label: string) {
    await target.screenshot({ path: join(directory, file) }); images.push({ file, label });
  }
  try {
    const administrator = await fixture.createAccount('super_admin');
    const employee = await fixture.createAccount('approver');
    const roleName = `QA ${fixture.runId.slice(0, 8)}`;
    fixture.registerStaffRole(roleName, administrator);
    evidence.captchaRolloutProbe = await waitForNativeCaptchaDisabled(fixture, administrator);
    const sharedBefore = await fixture.service.from('staff_roles').select('id,updated_at').eq('is_system', true).order('id');
    expect(sharedBefore.error).toBeNull();
    evidence.stage = 'password-login';
    await passwordLogin(page, administrator);
    await passwordLogin(employeePage, employee);
    // The parent restores the shared CAPTCHA switch before TOTP and all RBAC operations.
    const window = process.env.PORTAL_E2E_CAPTCHA_WINDOW!;
    writeFileSync(join(window, 'passwords-ready'), 'ready', { mode: 0o600 });
    await expect.poll(() => existsSync(join(window, 'captcha-restored.json')), { timeout: 45_000 }).toBe(true);
    const restored = JSON.parse(readFileSync(join(window, 'captcha-restored.json'), 'utf8')) as { restored: boolean; enabled: boolean; providerAndSecretUnchanged: boolean };
    expect(restored).toMatchObject({ restored: true, enabled: true, providerAndSecretUnchanged: true });
    evidence.captcha = restored;
    evidence.captchaProviderEnforced = await waitForNativeCaptchaEnabled(fixture, administrator);
    evidence.stage = 'strict-authentication';
    evidence.administratorAuthentication = (await authenticateStaff(page, fixture, administrator, true)).evidence;
    const employeeAuthentication = (await authenticateStaff(employeePage, fixture, employee, true)).evidence;
    evidence.employeeAuthentication = employeeAuthentication;
    expect(employeeAuthentication.full).toMatchObject({ isSuperAdmin: false, recommendationReview: false });
    evidence.staffCannotGovern = (await api(employeePage, 'GET', '/api/admin/access-control/overview')).status;
    expect(evidence.staffCannotGovern).toBe(403);
    expect((await api(employeePage, 'GET', '/api/admin/recommendations')).status).toBe(403);
    const overview = page.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/access-control/overview');
    await page.goto('/admin/access-control');
    expect((await overview).status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Access Control', exact: true })).toBeVisible();
    await expect(page.getByText('Loading Access Control data…', { exact: true })).toHaveCount(0);
    await capture(page.locator('main'), '01-access-control.png', 'Strict administrator session opens Access Control');

    evidence.stage = 'create-role';
    const initialEmployeeList = page.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/access-control/staff-employees' && new URL(response.url()).searchParams.get('page') === '1');
    await page.getByRole('tab', { name: 'Staff Roles', exact: true }).click();
    const initialEmployeeListResponse = await initialEmployeeList;
    const initialEmployeeListBody = await initialEmployeeListResponse.json() as { error?: { code?: string; details?: { stage?: string; databaseCode?: string; fields?: string[] } } };
    evidence.initialEmployeeList = {
      status: initialEmployeeListResponse.status(),
      errorCode: initialEmployeeListBody.error?.code ?? null,
      diagnostic: initialEmployeeListBody.error?.details ?? null,
    };
    await expect(page.locator('#role-name')).toBeVisible();
    await page.locator('#role-name').fill(roleName);
    await page.locator('#role-description').fill('Synthetic least-privilege Access Control acceptance role');
    await page.locator('fieldset').getByRole('checkbox', { name: /Recommendations/ }).check();
    const creationReason = `Create isolated acceptance role ${fixture.runId}`;
    await page.locator('#role-reason').fill(creationReason);
    await page.getByRole('button', { name: 'Review role change', exact: true }).click();
    const roleResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/access-control/staff-roles' && response.request().method() === 'POST');
    await confirm(page, 'Save staff role');
    const created = await roleResponse;
    expect(created.status()).toBe(201);
    const roleReceipt = (await created.json() as { data: Receipt }).data;
    expect(roleReceipt).toMatchObject({ committed: true, receiptAvailable: true });
    expect(roleReceipt.roleId).toBeTruthy();
    const roleId = roleReceipt.roleId!;
    evidence.role = { id: roleId, name: roleName, auditEventId: roleReceipt.auditEventId };

    evidence.stage = 'assign-role';
    await page.locator('#assignment-role').selectOption(roleId);
    await page.locator('#staff-search').fill(employee.email);
    await page.locator('form').filter({ has: page.locator('#staff-search') }).getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('button').filter({ hasText: employee.email }).click();
    const assignmentReason = `Grant synthetic employee recommendation-review access ${fixture.runId}`;
    await page.locator('#assignment-reason').fill(assignmentReason);
    await page.getByRole('button', { name: /^Review granting \d+ permissions?$/ }).click();
    await capture(page.getByRole('alertdialog'), '02-grant-confirmation.png', 'Confirm the exact employee, role and permission being granted');
    const assignmentPath = `/api/admin/access-control/staff-roles/${roleId}/assignments`;
    const assignmentResponse = page.waitForResponse(response => new URL(response.url()).pathname === assignmentPath && response.request().method() === 'POST');
    await confirm(page, 'Grant permissions');
    const assigned = await assignmentResponse;
    expect(assigned.status()).toBe(201);
    const assignmentReceipt = (await assigned.json() as { data: Receipt }).data;
    expect(assignmentReceipt).toMatchObject({ committed: true, receiptAvailable: true });
    const assignmentId = assignmentReceipt.assignmentId!;
    const afterGrant = await staffEvidence(employeePage, fixture);
    expect(afterGrant).toMatchObject({ verified: true, isSuperAdmin: false, eventReview: true, recommendationReview: true });
    const grantedStatus = (await api(employeePage, 'GET', '/api/admin/recommendations')).status;
    expect(grantedStatus).toBe(200);
    await employeePage.reload();
    await expect(employeePage.getByRole('link', { name: /Recommendations/ })).toBeVisible();
    await capture(employeePage.locator('main'), '03-employee-granted.png', 'The same staff session receives only the assigned work module');
    evidence.assignment = { id: assignmentId, auditEventId: assignmentReceipt.auditEventId, eventApiStatus: grantedStatus, afterGrant };

    async function viewAudit(eventId: string, action: string, reason: string) {
      await page.getByRole('button', { name: 'View audit event', exact: true }).click();
      await expect(page.getByPlaceholder('Action prefix', { exact: true })).toHaveValue(action);
      const row = page.getByRole('row').filter({ hasText: action });
      await expect(row).toHaveCount(1, { timeout: 20_000 });
      await expect(row).toContainText(assignmentId);
      await expect(row).toContainText(reason);
      await expect(page.getByRole('region', { name: 'Key changes' })).toBeVisible();
      const auditResponse = await api(page, 'GET', `/api/admin/access-control/audit-log?page=1&pageSize=25&entityId=${encodeURIComponent(assignmentId)}`);
      expect(auditResponse.status).toBe(200);
      const payload = auditResponse.json as { data: { items: Audit[] } };
      const event = payload.data.items.find(item => item.id === eventId);
      expect(event).toMatchObject({ actorId: administrator.id, action, entityId: assignmentId });
      // These assertions must prove who received which role and why, through the public audit API.
      expect.soft(event?.after).toMatchObject({ assignmentId, roleId, userId: employee.id });
      expect.soft(event?.reason).toBe(reason);
      await expect(row).toContainText(administrator.id);
      return event;
    }
    evidence.stage = 'assigned-audit';
    evidence.assignedAudit = await viewAudit(assignmentReceipt.auditEventId, 'staff.role.assigned', assignmentReason);
    await capture(page.locator('main'), '04-assigned-audit.png', 'Actual assignment event from Supabase with its immutable event ID');

    evidence.stage = 'revoke-role';
    await page.getByRole('tab', { name: 'Staff Roles', exact: true }).click();
    const employees = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Employees and access', exact: true }) });
    const employeeListResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/access-control/staff-employees' && new URL(response.url()).searchParams.get('search') === employee.email);
    await employees.getByRole('textbox', { name: 'Search employees by name or email', exact: true }).fill(employee.email);
    const employeeList = await employeeListResponse;
    expect(employeeList.status()).toBe(200);
    expect((await employeeList.json() as { data: { items: Array<{ id: string }> } }).data.items.map(item => item.id)).toEqual([employee.id]);
    await expect(employees.getByRole('button', { name: 'View access', exact: true })).toHaveCount(1);
    const employeeAccessResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/admin/access-control/staff-employees/${employee.id}` && !new URL(response.url()).search);
    await employees.getByRole('button', { name: 'View access', exact: true }).click();
    const employeeAccess = (await (await employeeAccessResponse).json() as { data: { id: string; assignments: Array<{ id: string; roleId: string }> } }).data;
    expect(employeeAccess.id).toBe(employee.id);
    expect(employeeAccess.assignments).toContainEqual(expect.objectContaining({ id: assignmentId, roleId }));
    await employees.getByRole('button', { name: 'Revoke this assignment', exact: true }).click();
    const revocationReason = `Remove only the synthetic employee role ${fixture.runId}`;
    await employees.getByRole('textbox', { name: 'Reason for revoking this assignment' }).fill(revocationReason);
    await employees.getByRole('button', { name: 'Review change', exact: true }).click();
    await capture(page.getByRole('alertdialog'), '05-revoke-confirmation.png', 'Individual revocation preserves the employee and historical audit records');
    const revokeResponse = page.waitForResponse(response => new URL(response.url()).pathname === assignmentPath && response.request().method() === 'DELETE');
    await confirm(page, 'Revoke this assignment');
    const revoked = await revokeResponse;
    expect(revoked.status()).toBe(200);
    const revokeReceipt = (await revoked.json() as { data: Receipt }).data;
    expect(revokeReceipt).toMatchObject({ committed: true, receiptAvailable: true });
    const afterRevoke = await staffEvidence(employeePage, fixture);
    expect(afterRevoke).toMatchObject({ verified: true, isSuperAdmin: false, eventReview: true, recommendationReview: false });
    const revokedStatus = (await api(employeePage, 'GET', '/api/admin/recommendations')).status;
    expect(revokedStatus).toBe(403);
    await employeePage.reload();
    await expect(employeePage.getByRole('link', { name: /Recommendations/ })).toHaveCount(0);
    await capture(employeePage.locator('main'), '06-employee-revoked.png', 'Revocation immediately removes the staff module and API authority');
    evidence.revocation = { auditEventId: revokeReceipt.auditEventId, eventApiStatus: revokedStatus, afterRevoke };
    evidence.stage = 'revoked-audit';
    evidence.revokedAudit = await viewAudit(revokeReceipt.auditEventId, 'staff.role.revoked', revocationReason);
    await capture(page.locator('main'), '07-revocation-audit.png', 'The revocation audit event remains queryable for the same assignment');
    const persisted = await fixture.service.from('staff_role_assignments').select('role_id,user_id,assigned_by,revoked_at').eq('id', assignmentId).single();
    expect(persisted.error).toBeNull();
    expect(persisted.data).toMatchObject({ role_id: roleId, user_id: employee.id, assigned_by: administrator.id });
    expect(persisted.data?.revoked_at).toBeTruthy();
    const sharedAfter = await fixture.service.from('staff_roles').select('id,updated_at').eq('is_system', true).order('id');
    expect(sharedAfter.error).toBeNull();
    expect(sharedAfter.data).toEqual(sharedBefore.data);
    evidence.sharedSystemRolesUnchanged = true;
    evidence.stage = 'completed';
  } finally {
    await employeeContext.close();
    if (!page.isClosed()) { await page.goto('about:blank'); await page.context().clearCookies(); }
    try {
      await fixture.cleanup();
      evidence.cleanup = { verified: true, retainedDeletedSyntheticAuditActors: fixture.retainedAuditActors, authAndCredentialsRemoved: true, testRoleAndAssignmentsRemoved: true, auditHistoryPreserved: true };
    } catch (error) {
      evidence.cleanup = { verified: false, error: error instanceof Error ? error.message : 'cleanup_failed', retainedDeletedSyntheticAuditActors: fixture.retainedAuditActors };
      throw error;
    } finally {
      evidence.finishedAt = new Date().toISOString();
      writeFileSync(join(directory, 'access-control-evidence.json'), JSON.stringify(evidence, null, 2));
      writeFileSync(join(directory, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Access Control acceptance</title><style>body{font:16px system-ui;max-width:1200px;margin:32px auto;background:#f8fafc;color:#172033}img{max-width:100%;border:1px solid #ddd}figure{margin:32px 0}figcaption{margin:12px 0;font-weight:600}</style><h1>Access Control Playwright acceptance</h1><p>Real Supabase password, TOTP, virtual WebAuthn and authorization. CAPTCHA is explicitly excluded by a local-only test adapter and was restored before authorization. Synthetic accounts only.</p>${images.map(image => `<figure><figcaption>${image.label}</figcaption><img src="${image.file}" alt="${image.label}"></figure>`).join('')}</html>`);
    }
  }
});
