import React, { act } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { useTranslation } from "react-i18next";
import type { AppLocale } from "@/lib/i18n/locale";

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

type TestResources = Record<string, Record<string, Record<string, string>>>;

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
  children?: React.ReactNode;
}>;
let root: ReturnType<typeof import("react-dom/client").createRoot> | undefined;
let container: FakeElement;

function TranslationProbe() {
  const { t } = useTranslation("common");
  return React.createElement("output", null, `${t("greeting")}|${t("fallback")}`);
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

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = undefined;
    }
    container.textContent = "";
  });

  it("renders English fallback text initially and hydrates a previously absent locale", async () => {
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

    expect(container.textContent).toBe("你好|English fallback");

    await act(async () => {
      root?.render(
        React.createElement(
          AppI18nProvider,
          { locale: "ms", resources: hydratedResources },
          React.createElement(TranslationProbe),
        ),
      );
    });

    expect(container.textContent).toBe("Hai|English fallback");
  });
});
