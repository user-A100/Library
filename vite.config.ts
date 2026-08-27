import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

type ProviderId = "openai" | "deepseek" | "openrouter" | "moonshot" | "zhipu" | "ollama" | "custom";

const providerKeyNames: Record<ProviderId, string> = {
  openai: "OPENAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  moonshot: "MOONSHOT_API_KEY",
  zhipu: "ZHIPU_API_KEY",
  ollama: "OLLAMA_API_KEY",
  custom: "CUSTOM_AI_API_KEY",
};

function readRequestBody(request: import("node:http").IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1_500_000) {
        reject(new Error("请求内容过大"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("请求格式无效"));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response: import("node:http").ServerResponse, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function validateBaseUrl(value: string) {
  const url = new URL(value);
  const localHost = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localHost)) {
    throw new Error("接口地址必须使用 HTTPS；本地模型可使用 localhost 或 127.0.0.1");
  }
  return url.toString().replace(/\/$/, "");
}

function localAiProxy(env: Record<string, string>): Plugin {
  const sessionKeys = new Map<ProviderId, string>();
  const getKey = (provider: ProviderId) => sessionKeys.get(provider) || env[providerKeyNames[provider]] || env.AI_API_KEY || "";
  const getKeyStorage = (provider: ProviderId) => sessionKeys.has(provider) ? "memory" : (env[providerKeyNames[provider]] || env.AI_API_KEY) ? "environment" : "none";

  return {
    name: "local-ai-proxy",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!request.url?.startsWith("/api/ai/")) return next();
        const origin = request.headers.origin;
        if (origin && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) {
          return sendJson(response, 403, { error: "只允许本机页面配置 AI 服务" });
        }

        if (request.method === "GET" && request.url.startsWith("/api/ai/status")) {
          const url = new URL(request.url, "http://127.0.0.1");
          const provider = (url.searchParams.get("provider") || "custom") as ProviderId;
          if (!(provider in providerKeyNames)) return sendJson(response, 400, { error: "未知 AI 提供商" });
          const configured = provider === "ollama" || Boolean(getKey(provider));
          return sendJson(response, 200, { configured, provider, keyName: providerKeyNames[provider], storage: provider === "ollama" ? "none" : getKeyStorage(provider) });
        }

        if (request.method === "POST" && request.url === "/api/ai/config") {
          try {
            const body = await readRequestBody(request) as { provider?: ProviderId; apiKey?: string };
            const provider = body.provider;
            const apiKey = body.apiKey?.trim() || "";
            if (!provider || !(provider in providerKeyNames)) throw new Error("未知 AI 提供商");
            if (!apiKey || apiKey.length < 8 || apiKey.length > 4096) throw new Error("请输入有效的 API Key");
            sessionKeys.set(provider, apiKey);
            return sendJson(response, 200, { configured: true, provider, keyName: providerKeyNames[provider], storage: "memory" });
          } catch (error) {
            return sendJson(response, 400, { error: error instanceof Error ? error.message : "密钥配置失败" });
          }
        }

        if (request.method !== "POST" || request.url !== "/api/ai/chat") return sendJson(response, 404, { error: "接口不存在" });

        try {
          const body = await readRequestBody(request) as {
            config?: { provider?: ProviderId; baseUrl?: string; model?: string };
            question?: string;
            sources?: Array<{ id: string; title: string; authors: string; year: string; content: string }>;
            history?: Array<{ role: "user" | "assistant"; text: string }>;
          };
          const provider = body.config?.provider;
          const model = body.config?.model?.trim();
          const question = body.question?.trim();
          if (!provider || !(provider in providerKeyNames) || !model || !question) throw new Error("请完整配置提供商、模型并输入问题");
          const baseUrl = validateBaseUrl(body.config?.baseUrl?.trim() || "");
          const apiKey = getKey(provider);
          if (provider !== "ollama" && !apiKey) throw new Error(`本地服务未配置 ${providerKeyNames[provider]} 或 AI_API_KEY`);

          const sources = (body.sources || []).slice(0, 8);
          const sourceText = sources.map((source, index) => [
            `【来源 ${index + 1}】${source.title}`,
            `${source.authors} · ${source.year}`,
            source.content.slice(0, 60_000),
          ].join("\n")).join("\n\n");
          const systemPrompt = [
            "你是论文阅读助手。只根据用户选择的来源回答，使用中文，区分原文信息与推断。",
            "引用时使用【来源 1】；如果上下文包含页码标记，可写成【来源 1 · p. 3】。",
            "当上下文含有 [block:块ID | p.页码 | bbox:坐标 | 类型] 标记时，必须优先使用精确格式【来源 1 · p.3 · block:块ID】，且只能引用真实存在的块ID。",
            "不知道时直接说明来源不足，不要编造引用、页码或块ID。",
            sourceText,
          ].join("\n\n");
          const messages = [
            { role: "system", content: systemPrompt },
            ...(body.history || []).slice(-10).map((message) => ({ role: message.role, content: message.text.slice(0, 12_000) })),
            { role: "user", content: question },
          ];

          const upstream = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
              ...(provider === "openrouter" ? { "HTTP-Referer": "http://127.0.0.1:5173", "X-Title": "Zen Research Workspace" } : {}),
            },
            body: JSON.stringify({ model, messages, temperature: 0.2, stream: false }),
            signal: AbortSignal.timeout(90_000),
          });
          const result = await upstream.json().catch(() => ({})) as {
            choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
            error?: { message?: string };
          };
          if (!upstream.ok) throw new Error(result.error?.message || `上游服务返回 ${upstream.status}`);
          const rawContent = result.choices?.[0]?.message?.content;
          const answer = typeof rawContent === "string"
            ? rawContent
            : rawContent?.map((part) => part.text || "").join("") || "";
          if (!answer.trim()) throw new Error("模型没有返回可显示的内容");
          return sendJson(response, 200, { answer: answer.trim() });
        } catch (error) {
          const message = error instanceof Error ? error.message : "AI 服务请求失败";
          return sendJson(response, 502, { error: message });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), localAiProxy(env)],
    server: {
      watch: {
        ignored: ["**/work/**", "**/tmp/**", "**/.*.tmpdir/**"],
      },
    },
  };
});
