import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useTranslation } from "react-i18next";
import type { AppLocale } from "@/lib/i18n/locale";

const mocks = vi.hoisted(() => ({
  loadLocaleNamespace: vi.fn(async (_locale: string, _namespace: string): Promise<Record<string, unknown>> => ({})),
  pathname: "/customer",
}));

vi.mock("@/lib/i18n/resources", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/i18n/resources")>()),
  loadLocaleNamespace: mocks.loadLocaleNamespace,
}));

vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));

class FakeNode {
  nodeType: number;
  ownerDocument: FakeDocument;
  nodeName: string;
  nodeValue = "";
  parentNode: FakeNode | null = null;
  childNodes: FakeNode[] = [];
  listeners: Record<string, Array<(...args: unknown[]) => void>> = {};

  constructor(nodeType: number, ownerDocument: FakeDocument, nodeName = "") {
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

  addEventListener(type: string, listener: (...args: unknown[]) => void) {
    (this.listeners[type] ??= []).push(listener);
  }

  removeEventListener(type: string, listener: (...args: unknown[]) => void) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((candidate) => candidate !== listener);
  }

  setAttribute(name: string, value: unknown) {
    (this as unknown as Record<string, unknown>)[name] = String(value);
  }

  removeAttribute(name: string) {
    delete (this as unknown as Record<string, unknown>)[name];
  }

  get textContent() {
    return this.childNodes.map((node) => node.nodeType === 3 ? node.nodeValue : node.textContent).join("");
  }

  set textContent(value: string) {
    this.childNodes = value ? [new FakeText(this.ownerDocument, value)] : [];
    if (this.childNodes[0]) this.childNodes[0].parentNode = this;
  }
}

class FakeElement extends FakeNode {
  tagName: string;
  namespaceURI = "http://www.w3.org/1999/xhtml";
  style: Record<string, string> = {};

  constructor(document: FakeDocument, tagName: string) {
    super(1, document, tagName.toUpperCase());
    this.tagName = tagName.toUpperCase();
  }
}

class FakeText extends FakeNode {
  nodeValue: string;
  data: string;

  constructor(document: FakeDocument, value: string) {
    super(3, document, "#text");
    this.nodeValue = value;
    this.data = value;
  }
}

class FakeComment extends FakeNode {
  nodeValue: string;
  data: string;

  constructor(document: FakeDocument, value: string) {
    super(8, document, "#comment");
    this.nodeValue = value;
    this.data = value;
  }
}

class FakeDocument extends FakeNode {
  readyState = "complete";
  defaultView: { document: FakeDocument; HTMLIFrameElement: typeof FakeElement };
  documentElement: FakeElement;
  body: FakeElement;
  head: FakeElement;

