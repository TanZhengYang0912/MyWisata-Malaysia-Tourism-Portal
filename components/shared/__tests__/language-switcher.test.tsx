import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/lib/i18n/locale";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
  showFeedback: vi.fn(),
  useRouter: vi.fn(),
  useTranslation: vi.fn(),
  useActionFeedback: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: mocks.useRouter }));
vi.mock("react-i18next", () => ({ useTranslation: mocks.useTranslation }));
vi.mock("@/components/providers/action-feedback", () => ({ useActionFeedback: mocks.useActionFeedback }));

import { LANGUAGE_OPTIONS, LanguageSwitcher, saveLocalePreference } from "../language-switcher";

type FakeListener = (event: FakeEvent) => void;

class FakeEvent {
  readonly type: string;
  readonly bubbles: boolean;
  target: FakeNode | null = null;
  currentTarget: FakeNode | null = null;
  defaultPrevented = false;
  cancelBubble = false;

  constructor(type: string, init: { bubbles?: boolean } = {}) {
    this.type = type;
    this.bubbles = init.bubbles ?? false;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }

  stopPropagation() {
    this.cancelBubble = true;
  }
}

class FakeNode {
  readonly nodeType: number;
  readonly ownerDocument: FakeDocument;
  readonly nodeName: string;
  parentNode: FakeNode | null = null;
  childNodes: FakeNode[] = [];
  private readonly listeners = new Map<string, FakeListener[]>();
  nodeValue = "";

  constructor(nodeType: number, ownerDocument: FakeDocument, nodeName: string) {
    this.nodeType = nodeType;
    this.ownerDocument = ownerDocument;
    this.nodeName = nodeName;
  }

  get firstChild() {
    return this.childNodes[0] ?? null;
  }

  get nextSibling(): FakeNode | null {
    if (!this.parentNode) return null;
    const index = this.parentNode.childNodes.indexOf(this);
    return this.parentNode.childNodes[index + 1] ?? null;
  }

  appendChild(node: FakeNode) {
    if (node.parentNode) node.parentNode.removeChild(node);
    this.childNodes.push(node);
    node.parentNode = this;
    return node;
  }

  insertBefore(node: FakeNode, before: FakeNode | null) {
    if (node.parentNode) node.parentNode.removeChild(node);
    const index = before ? this.childNodes.indexOf(before) : -1;
    if (index < 0) this.childNodes.push(node);
    else this.childNodes.splice(index, 0, node);
    node.parentNode = this;
    return node;
  }

  removeChild(node: FakeNode) {
    const index = this.childNodes.indexOf(node);
    if (index >= 0) this.childNodes.splice(index, 1);
    node.parentNode = null;
    return node;
  }

  replaceChild(next: FakeNode, previous: FakeNode) {
    const index = this.childNodes.indexOf(previous);
    if (index >= 0) {
      if (next.parentNode) next.parentNode.removeChild(next);
      this.childNodes[index] = next;
      next.parentNode = this;
      previous.parentNode = null;
    }
    return previous;
  }

  addEventListener(type: string, listener: FakeListener | null) {
    if (!listener) return;
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  removeEventListener(type: string, listener: FakeListener | null) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((candidate) => candidate !== listener));
  }

  dispatchEvent(event: FakeEvent) {
    event.target ??= this;
    this.dispatchBubblingEvent(event);
    event.currentTarget = null;
    return !event.defaultPrevented;
  }

  private dispatchBubblingEvent(event: FakeEvent): void {
    event.currentTarget = this;
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    if (event.bubbles && !event.cancelBubble) this.parentNode?.dispatchBubblingEvent(event);
  }

  get textContent() {
    return this.childNodes.map((node) => node.nodeType === 3 ? node.nodeValue : node.textContent).join("");
  }

  set textContent(value: string) {
    this.childNodes = value ? [new FakeText(this.ownerDocument, value)] : [];
    if (this.childNodes[0]) this.childNodes[0].parentNode = this;
  }
}

class FakeText extends FakeNode {
  constructor(document: FakeDocument, value: string) {
    super(3, document, "#text");
    this.nodeValue = value;
  }
}

class FakeComment extends FakeNode {
  constructor(document: FakeDocument, value: string) {
    super(8, document, "#comment");
    this.nodeValue = value;
  }
}

class FakeElement extends FakeNode {
  readonly tagName: string;
  namespaceURI = "http://www.w3.org/1999/xhtml";
  readonly attributes = new Map<string, string>();
  readonly style = {
    setProperty: (name: string, value: string) => { (this.style as Record<string, string>)[name] = value; },
    removeProperty: (name: string) => { delete (this.style as Record<string, string>)[name]; },
  } as unknown as Record<string, string>;
  className = "";
  id = "";
  htmlFor = "";
  private valueState = "";
  disabled = false;
  private selectedState = false;
  tabIndex = 0;

