import { expect, test, type BrowserContext } from '@playwright/test';
import { localEnv } from './helpers/demo';

test.use({ trace: 'off', video: 'off' });

const customerUser = {
  id: 'e2e-support-customer-1',
  email: 'support-recovery@example.test',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-01-01T00:00:00.000Z',
};

async function mockCustomerSession(context: BrowserContext) {
  const supabaseUrl = localEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = localEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return false;
  const session = {
    access_token: 'support-recovery-test-token',
    refresh_token: 'support-recovery-test-refresh',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: customerUser,
  };
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  await context.addCookies([{
    name: `sb-${projectRef}-auth-token`,
    value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`,
    domain: 'localhost',
    path: '/',
    httpOnly: false,
    sameSite: 'Lax',
  }]);
  await context.route('**/auth/v1/user', (route) => route.fulfill({ status: 200, json: customerUser }));
  await context.route('**/api/auth/me', (route) => route.fulfill({ status: 200, json: { user: {
    id: customerUser.id,
    email: customerUser.email,
    fullName: 'Support recovery test',
    avatarUrl: null,
    tier: 'email_unverified',
    roles: ['customer'],
    activeVendorId: null,
    activeVendorName: null,
    activeOutletIds: [],
    activeOutletName: null,
    city: null,
    country: null,
    preferredLocale: null,
    phone: null,
    status: 'active',
    capabilities: {},
    verificationFacts: null,
    entitlementGeneration: 1,
    staffRoleNames: [],
    staffPermissionKeys: [],
    staffModules: [],
    staffVerified: false,
    staffPasskeyRequired: false,
    staffMfaRequired: false,
    staffPermissionExpiresAt: null,
  } } }));
  await context.route('**/api/support/tickets?page=1', (route) => route.fulfill({ status: 200, json: { data: {
    tickets: [], page: 1, pageSize: 10, total: 0, totalPages: 1,
  }, error: null } }));
  return true;
}

test('mocked customer draft recovery survives a failed read, retry, and page refresh', async ({ page, context }) => {
  test.skip(!await mockCustomerSession(context), 'Local browser environment needs the public Supabase client settings.');

  const withdrawalId = '4a448d6e-4198-4df0-95ba-9017d3ed5464';
  const createdTicketId = '57bffad3-3652-4aa0-8998-74008f85b04a';
  let ticketCreateCount = 0;
  await context.route('**/api/support/tickets', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    ticketCreateCount += 1;
    await route.fulfill({ status: 503, json: { data: null, error: { code: 'WRITE_UNAVAILABLE' } } });
  });
  await context.route('**/api/support/operations/**', (route) => route.fulfill({ status: 200, json: {
    data: { state: 'completed', ticketId: createdTicketId }, error: null,
  } }));

  let failNextDraftRead = true;
  let savedDraft: { subject: string; body: string; version: number } | null = null;
  await context.route('**/api/support/drafts**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      if (failNextDraftRead) {
        failNextDraftRead = false;
        await route.fulfill({ status: 503, json: { data: null, error: { code: 'READ_UNAVAILABLE' } } });
        return;
      }
      await route.fulfill({ status: 200, json: { data: savedDraft ?? { subject: '', body: '', version: 0 }, error: null } });
      return;
    }
    if (request.method() === 'PUT') {
      const input = request.postDataJSON() as { subject: string; body: string };
      savedDraft = { subject: input.subject, body: input.body, version: 1 };
      await route.fulfill({ status: 200, json: { data: { version: 1, changed: true }, error: null } });
      return;
    }
    if (request.method() === 'DELETE') {
      savedDraft = null;
      await route.fulfill({ status: 200, json: { data: { cleared: true }, error: null } });
      return;
    }
    await route.fulfill({ status: 405, json: { data: null, error: { code: 'METHOD_NOT_ALLOWED' } } });
  });

  await page.goto(`/customer/support?withdrawal=${withdrawalId}`);
  const subject = page.getByRole('textbox', { name: /subject/i });
  const message = page.getByRole('textbox', { name: /message/i });
  await expect(subject).toBeVisible();
  await expect(page.locator('p[role="alert"]').filter({ hasText: 'Could not load the saved draft' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry loading draft' }).click();

  await subject.fill('Withdrawal status follow-up');
  await message.fill('Please check the status shown on my account.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('textbox', { name: /subject/i })).toHaveValue('Withdrawal status follow-up');
  await expect(page.getByRole('textbox', { name: /message/i })).toHaveValue('Please check the status shown on my account.');

  await page.getByRole('button', { name: 'Send information' }).click();
  await expect(page.getByRole('button', { name: 'Check ticket status' })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/customer/support/${createdTicketId}$`));
  expect(ticketCreateCount).toBe(1);
});

