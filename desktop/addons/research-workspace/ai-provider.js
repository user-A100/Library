LibraryAIProviderAdapter = class LibraryAIProviderAdapter {
	constructor(prefRoot) { this.prefRoot = prefRoot; }
	get presets() {
		return {
			openai: ["OpenAI", "https://api.openai.com/v1", "gpt-4.1-mini"],
			deepseek: ["DeepSeek", "https://api.deepseek.com/v1", "deepseek-chat"],
			openrouter: ["OpenRouter", "https://openrouter.ai/api/v1", "openai/gpt-4.1-mini"],
			moonshot: ["Moonshot / Kimi", "https://api.moonshot.cn/v1", "moonshot-v1-32k"],
			zhipu: ["智谱 GLM", "https://open.bigmodel.cn/api/paas/v4", "glm-4-flash"],
			ollama: ["Ollama / LM Studio", "http://127.0.0.1:11434/v1", "qwen2.5:7b"],
			custom: ["自定义兼容接口", "", ""],
		};
	}
	get config() {
		return {
			preset: Services.prefs.getStringPref(this.prefRoot + "aiProvider", "openai"),
			baseURL: Services.prefs.getStringPref(this.prefRoot + "aiBaseURL", "https://api.openai.com/v1").replace(/\/$/, ""),
			model: Services.prefs.getStringPref(this.prefRoot + "aiModel", "gpt-4.1-mini"),
		};
	}
	async getKey() {
		return Services.logins.findLogins("library-ai://model", null, "Library AI")[0]?.password || "";
	}
	async save({ preset, baseURL, model, apiKey }) {
		if (!/^https?:\/\//i.test(baseURL)) throw new Error("请填写有效的接口地址");
		if (!model.trim()) throw new Error("请填写模型 ID");
		Services.prefs.setStringPref(this.prefRoot + "aiProvider", preset || "custom");
		Services.prefs.setStringPref(this.prefRoot + "aiBaseURL", baseURL.replace(/\/$/, ""));
		Services.prefs.setStringPref(this.prefRoot + "aiModel", model.trim());
		if (apiKey) {
			let origin = "library-ai://model", realm = "Library AI";
			let logins = Services.logins.findLogins(origin, null, realm);
			let LoginInfo = new Components.Constructor(
				"@mozilla.org/login-manager/loginInfo;1",
				Components.interfaces.nsILoginInfo,
				"init",
			);
			let loginInfo = new LoginInfo(origin, null, realm, "api", apiKey, "", "");
			if (logins.length) {
				Services.logins.modifyLogin(logins[0], loginInfo);
				for (let login of logins.slice(1)) Services.logins.removeLogin(login);
			}
			else {
				await Services.logins.addLoginAsync(loginInfo);
			}
		}
		return this.config;
	}
	async request(path, options = {}) {
		let config = this.config;
		let key = await this.getKey();
		let headers = { "Content-Type": "application/json", ...(options.headers || {}) };
		if (key) headers.Authorization = `Bearer ${key}`;
		return fetch(`${config.baseURL}${path}`, { ...options, headers });
	}
	async test() {
		let response = await this.request("/models", { method: "GET" });
		if (!response.ok) throw new Error(`连接失败（${response.status}）`);
		return true;
	}

	// —— 模型列表自动抓取（OpenAI 兼容标准：URL + Key → GET /models）——
	// 归一化策略对齐 Claudian extractModels 的宽松风格：兼容 {data:[{id}]}、
	// {models:[...]} 与裸数组三种返回形态，去重排序后按 baseURL 缓存。
	async listModels() {
		let response = await this.request("/models", { method: "GET" });
		if (!response.ok) throw new Error(`模型列表抓取失败（${response.status}）`);
		let data = await response.json();
		let raw = Array.isArray(data) ? data : (data.data || data.models || data.available_models || []);
		let ids = [...new Set(raw.map(item => typeof item === "string" ? item : item?.id).filter(Boolean))];
		ids.sort((a, b) => a.localeCompare(b));
		return ids;
	}

	get modelCache() {
		try { return JSON.parse(Services.prefs.getStringPref(this.prefRoot + "aiModelCache", "{}")); }
		catch (_) { return {}; }
	}

	getCachedModels() {
		return this.modelCache[this.config.baseURL]?.models || [];
	}

	cacheStale(maxAgeMs = 10 * 60 * 1000) {
		let entry = this.modelCache[this.config.baseURL];
		return !entry || Date.now() - entry.fetchedAt > maxAgeMs;
	}

	async fetchModels() {
		let models = await this.listModels();
		let cache = this.modelCache;
		cache[this.config.baseURL] = { models, fetchedAt: Date.now() };
		Services.prefs.setStringPref(this.prefRoot + "aiModelCache", JSON.stringify(cache));
		return models;
	}
	async stream(messages, { signal, onDelta, onReasoning, window }) {
		let { model } = this.config;
		let response = await this.request("/chat/completions", {
			method: "POST", signal,
			body: JSON.stringify({ model, temperature: 0.2, stream: true, messages }),
		});
		if (!response.ok) {
			let detail = "";
			try { detail = (await response.json())?.error?.message || ""; } catch (_) {}
			throw new Error(detail || `模型接口返回 ${response.status}`);
		}
		if (!response.body?.getReader) {
			let data = await response.json();
			let content = data.choices?.[0]?.message?.content || "";
			if (!content) throw new Error("模型没有返回正文");
			onDelta(content);
			return content;
		}
		// bootstrap 沙箱里未必有 TextDecoder/AbortController 等 DOM 构造器，优先从窗口取
		let TextDecoderImpl = typeof TextDecoder !== "undefined" ? TextDecoder : window?.TextDecoder;
		let reader = response.body.getReader(), decoder = new TextDecoderImpl(), buffer = "", result = "";
		while (true) {
			let { value, done } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			let lines = buffer.split(/\r?\n/); buffer = lines.pop() || "";
			for (let line of lines) {
				if (!line.startsWith("data:")) continue;
				let payload = line.slice(5).trim();
				if (!payload || payload === "[DONE]") continue;
				try {
					// 推理型模型（如 DeepSeek-V4-Flash/R1）会先长时间输出
					// reasoning_content 再输出 content，两者都要处理，否则
					// 整个推理阶段界面看起来完全卡死。
					let delta = JSON.parse(payload).choices?.[0]?.delta || {};
					let thinking = delta.reasoning_content || "";
					let text = delta.content || "";
					if (thinking) onReasoning?.(thinking);
					if (text) { result += text; onDelta(text); }
				} catch (_) {}
			}
		}
		if (!result) throw new Error("模型没有返回正文");
		return result;
	}
};
