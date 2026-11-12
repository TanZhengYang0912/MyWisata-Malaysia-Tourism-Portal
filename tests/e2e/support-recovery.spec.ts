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

test('mocked reopen reuses the saved operation after a lost response and intervening close', async ({ page, context }) => {
  test.skip(!await mockCustomerSession(context), 'Local browser environment needs the public Supabase client settings.');
  const ticketId = '2b96d06d-2a34-4a21-8e34-19d365ba0b91';
  const operationKey = `mw_support_reopen_operation:${customerUser.id}:${ticketId}`;
  const operationIds: string[] = [];
  let ticketStatus: 'closed' | 'in_progress' = 'closed';
  let reopenAttempts = 0;

  await context.route(`**/api/support/tickets/${ticketId}`, (route) => route.fulfill({ status: 200, json: { data: {
    id: ticketId,
    viewerIsOwner: true,
    subject: 'Reopen recovery test',
    body: 'Please check this resolved request.',
    category: 'general',
    status: ticketStatus,
    createdAt: '2026-04-01T00:00:00.000Z',
    resolvedAt: '2026-04-01T01:00:00.000Z',
    muted: false,
    replies: [],
    repliesCursor: null,
  }, error: null } }));
  await context.route(`**/api/support/tickets/${ticketId}/reopen`, async (route) => {
    const request = route.request();
    operationIds.push(String(request.postDataJSON()?.operationId ?? ''));
    reopenAttempts += 1;
    if (reopenAttempts === 1) {
      ticketStatus = 'in_progress';
      await route.fulfill({ status: 503, json: { data: null, error: { code: 'WRITE_UNAVAILABLE' } } });
      return;
    }
    if (reopenAttempts === 3) {
      await route.fulfill({ status: 200, json: { data: {
        id: 'another-ticket', status: 'in_progress', changed: true, replayed: false,
      }, error: null } });
      return;
    }
    ticketStatus = 'closed';
    await route.fulfill({ status: 200, json: { data: {
      id: ticketId, status: 'in_progress', changed: true, replayed: true,
    }, error: null } });
  });
  await context.route(`**/api/support/drafts?surface=ticket_reply**`, (route) => route.fulfill({ status: 200, json: {
    data: { body: '', version: 0 }, error: null,
  } }));

  await page.goto(`/customer/support/${ticketId}`);
  await page.getByRole('button', { name: 'Reopen' }).click();
  await expect(page.locator('[role="alert"]').filter({ hasText: 'The result is not confirmed yet.' })).toBeVisible();
  const savedOperationId = await page.evaluate((key) => localStorage.getItem(key), operationKey);
  expect(savedOperationId).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);

  ticketStatus = 'closed';
  await page.reload();
  await expect(page.getByRole('button', { name: 'Reopen' })).toBeVisible();
  await page.getByRole('button', { name: 'Reopen' }).click();
  await expect(page.getByText('This reopen request was already processed. The current ticket status is shown below.')).toBeVisible();
  await expect(page.getByText('Closed', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), operationKey)).toBeNull();

  await page.getByRole('button', { name: 'Reopen' }).click();
  await expect(page.locator('[role="alert"]').filter({ hasText: 'The result is not confirmed yet.' })).toBeVisible();
  expect(operationIds[0]).toBe(savedOperationId);
  expect(operationIds[1]).toBe(savedOperationId);
  expect(operationIds[2]).not.toBe(savedOperationId);
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), operationKey)).toBe(operationIds[2]);
});