  constructor(document: FakeDocument, tagName: string) {
    super(1, document, tagName.toUpperCase());
    this.tagName = tagName.toUpperCase();
  }

  get value() {
    if (this.tagName === "SELECT") {
      return this.options.find((option) => option.selected)?.value ?? this.valueState;
    }
    return this.valueState;
  }

  set value(nextValue: string) {
    this.valueState = String(nextValue);
    if (this.tagName === "SELECT") {
      for (const option of this.options) option.selected = option.value === this.valueState;
    }
  }

  get selected() {
    return this.selectedState;
  }

  set selected(nextSelected: boolean) {
    this.selectedState = nextSelected;
    if (!nextSelected || this.tagName !== "OPTION" || this.parentNode?.nodeName !== "SELECT") return;
    for (const option of (this.parentNode as FakeElement).options) {
      if (option !== this) option.selectedState = false;
    }
  }

  setAttribute(name: string, value: unknown) {
    const stringValue = String(value);
    this.attributes.set(name, stringValue);
    if (name === "class") this.className = stringValue;
    if (name === "id") this.id = stringValue;
    if (name === "for") this.htmlFor = stringValue;
    if (name === "value") this.value = stringValue;
    if (name === "disabled") this.disabled = true;
    if (name === "selected") this.selected = true;
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
    if (name === "disabled") this.disabled = false;
    if (name === "selected") this.selected = false;
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name: string) {
    return this.attributes.has(name);
  }

  contains(node: FakeNode | null): boolean {
    if (!node) return false;
    if (node === this) return true;
    return this.childNodes.some((child) => child === node || (child instanceof FakeElement && child.contains(node)));
  }

  get options() {
    return this.childNodes.filter((node): node is FakeElement => node instanceof FakeElement && node.tagName === "OPTION");
  }
}

class FakeDocument extends FakeNode {
  readonly defaultView: FakeWindow;
  readonly documentElement: FakeElement;
  readonly head: FakeElement;
  readonly body: FakeElement;

  constructor() {
    super(9, undefined as unknown as FakeDocument, "#document");
    (this as { ownerDocument: FakeDocument }).ownerDocument = this;
    this.defaultView = new FakeWindow(this);
    this.documentElement = new FakeElement(this, "html");
    this.head = new FakeElement(this, "head");
    this.body = new FakeElement(this, "body");
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
  }

  createElement(tagName: string) {
    return new FakeElement(this, tagName);
  }

  createElementNS(namespaceURI: string, tagName: string) {
    const element = new FakeElement(this, tagName);
    element.namespaceURI = namespaceURI;
    return element;
  }

  createTextNode(value: string) {
    return new FakeText(this, value);
  }

  createComment(value: string) {
    return new FakeComment(this, value);
  }

  get activeElement() {
    return this.body;
  }
}

class FakeWindow {
  readonly HTMLIFrameElement = FakeElement;

  constructor(readonly document: FakeDocument) {}

  addEventListener() {}

  removeEventListener() {}

  getComputedStyle() {
    return {};
  }
}

function installFakeDom() {
  const document = new FakeDocument();
  const scope = globalThis as unknown as Record<string, unknown>;
  scope.document = document;
  scope.window = document.defaultView;
  Object.defineProperty(scope, "navigator", {
    configurable: true,
    value: { userAgent: "node" },
  });
  scope.HTMLElement = FakeElement;
  scope.Element = FakeElement;
  scope.SVGElement = FakeElement;
  scope.HTMLIFrameElement = FakeElement;
  scope.Node = FakeNode;
  scope.Text = FakeText;
  scope.Comment = FakeComment;
  scope.Event = FakeEvent;
  scope.KeyboardEvent = FakeEvent;
  scope.MouseEvent = FakeEvent;
  scope.IS_REACT_ACT_ENVIRONMENT = true;
  return document;
}

function findElements(node: FakeNode, predicate: (element: FakeElement) => boolean): FakeElement[] {
  return node.childNodes.flatMap((child) => {
    const matches = child instanceof FakeElement && predicate(child) ? [child] : [];
    return child instanceof FakeElement ? [...matches, ...findElements(child, predicate)] : matches;
  });
}

