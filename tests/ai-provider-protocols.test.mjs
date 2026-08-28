import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

async function createHarness(seed = {}) {
  const prefStore = new Map(Object.entries(seed.prefs || {}));
  const loginStore = new Map();
  let fetchImpl = async () => ({ ok: true, json: async () => ({ data: [] }) });
  const context = {
    TextDecoder,
    Services: {
      prefs: {
        getStringPref: (name, fallback = "") => prefStore.has(name) ? prefStore.get(name) : fallback,
        setStringPref: (name, value) => prefStore.set(name, value),
      },
      logins: {
        findLogins: origin => loginStore.has(origin) ? [loginStore.get(origin)] : [],
        addLogin: info => loginStore.set(info.origin, info),
        modifyLogin: (_old, info) => loginStore.set(info.origin, info),
        removeLogin: info => loginStore.delete(info.origin),
      },
    },
    Components: {
      interfaces: { nsILoginInfo: {} },
      Constructor: class {
        constructor() {
          return function (origin, _unused, realm, _user, password) {
            Object.assign(this, { origin, realm, password });
          };
        }
      },
    },
    Zotero: { logError() {} },
    fetch: (...args) => fetchImpl(...args),
  };
  vm.createContext(context);
  vm.runInContext(await readFile("desktop/addons/research-workspace/ai-provider.js", "utf8"), context, { filename: "ai-provider.js" });
  return {
    Adapter: context.LibraryAIProviderAdapter,
    prefStore,
    setFetch(fn) { fetchImpl = fn; },
  };
}

function streamResponse(chunks) {
  let index = 0;
  const encoded = chunks.map(chunk => new TextEncoder().encode(chunk));
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () => index < encoded.length
          ? { value: encoded[index++], done: false }
          : { value: undefined, done: true },
      }),
    },
  };
}