test('mocked reply keeps one operation across refresh and retries saved-draft cleanup safely', async ({ page, context }) => {
  test.skip(!await mockCustomerSession(context), 'Local browser environment needs the public Supabase client settings.');
  const ticketId = '55f3209b-56aa-43c3-b6e5-f97d57400855';
  const operationKey = `mw_support_reply_operation:${customerUser.id}:${ticketId}`;
  const replyText = 'Please check the booking confirmation.';
  const operationIds: string[] = [];
  let savedDraft: { body: string; version: number } | null = null;
  let committedReply = false;
  let replyAttempts = 0;
  let draftDeleteAttempts = 0;

  await context.route(`**/api/support/tickets/${ticketId}`, (route) => route.fulfill({ status: 200, json: { data: {
    id: ticketId, viewerIsOwner: true, subject: 'Reply recovery test', body: 'Please confirm this booking.', category: 'general', status: 'open',
    createdAt: '2026-04-01T00:00:00.000Z', resolvedAt: null, muted: false,
    replies: committedReply ? [{
      id: '00000000-0000-4000-8000-000000000055', is_mine: true, sender_role: 'customer', body: replyText,
      created_at: '2026-04-01T00:01:00.000Z', attachment_type: null,
    }] : [],
    repliesCursor: null,
  }, error: null } }));
  await context.route(`**/api/support/tickets/${ticketId}/read`, (route) => route.fulfill({
    status: 200, json: { data: { changed: false }, error: null },
  }));
  await context.route('**/api/support/drafts**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, json: { data: savedDraft ?? { body: '', version: 0 }, error: null } });
      return;
    }
    if (route.request().method() === 'PUT') {
      const input = route.request().postDataJSON() as { body: string };
      savedDraft = { body: input.body, version: 1 };
      await route.fulfill({ status: 200, json: { data: { version: 1, changed: true }, error: null } });
      return;
    }
    if (route.request().method() === 'DELETE') {
      draftDeleteAttempts += 1;
      if (draftDeleteAttempts === 1) {
        await route.fulfill({ status: 503, json: { data: null, error: { code: 'WRITE_UNAVAILABLE' } } });
        return;
      }
      savedDraft = null;
      await route.fulfill({ status: 200, json: { data: { cleared: true }, error: null } });
      return;
    }
    await route.fulfill({ status: 405, json: { data: null, error: { code: 'METHOD_NOT_ALLOWED' } } });
  });
  await context.route(`**/api/support/tickets/${ticketId}/replies`, async (route) => {
    const payload = route.request().postDataJSON() as { body: string; operationId: string };
    operationIds.push(payload.operationId);
    replyAttempts += 1;
    if (replyAttempts === 1) {
      committedReply = true;
      await route.fulfill({ status: 503, json: { data: null, error: { code: 'WRITE_UNAVAILABLE' } } });
      return;
    }
    await route.fulfill({ status: 200, json: { data: {
      id: '00000000-0000-4000-8000-000000000055', senderId: customerUser.id, senderRole: 'customer',
      body: payload.body, createdAt: '2026-04-01T00:01:00.000Z', newStatus: 'open',
    }, error: null } });
  });

  await page.goto(`/customer/support/${ticketId}`);
  const reply = page.getByRole('textbox', { name: 'Reply' });
  await reply.fill(replyText);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect.poll(() => savedDraft?.body).toBe(replyText);
  await reply.press('Enter');
  await expect(page.locator('[role="alert"]').filter({ hasText: 'The result is not confirmed yet.' })).toBeVisible();
  const firstOperationId = await page.evaluate((key) => sessionStorage.getItem(key), operationKey);
  expect(firstOperationId).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Reply' })).toHaveValue(replyText);
  await page.getByRole('textbox', { name: 'Reply' }).press('Enter');
  await expect(page.locator('[role="status"]').filter({ hasText: 'Reply sent, but its saved draft could not be cleared.' })).toBeVisible();
  expect(await page.evaluate((key) => sessionStorage.getItem(key), operationKey)).toBe(firstOperationId);

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Reply' })).toHaveValue(replyText);
  await page.getByRole('textbox', { name: 'Reply' }).press('Enter');
  await expect(page.locator('[role="status"]').filter({ hasText: 'Reply sent.' })).toBeVisible();
  await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), operationKey)).toBeNull();
  expect(replyAttempts).toBe(3);
  expect(operationIds).toEqual([firstOperationId, firstOperationId, firstOperationId]);
  expect(committedReply).toBe(true);
  expect(draftDeleteAttempts).toBe(2);
});