function findOne(node: FakeNode, predicate: (element: FakeElement) => boolean) {
  const element = findElements(node, predicate)[0];
  if (!element) throw new Error("Expected element was not rendered");
  return element;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof import("react-dom/client").createRoot> | undefined;
let document: FakeDocument;
let container: FakeElement;

const translations: Record<string, string> = {
  "language.label": "Language",
  "language.saved": "Language preference saved.",
  "language.saveError": "Unable to save language preference. Please try again.",
};

function translate(key: string, options?: { defaultValue?: string; count?: number }) {
  const value = translations[key] ?? options?.defaultValue ?? key;
  return options?.count === undefined ? value : value.replace("{{count}}", String(options.count));
}

async function renderSwitcher() {
  await act(async () => {
    root?.render(React.createElement(LanguageSwitcher));
  });
  return findOne(container, (element) => element.tagName === "SELECT");
}

describe("LanguageSwitcher", () => {
  beforeAll(async () => {
    document = installFakeDom();
    ({ createRoot } = await import("react-dom/client"));
  });

  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.refresh.mockReset();
    mocks.push.mockReset();
    mocks.showFeedback.mockReset();
    mocks.useRouter.mockReturnValue({ refresh: mocks.refresh, push: mocks.push });
    mocks.useTranslation.mockReturnValue({ t: translate, i18n: { resolvedLanguage: "en" } });
    mocks.useActionFeedback.mockReturnValue({ showFeedback: mocks.showFeedback });
    vi.stubGlobal("fetch", mocks.fetch);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
  });

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = undefined;
    }
    document.body.removeChild(container);
    vi.unstubAllGlobals();
  });

  it("renders one native, keyboard-accessible select with native language labels and the resolved selection", async () => {
    const select = await renderSwitcher();
    const options = findElements(select, (element) => element.tagName === "OPTION");
    const label = findOne(container, (element) => element.tagName === "LABEL");

    expect(LANGUAGE_OPTIONS.map((option) => option.locale)).toEqual([...APP_LOCALES]);
    expect(options.map((option) => option.textContent)).toEqual(["English", "简体中文", "Bahasa Melayu"]);
    expect(options.map((option) => option.getAttribute("value"))).toEqual(["en", "zh-CN", "ms"]);
    expect(select.value).toBe("en");
    expect(select.getAttribute("aria-label")).toBe("Language");
    expect(select.getAttribute("role")).toBeNull();
    expect(select.tabIndex).toBeGreaterThanOrEqual(0);
    expect(label.htmlFor).toBe(select.id);
    expect(label.textContent).toBe("Language");
  });

  it("keeps the visible selection synchronized with a provider locale change", async () => {
    let resolvedLanguage = "en";
    mocks.useTranslation.mockImplementation(() => ({
      t: translate,
      i18n: { resolvedLanguage },
    }));

    expect((await renderSwitcher()).value).toBe("en");

    resolvedLanguage = "zh-CN";
    await act(async () => {
      root?.render(React.createElement(LanguageSwitcher));
    });

    const select = findOne(container, (element) => element.tagName === "SELECT");
    expect(select.value).toBe("zh-CN");
  });

  it("disables the real select while the locale request is pending", async () => {
    const request = deferred<Response>();
    mocks.fetch.mockReturnValue(request.promise);
    const select = await renderSwitcher();

    await act(async () => {
      select.value = "zh-CN";
      select.dispatchEvent(new FakeEvent("change", { bubbles: true }));
      await Promise.resolve();
    });

    expect(select.disabled).toBe(true);
    expect(select.getAttribute("aria-busy")).toBe("true");
    expect(select.value).toBe("en");

    await act(async () => {
      request.resolve({ status: 200 } as Response);
      await request.promise;
    });
  });

  it("reports success and waits for the provider locale before changing the visible selection", async () => {
    mocks.fetch.mockResolvedValue({ status: 200 } as Response);
    const select = await renderSwitcher();

    await act(async () => {
      select.value = "zh-CN";
      select.dispatchEvent(new FakeEvent("change", { bubbles: true }));
      await Promise.resolve();
    });

    const liveRegion = findOne(container, (element) => element.getAttribute("aria-live") === "polite");
    expect(select.value).toBe("en");
    expect(mocks.fetch).toHaveBeenCalledWith("/api/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: "zh-CN" }),
    });
    expect(mocks.showFeedback).toHaveBeenCalledWith("success", "Language preference saved.");
    expect(liveRegion.textContent).toBe("Language preference saved.");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("reports errors while keeping the previous visible selection unchanged", async () => {
    mocks.fetch.mockResolvedValue({ status: 500 } as Response);
    const select = await renderSwitcher();

    await act(async () => {
      select.value = "ms";
      select.dispatchEvent(new FakeEvent("change", { bubbles: true }));
      await Promise.resolve();
    });

    const liveRegion = findOne(container, (element) => element.getAttribute("aria-live") === "polite");
    expect(select.value).toBe("en");
    expect(mocks.showFeedback).toHaveBeenCalledWith("error", "Unable to save language preference. Please try again.");
    expect(liveRegion.textContent).toBe("Unable to save language preference. Please try again.");
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("posts only an exact 200 response as a successful preference save", async () => {
    const fetcher = vi.fn().mockResolvedValue({ status: 200 } as Response);
    await expect(saveLocalePreference("zh-CN", fetcher)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith("/api/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: "zh-CN" }),
    });

    const failedFetcher = vi.fn().mockResolvedValue({ status: 204 } as Response);
    await expect(saveLocalePreference("ms", failedFetcher)).rejects.toThrow("Unable to save language preference");
  });
});