describe("Library AI provider protocol compatibility", () => {
  it("migrates profiles without a protocol and detects Anthropic-compatible base URLs", async () => {
    const profiles = [
      { id: "kimi", name: "Kimi", preset: "custom", baseURL: "https://api.kimi.com/coding/", model: "k3" },
      { id: "deepseek", name: "DeepSeek", preset: "deepseek", baseURL: "https://api.deepseek.com/v1", model: "deepseek-chat" },
    ];
    const { Adapter, prefStore } = await createHarness({
      prefs: {
        "test.aiProfiles": JSON.stringify(profiles),
        "test.aiActiveProfile": "kimi",
      },
    });
    const provider = new Adapter("test.");

    expect(provider.profiles.map(profile => profile.protocol)).toEqual(["anthropic", "openai"]);
    expect(JSON.parse(prefStore.get("test.aiProfiles")).map(profile => profile.protocol)).toEqual(["anthropic", "openai"]);
    expect(provider.config.protocol).toBe("anthropic");
  });

  it("builds Anthropic endpoints and authentication headers without duplicating /v1", async () => {
    const { Adapter, setFetch } = await createHarness();
    const provider = Object.create(Adapter.prototype);
    Object.defineProperty(provider, "config", {
      value: { protocol: "anthropic", baseURL: "https://api.kimi.com/coding", model: "k3" },
    });
    let captured;
    setFetch(async (url, options) => {
      captured = { url, options };
      return { ok: true, json: async () => ({}) };
    });

    await provider.request("/v1/messages", {
      baseURL: "https://api.kimi.com/coding/v1/",
      apiKey: "test-key",
      protocol: "anthropic",
      method: "POST",
    });

    expect(captured.url).toBe("https://api.kimi.com/coding/v1/messages");
    expect(captured.options.headers).toMatchObject({
      "x-api-key": "test-key",
      "anthropic-version": "2023-06-01",
    });
    expect(captured.options.headers.Authorization).toBeUndefined();
  });

  it("keeps OpenAI authentication on Bearer without Anthropic headers", async () => {
    const { Adapter, setFetch } = await createHarness();
    const provider = Object.create(Adapter.prototype);
    Object.defineProperty(provider, "config", {
      value: { protocol: "openai", baseURL: "https://api.moonshot.cn/v1", model: "moonshot-v1-32k" },
    });
    let captured;
    setFetch(async (url, options) => {
      captured = { url, options };
      return { ok: true, json: async () => ({}) };
    });

    await provider.request("/chat/completions", { apiKey: "test-key", protocol: "openai", method: "POST" });

    expect(captured.url).toBe("https://api.moonshot.cn/v1/chat/completions");
    expect(captured.options.headers.Authorization).toBe("Bearer test-key");
    expect(captured.options.headers["x-api-key"]).toBeUndefined();
    expect(captured.options.headers["anthropic-version"]).toBeUndefined();
  });

  it("switches the saved protocol when the sidebar selects an Anthropic preset", async () => {
    const profiles = [{
      id: "default", name: "Default", preset: "openai", protocol: "openai",
      baseURL: "https://api.openai.com/v1", model: "gpt-4.1-mini",
    }];
    const { Adapter } = await createHarness({
      prefs: {
        "test.aiProfiles": JSON.stringify(profiles),
        "test.aiActiveProfile": "default",
      },
    });
    const provider = new Adapter("test.");

    await provider.save({
      preset: "kimi-code",
      baseURL: "https://api.kimi.com/coding",
      model: "k3",
      apiKey: "",
    });

    expect(provider.config).toMatchObject({ preset: "kimi-code", protocol: "anthropic", model: "k3" });
  });

  it("converts system messages and parses Anthropic thinking/text SSE events", async () => {
    const profiles = [{
      id: "kimi", name: "Kimi", preset: "kimi-code", protocol: "anthropic",
      baseURL: "https://api.kimi.com/coding", model: "k3[1m]",
    }];
    const { Adapter } = await createHarness({
      prefs: {
        "test.aiProfiles": JSON.stringify(profiles),
        "test.aiActiveProfile": "kimi",
      },
    });
    const provider = new Adapter("test.");
    let requestPath;
    let requestOptions;
    provider.request = async (path, options) => {
      requestPath = path;
      requestOptions = options;
      return streamResponse([
        "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{}}\n\n",
        "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"先检查\"}}\n\n",
        "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"回答\"}}\n",
        "\nevent: message_stop\ndata: {\"type\":\"message_stop\"}\n\n",
      ]);
    };
    let reasoning = "";
    let content = "";

    const result = await provider.stream([
      { role: "system", content: "只依据论文回答" },
      { role: "user", content: "问题" },
    ], {
      window: { TextDecoder },
      onReasoning: delta => { reasoning += delta; },
      onDelta: delta => { content += delta; },
    });

    expect(requestPath).toBe("/v1/messages");
    expect(requestOptions.protocol).toBe("anthropic");
    expect(JSON.parse(requestOptions.body)).toMatchObject({
      model: "k3",
      max_tokens: 4096,
      stream: true,
      system: "只依据论文回答",
      messages: [{ role: "user", content: "问题" }],
    });
    expect(reasoning).toBe("先检查");
    expect(content).toBe("回答");
    expect(result).toBe("回答");
  });

  it("parses a non-stream Anthropic JSON response even when fetch exposes a body reader", async () => {
    const profiles = [{
      id: "anthropic", name: "Anthropic", preset: "anthropic", protocol: "anthropic",
      baseURL: "https://api.anthropic.com", model: "claude-test",
    }];
    const { Adapter } = await createHarness({
      prefs: {
        "test.aiProfiles": JSON.stringify(profiles),
        "test.aiActiveProfile": "anthropic",
      },
    });
    const provider = new Adapter("test.");
    provider.request = async () => ({
      ok: true,
      headers: { get: name => name === "content-type" ? "application/json" : null },
      body: { getReader: () => ({ read: async () => ({ done: true }) }) },
      json: async () => ({
        type: "message",
        content: [
          { type: "thinking", thinking: "分析" },
          { type: "text", text: "结论" },
        ],
      }),
    });
    let reasoning = "";
    let content = "";

    const result = await provider.stream([{ role: "user", content: "问题" }], {
      window: { TextDecoder },
      onReasoning: delta => { reasoning += delta; },
      onDelta: delta => { content += delta; },
    });

    expect(reasoning).toBe("分析");
    expect(content).toBe("结论");
    expect(result).toBe("结论");
  });

  it("uses a minimal Anthropic Messages request when testing a connection", async () => {
    const { Adapter } = await createHarness();
    const provider = Object.create(Adapter.prototype);
    Object.defineProperty(provider, "config", {
      value: { protocol: "anthropic", baseURL: "https://api.kimi.com/coding", model: "k3" },
    });
    let captured;
    provider.request = async (path, options) => {
      captured = { path, options };
      return { ok: true, json: async () => ({ content: [{ type: "text", text: "Hi" }] }) };
    };

    await provider.test({
      baseURL: "https://api.kimi.com/coding",
      apiKey: "test-key",
      protocol: "anthropic",
      model: "k3[1m]",
    });

    expect(captured.path).toBe("/v1/messages");
    expect(JSON.parse(captured.options.body)).toMatchObject({ model: "k3", max_tokens: 8, stream: false });
  });
});