test('mocked reply conflict requires review before using a new operation', async ({ page, context }) => {
  test.skip(!await mockCustomerSession(context), 'Local browser environment needs the public Supabase client settings.');
  const ticketId = 'a4f90852-c232-439a-bfc7-dd8b30e2e408';
  const operationKey = `mw_support_reply_operation:${customerUser.id}:${ticketId}`;
  const oldOperationId = '11111111-1111-4111-8111-111111111111';
  const revisedReply = 'A revised reply from another saved draft. Updated.';
  const operationIds: string[] = [];
  let replyAttempts = 0;

  await page.addInitScript(({ key, operationId }) => sessionStorage.setItem(key, operationId), { key: operationKey, operationId: oldOperationId });
  await context.route(`**/api/support/tickets/${ticketId}`, (route) => route.fulfill({ status: 200, json: { data: {
    id: ticketId, viewerIsOwner: true, subject: 'Reply conflict test', body: 'Original request', category: 'general', status: 'open',
    createdAt: '2026-04-01T00:00:00.000Z', resolvedAt: null, muted: false, replies: [], repliesCursor: null,
  }, error: null } }));
  await context.route(`**/api/support/tickets/${ticketId}/read`, (route) => route.fulfill({ status: 200, json: { data: { changed: false }, error: null } }));
  await context.route('**/api/support/drafts?surface=ticket_reply**', (route) => route.fulfill({
    status: 200, json: { data: { body: 'A revised reply from another saved draft.', version: 2 }, error: null },
  }));
  await context.route(`**/api/support/tickets/${ticketId}/replies`, async (route) => {
    const payload = route.request().postDataJSON() as { operationId: string };
    operationIds.push(payload.operationId);
    replyAttempts += 1;
    if (replyAttempts === 1) {
      await route.fulfill({ status: 409, json: { data: null, error: { code: 'OPERATION_CONFLICT' } } });
      return;
    }
    await route.fulfill({ status: 201, json: { data: {
      id: '00000000-0000-4000-8000-000000000056', senderId: customerUser.id, senderRole: 'customer',
      body: revisedReply, createdAt: '2026-04-01T00:01:00.000Z', newStatus: 'open',
    }, error: null } });
  });

  await page.goto(`/customer/support/${ticketId}`);
  const reply = page.getByRole('textbox', { name: 'Reply' });
  await expect(reply).toHaveValue('A revised reply from another saved draft.');
  await reply.fill(revisedReply);
  await reply.press('Enter');
  await expect(page.locator('[role="alert"]').filter({ hasText: 'An earlier reply used this request reference.' })).toBeVisible();
  expect(replyAttempts).toBe(1);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), operationKey)).toBeNull();

  await reply.press('Enter');
  await expect(page.locator('[role="status"]').filter({ hasText: 'Reply sent.' })).toBeVisible();
  expect(replyAttempts).toBe(2);
  expect(operationIds[0]).toBe(oldOperationId);
  expect(operationIds[1]).not.toBe(oldOperationId);
});

test('mocked reply does not send when the tab cannot persist its recovery reference', async ({ page, context }) => {
  test.skip(!await mockCustomerSession(context), 'Local browser environment needs the public Supabase client settings.');
  const ticketId = 'c6765938-a8c5-48b3-a2ca-12730bf774ed';
  const operationKey = `mw_support_reply_operation:${customerUser.id}:${ticketId}`;
  let replyAttempts = 0;

  await page.addInitScript((key) => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (candidateKey, value) {
      if (candidateKey === key) throw new DOMException('blocked', 'QuotaExceededError');
      originalSetItem.call(this, candidateKey, value);
    };
  }, operationKey);
  await context.route(`**/api/support/tickets/${ticketId}`, (route) => route.fulfill({ status: 200, json: { data: {
    id: ticketId, viewerIsOwner: true, subject: 'Reply storage test', body: 'Original request', category: 'general', status: 'open',
    createdAt: '2026-04-01T00:00:00.000Z', resolvedAt: null, muted: false, replies: [], repliesCursor: null,
  }, error: null } }));
  await context.route(`**/api/support/tickets/${ticketId}/read`, (route) => route.fulfill({ status: 200, json: { data: { changed: false }, error: null } }));
  await context.route('**/api/support/drafts?surface=ticket_reply**', (route) => route.fulfill({
    status: 200, json: { data: { body: '', version: 0 }, error: null },
  }));
  await context.route(`**/api/support/tickets/${ticketId}/replies`, async (route) => {
    replyAttempts += 1;
    await route.fulfill({ status: 201, json: { data: { id: '00000000-0000-4000-8000-000000000057' }, error: null } });
  });

  await page.goto(`/customer/support/${ticketId}`);
  const reply = page.getByRole('textbox', { name: 'Reply' });
  await reply.fill('Please verify this request.');
  await reply.press('Enter');
  await expect(page.locator('[role="alert"]').filter({ hasText: 'This tab cannot save the reply reference' })).toBeVisible();
  expect(replyAttempts).toBe(0);
});