test('mocked deterministic withdrawal-state rejection points to the current withdrawal status', async ({ page, context }) => {
  test.skip(!await mockCustomerSession(context), 'Local browser environment needs the public Supabase client settings.');
  const withdrawalId = 'cb0ce13a-f82d-4384-949f-0a2e7d56e4ce';
  let operationChecks = 0;
  await context.route('**/api/support/drafts**', (route) => route.fulfill({ status: 200, json: {
    data: { subject: '', body: '', version: 0 }, error: null,
  } }));
  await context.route('**/api/support/tickets', (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    return route.fulfill({ status: 409, json: {
      data: null, error: { code: 'INVALID_STATE', message: 'Only a held withdrawal can be linked.' },
    } });
  });
  await context.route('**/api/support/operations/**', (route) => {
    operationChecks += 1;
    return route.fulfill({ status: 200, json: { data: { state: 'not_found' }, error: null } });
  });

  await page.goto(`/customer/support?withdrawal=${withdrawalId}`);
  await page.getByRole('textbox', { name: /message/i }).fill('Please check this withdrawal.');
  await page.getByRole('button', { name: 'Send information' }).click();
  await expect(page.locator('p[role="alert"]').filter({ hasText: 'This withdrawal is no longer on hold' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open withdrawal status' })).toHaveAttribute('href', `/customer/wallet/withdrawals/${withdrawalId}`);
  await expect(page.getByRole('button', { name: 'Check ticket status' })).toHaveCount(0);
  expect(operationChecks).toBe(0);
});

test('mocked blocked browser storage prevents an unrecoverable ticket submission', async ({ page, context }) => {
  test.skip(!await mockCustomerSession(context), 'Local browser environment needs the public Supabase client settings.');
  let ticketCreateCount = 0;
  await page.addInitScript(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('mw_support_ticket_operation:')) throw new DOMException('blocked', 'QuotaExceededError');
      return originalSetItem.call(this, key, value);
    };
  });
  await context.route('**/api/support/drafts**', (route) => route.fulfill({ status: 200, json: {
    data: { subject: '', body: '', version: 0 }, error: null,
  } }));
  await context.route('**/api/support/tickets', (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    ticketCreateCount += 1;
    return route.fulfill({ status: 201, json: { data: { id: '57bffad3-3652-4aa0-8998-74008f85b04a' }, error: null } });
  });

  await page.goto('/customer/support?withdrawal=cb0ce13a-f82d-4384-949f-0a2e7d56e4ce');
  await page.getByRole('textbox', { name: /message/i }).fill('Please check this withdrawal.');
  await page.getByRole('button', { name: 'Send information' }).click();
  await expect(page.locator('p[role="alert"]').filter({ hasText: 'Your browser blocked the request reference' })).toBeVisible();
  expect(ticketCreateCount).toBe(0);
});

test('mocked corrupt operation reference is cleared before a new safe submission', async ({ page, context }) => {
  test.skip(!await mockCustomerSession(context), 'Local browser environment needs the public Supabase client settings.');
  const withdrawalId = 'cb0ce13a-f82d-4384-949f-0a2e7d56e4ce';
  const ticketId = '57bffad3-3652-4aa0-8998-74008f85b04a';
  let submittedOperationId = '';
  let operationChecks = 0;
  await page.addInitScript(({ ownerId, targetWithdrawalId }) => {
    localStorage.setItem(`mw_support_ticket_operation:${ownerId}:${targetWithdrawalId}`, 'a'.repeat(36));
  }, { ownerId: customerUser.id, targetWithdrawalId: withdrawalId });
  await context.route('**/api/support/drafts**', (route) => route.fulfill({ status: 200, json: {
    data: { subject: '', body: '', version: 0 }, error: null,
  } }));
  await context.route('**/api/support/operations/**', (route) => {
    operationChecks += 1;
    return route.fulfill({ status: 400, json: { data: null, error: { code: 'BAD_REQUEST' } } });
  });
  await context.route('**/api/support/tickets', (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    submittedOperationId = String(route.request().postDataJSON().operationId ?? '');
    return route.fulfill({ status: 201, json: { data: { id: ticketId }, error: null } });
  });

  await page.goto(`/customer/support?withdrawal=${withdrawalId}`);
  await page.getByRole('textbox', { name: /message/i }).waitFor();
  await expect.poll(() => page.evaluate(({ ownerId, targetWithdrawalId }) =>
    localStorage.getItem(`mw_support_ticket_operation:${ownerId}:${targetWithdrawalId}`),
  { ownerId: customerUser.id, targetWithdrawalId: withdrawalId })).toBeNull();
  await expect.poll(() => operationChecks).toBe(0);
  await page.getByRole('textbox', { name: /message/i }).fill('Please check this withdrawal.');
  await page.getByRole('button', { name: 'Send information' }).click();
  await expect.poll(() => submittedOperationId).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
});

