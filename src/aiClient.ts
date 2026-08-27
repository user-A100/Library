export type AiProviderId = "openai" | "deepseek" | "openrouter" | "moonshot" | "zhipu" | "ollama" | "custom";

export type AiProviderConfig = {
  provider: AiProviderId;
  baseUrl: string;
  model: string;
};

export type AiSourceContext = {
  id: string;
  title: string;
  authors: string;
  year: string;
  content: string;
  parser?: "mineru" | "pdfjs";
};

export type AiProviderStatus = {
  configured: boolean;
  provider: AiProviderId;
  keyName: string;
  storage: "memory" | "environment" | "none";
};

export const aiProviderPresets: Array<AiProviderConfig & { label: string }> = [
  { provider: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" },
  { provider: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { provider: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4.1-mini" },
  { provider: "moonshot", label: "Moonshot / Kimi", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-32k" },
  { provider: "zhipu", label: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
  { provider: "ollama", label: "Ollama / LM Studio", baseUrl: "http://127.0.0.1:11434/v1", model: "qwen2.5:7b" },
  { provider: "custom", label: "自定义兼容接口", baseUrl: "", model: "" },
];

export function loadAiProviderConfig(): AiProviderConfig {
  const fallback = aiProviderPresets[1];
  try {
    const saved = window.localStorage.getItem("research-ai-provider-v1");
    if (!saved) return { provider: fallback.provider, baseUrl: fallback.baseUrl, model: fallback.model };
    const parsed = JSON.parse(saved) as Partial<AiProviderConfig>;
    if (!parsed.provider || !parsed.baseUrl || !parsed.model) throw new Error("Invalid AI provider config");
    return { provider: parsed.provider, baseUrl: parsed.baseUrl, model: parsed.model };
  } catch {
    return { provider: fallback.provider, baseUrl: fallback.baseUrl, model: fallback.model };
  }
}

export function saveAiProviderConfig(config: AiProviderConfig) {
  window.localStorage.setItem("research-ai-provider-v1", JSON.stringify(config));
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `AI 服务请求失败（${response.status}）`);
  return payload;
}

export async function getAiProviderStatus(config: AiProviderConfig): Promise<AiProviderStatus> {
  const query = new URLSearchParams({ provider: config.provider });
  const response = await fetch(`/api/ai/status?${query.toString()}`);
  return readJsonResponse<AiProviderStatus>(response);
}

export async function setAiProviderKey(provider: AiProviderId, apiKey: string): Promise<AiProviderStatus> {
  const response = await fetch("/api/ai/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, apiKey }),
  });
  return readJsonResponse<AiProviderStatus>(response);
}

export async function askAiProvider(config: AiProviderConfig, question: string, sources: AiSourceContext[], history: Array<{ role: "user" | "assistant"; text: string }>): Promise<string> {
  const response = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config, question, sources, history: history.slice(-10) }),
  });
  const payload = await readJsonResponse<{ answer: string }>(response);
  return payload.answer;
}