test('mocked attachment reuses its operation after refresh and retries saved-draft cleanup safely', async ({ page, context }) => {
  test.skip(!await mockCustomerSession(context), 'Local browser environment needs the public Supabase client settings.');
  const ticketId = '7ca7d57d-864b-42bc-afdf-1d7d0ec8bb8a';
  const operationKey = `mw_support_attachment_operation:customer:${customerUser.id}:${ticketId}`;
  const operationIds: string[] = [];
  let attachmentAttempts = 0;
  let draftDeleteAttempts = 0;
  let savedDraft: { body: string; version: number } | null = null;
  await context.route(`**/api/support/tickets/${ticketId}`, (route) => route.fulfill({ status: 200, json: { data: {
    id: ticketId, viewerIsOwner: true, subject: 'Attachment recovery test', body: 'Original request', category: 'general', status: 'open',
    createdAt: '2026-04-01T00:00:00.000Z', resolvedAt: null, muted: false, replies: [], repliesCursor: null,
  }, error: null } }));
  await context.route(`**/api/support/tickets/${ticketId}/read`, (route) => route.fulfill({ status: 200, json: { data: { changed: false }, error: null } }));
  await context.route('**/api/support/drafts**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, json: { data: savedDraft ?? { body: '', version: 0 }, error: null } });
      return;
    }
    if (route.request().method() === 'PUT') {
      const input = route.request().postDataJSON() as { body: string };
      savedDraft = { body: input.body, version: 1 };
      await route.fulfill({ status: 200, json: { data: { version: 1, changed: true }, error: null } });
      return;
    }
    if (route.request().method() === 'DELETE') {
      draftDeleteAttempts += 1;
      if (draftDeleteAttempts === 1) {
        await route.fulfill({ status: 503, json: { data: null, error: { code: 'WRITE_UNAVAILABLE' } } });
        return;
      }
      savedDraft = null;
      await route.fulfill({ status: 200, json: { data: { cleared: true }, error: null } });
      return;
    }
    await route.fulfill({ status: 405, json: { data: null, error: { code: 'METHOD_NOT_ALLOWED' } } });
  });
  await context.route(`**/api/support/tickets/${ticketId}/attachments`, async (route) => {
    const operationId = route.request().postData()?.match(/name="operationId"\r\n\r\n([^\r]+)/)?.[1] ?? '';
    operationIds.push(operationId);
    attachmentAttempts += 1;
    if (attachmentAttempts === 1) {
      await route.fulfill({ status: 503, json: { data: null, error: { code: 'WRITE_UNAVAILABLE' } } });
      return;
    }
    await route.fulfill({ status: attachmentAttempts === 2 ? 201 : 200, json: { data: {
      id: '00000000-0000-4000-8000-000000000058',
    }, error: null } });
  });

  await page.goto(`/customer/support/${ticketId}`);
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({ name: 'evidence.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
  const caption = page.getByRole('textbox', { name: 'Reply' });
  await caption.fill('Please review the attached receipt.');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect.poll(() => savedDraft?.body).toBe('Please review the attached receipt.');
  await caption.press('Enter');
  await expect(page.locator('[role="alert"]').filter({ hasText: 'The upload result is not confirmed.' })).toBeVisible();
  const operationId = await page.evaluate((key) => sessionStorage.getItem(key), operationKey);
  expect(operationId).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Reply' })).toHaveValue('Please review the attached receipt.');
  await page.locator('input[type="file"]').setInputFiles({ name: 'evidence.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
  await page.getByRole('textbox', { name: 'Reply' }).press('Enter');
  await expect(page.locator('[role="status"]').filter({ hasText: 'Attachment sent, but its saved draft could not be cleared.' })).toBeVisible();
  expect(await page.evaluate((key) => sessionStorage.getItem(key), operationKey)).toBe(operationId);
  await expect(page.getByRole('textbox', { name: 'Reply' })).toHaveValue('Please review the attached receipt.');

  await page.getByRole('textbox', { name: 'Reply' }).press('Enter');
  await expect(page.locator('[role="status"]').filter({ hasText: 'Reply sent.' })).toBeVisible();
  await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), operationKey)).toBeNull();
  expect(attachmentAttempts).toBe(3);
  expect(operationIds).toEqual([operationId, operationId, operationId]);
  expect(draftDeleteAttempts).toBe(2);
});