test('mocked ticket history loads earlier replies in a bounded page and keeps the visible thread', async ({ page, context }) => {
  test.skip(!await mockCustomerSession(context), 'Local browser environment needs the public Supabase client settings.');
  const ticketId = '91f243cf-f7a9-4c60-8eb3-1b102fb9a942';
  const cursor = { createdAt: '2026-04-01T00:29:00.000Z', id: '00000000-0000-4000-8000-000000000029' };
  let historyRequestUrl = '';
  const replies = Array.from({ length: 30 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    is_mine: index % 2 === 0,
    sender_role: index % 2 === 0 ? 'customer' : 'admin',
    body: `Recent reply ${index + 1}`,
    created_at: new Date(Date.UTC(2026, 2, index + 1)).toISOString(),
    attachment_type: null,
  }));
  replies[29].sender_role = 'admin';
  await context.route(`**/api/support/tickets/${ticketId}`, (route) => route.fulfill({ status: 200, json: { data: {
    id: ticketId, viewerIsOwner: true, subject: 'History test', body: 'Original request', category: 'general', status: 'open',
    createdAt: '2026-02-01T00:00:00.000Z', resolvedAt: null, muted: false, replies, repliesCursor: cursor,
  }, error: null } }));
  await context.route(`**/api/support/tickets/${ticketId}/read`, (route) => route.fulfill({ status: 200, json: { data: { changed: false }, error: null } }));
  await context.route('**/api/support/drafts?surface=ticket_reply**', (route) => route.fulfill({ status: 200, json: {
    data: { body: '', version: 0 }, error: null,
  } }));
  await context.route(`**/api/support/tickets/${ticketId}/replies?*`, async (route) => {
    historyRequestUrl = route.request().url();
    await route.fulfill({ status: 200, json: { data: {
      replies: [{ id: '00000000-0000-4000-8000-000000000000', is_mine: false, sender_role: 'admin', body: 'Earlier reply restored', created_at: '2026-03-01T00:00:00.000Z', attachment_type: null }],
      nextCursor: null,
    }, error: null } });
  });

  await page.goto(`/customer/support/${ticketId}`);
  await expect(page.getByText('Recent reply 30')).toBeVisible();
  await page.getByRole('button', { name: 'Load earlier messages' }).click();
  await expect(page.getByText('Earlier reply restored')).toBeVisible();
  await expect(page.getByText('Recent reply 30')).toBeVisible();
  expect(new URL(historyRequestUrl).searchParams.get('beforeCreatedAt')).toBe(cursor.createdAt);
  expect(new URL(historyRequestUrl).searchParams.get('beforeId')).toBe(cursor.id);
});

