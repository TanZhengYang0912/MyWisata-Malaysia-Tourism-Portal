import React, { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { findElements, findOne, installTestDom, TestEvent, type TestDocument, type TestElement, type TestNode } from '@/components/shared/__tests__/render-test-dom';
import { computeProfileVerification } from '@/lib/verification/eligibility';

const mocks = vi.hoisted(() => ({
  user: { id: 'user-a', name: 'Aisha', email: 'a@example.test', city: 'Kuala Lumpur', country: 'Malaysia' },
  feedback: vi.fn(), refresh: vi.fn(), push: vi.fn(),
}));
vi.mock('@/components/providers/auth', () => ({ useAuth: () => ({ currentUser: mocks.user, refreshUser: mocks.refresh }) }));
vi.mock('@/components/providers/action-feedback', () => ({ useActionFeedback: () => ({ showFeedback: mocks.feedback }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }), useSearchParams: () => new URLSearchParams() }));
vi.mock('next/link', () => ({ default: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/profile/business-share-banner', () => ({ BusinessShareBanner: () => null }));
vi.mock('@/components/profile/verification-path-cards', () => ({ VerificationPathCards: () => null }));
vi.mock('@/components/profile/profile-sections', () => ({ ProfileSections: () => <div>Completed profile</div> }));
vi.mock('@/components/customer/guest-account-empty-state', () => ({ GuestAccountEmptyState: () => <div>Guest</div> }));
vi.mock('@/components/profile/profile-location-fields', () => ({ ProfileLocationFields: () => <div>Location</div> }));
vi.mock('@/components/profile/profile-photo-picker', () => ({
  ProfilePhotoPicker: ({ previewUrl, onPhotoSelected }: { previewUrl: string; onPhotoSelected: (file: File) => void }) => <div>
    <output data-testid="photo-preview" data-src={previewUrl} />
    <button onClick={() => onPhotoSelected(new File(['photo'], 'photo.png', { type: 'image/png' }))}>Choose test photo</button>
  </div>,
}));

import ProfilePage from '../page';

let createRoot: typeof import('react-dom/client').createRoot;
let document: TestDocument;
let root: ReturnType<typeof createRoot>;
let container: TestElement;
let fetchMock: ReturnType<typeof vi.fn>;
let saved: ReturnType<typeof initialProfile>;
let surveySaved: boolean;
let savedNotes: string;
let rejectBio: boolean;

function initialProfile(id = 'user-a') {
  return { id, fullName: id === 'user-a' ? 'Aisha' : 'New account', city: 'Kuala Lumpur', country: 'Malaysia',
    cityId: null, countryCode: 'MY', bio: 'I enjoy travel.', avatarUrl: `https://avatars.example/${id}.png` };
}
function summary() {
  return { ...saved, phoneVerified: true, kycStatus: 'approved',
    verification: computeProfileVerification({ ...saved, surveyComplete: surveySaved }) };
}
function response(data: unknown, status = 200) { return new Response(JSON.stringify({ data }), { status }); }
async function settle() { for (let index = 0; index < 8; index += 1) await Promise.resolve(); }
function visible(node: TestElement) {
  for (let parent: TestNode | null = node; parent; parent = parent.parentNode) {
    if ('hasAttribute' in parent && (parent as TestElement).hasAttribute('hidden')) return false;
  }
  return true;
}
function button(label: string) { return findOne(container, (node) => visible(node) && node.tagName === 'BUTTON' && node.textContent === label); }
function input(placeholder: string) { return findOne(container, (node) => visible(node) && node.getAttribute('placeholder') === placeholder); }
async function click(node: TestElement) {
  await act(async () => { node.dispatchEvent(new TestEvent('click', { bubbles: true })); await settle(); });
}
async function fill(node: TestElement, value: string) {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value')?.set?.call(node, value);
  await act(async () => { node.dispatchEvent(new TestEvent('input', { bubbles: true })); await settle(); });
}
async function renderPage() { await act(async () => { root.render(<ProfilePage />); await settle(); }); }
async function step(id: string) { await click(button(`ui.profileWizard.steps.${id}`)); }
// The shared lightweight DOM does not implement textarea defaultValue/value coupling.
function valueOf(node: TestElement) { return node.value || (node as unknown as HTMLTextAreaElement).defaultValue || ''; }
function writes(path: string) { return fetchMock.mock.calls.filter(([url, options]) => url === path && options?.method); }

describe('Profile wizard navigation and draft ownership', () => {
  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import('react-dom/client'));
  });
  beforeEach(() => {
    mocks.user = { id: 'user-a', name: 'Aisha', email: 'a@example.test', city: 'Kuala Lumpur', country: 'Malaysia' };
    mocks.feedback.mockReset(); mocks.push.mockReset();
    mocks.refresh.mockReset().mockImplementation(async () => { mocks.user = { ...mocks.user }; });
    saved = initialProfile(); surveySaved = false; savedNotes = ''; rejectBio = false;
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:avatar-draft');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url === '/api/profile/me') return response(summary());
      if (url === '/api/profile/survey' && !options?.method) return response({ interests: surveySaved ? ['food'] : [], notes: savedNotes });
      if (url === '/api/profile/identity') { saved = { ...saved, ...JSON.parse(options?.body as string) }; return response({ updated: true }); }
      if (url === '/api/profile/bio') {
        if (rejectBio) return response(null, 503);
        saved.bio = JSON.parse(options?.body as string).bio; return response({ updated: true });
      }
      if (url.startsWith('/api/profile/avatar?')) return response({ uploadUrl: 'https://upload.example/signed', path: `${saved.id}/avatar.png` });
      if (url === 'https://upload.example/signed') return new Response(null, { status: 200 });
      if (url === '/api/profile/avatar/confirm') { saved.avatarUrl = `https://avatars.example/${saved.id}-new.png`; return response({ updated: true }); }
      if (url === '/api/profile/survey') { surveySaved = true; savedNotes = JSON.parse(options?.body as string).notes ?? ''; return response({ updated: true }); }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container as unknown as HTMLElement);
  });
  afterEach(() => {
    act(() => root.unmount()); document.body.removeChild(container);
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  });

  it('returns from Preferences to saved biography, photo and identity with Back and Continue', async () => {
    await renderPage();
    await click(button('ui.profileWizard.previous'));
    expect(valueOf(input('ui.profileWizard.bioPlaceholder'))).toBe(saved.bio);
    await click(button('ui.profileWizard.previous'));
    expect(findOne(container, (node) => node.getAttribute('data-testid') === 'photo-preview').getAttribute('data-src')).toBe(saved.avatarUrl);
    await click(button('ui.profileWizard.previous'));
    expect(input('ui.profileWizard.fullNamePlaceholder').value).toBe(saved.fullName);
    await click(button('ui.profileWizard.continue'));
    await click(button('ui.profileWizard.continue'));
    await click(button('ui.profileWizard.continue'));
    expect(input('ui.preferencesEditor.notesPlaceholder')).toBeDefined();
    expect(writes('/api/profile/identity')).toHaveLength(0);
    expect(writes('/api/profile/bio')).toHaveLength(0);
  });

  it('retains a biography draft when saving Identity and refreshing the same auth account', async () => {
    await renderPage(); await step('bio');
    await fill(input('ui.profileWizard.bioPlaceholder'), '爱旅行');
    await step('identity'); await fill(input('ui.profileWizard.fullNamePlaceholder'), 'Aisha Updated');
    await click(button('ui.profileWizard.continue'));
    await step('bio');
    expect(valueOf(input('ui.profileWizard.bioPlaceholder'))).toBe('爱旅行');
    expect(saved.fullName).toBe('Aisha Updated');
    expect(saved.bio).toBe('I enjoy travel.');
  });

  it('retains preference answers across navigation and a different section save', async () => {
    await renderPage();
    await fill(input('ui.preferencesEditor.notesPlaceholder'), 'Keep these preferences');
    await click(button('categories.food'));
    await step('identity'); await fill(input('ui.profileWizard.fullNamePlaceholder'), 'Aisha Updated');
    await click(button('ui.profileWizard.continue')); await step('survey');
    expect(valueOf(input('ui.preferencesEditor.notesPlaceholder'))).toBe('Keep these preferences');
    await click(button('ui.kyc.completeProfile'));
    expect(JSON.parse(writes('/api/profile/survey')[0][1].body)).toMatchObject({ interests: ['food'], notes: 'Keep these preferences' });
    expect(container.textContent).toContain('Completed profile');
  });

  it('retains a selected photo across another save and restores the saved photo after upload', async () => {
    await renderPage(); await step('avatar'); await click(button('Choose test photo'));
    await step('bio'); await fill(input('ui.profileWizard.bioPlaceholder'), '爱旅行');
    await click(button('ui.profileWizard.continue')); await step('avatar');
    expect(findOne(container, (node) => node.getAttribute('data-testid') === 'photo-preview').getAttribute('data-src')).toBe('blob:avatar-draft');
    await click(button('ui.profileWizard.savePhoto'));
    await step('avatar');
    expect(findOne(container, (node) => node.getAttribute('data-testid') === 'photo-preview').getAttribute('data-src')).toBe(saved.avatarUrl);
    expect(saved.avatarUrl).toContain('-new.png');
    expect(saved.bio).toBe('爱旅行');
  });

  it('requires saving other drafts before final preference submission', async () => {
    await renderPage(); await step('bio'); await fill(input('ui.profileWizard.bioPlaceholder'), '爱旅行');
    await step('survey'); await click(button('categories.food'));
    await click(button('ui.kyc.completeProfile'));
    expect(writes('/api/profile/survey')).toHaveLength(0);
    expect(valueOf(input('ui.profileWizard.bioPlaceholder'))).toBe('爱旅行');
    expect(mocks.feedback).toHaveBeenCalledWith('error', 'ui.profileWizard.saveStepFirst');
  });

  it('keeps an unsuccessful save on its current step without discarding the draft', async () => {
    rejectBio = true;
    await renderPage(); await step('bio'); await fill(input('ui.profileWizard.bioPlaceholder'), '爱旅行');
    await click(button('ui.profileWizard.continue'));
    expect(valueOf(input('ui.profileWizard.bioPlaceholder'))).toBe('爱旅行');
    expect(findOne(container, (node) => node.getAttribute('aria-current') === 'step').textContent).toBe('ui.profileWizard.steps.bio');
    expect(saved.bio).toBe('I enjoy travel.');
  });

  it('does not unlock later missing steps or mark an invalid biography complete', async () => {
    saved.bio = '';
    await renderPage();
    expect(button('ui.profileWizard.steps.survey').disabled).toBe(true);
    await fill(input('ui.profileWizard.bioPlaceholder'), 'Hi'); await click(button('ui.profileWizard.continue'));
    expect(writes('/api/profile/bio')).toHaveLength(0);
    expect(container.textContent).toContain('ui.profileWizard.bioValidation');
  });

  it('clears the prior account photo and preference drafts when the account changes', async () => {
    await renderPage(); await fill(input('ui.preferencesEditor.notesPlaceholder'), 'Private draft');
    await step('avatar'); await click(button('Choose test photo'));
    mocks.user = { ...mocks.user, id: 'user-b', name: 'New account' }; saved = initialProfile('user-b');
    await renderPage();
    expect(valueOf(input('ui.preferencesEditor.notesPlaceholder'))).toBe('');
    await step('avatar');
    expect(findOne(container, (node) => node.getAttribute('data-testid') === 'photo-preview').getAttribute('data-src')).toBe('https://avatars.example/user-b.png');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:avatar-draft');
  });

  it('restores saved identity after the page is remounted', async () => {
    await renderPage(); await step('identity'); await fill(input('ui.profileWizard.fullNamePlaceholder'), 'Aisha Saved');
    await click(button('ui.profileWizard.continue'));
    act(() => root.unmount());
    root = createRoot(container as unknown as HTMLElement);
    await renderPage(); await step('identity');
    expect(input('ui.profileWizard.fullNamePlaceholder').value).toBe('Aisha Saved');
    expect(findElements(container, (node) => node.getAttribute('aria-current') === 'step')).toHaveLength(1);
  });

  it('ignores a previous account profile response arriving after the new account loads', async () => {
    const staleProfile = summary();
    let resolve!: (value: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; }));
    await renderPage();
    mocks.user = { ...mocks.user, id: 'user-b', name: 'New account' }; saved = initialProfile('user-b');
    await renderPage();
    await act(async () => { resolve(response(staleProfile)); await settle(); });
    await step('identity');
    expect(input('ui.profileWizard.fullNamePlaceholder').value).toBe('New account');
  });
});