test('mocked attachment keeps its operation reference when a successful response is malformed', async ({ page, context }) => {
  test.skip(!await mockCustomerSession(context), 'Local browser environment needs the public Supabase client settings.');
  const ticketId = '012802df-81e2-4de9-a731-cfb8973e6a10';
  const operationKey = `mw_support_attachment_operation:customer:${customerUser.id}:${ticketId}`;
  const operationIds: string[] = [];
  let attachmentAttempts = 0;

  await context.route(`**/api/support/tickets/${ticketId}`, (route) => route.fulfill({ status: 200, json: { data: {
    id: ticketId, viewerIsOwner: true, subject: 'Malformed attachment response test', body: 'Original request', category: 'general', status: 'open',
    createdAt: '2026-04-01T00:00:00.000Z', resolvedAt: null, muted: false, replies: [], repliesCursor: null,
  }, error: null } }));
  await context.route(`**/api/support/tickets/${ticketId}/read`, (route) => route.fulfill({ status: 200, json: { data: { changed: false }, error: null } }));
  await context.route('**/api/support/drafts**', (route) => route.fulfill({ status: 200, json: {
    data: { body: '', version: 0 }, error: null,
  } }));
  await context.route(`**/api/support/tickets/${ticketId}/attachments`, async (route) => {
    operationIds.push(route.request().postData()?.match(/name="operationId"\r\n\r\n([^\r]+)/)?.[1] ?? '');
    attachmentAttempts += 1;
    await route.fulfill({ status: 201, json: attachmentAttempts === 1
      ? { data: null, error: null }
      : { data: { id: '00000000-0000-4000-8000-000000000060' }, error: null } });
  });

  await page.goto(`/customer/support/${ticketId}`);
  await page.locator('input[type="file"]').setInputFiles({ name: 'receipt.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
  await page.getByRole('textbox', { name: 'Reply' }).press('Enter');
  await expect(page.locator('[role="alert"]').filter({ hasText: 'The upload result is not confirmed.' })).toBeVisible();
  const operationId = await page.evaluate((key) => sessionStorage.getItem(key), operationKey);
  expect(operationId).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);

  await page.getByRole('textbox', { name: 'Reply' }).press('Enter');
  await expect(page.locator('[role="status"]').filter({ hasText: 'Reply sent.' })).toBeVisible();
  await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), operationKey)).toBeNull();
  expect(attachmentAttempts).toBe(2);
  expect(operationIds).toEqual([operationId, operationId]);
});

test('mocked attachment conflict refreshes the ticket and waits for a second explicit send', async ({ page, context }) => {
  test.skip(!await mockCustomerSession(context), 'Local browser environment needs the public Supabase client settings.');
  const ticketId = '38ca1457-cbd3-4174-b4f8-65e1941ba611';
  const operationKey = `mw_support_attachment_operation:customer:${customerUser.id}:${ticketId}`;
  const operationIds: string[] = [];
  let attachmentAttempts = 0;
  let ticketReads = 0;

  await context.route(`**/api/support/tickets/${ticketId}`, (route) => {
    ticketReads += 1;
    return route.fulfill({ status: 200, json: { data: {
      id: ticketId, viewerIsOwner: true, subject: 'Attachment conflict test', body: 'Original request', category: 'general', status: 'open',
      createdAt: '2026-04-01T00:00:00.000Z', resolvedAt: null, muted: false, replies: [], repliesCursor: null,
    }, error: null } });
  });
  await context.route(`**/api/support/tickets/${ticketId}/read`, (route) => route.fulfill({ status: 200, json: { data: { changed: false }, error: null } }));
  await context.route('**/api/support/drafts**', (route) => route.fulfill({ status: 200, json: {
    data: { body: '', version: 0 }, error: null,
  } }));
  await context.route(`**/api/support/tickets/${ticketId}/attachments`, async (route) => {
    operationIds.push(route.request().postData()?.match(/name="operationId"\r\n\r\n([^\r]+)/)?.[1] ?? '');
    attachmentAttempts += 1;
    if (attachmentAttempts === 1) {
      await route.fulfill({ status: 503, json: { data: null, error: { code: 'WRITE_UNAVAILABLE' } } });
      return;
    }
    if (attachmentAttempts === 2) {
      await route.fulfill({ status: 409, json: { data: null, error: { code: 'OPERATION_CONFLICT' } } });
      return;
    }
    await route.fulfill({ status: 201, json: { data: { id: '00000000-0000-4000-8000-000000000061' }, error: null } });
  });

  await page.goto(`/customer/support/${ticketId}`);
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({ name: 'first.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 first') });
  await page.getByRole('textbox', { name: 'Reply' }).press('Enter');
  await expect(page.locator('[role="alert"]').filter({ hasText: 'The upload result is not confirmed.' })).toBeVisible();
  const firstOperationId = await page.evaluate((key) => sessionStorage.getItem(key), operationKey);
  expect(firstOperationId).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);

  await fileInput.setInputFiles({ name: 'replacement.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 replacement') });
  await page.getByRole('textbox', { name: 'Reply' }).press('Enter');
  await expect(page.locator('[role="alert"]').filter({ hasText: 'An earlier upload used this request reference.' })).toBeVisible();
  const replacementOperationId = await page.evaluate((key) => sessionStorage.getItem(key), operationKey);
  expect(replacementOperationId).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
  expect(replacementOperationId).not.toBe(firstOperationId);
  expect(attachmentAttempts).toBe(2);

  await page.getByRole('textbox', { name: 'Reply' }).press('Enter');
  await expect(page.locator('[role="status"]').filter({ hasText: 'Reply sent.' })).toBeVisible();
  expect(attachmentAttempts).toBe(3);
  expect(operationIds).toEqual([firstOperationId, firstOperationId, replacementOperationId]);
  expect(ticketReads).toBeGreaterThanOrEqual(3);
});