test('mocked failed ticket read marker stays actionable and retries the displayed reply', async ({ page, context }) => {
  test.skip(!await mockCustomerSession(context), 'Local browser environment needs the public Supabase client settings.');
  const ticketId = '9fae18d3-38d2-4d9d-91c5-fc74119c91ee';
  const replyId = '00000000-0000-4000-8000-000000000041';
  let readAttempts = 0;
  let displayedReplyId = '';

  await context.route(`**/api/support/tickets/${ticketId}`, (route) => route.fulfill({ status: 200, json: { data: {
    id: ticketId, viewerIsOwner: true, subject: 'Read recovery test', body: 'Original request', category: 'general', status: 'open',
    createdAt: '2026-04-01T00:00:00.000Z', resolvedAt: null, muted: false,
    replies: [{ id: replyId, is_mine: false, sender_role: 'admin', body: 'Please check the latest details.', created_at: '2026-04-01T00:01:00.000Z', attachment_type: null }],
    repliesCursor: null,
  }, error: null } }));
  await context.route(`**/api/support/tickets/${ticketId}/read`, async (route) => {
    readAttempts += 1;
    displayedReplyId = String(route.request().postDataJSON()?.lastDisplayedReplyId ?? '');
    if (readAttempts === 1) {
      await route.fulfill({ status: 503, json: { data: null, error: { code: 'READ_UNAVAILABLE' } } });
      return;
    }
    await route.fulfill({ status: 200, json: { data: { id: ticketId, column: 'customer_last_read_at', changed: true }, error: null } });
  });
  await context.route(`**/api/support/drafts?surface=ticket_reply**`, (route) => route.fulfill({ status: 200, json: {
    data: { body: '', version: 0 }, error: null,
  } }));

  await page.goto(`/customer/support/${ticketId}`);
  await expect(page.getByText('Please check the latest details.')).toBeVisible();
  await expect(page.locator('[role="alert"]').filter({ hasText: 'Could not load this information. Try again.' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('[role="alert"]').filter({ hasText: 'Could not load this information. Try again.' })).toHaveCount(0);
  expect(readAttempts).toBe(2);
  expect(displayedReplyId).toBe(replyId);
});

test('mocked ticket remains unread while its browser tab is hidden', async ({ page, context }) => {
  test.skip(!await mockCustomerSession(context), 'Local browser environment needs the public Supabase client settings.');
  const ticketId = 'cd6cdb77-d77e-4539-ae3f-7f79c5dc5b7b';
  let readAttempts = 0;
  await page.addInitScript(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  });
  await context.route(`**/api/support/tickets/${ticketId}`, (route) => route.fulfill({ status: 200, json: { data: {
    id: ticketId, viewerIsOwner: true, subject: 'Hidden tab read test', body: 'Original request', category: 'general', status: 'open',
    createdAt: '2026-04-01T00:00:00.000Z', resolvedAt: null, muted: false,
    replies: [{ id: '00000000-0000-4000-8000-000000000042', is_mine: false, sender_role: 'admin', body: 'New support reply', created_at: '2026-04-01T00:01:00.000Z', attachment_type: null }],
    repliesCursor: null,
  }, error: null } }));
  await context.route(`**/api/support/tickets/${ticketId}/read`, (route) => {
    readAttempts += 1;
    return route.fulfill({ status: 200, json: { data: { id: ticketId, column: 'customer_last_read_at', changed: true }, error: null } });
  });
  await context.route(`**/api/support/drafts?surface=ticket_reply**`, (route) => route.fulfill({ status: 200, json: {
    data: { body: '', version: 0 }, error: null,
  } }));

  await page.goto(`/customer/support/${ticketId}`);
  await expect(page.getByText('New support reply')).toBeVisible();
  expect(readAttempts).toBe(0);

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => readAttempts).toBe(1);
});

test('mocked ticket read permission failure gives a path back to the ticket list', async ({ page, context }) => {
  test.skip(!await mockCustomerSession(context), 'Local browser environment needs the public Supabase client settings.');
  const ticketId = '0fb163b9-7831-4a6b-9daf-13549e05346d';

  await context.route(`**/api/support/tickets/${ticketId}`, (route) => route.fulfill({ status: 200, json: { data: {
    id: ticketId, viewerIsOwner: true, subject: 'Permission recovery test', body: 'Original request', category: 'general', status: 'open',
    createdAt: '2026-04-01T00:00:00.000Z', resolvedAt: null, muted: false,
    replies: [{ id: '00000000-0000-4000-8000-000000000043', is_mine: false, sender_role: 'admin', body: 'Please check the latest details.', created_at: '2026-04-01T00:01:00.000Z', attachment_type: null }],
    repliesCursor: null,
  }, error: null } }));
  await context.route(`**/api/support/tickets/${ticketId}/read`, (route) => route.fulfill({
    status: 403, json: { data: null, error: { code: 'FORBIDDEN' } },
  }));
  await context.route(`**/api/support/drafts?surface=ticket_reply**`, (route) => route.fulfill({ status: 200, json: {
    data: { body: '', version: 0 }, error: null,
  } }));

  await page.goto(`/customer/support/${ticketId}`);
  await expect(page.getByText("Couldn't load this ticket")).toBeVisible();
  await expect(page.getByRole('link', { name: 'My Tickets' })).toHaveAttribute('href', '/customer/support');
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
});
