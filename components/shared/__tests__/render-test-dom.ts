export class TestEvent {
  readonly type: string;
  readonly bubbles: boolean;
  readonly cancelable = true;
  readonly isTrusted = true;
  readonly timeStamp = Date.now();
  target: TestNode | null = null;
  currentTarget: TestNode | null = null;
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

type TestListener = (event: TestEvent) => void;

export class TestNode {
  readonly nodeType: number;
  readonly nodeName: string;
  ownerDocument: TestDocument;
  parentNode: TestNode | null = null;
  childNodes: TestNode[] = [];
  nodeValue = "";
  private readonly listeners = new Map<string, TestListener[]>();

  constructor(nodeType: number, ownerDocument: TestDocument, nodeName: string) {
    this.nodeType = nodeType;
    this.ownerDocument = ownerDocument;
    this.nodeName = nodeName;
  }

  get firstChild() {
    return this.childNodes[0] ?? null;
  }

  get nextSibling(): TestNode | null {
    if (!this.parentNode) return null;
    const index = this.parentNode.childNodes.indexOf(this);
    return this.parentNode.childNodes[index + 1] ?? null;
  }

  appendChild(node: TestNode) {
    if (node.parentNode) node.parentNode.removeChild(node);
    this.childNodes.push(node);
    node.parentNode = this;
    return node;
  }

  insertBefore(node: TestNode, before: TestNode | null) {
    if (node.parentNode) node.parentNode.removeChild(node);
    const index = before ? this.childNodes.indexOf(before) : -1;
    if (index < 0) this.childNodes.push(node);
    else this.childNodes.splice(index, 0, node);
    node.parentNode = this;
    return node;
  }

  removeChild(node: TestNode) {
    const index = this.childNodes.indexOf(node);
    if (index >= 0) this.childNodes.splice(index, 1);
    node.parentNode = null;
    return node;
  }

  replaceChild(next: TestNode, previous: TestNode) {
    const index = this.childNodes.indexOf(previous);
    if (index >= 0) {
      if (next.parentNode) next.parentNode.removeChild(next);
      this.childNodes[index] = next;
      next.parentNode = this;
      previous.parentNode = null;
    }
    return previous;
  }

  addEventListener(type: string, listener: TestListener | null) {
    if (!listener) return;
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  removeEventListener(type: string, listener: TestListener | null) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((candidate) => candidate !== listener));
  }

  dispatchEvent(event: TestEvent) {
    event.target ??= this;
    this.dispatchBubblingEvent(event);
    event.currentTarget = null;
    return !event.defaultPrevented;
  }

  private dispatchBubblingEvent(event: TestEvent): void {
    event.currentTarget = this;
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    if (event.bubbles && !event.cancelBubble) this.parentNode?.dispatchBubblingEvent(event);
  }

  get textContent() {
    return this.childNodes.map((node) => node.nodeType === 3 ? node.nodeValue : node.textContent).join("");
  }

  set textContent(value: string) {
    this.childNodes = value ? [new TestText(this.ownerDocument, value)] : [];
    if (this.childNodes[0]) this.childNodes[0].parentNode = this;
  }
}

export class TestText extends TestNode {
  constructor(document: TestDocument, value: string) {
    super(3, document, "#text");
    this.nodeValue = value;
  }
}

export class TestComment extends TestNode {
  constructor(document: TestDocument, value: string) {
    super(8, document, "#comment");
    this.nodeValue = value;
  }
}

export class TestElement extends TestNode {
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
  type = "";
  disabled = false;
  tabIndex = 0;
  private valueState = "";
  private selectedState = false;

  constructor(document: TestDocument, tagName: string) {
    super(1, document, tagName.toUpperCase());
    this.tagName = tagName.toUpperCase();
    if (this.tagName === "INPUT") this.type = "text";
  }

  get value() {
    if (this.tagName === "SELECT") return this.options.find((option) => option.selected)?.value ?? this.valueState;
    return this.valueState;
  }

  set value(value: string) {
    this.valueState = String(value);
    if (this.tagName === "SELECT") for (const option of this.options) option.selected = option.value === this.valueState;
  }

  get selected() {
    return this.selectedState;
  }