test('mocked attachment blocks sending its caption as a separate reply while the result is unknown', async ({ page, context }) => {
  test.skip(!await mockCustomerSession(context), 'Local browser environment needs the public Supabase client settings.');
  const ticketId = '8a1d4531-41d6-47c1-8f4e-954dd434cf59';
  const attachmentKey = `mw_support_attachment_operation:customer:${customerUser.id}:${ticketId}`;
  let replyAttempts = 0;

  await page.addInitScript((key) => sessionStorage.setItem(key, '33333333-3333-4333-8333-333333333333'), attachmentKey);
  await context.route(`**/api/support/tickets/${ticketId}`, (route) => route.fulfill({ status: 200, json: { data: {
    id: ticketId, viewerIsOwner: true, subject: 'Pending attachment test', body: 'Original request', category: 'general', status: 'open',
    createdAt: '2026-04-01T00:00:00.000Z', resolvedAt: null, muted: false, replies: [], repliesCursor: null,
  }, error: null } }));
  await context.route(`**/api/support/tickets/${ticketId}/read`, (route) => route.fulfill({ status: 200, json: { data: { changed: false }, error: null } }));
  await context.route('**/api/support/drafts**', (route) => route.fulfill({ status: 200, json: {
    data: { body: 'This was the attachment caption.', version: 1 }, error: null,
  } }));
  await context.route(`**/api/support/tickets/${ticketId}/replies`, async (route) => {
    replyAttempts += 1;
    await route.fulfill({ status: 201, json: { data: { id: '00000000-0000-4000-8000-000000000062' }, error: null } });
  });

  await page.goto(`/customer/support/${ticketId}`);
  const reply = page.getByRole('textbox', { name: 'Reply' });
  await expect(reply).toHaveValue('This was the attachment caption.');
  await reply.press('Enter');
  await expect(page.locator('[role="alert"]').filter({ hasText: 'The upload result is not confirmed.' })).toBeVisible();
  expect(replyAttempts).toBe(0);
});

test('mocked attachment is not sent when browser session storage blocks its recovery reference', async ({ page, context }) => {
  test.skip(!await mockCustomerSession(context), 'Local browser environment needs the public Supabase client settings.');
  const ticketId = '3f354914-32c7-4c4c-852a-17b3e8fecc1b';
  let attachmentAttempts = 0;

  await page.addInitScript(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('mw_support_attachment_operation:')) throw new DOMException('blocked', 'QuotaExceededError');
      return originalSetItem.call(this, key, value);
    };
  });
  await context.route(`**/api/support/tickets/${ticketId}`, (route) => route.fulfill({ status: 200, json: { data: {
    id: ticketId, viewerIsOwner: true, subject: 'Attachment storage test', body: 'Original request', category: 'general', status: 'open',
    createdAt: '2026-04-01T00:00:00.000Z', resolvedAt: null, muted: false, replies: [], repliesCursor: null,
  }, error: null } }));
  await context.route(`**/api/support/tickets/${ticketId}/read`, (route) => route.fulfill({ status: 200, json: { data: { changed: false }, error: null } }));
  await context.route('**/api/support/drafts**', (route) => route.fulfill({ status: 200, json: {
    data: { body: '', version: 0 }, error: null,
  } }));
  await context.route(`**/api/support/tickets/${ticketId}/attachments`, async (route) => {
    attachmentAttempts += 1;
    await route.fulfill({ status: 201, json: { data: { id: '00000000-0000-4000-8000-000000000063' }, error: null } });
  });

  await page.goto(`/customer/support/${ticketId}`);
  await page.locator('input[type="file"]').setInputFiles({ name: 'blocked.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 blocked') });
  await page.getByRole('textbox', { name: 'Reply' }).press('Enter');
  await expect(page.locator('[role="alert"]').filter({ hasText: 'This tab cannot save the upload reference' })).toBeVisible();
  expect(attachmentAttempts).toBe(0);
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

