import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findElements, findOne, installTestDom, TestEvent, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  currentUser: { id: "creator-1" } as { id: string } | null,
  confirm: vi.fn(async () => true),
}));

vi.mock("react-i18next", () => {
  const t = (key: string, values?: Record<string, unknown>) => key === "pagination.range"
    ? `${key}:${values?.from}-${values?.to}/${values?.total}`
    : key;
  return {
    useTranslation: () => ({ t, i18n: { resolvedLanguage: "en" } }),
  };
});
vi.mock("@/components/providers/app-dialog", () => ({ useAppDialog: () => ({ confirm: mocks.confirm, prompt: vi.fn() }) }));
vi.mock("@/components/map/map-view", () => ({ MapView: () => <div /> }));
vi.mock("@/components/providers/action-feedback", () => ({ useActionFeedback: () => ({ showFeedback: vi.fn() }) }));
vi.mock("@/components/providers/auth", () => ({ useAuth: () => ({ currentUser: mocks.currentUser }) }));

import PromotionCampaignsPage from "@/app/admin/promotion-campaigns/page";

let createRoot: typeof import("react-dom/client").createRoot;
let document: TestDocument;
let container: TestElement;
let root: ReturnType<typeof import("react-dom/client").createRoot>;

function response(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function campaignPayload(status: "draft" | "rejected" | "pending_approval" | "approved" | "paused" | "archived" = "draft") {
  return response({ data: {
    campaigns: [{
      id: "campaign-1", slug: "heritage-walk-kl-current-offers", title: "Heritage Walk KL — Local Explorer Picks",
      summary: "Offers from Heritage Walk KL", description: "Existing outlet products and voucher.",
      poster_url: "https://x/poster.jpg", operating_hours: "10:00 AM - 6:00 PM", status,
      starts_at: "2026-09-25T10:50:00.000Z", ends_at: "2027-03-12T23:00:00.000Z",
      created_by: "creator-1", updated_at: "2026-09-25T11:28:22.000Z", rejection_note: null,
      locations: [{ id: 'location-1', name: 'Main Hall', address: null, lat: null, lng: null, starts_on: '2026-09-25', ends_on: '2027-03-13', opens_at: '10:00', closes_at: '18:00', status: 'active' }],
    }],
  }, error: null });
}

async function click(element: TestElement) {
  await act(async () => {
    element.dispatchEvent(new TestEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function setInputValue(input: TestElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new TestEvent(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}

async function renderLoadedPage() {
  await act(async () => {
    root.render(<PromotionCampaignsPage />);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function campaignMobileRows() {
  return findElements(container, element =>
    element.tagName === 'ARTICLE' && (element.getAttribute('class') ?? '').includes('xl:hidden'),
  );
}

describe("Admin promotion campaign workbench", () => {
  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import("react-dom/client"));
  });

  beforeEach(() => {
    mocks.confirm.mockResolvedValue(true);
    mocks.currentUser = { id: "creator-1" };
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.fetch.mockReset().mockResolvedValue(campaignPayload());
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
  });

  it('recovers the workbench after permissions are restored and Refresh succeeds', async () => {
    mocks.fetch.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}) }).mockResolvedValue(campaignPayload());
    await renderLoadedPage();
    expect(container.textContent).toContain('promotionCampaigns.errors.forbidden');
    await click(findOne(container, element => element.tagName === 'BUTTON' && element.textContent.includes('promotionCampaigns.refresh')));
    expect(container.textContent).not.toContain('promotionCampaigns.errors.forbidden');
    expect(findElements(container, element => element.tagName === 'FORM')).toHaveLength(1);
  });

  it.each(['date', 'time'])('confirms before discarding a new form with only %s changes', async (type) => {
    await renderLoadedPage();
    const form = findOne(container, element => element.tagName === 'FORM');
    await setInputValue(findElements(form, element => element.tagName === 'INPUT' && element.type === type)[0], type === 'date' ? '2027-01-01' : '11:00');
    mocks.confirm.mockResolvedValue(false);
    await click(findOne(container, element => element.tagName === 'BUTTON' && element.textContent.includes('promotionCampaigns.actions.edit')));
    expect(mocks.confirm).toHaveBeenCalledWith('promotionCampaigns.form.discardConfirm');
    expect(findElements(form, element => element.tagName === 'INPUT' && element.value === 'Heritage Walk KL — Local Explorer Picks')).toHaveLength(0);
  });

  it('locks campaign switching and cancellation while a poster is uploading', async () => {
    await renderLoadedPage();
    const edit = () => findOne(container, element => element.tagName === 'BUTTON' && element.textContent.includes('promotionCampaigns.actions.edit'));
    await click(edit());
    await click(findOne(container, element => element.tagName === 'BUTTON' && element.textContent.includes('promotionCampaigns.form.removePoster')));
    let release!: (value: Response) => void;
    mocks.fetch.mockImplementation(async (_url, init) => init?.method === 'POST' ? new Promise<Response>(resolve => { release = resolve; }) : campaignPayload());
    const input = findOne(container, element => element.tagName === 'INPUT' && element.type === 'file');
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['test'], 'poster.png', { type: 'image/png' })] });
    await act(async () => { input.dispatchEvent(new TestEvent('change', { bubbles: true })); });
    expect(edit().disabled).toBe(true);
    expect(findOne(container, element => element.tagName === 'BUTTON' && element.textContent.includes('promotionCampaigns.form.cancelEdit')).disabled).toBe(true);
    await act(async () => { release(response({ data: { url: 'https://x/uploaded.jpg' } })); await Promise.resolve(); });
    expect(edit().disabled).toBe(false);
    expect(container.textContent).toContain('promotionCampaigns.form.removePoster');
  });

  it('publishes an existing draft with exactly one submit followed by approval', async () => {
    mocks.fetch.mockImplementation(async (_url, init) => {
      if (init?.method === 'PATCH') {
        const action = JSON.parse(String(init.body)).action;
        return response({ data: { id: 'campaign-1', status: action === 'submit' ? 'pending_approval' : 'approved', updated_at: action === 'submit' ? '2026-10-12T01:00:00Z' : '2026-10-12T01:01:00Z' } });
      }
      return campaignPayload();
    });
    await renderLoadedPage();
    await click(findOne(container, element => element.tagName === 'BUTTON' && element.textContent === 'promotionCampaigns.actions.submit'));
    expect(mocks.fetch.mock.calls.filter(([, init]) => init?.method === 'PATCH').map(([, init]) => JSON.parse(String(init.body)).action)).toEqual(['submit', 'approve']);
  });

  it('disables publishing before required information is ready and while a location is being edited', async () => {
    await renderLoadedPage();
    const publish = () => findOne(container, element => element.tagName === 'BUTTON' && element.textContent.includes('promotionCampaigns.form.saveDraft'));
    expect(publish().disabled).toBe(true);
    await click(findOne(container, element => element.tagName === 'BUTTON' && element.textContent.includes('promotionCampaigns.actions.edit')));
    expect(publish().disabled).toBe(false);
    await click(findOne(container, element => element.tagName === 'BUTTON' && element.textContent.includes('promotionCampaigns.locations.add')));
    expect(publish().disabled).toBe(true);
    expect(findOne(container, element => element.tagName === 'BUTTON' && element.textContent === 'promotionCampaigns.locations.save').disabled).toBe(true);
  });

  it('saves basic information as a draft without triggering publication', async () => {
    await renderLoadedPage();
    await click(findOne(container, element => element.tagName === 'BUTTON' && element.textContent.includes('promotionCampaigns.actions.edit')));
    await click(findOne(container, element => element.tagName === 'BUTTON' && element.textContent.includes('promotionCampaigns.form.removePoster')));
    await act(async () => { findOne(container, element => element.tagName === 'FORM').dispatchEvent(new TestEvent('submit', { bubbles: true })); });
    const actions = mocks.fetch.mock.calls.filter(([, init]) => init?.method === 'PATCH').map(([, init]) => JSON.parse(String(init.body)));
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ action: 'save_draft', campaign: { posterUrl: null } });
  });

  it('skips the draft API write when an existing campaign is unchanged', async () => {
    await renderLoadedPage();
    await click(findOne(container, element => element.tagName === 'BUTTON' && element.textContent.includes('promotionCampaigns.actions.edit')));
    await act(async () => {
      findOne(container, element => element.tagName === 'FORM').dispatchEvent(new TestEvent('submit', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.fetch.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
  });

  it('saves an unchanged rejected campaign to clear its rejection state', async () => {
    mocks.fetch.mockResolvedValue(campaignPayload('rejected'));
    await renderLoadedPage();
    await click(findOne(container, element => element.tagName === 'BUTTON' && element.textContent.includes('promotionCampaigns.actions.edit')));
    await act(async () => {
      findOne(container, element => element.tagName === 'FORM').dispatchEvent(new TestEvent('submit', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    const patch = mocks.fetch.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patch).toBeDefined();
    expect(JSON.parse(String(patch?.[1]?.body))).toMatchObject({ action: 'save_draft' });
  });

  it('retains the pending state after approval fails, allowing a single approve retry', async () => {
    const row = (await campaignPayload().json()).data.campaigns[0];
    let status = 'draft', fail = true;
    mocks.fetch.mockImplementation(async (_url, init) => {
      if (init?.method === 'PATCH') {
        const action = JSON.parse(String(init.body)).action;
        if (action === 'approve' && fail) { fail = false; return { ok: false, json: async () => ({ error: { message: 'approval unavailable' } }) }; }
        status = action === 'submit' ? 'pending_approval' : 'approved';
        return response({ data: { ...row, status } });
      }
      return response({ data: { campaigns: [{ ...row, status }] } });
    });
    await renderLoadedPage();
    await click(findOne(container, element => element.tagName === 'BUTTON' && element.textContent === 'promotionCampaigns.actions.submit'));
    expect(container.textContent).toContain('approval unavailable');
    await click(findOne(container, element => element.tagName === 'BUTTON' && element.textContent === 'promotionCampaigns.actions.approve'));
    expect(mocks.fetch.mock.calls.filter(([, init]) => init?.method === 'PATCH').map(([, init]) => JSON.parse(String(init.body)).action)).toEqual(['submit', 'approve', 'approve']);
  });

  it('paginates 31 loaded events and applies search before page counts', async () => {
    const row = (await campaignPayload().json()).data.campaigns[0];
    mocks.fetch.mockResolvedValue(response({ data: { campaigns: Array.from({ length: 31 }, (_, index) => ({ ...row, id: `campaign-${index}`, title: `Event ${index}` })) } }));
    await renderLoadedPage();
    expect(campaignMobileRows()).toHaveLength(15);
    await click(findOne(container, element => element.tagName === 'BUTTON' && element.getAttribute('aria-label') === 'accessibility.nextPage'));
    expect(campaignMobileRows()).toHaveLength(15);
    await setInputValue(findOne(container, element => element.tagName === 'INPUT' && element.type === 'search'), ' Event 30 ');
    const rows = campaignMobileRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Event 30');
  });

  it('keeps page sizes, filtered totals, and page resets consistent across list controls', async () => {
    const row = (await campaignPayload().json()).data.campaigns[0];
    mocks.fetch.mockResolvedValue(response({ data: { campaigns: Array.from({ length: 61 }, (_, index) => ({
      ...row, id: `campaign-${index}`, title: `Event ${index}`, slug: `event-${index}`,
      status: index < 31 ? 'approved' : 'draft',
    })) } }));
    await renderLoadedPage();
    const rows = campaignMobileRows;
    const next = () => findOne(container, element => element.tagName === 'BUTTON' && element.getAttribute('aria-label') === 'accessibility.nextPage');
    const perPage = findOne(container, element => element.tagName === 'SELECT' && element.getAttribute('aria-label') === 'ui.pagination.perPage');
    expect(findElements(perPage, element => element.tagName === 'OPTION').map(element => element.value)).toEqual(['15', '25', '50']);
    expect(container.textContent).toContain('pagination.range:1-15/61');
    await click(next());
    expect(container.textContent).toContain('pagination.range:16-30/61');

    await setInputValue(perPage, '25');
    expect(rows()).toHaveLength(25);
    expect(rows()[0].textContent).toContain('Event 0');
    expect(container.textContent).toContain('pagination.range:1-25/61');
    await click(next());
    const status = findOne(container, element => element.tagName === 'SELECT' && Boolean(element.parentNode?.textContent.includes('promotionCampaigns.list.statusFilter')));
    await setInputValue(status, 'draft');
    expect(rows()[0].textContent).toContain('Event 31');
    expect(container.textContent).toContain('pagination.range:1-25/30');
    await click(next());
    expect(rows()).toHaveLength(5);
    expect(container.textContent).toContain('pagination.range:26-30/30');

    const from = findOne(container, element => element.tagName === 'INPUT' && Boolean(element.parentNode?.textContent.includes('promotionCampaigns.list.dateFrom')));
    await setInputValue(from, '2027-03-14');
    expect(rows()).toHaveLength(0);
    expect(container.textContent).not.toContain('pagination.range');
    await setInputValue(from, '');
    expect(container.textContent).toContain('pagination.range:1-25/30');
    await setInputValue(perPage, '50');
    expect(rows()).toHaveLength(30);
    expect(container.textContent).toContain('pagination.range:1-30/30');
    await setInputValue(status, 'all');
    expect(rows()).toHaveLength(50);
    await click(next());
    await setInputValue(findOne(container, element => element.tagName === 'INPUT' && element.type === 'search'), 'Event 60');
    expect(rows()).toHaveLength(1);
    expect(container.textContent).toContain('pagination.range:1-1/1');
    await click(findOne(container, element => element.tagName === 'BUTTON' && element.textContent === 'filters.clear'));
    expect(rows()).toHaveLength(50);
    expect(container.textContent).toContain('pagination.range:1-50/61');
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
    vi.unstubAllGlobals();
  });

  it("renders a localized loading state while staff campaigns load", () => {
    const markup = renderToStaticMarkup(<PromotionCampaignsPage />);

    expect(markup).toContain("promotionCampaigns.title");
    expect(markup).toContain('role="status"');
    expect(markup).toContain("promotionCampaigns.states.loading");
    expect(markup).not.toContain("promotionCampaigns.form.saveDraft");
  });

  it("offers review actions to the campaign creator now that self-approval is allowed", async () => {
    mocks.fetch.mockResolvedValue(campaignPayload("pending_approval"));

    await act(async () => {
      root.render(<PromotionCampaignsPage />);
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain("promotionCampaigns.status.pending_approval");
    expect(container.textContent).toContain("promotionCampaigns.actions.approve");
    expect(container.textContent).toContain("promotionCampaigns.actions.reject");
  });

  it("keeps review actions available to an independent campaign reviewer", async () => {
    mocks.currentUser = { id: "reviewer-2" };
    mocks.fetch.mockResolvedValue(campaignPayload("pending_approval"));

    await act(async () => {
      root.render(<PromotionCampaignsPage />);
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain("promotionCampaigns.actions.approve");
    expect(container.textContent).toContain("promotionCampaigns.actions.reject");
  });

  it("populates the edit form with the event's poster, hours, and copy — not an offers picker", async () => {
    await act(async () => {
      root.render(<PromotionCampaignsPage />);
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.textContent).toContain("Heritage Walk KL — Local Explorer Picks");

    const editDraft = findOne(container, (element) => element.tagName === "BUTTON" && element.textContent.includes("promotionCampaigns.actions.edit"));
    await click(editDraft);

    const titleInput = findOne(container, (element) => element.tagName === "INPUT" && element.value === "Heritage Walk KL — Local Explorer Picks");
    expect(titleInput).toBeDefined();
    const hoursFromInput = findOne(container, (element) => element.tagName === "INPUT" && element.type === "time" && element.value === "10:00");
    expect(hoursFromInput).toBeDefined();
    const hoursToInput = findOne(container, (element) => element.tagName === "INPUT" && element.type === "time" && element.value === "18:00");
    expect(hoursToInput).toBeDefined();
    expect(container.textContent).toContain("promotionCampaigns.form.removePoster");
    expect(container.textContent).not.toContain("promotionCampaigns.form.offerType");
    expect(container.textContent).not.toContain("promotionCampaigns.form.chooseSource");
  });

  it.each(["approved", "paused"] as const)("lets a %s event be corrected in place with the address locked and the poster replace-only", async (status) => {
    mocks.fetch.mockResolvedValue(campaignPayload(status));
    await renderLoadedPage();
    await click(findOne(container, (element) => element.tagName === "BUTTON" && element.textContent.includes("promotionCampaigns.actions.edit")));

    expect(container.textContent).toContain("promotionCampaigns.form.liveEditing");
    expect(findOne(container, (element) => element.tagName === "INPUT" && element.value === "heritage-walk-kl-current-offers").disabled).toBe(true);
    expect(findOne(container, (element) => element.tagName === "INPUT" && element.value === "Heritage Walk KL — Local Explorer Picks").disabled).toBe(false);
    expect(container.textContent).toContain("promotionCampaigns.form.replacePoster");
    expect(container.textContent).not.toContain("promotionCampaigns.form.removePoster");
    expect(findElements(container, (element) => element.tagName === "BUTTON" && element.textContent.includes("promotionCampaigns.form.saveDraft"))).toHaveLength(0);
    expect(container.textContent).not.toContain("promotionCampaigns.form.checklistTitle");
  });

  it("asks before saving a live event and skips the no-op update", async () => {
    mocks.fetch.mockResolvedValue(campaignPayload("approved"));
    await renderLoadedPage();
    await click(findOne(container, (element) => element.tagName === "BUTTON" && element.textContent.includes("promotionCampaigns.actions.edit")));
    const submit = async () => act(async () => {
      findOne(container, (element) => element.tagName === "FORM").dispatchEvent(new TestEvent("submit", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    const patches = () => mocks.fetch.mock.calls.filter(([url, init]) => url === "/api/admin/promotion-campaigns/campaign-1" && (init as RequestInit | undefined)?.method === "PATCH");

    mocks.confirm.mockResolvedValueOnce(false);
    await submit();
    expect(mocks.confirm).toHaveBeenCalledWith("promotionCampaigns.form.liveSaveConfirm");
    expect(patches()).toHaveLength(0);

    await submit();
    expect(patches()).toHaveLength(0);
  });

  it.each(["pending_approval", "archived"] as const)("keeps a %s event locked with no Edit action", async (status) => {
    mocks.fetch.mockResolvedValue(campaignPayload(status));
    await renderLoadedPage();
    expect(findElements(container, (element) => element.tagName === "BUTTON" && element.textContent.includes("promotionCampaigns.actions.edit"))).toHaveLength(0);
  });

  it("uses inclusive event dates and rejects equal daily opening and closing times", async () => {
    await renderLoadedPage();
    const dates = findElements(findOne(container, element => element.tagName === "FORM"), (element) => element.tagName === "INPUT" && element.type === "date");
    expect(dates).toHaveLength(2);
    expect(findElements(container, (element) => element.tagName === "INPUT" && element.type === "datetime-local")).toHaveLength(0);

    await setInputValue(dates[0], "2026-10-01");
    await setInputValue(dates[1], "2026-10-01");
    expect(container.textContent).not.toContain("promotionCampaigns.form.invalidRange");

    const hours = findElements(container, (element) => element.tagName === "INPUT" && element.type === "time");
    await setInputValue(hours[0], "01:22");
    await setInputValue(hours[1], "01:22");
    expect(container.textContent).toContain("promotionCampaigns.form.invalidOperatingHours");
    expect(findOne(container, (element) => element.tagName === "BUTTON" && element.textContent.includes("promotionCampaigns.form.saveDraft")).disabled).toBe(true);

    await setInputValue(hours[1], "01:23");
    expect(container.textContent).not.toContain("promotionCampaigns.form.invalidOperatingHours");
  });

  it("skips a no-op save while preserving legacy timestamps", async () => {
    await renderLoadedPage();
    await click(findOne(container, (element) => element.tagName === "BUTTON" && element.textContent.includes("promotionCampaigns.actions.edit")));
    const dates = findElements(findOne(container, element => element.tagName === "FORM"), (element) => element.tagName === "INPUT" && element.type === "date");
    expect(dates.map((date) => date.value)).toEqual(["2026-09-25", "2027-03-13"]);

    await act(async () => {
      findOne(container, (element) => element.tagName === "FORM").dispatchEvent(new TestEvent("submit", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    const patch = mocks.fetch.mock.calls.find(([url, init]) => url === "/api/admin/promotion-campaigns/campaign-1" && (init as RequestInit | undefined)?.method === "PATCH");
    expect(patch).toBeUndefined();
  });

  it("normalizes both boundaries when an admin changes a legacy event date", async () => {
    await renderLoadedPage();
    await click(findOne(container, (element) => element.tagName === "BUTTON" && element.textContent.includes("promotionCampaigns.actions.edit")));
    const dates = findElements(findOne(container, element => element.tagName === "FORM"), (element) => element.tagName === "INPUT" && element.type === "date");
    await setInputValue(dates[0], "2026-10-01");
    await setInputValue(dates[1], "2026-10-08");

    await act(async () => {
      findOne(container, (element) => element.tagName === "FORM").dispatchEvent(new TestEvent("submit", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    const patch = mocks.fetch.mock.calls.find(([url, init]) => url === "/api/admin/promotion-campaigns/campaign-1" && (init as RequestInit | undefined)?.method === "PATCH");
    expect(patch).toBeDefined();
    expect(JSON.parse(String((patch![1] as RequestInit).body)).campaign).toMatchObject({
      startsAt: "2026-09-30T16:00:00.000Z",
      endsAt: "2026-10-08T15:59:59.999Z",
    });
  });
});
