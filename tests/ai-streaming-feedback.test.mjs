import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { beforeAll, describe, expect, it, vi } from "vitest";

let ViewHost;
let ProviderAdapter;

beforeAll(async () => {
  const context = {
    Services: { prefs: { getBoolPref: () => false } },
    TextDecoder,
  };
  vm.createContext(context);
  vm.runInContext(await readFile("desktop/addons/research-workspace/ai-view.js", "utf8"), context, { filename: "ai-view.js" });
  vm.runInContext(await readFile("desktop/addons/research-workspace/ai-provider.js", "utf8"), context, { filename: "ai-provider.js" });
  ViewHost = context.LibraryAIViewHost;
  ProviderAdapter = context.LibraryAIProviderAdapter;
});

class FakeElement {
  constructor(name) {
    this.localName = name;
    this.children = [];
    this.childNodes = this.children;
    this.dataset = {};
    this.className = "";
    this.textContent = "";
    this.attributes = {};
  }

  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes[name] = value; }
}

class FakeDOMParser {
  parseFromString() { return { body: new FakeElement("body") }; }
}

function fakeDocument() {
  return {
    defaultView: { DOMParser: FakeDOMParser },
    createElement: name => new FakeElement(name),
    createElementNS: (_namespace, name) => new FakeElement(name),
    importNode: node => node,
  };
}

function findByClass(node, className) {
  if (String(node.className || "").split(/\s+/).includes(className)) return node;
  for (const child of node.children || []) {
    const match = findByClass(child, className);
    if (match) return match;
  }
  return null;
}

describe("Library AI streaming feedback", () => {
	it("coalesces rapid streaming updates into one scheduled render", () => {
		const host = Object.create(ViewHost.prototype);
		const callbacks = [];
		const fakeWindow = {
			setTimeout: vi.fn(callback => { callbacks.push(callback); return callbacks.length; }),
			clearTimeout: vi.fn(),
		};
		host.windows = new Map([[fakeWindow, { renderTimer: null }]]);
		host.render = vi.fn();

		host.scheduleRenderAll();
		host.scheduleRenderAll();
		host.scheduleRenderAll();

		expect(fakeWindow.setTimeout).toHaveBeenCalledOnce();
		expect(host.render).not.toHaveBeenCalled();
		callbacks[0]();
		expect(host.render).toHaveBeenCalledOnce();
	});

  it("renders a readable activity state before the first answer token", () => {
    const host = Object.create(ViewHost.prototype);
    host.renderMarkdown = () => "";
    const article = host.messageNode(fakeDocument(), {
      id: "assistant-1",
      role: "assistant",
      content: "",
      citations: {},
      state: "streaming",
      activity: { phase: "waiting", label: "正在等待 GLM-4.5-Flash 响应…" },
    });

    const progress = findByClass(article, "library-ai-progress");
    expect(progress).not.toBeNull();
    expect(progress.attributes).toMatchObject({ role: "status", "aria-live": "polite" });
    expect(progress.children.at(-1).textContent).toBe("正在等待 GLM-4.5-Flash 响应…");
    expect(findByClass(article, "library-ai-cursor")).toBeNull();
  });

  it("accepts common reasoning field aliases from compatible streaming APIs", async () => {
    const adapter = Object.create(ProviderAdapter.prototype);
    Object.defineProperty(adapter, "config", { value: { model: "test-model" } });
    const chunks = [
      'data: {"choices":[{"delta":{"thinking":"先检查论文上下文"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"回答正文"}}]}\n\n',
      "data: [DONE]\n\n",
    ].map(value => new TextEncoder().encode(value));
    let index = 0;
    adapter.request = async () => ({
      ok: true,
      body: { getReader: () => ({ read: async () => index < chunks.length ? { value: chunks[index++], done: false } : { done: true } }) },
    });
    let reasoning = "";
    let content = "";

    await adapter.stream([{ role: "user", content: "问题" }], {
      window: { TextDecoder },
      onReasoning: delta => { reasoning += delta; },
      onDelta: delta => { content += delta; },
    });

    expect(reasoning).toBe("先检查论文上下文");
    expect(content).toBe("回答正文");
  });
});