test('mocked duplicate report is shown as already reported without offering another submission', async ({ page, context }) => {
  test.skip(!await mockCustomerSession(context), 'Local browser environment needs the public Supabase client settings.');
  const ticketId = '6f1d1227-f1b4-4e73-a796-e06527d27c2a';
  let reportAttempts = 0;

  await context.route(`**/api/support/tickets/${ticketId}`, (route) => route.fulfill({ status: 200, json: { data: {
    id: ticketId, viewerIsOwner: true, subject: 'Duplicate report test', body: 'Original request', category: 'general', status: 'open',
    createdAt: '2026-04-01T00:00:00.000Z', resolvedAt: null, muted: false, replies: [], repliesCursor: null,
  }, error: null } }));
  await context.route(`**/api/support/tickets/${ticketId}/read`, (route) => route.fulfill({ status: 200, json: { data: { changed: false }, error: null } }));
  await context.route(`**/api/support/drafts?surface=ticket_reply**`, (route) => route.fulfill({ status: 200, json: {
    data: { body: '', version: 0 }, error: null,
  } }));
  await context.route('**/api/conduct/report', async (route) => {
    reportAttempts += 1;
    await route.fulfill({ status: 409, json: { error: { code: 'ALREADY_REPORTED' } } });
  });

  await page.goto(`/customer/support/${ticketId}`);
  await page.getByRole('button', { name: 'Report this conversation' }).click();
  await page.getByRole('textbox', { name: 'Reason (optional)' }).fill('This was already reported.');
  await page.getByRole('button', { name: 'Submit report' }).click();

  await expect(page.getByText('You have already reported this conversation.')).toBeVisible();
  await expect(page.getByText('Reported', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Report this conversation' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Submit report' })).toHaveCount(0);
  expect(reportAttempts).toBe(1);
});

test('mocked expired report session keeps the reason and links back to this ticket after sign-in', async ({ page, context }) => {
  test.skip(!await mockCustomerSession(context), 'Local browser environment needs the public Supabase client settings.');
  const ticketId = 'e2ca2bc8-f421-48e5-9174-6678234600fd';
  let reportAttempts = 0;

  await context.route(`**/api/support/tickets/${ticketId}`, (route) => route.fulfill({ status: 200, json: { data: {
    id: ticketId, viewerIsOwner: true, subject: 'Expired report session test', body: 'Original request', category: 'general', status: 'open',
    createdAt: '2026-04-01T00:00:00.000Z', resolvedAt: null, muted: false, replies: [], repliesCursor: null,
  }, error: null } }));
  await context.route(`**/api/support/tickets/${ticketId}/read`, (route) => route.fulfill({ status: 200, json: { data: { changed: false }, error: null } }));
  await context.route(`**/api/support/drafts?surface=ticket_reply**`, (route) => route.fulfill({ status: 200, json: {
    data: { body: '', version: 0 }, error: null,
  } }));
  await context.route('**/api/conduct/report', async (route) => {
    reportAttempts += 1;
    await route.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED' } } });
  });

  await page.goto(`/customer/support/${ticketId}`);
  await page.getByRole('button', { name: 'Report this conversation' }).click();
  const reason = page.getByRole('textbox', { name: 'Reason (optional)' });
  await reason.fill('Please review this conversation.');
  await page.getByRole('button', { name: 'Submit report' }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'Your session expired. Sign in to return to this support request.' })).toBeVisible();
  await expect(reason).toHaveValue('Please review this conversation.');
  await expect(page.getByRole('button', { name: 'Copy reason' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', `/login?next=%2Fcustomer%2Fsupport%2F${ticketId}`);
  expect(reportAttempts).toBe(1);
});