  set selected(value: boolean) {
    this.selectedState = value;
    if (!value || this.tagName !== "OPTION" || this.parentNode?.nodeName !== "SELECT") return;
    for (const option of (this.parentNode as TestElement).options) if (option !== this) option.selectedState = false;
  }

  get options() {
    return this.childNodes.filter((node): node is TestElement => node instanceof TestElement && node.tagName === "OPTION");
  }

  setAttribute(name: string, value: unknown) {
    const stringValue = String(value);
    this.attributes.set(name, stringValue);
    if (name === "class") this.className = stringValue;
    if (name === "id") this.id = stringValue;
    if (name === "for") this.htmlFor = stringValue;
    if (name === "type") this.type = stringValue;
    if (name === "value") this.value = stringValue;
    if (name === "disabled") this.disabled = true;
    if (name === "tabindex") this.tabIndex = Number(stringValue);
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

  contains(node: TestNode | null): boolean {
    if (!node) return false;
    return node === this || this.childNodes.some((child) => child === node || (child instanceof TestElement && child.contains(node)));
  }

  focus() {}
  scrollTo() {}
}

class TestWindow {
  readonly HTMLIFrameElement = TestElement;
  readonly localStorage = {
    getItem: () => null,
    setItem: () => {},
  };

  constructor(readonly document: TestDocument) {}

  addEventListener() {}
  removeEventListener() {}
  getComputedStyle() { return {}; }
  // Delegates to the real timers — components polling via `window.setInterval`
  // (not the bare global) need this to exist on the fake window at all.
  setInterval(...args: Parameters<typeof setInterval>) { return setInterval(...args); }
  clearInterval(...args: Parameters<typeof clearInterval>) { return clearInterval(...args); }
  setTimeout(...args: Parameters<typeof setTimeout>) { return setTimeout(...args); }
  clearTimeout(...args: Parameters<typeof clearTimeout>) { return clearTimeout(...args); }
}

export class TestDocument extends TestNode {
  readonly defaultView: TestWindow;
  readonly documentElement: TestElement;
  readonly head: TestElement;
  readonly body: TestElement;
  oninput: ((event: TestEvent) => void) | null = null;

  constructor() {
    super(9, undefined as unknown as TestDocument, "#document");
    this.ownerDocument = this;
    this.defaultView = new TestWindow(this);
    this.documentElement = new TestElement(this, "html");
    this.head = new TestElement(this, "head");
    this.body = new TestElement(this, "body");
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
  }

  createElement(tagName: string) { return new TestElement(this, tagName); }
  createElementNS(namespaceURI: string, tagName: string) {
    const element = new TestElement(this, tagName);
    element.namespaceURI = namespaceURI;
    return element;
  }
  createTextNode(value: string) { return new TestText(this, value); }
  createComment(value: string) { return new TestComment(this, value); }
  get activeElement() { return this.body; }
}

export function installTestDom() {
  const document = new TestDocument();
  const scope = globalThis as unknown as Record<string, unknown>;
  scope.document = document;
  scope.window = document.defaultView;
  Object.defineProperty(scope, "navigator", { configurable: true, value: { userAgent: "node", language: "en-US" } });
  scope.HTMLElement = TestElement;
  scope.Element = TestElement;
  scope.SVGElement = TestElement;
  scope.HTMLIFrameElement = TestElement;
  scope.Node = TestNode;
  scope.Text = TestText;
  scope.Comment = TestComment;
  scope.Event = TestEvent;
  scope.KeyboardEvent = TestEvent;
  scope.MouseEvent = TestEvent;
  scope.IS_REACT_ACT_ENVIRONMENT = true;
  return document;
}

export function findElements(node: TestNode, predicate: (element: TestElement) => boolean): TestElement[] {
  return node.childNodes.flatMap((child) => {
    const matches = child instanceof TestElement && predicate(child) ? [child] : [];
    return child instanceof TestElement ? [...matches, ...findElements(child, predicate)] : matches;
  });
}

export function findOne(node: TestNode, predicate: (element: TestElement) => boolean) {
  const element = findElements(node, predicate)[0];
  if (!element) throw new Error("Expected element was not rendered");
  return element;
}