  constructor() {
    super(9, null as unknown as FakeDocument, "#document");
    this.ownerDocument = this;
    this.defaultView = { document: this, HTMLIFrameElement: FakeElement };
    this.documentElement = new FakeElement(this, "html");
    this.body = new FakeElement(this, "body");
    this.head = new FakeElement(this, "head");
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

  getElementsByTagName() {
    return [];
  }

  querySelector() {
    return null;
  }
}

type TestResources = Record<string, Record<string, Record<string, unknown>>>;

const initialResources: TestResources = {
  en: { common: { greeting: "Hello", fallback: "English fallback" } },
  "zh-CN": { common: { greeting: "你好" } },
};

const hydratedResources: TestResources = {
  ...initialResources,
  ms: { common: { greeting: "Hai" } },
};

let createRoot: typeof import("react-dom/client").createRoot;
let AppI18nProvider: React.ComponentType<{
  locale: AppLocale;
  resources: TestResources;
  partialNamespaces?: string[];
  children?: React.ReactNode;
}>;
let root: ReturnType<typeof import("react-dom/client").createRoot> | undefined;
const idleQueue: Array<() => void> = [];
let container: FakeElement;

function TranslationProbe() {
  const { t } = useTranslation("common");
  return React.createElement("output", null, `${t("greeting")}|${t("fallback")}`);
}

function installFakeDom() {
  const document = new FakeDocument();
  const scope = globalThis as unknown as Record<string, unknown>;
  scope.document = document;
  // Queue idle work so a test can observe the page before and after the background fill-in.
  Object.assign(document.defaultView, {
    requestIdleCallback: (callback: () => void) => idleQueue.push(callback),
    cancelIdleCallback: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
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
  scope.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
}

describe("AppI18nProvider runtime resource hydration", () => {
  beforeAll(async () => {
    installFakeDom();
    ({ createRoot } = await import("react-dom/client"));
    const providerModule = await import("../i18n-provider");
    AppI18nProvider = providerModule.AppI18nProvider as unknown as typeof AppI18nProvider;
  });

  beforeEach(() => {
    mocks.loadLocaleNamespace.mockReset();
    mocks.loadLocaleNamespace.mockImplementation(async () => ({}));
    mocks.pathname = "/customer";
    idleQueue.length = 0;
  });

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = undefined;
    }
    container.textContent = "";
  });

  it("never falls back to English while hydrating a selected non-English locale", async () => {
    root = createRoot(container as unknown as Element);

    await act(async () => {
      root?.render(
        React.createElement(
          AppI18nProvider,
          { locale: "zh-CN", resources: initialResources },
          React.createElement(TranslationProbe),
        ),
      );
    });

    expect(container.textContent).toBe("你好|fallback");

    await act(async () => {
      root?.render(
        React.createElement(
          AppI18nProvider,
          { locale: "ms", resources: hydratedResources },
          React.createElement(TranslationProbe),
        ),
      );
    });

    expect(container.textContent).toBe("Hai|fallback");
  });

  async function flushIdleFill() {
    await act(async () => {
      for (const callback of idleQueue.splice(0)) callback();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  function countingProbe(namespace: string, key: string) {
    const probe = { renders: 0, i18n: null as null | import("i18next").i18n };
    function Probe() {
      const { t, i18n } = useTranslation(namespace);
      // No dependency list: runs after every commit, so it counts renders.
      React.useEffect(() => {
        probe.renders += 1;
        probe.i18n = i18n;
      });
      return React.createElement("output", null, t(key));
    }
    return { probe, Probe };
  }

  async function renderProvider(props: { resources: TestResources; partialNamespaces?: string[] }, child: React.ReactElement) {
    root ??= createRoot(container as unknown as Element);
    await act(async () => {
      root?.render(React.createElement(AppI18nProvider, { locale: "en", ...props }, child));
    });
  }

  it("fills in a namespace the slim page omitted and refreshes the component that needed it", async () => {
    mocks.loadLocaleNamespace.mockImplementation(async (_locale, namespace) => namespace === "vendor" ? { title: "Vendor title" } : {});
    const { Probe } = countingProbe("vendor", "title");

    await renderProvider({ resources: { en: { common: { greeting: "Hello" } } } }, React.createElement(Probe));
    expect(container.textContent).toBe("title");
    expect(mocks.loadLocaleNamespace).not.toHaveBeenCalled();
    await flushIdleFill();

    expect(mocks.loadLocaleNamespace).toHaveBeenCalledWith("en", "vendor");
    expect(container.textContent).toBe("Vendor title");
  });

  it("completes a partial namespace without re-rendering the components already showing it", async () => {
    mocks.loadLocaleNamespace.mockImplementation(async (_locale, namespace) => (
      namespace === "admin" ? { share: { label: "Share" }, users: { title: "Users" } } : {}
    ));
    const { probe, Probe } = countingProbe("admin", "share.label");

    await renderProvider(
      { resources: { en: { common: {}, admin: { share: { label: "Share" } } } }, partialNamespaces: ["admin"] },
      React.createElement(Probe),
    );
    const rendersBeforeFill = probe.renders;
    await flushIdleFill();

    expect(mocks.loadLocaleNamespace).toHaveBeenCalledWith("en", "admin");
    expect(probe.renders).toBe(rendersBeforeFill);
    expect(probe.i18n?.getResource("en", "admin", "users.title")).toBe("Users");
  });

  it("does not re-render when the filled-in namespaces are unused", async () => {
    const { probe, Probe } = countingProbe("common", "greeting");

    await renderProvider({ resources: { en: { common: { greeting: "Hello" } } } }, React.createElement(Probe));
    const rendersBeforeFill = probe.renders;
    await flushIdleFill();

    expect(mocks.loadLocaleNamespace).toHaveBeenCalledWith("en", "vendor");
    expect(probe.renders).toBe(rendersBeforeFill);
  });

  it("loads nothing when the page already has every namespace", async () => {
    const { Probe } = countingProbe("common", "greeting");

    await renderProvider(
      { resources: { en: { common: { greeting: "Hello" }, auth: {}, customer: {}, vendor: {}, admin: {} } } },
      React.createElement(Probe),
    );
    await flushIdleFill();

    expect(mocks.loadLocaleNamespace).not.toHaveBeenCalled();
  });

  it("logs a failed fill-in and retries it after the next navigation", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.loadLocaleNamespace.mockImplementation(async (_locale, namespace) => {
      if (namespace === "vendor") throw new Error("chunk gone");
      return {};
    });
    const { Probe } = countingProbe("common", "greeting");
    const resources = { en: { common: { greeting: "Hello" }, auth: {}, customer: {}, admin: {} } };

    await renderProvider({ resources }, React.createElement(Probe));
    await flushIdleFill();
    expect(consoleError).toHaveBeenCalled();
    expect(mocks.loadLocaleNamespace).toHaveBeenCalledTimes(1);

    mocks.pathname = "/customer/affiliate";
    await renderProvider({ resources }, React.createElement(Probe));
    await flushIdleFill();

    expect(mocks.loadLocaleNamespace).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });
});
