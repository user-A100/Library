// Library AI 多配置档案适配器
// 存储模型：prefs 里的 aiProfiles（JSON 数组，不含密钥）+ aiActiveProfile（当前档案 id），
// 每个档案的 API Key 存系统凭据库（LoginManager），origin 为 library-ai://model/<id>。
// 兼容：0.15.x 之前的单配置（aiProvider/aiBaseURL/aiModel + library-ai://model 密钥）
// 在首次读取时自动迁移为 default 档案。
LibraryAIProviderAdapter = class LibraryAIProviderAdapter {
	constructor(prefRoot) { this.prefRoot = prefRoot; }
	get presets() {
		return {
			openai: ["OpenAI", "https://api.openai.com/v1", "gpt-4.1-mini", "openai"],
			anthropic: ["Anthropic Claude", "https://api.anthropic.com", "claude-sonnet-4-20250514", "anthropic"],
			deepseek: ["DeepSeek", "https://api.deepseek.com/v1", "deepseek-chat", "openai"],
			openrouter: ["OpenRouter", "https://openrouter.ai/api/v1", "openai/gpt-4.1-mini", "openai"],
			moonshot: ["Moonshot / Kimi 开放平台", "https://api.moonshot.cn/v1", "moonshot-v1-32k", "openai"],
			"kimi-code": ["Kimi Code（Claude 兼容）", "https://api.kimi.com/coding", "k3", "anthropic"],
			zhipu: ["智谱 GLM", "https://open.bigmodel.cn/api/paas/v4", "glm-4-flash", "openai"],
			"zhipu-coding": ["智谱 Coding Plan（Claude 兼容）", "https://open.bigmodel.cn/api/anthropic", "glm-5.2", "anthropic"],
			ollama: ["Ollama / LM Studio", "http://127.0.0.1:11434/v1", "qwen2.5:7b", "openai"],
			custom: ["自定义兼容接口", "", "", "openai"],
		};
	}

	get protocols() {
		return {
			openai: "OpenAI Chat Completions",
			anthropic: "Anthropic Messages",
		};
	}

	_inferProtocol({ protocol, preset, baseURL } = {}) {
		if (protocol === "openai" || protocol === "anthropic") return protocol;
		let url = String(baseURL || "").toLowerCase().replace(/\/+$/, "");
		if (/\/anthropic(?:\/v1)?$/.test(url) || /api\.anthropic\.com$/.test(url) || /api\.kimi\.com\/coding$/.test(url)) {
			return "anthropic";
		}
		let presetProtocol = this.presets[preset]?.[3];
		if (presetProtocol) return presetProtocol;
		return "openai";
	}

	_normalizeModel(baseURL, model) {
		let value = String(model || "").trim();
		if (/api\.kimi\.com\/coding/i.test(baseURL || "")) value = value.replace(/\[1m\]$/i, "");
		return value;
	}

	// —— 配置档案存储 ——
	_keyOrigin(id) { return `library-ai://model/${id}`; }

	_readProfiles() {
		let profiles = [];
		try { profiles = JSON.parse(Services.prefs.getStringPref(this.prefRoot + "aiProfiles", "[]")); }
		catch (_) { profiles = []; }
		if (!Array.isArray(profiles)) profiles = [];
		if (!profiles.length) profiles = this._migrateLegacy();
		let changed = false;
		profiles = profiles.map(profile => {
			let protocol = this._inferProtocol(profile);
			let baseURL = String(profile.baseURL || "").replace(/\/+$/, "");
			let model = this._normalizeModel(baseURL, profile.model);
			if (profile.protocol === protocol && profile.baseURL === baseURL && profile.model === model) return profile;
			changed = true;
			return { ...profile, protocol, baseURL, model };
		});
		if (changed) this._writeProfiles(profiles);
		return profiles;
	}

	_writeProfiles(profiles) {
		Services.prefs.setStringPref(this.prefRoot + "aiProfiles", JSON.stringify(profiles));
	}

	_migrateLegacy() {
		let preset = Services.prefs.getStringPref(this.prefRoot + "aiProvider", "openai");
		let baseURL = Services.prefs.getStringPref(this.prefRoot + "aiBaseURL", "https://api.openai.com/v1").replace(/\/$/, "");
		let model = Services.prefs.getStringPref(this.prefRoot + "aiModel", "gpt-4.1-mini");
		let protocol = this._inferProtocol({ preset, baseURL });
		let legacyKey = Services.logins.findLogins("library-ai://model", null, "Library AI")[0];
		let name = this.presets[preset]?.[0] || "默认配置";
		let legacyCache = {};
		try { legacyCache = JSON.parse(Services.prefs.getStringPref(this.prefRoot + "aiModelCache", "{}")); }
		catch (_) {}
		let profiles = [{
			id: "default", name, preset, protocol, baseURL, model,
			models: legacyCache[baseURL]?.models || [], fetchedAt: legacyCache[baseURL]?.fetchedAt || 0,
		}];
		this._writeProfiles(profiles);
		Services.prefs.setStringPref(this.prefRoot + "aiActiveProfile", "default");
		if (legacyKey) {
			this._writeKey("default", legacyKey.password)
				.then(() => { try { Services.logins.removeLogin(legacyKey); } catch (_) {} })
				.catch(error => Zotero.logError(error));
		}
		return profiles;
	}

	get profiles() { return this._readProfiles(); }

	get activeId() {
		let profiles = this._readProfiles();
		let id = Services.prefs.getStringPref(this.prefRoot + "aiActiveProfile", "");
		return profiles.some(p => p.id === id) ? id : profiles[0]?.id || "";
	}

	get activeProfile() {
		let profiles = this._readProfiles();
		return profiles.find(p => p.id === this.activeId) || profiles[0] || null;
	}

	// 兼容旧消费方（侧栏快捷设置 / 对话流）：config 始终指向当前活动档案
	get config() {
		let profile = this.activeProfile || { preset: "openai", protocol: "openai", baseURL: "https://api.openai.com/v1", model: "gpt-4.1-mini" };
		return {
			preset: profile.preset,
			protocol: this._inferProtocol(profile),
			baseURL: profile.baseURL.replace(/\/+$/, ""),
			model: profile.model,
		};
	}

	listProfiles() {
		let activeId = this.activeId;
		let legacyKey = Services.logins.findLogins("library-ai://model", null, "Library AI")[0]?.password;
		return this._readProfiles().map(p => ({
			...p, active: p.id === activeId,
			hasKey: Boolean(Services.logins.findLogins(this._keyOrigin(p.id), null, "Library AI")[0]?.password || (p.id === "default" && legacyKey)),
		}));
	}

	getProfile(id) { return this._readProfiles().find(p => p.id === id) || null; }

	async getKey(id = this.activeId) {
		if (!id) return "";
		let key = Services.logins.findLogins(this._keyOrigin(id), null, "Library AI")[0]?.password || "";
		// 0.15.x 升级时可能已写入 profiles，但旧密钥仍留在无 profile 后缀的 origin。
		// default 档案在首次实际请求时兼容读取并完成迁移，避免界面显示“已配置”却请求无 Key。
		if (!key && id === "default") {
			let legacy = Services.logins.findLogins("library-ai://model", null, "Library AI")[0];
			if (legacy?.password) {
				key = legacy.password;
				try { await this._writeKey(id, key); Services.logins.removeLogin(legacy); } catch (_) {}
			}
		}
		return key;
	}

	async _writeKey(id, apiKey) {
		let origin = this._keyOrigin(id), realm = "Library AI";
		let logins = Services.logins.findLogins(origin, null, realm);
		let LoginInfo = new Components.Constructor(
			"@mozilla.org/login-manager/loginInfo;1", Components.interfaces.nsILoginInfo, "init",
		);
		let loginInfo = new LoginInfo(origin, null, realm, "api", apiKey, "", "");
		if (logins.length) {
			Services.logins.modifyLogin(logins[0], loginInfo);
			for (let login of logins.slice(1)) Services.logins.removeLogin(login);
		}
		else if (typeof Services.logins.addLoginAsync === "function") {
			await Services.logins.addLoginAsync(loginInfo);
		}
		else if (typeof Services.logins.addLogin === "function") {
			Services.logins.addLogin(loginInfo);
		}
		else {
			throw new Error("当前 Zotero 运行时不支持保存系统凭据");
		}
	}

	_validate({ name, preset, protocol, baseURL, model }) {
		if (!/^https?:\/\//i.test(baseURL || "")) throw new Error("请填写有效的接口地址");
		if (!String(model || "").trim()) throw new Error("请填写模型 ID");
		if (protocol && !this.protocols[protocol]) throw new Error("不支持的 API 协议");
		let cleanBaseURL = baseURL.replace(/\/+$/, "");
		return {
			name: String(name || "").trim() || this.presets[preset]?.[0] || baseURL.replace(/^https?:\/\//, "").split("/")[0],
			preset: preset || "custom",
			protocol: this._inferProtocol({ protocol, preset, baseURL: cleanBaseURL }),
			baseURL: cleanBaseURL,
			model: this._normalizeModel(cleanBaseURL, model),
		};
	}

	async upsertProfile({ id, name, preset, protocol, baseURL, model, apiKey }) {
		let clean = this._validate({ name, preset, protocol, baseURL, model });
		let profiles = this._readProfiles();
		let profile = profiles.find(p => p.id === id);
		if (profile) Object.assign(profile, clean);
		else {
			profile = { id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, models: [], fetchedAt: 0, ...clean };
			profiles.push(profile);
		}
		if (apiKey) await this._writeKey(profile.id, apiKey);
		this._writeProfiles(profiles);
		if (!this.activeId) Services.prefs.setStringPref(this.prefRoot + "aiActiveProfile", profile.id);
		return profile;
	}

	async deleteProfile(id) {
		let profiles = this._readProfiles().filter(p => p.id !== id);
		this._writeProfiles(profiles);
		let logins = Services.logins.findLogins(this._keyOrigin(id), null, "Library AI");
		for (let login of logins) Services.logins.removeLogin(login);
		if (this.activeId === id) {
			Services.prefs.setStringPref(this.prefRoot + "aiActiveProfile", profiles[0]?.id || "");
		}
	}

	setActiveProfile(id) {
		if (!this._readProfiles().some(p => p.id === id)) throw new Error("配置不存在");
		Services.prefs.setStringPref(this.prefRoot + "aiActiveProfile", id);
	}

	// 兼容旧 save()：更新当前活动档案
	async save({ preset, protocol, baseURL, model, apiKey }) {
		let active = this.activeProfile;
		let resolvedProtocol = protocol || this.presets[preset]?.[3] || active?.protocol;
		return this.upsertProfile({ id: active?.id, name: active?.name, preset, protocol: resolvedProtocol, baseURL, model, apiKey });
	}

	// —— 请求（baseURL/apiKey 可覆盖，用于对未激活档案做测试与抓取）——
	_endpoint(baseURL, path) {
		let base = String(baseURL || "").replace(/\/+$/, "");
		if (base.endsWith(path)) return base;
		if (base.endsWith("/v1") && path.startsWith("/v1/")) return `${base}${path.slice(3)}`;
		return `${base}${path}`;
	}

	async request(path, options = {}) {
		let { baseURL, apiKey, protocol, ...fetchOptions } = options;
		baseURL = (baseURL || this.config.baseURL).replace(/\/+$/, "");
		protocol = this._inferProtocol({ protocol: protocol || this.config.protocol, baseURL });
		let key = apiKey !== undefined ? apiKey : await this.getKey();
		let headers = { "Content-Type": "application/json", ...(fetchOptions.headers || {}) };
		if (key) {
			if (protocol === "anthropic") headers["x-api-key"] = key;
			else headers.Authorization = `Bearer ${key}`;
		}
		if (protocol === "anthropic") headers["anthropic-version"] ||= "2023-06-01";
		return fetch(this._endpoint(baseURL, path), { ...fetchOptions, headers });
	}

	async _errorDetail(response, fallback) {
		let detail = "";
		try {
			let data = await response.json();
			detail = data?.error?.message || data?.message || "";
		} catch (_) {}
		return detail || `${fallback}（${response.status}）`;
	}

	async test({ baseURL, apiKey, protocol, model } = {}) {
		protocol = this._inferProtocol({ protocol: protocol || (!baseURL ? this.config.protocol : undefined), baseURL: baseURL || this.config.baseURL });
		if (protocol === "anthropic") {
			model = this._normalizeModel(baseURL, model || this.config.model);
			let response = await this.request("/v1/messages", {
				method: "POST", baseURL, apiKey, protocol,
				body: JSON.stringify({ model, max_tokens: 8, stream: false, messages: [{ role: "user", content: "Hi" }] }),
			});
			if (!response.ok) throw new Error(await this._errorDetail(response, "连接失败"));
			let payload;
			try { payload = await response.json(); }
			catch (_) { throw new Error("连接返回的不是有效 JSON"); }
			if (!Array.isArray(payload?.content)) throw new Error(payload?.error?.message || "Anthropic Messages 返回格式无效");
			return true;
		}
		let response = await this.request("/models", { method: "GET", baseURL, apiKey, protocol });
		if (!response.ok) throw new Error(await this._errorDetail(response, "连接失败"));
		return true;
	}

	// —— 模型列表自动抓取（OpenAI 兼容标准：URL + Key → GET /models）——
	// 归一化策略对齐 Claudian extractModels 的宽松风格：兼容 {data:[{id}]}、
	// {models:[...]} 与裸数组三种返回形态，去重排序后存回对应档案。
	async listModels({ baseURL, apiKey, protocol } = {}) {
		protocol = this._inferProtocol({ protocol: protocol || (!baseURL ? this.config.protocol : undefined), baseURL: baseURL || this.config.baseURL });
		let path = protocol === "anthropic" ? "/v1/models" : "/models";
		let response = await this.request(path, { method: "GET", baseURL, apiKey, protocol });
		if (!response.ok) throw new Error(await this._errorDetail(response, protocol === "anthropic" ? "该 Anthropic 兼容接口不支持抓取模型列表，请手动填写模型 ID" : "模型列表抓取失败"));
		let data = await response.json();
		let raw = Array.isArray(data) ? data : (data.data || data.models || data.available_models || []);
		let ids = [...new Set(raw.map(item => typeof item === "string" ? item : item?.id).filter(Boolean))];
		ids.sort((a, b) => a.localeCompare(b));
		return ids;
	}

	getCachedModels() { return this.activeProfile?.models || []; }

	getEmbeddingModel() {
		let models = this.getCachedModels();
		return models.find(model => /embedding/i.test(model)) || null;
	}

	async embed(inputs, { model } = {}) {
		if (this.config.protocol === "anthropic") throw new Error("Anthropic Messages 协议不提供 OpenAI embeddings 接口");
		model ||= this.getEmbeddingModel();
		if (!model) throw new Error("当前接口未发现 embedding 模型");
		let list = Array.isArray(inputs) ? inputs : [inputs];
		let response = await this.request("/embeddings", {
			method: "POST",
			body: JSON.stringify({ model, input: list }),
		});
		if (!response.ok) {
			let detail = ""; try { detail = (await response.json())?.error?.message || ""; } catch (_) {}
			throw new Error(detail || `Embedding 接口返回 ${response.status}`);
		}
		let payload = await response.json();
		let rows = (payload.data || []).sort((a, b) => (a.index || 0) - (b.index || 0));
		if (rows.length !== list.length || rows.some(row => !Array.isArray(row.embedding))) throw new Error("Embedding 返回格式无效");
		return rows.map(row => row.embedding);
	}

	// 供设置页使用：把表单里抓取到的模型列表存回指定档案
	storeModels(profileId, models) {
		let profiles = this._readProfiles();
		let target = profiles.find(p => p.id === profileId);
		if (target) { target.models = models; target.fetchedAt = Date.now(); this._writeProfiles(profiles); }
	}

	cacheStale(maxAgeMs = 10 * 60 * 1000) {
		let fetchedAt = this.activeProfile?.fetchedAt || 0;
		return Date.now() - fetchedAt > maxAgeMs;
	}

	async fetchModels(profileId = this.activeId) {
		let profile = this.getProfile(profileId);
		if (!profile) throw new Error("配置不存在");
		let models = await this.listModels({ baseURL: profile.baseURL, apiKey: await this.getKey(profile.id), protocol: profile.protocol });
		let profiles = this._readProfiles();
		let target = profiles.find(p => p.id === profile.id);
		if (target) { target.models = models; target.fetchedAt = Date.now(); this._writeProfiles(profiles); }
		return models;
	}

	async _readSSE(response, window, onPayload) {
		// bootstrap 沙箱里未必有 TextDecoder/AbortController 等 DOM 构造器，优先从窗口取。
		let TextDecoderImpl = typeof TextDecoder !== "undefined" ? TextDecoder : window?.TextDecoder;
		if (!TextDecoderImpl) throw new Error("当前运行环境不支持流式文本解码");
		let reader = response.body.getReader(), decoder = new TextDecoderImpl(), buffer = "";
		let consumeLine = line => {
			if (!line.startsWith("data:")) return;
			let payload = line.slice(5).trim();
			if (payload && payload !== "[DONE]") onPayload(payload);
		};
		while (true) {
			let { value, done } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			let lines = buffer.split(/\r?\n/); buffer = lines.pop() || "";
			for (let line of lines) consumeLine(line);
		}
		buffer += decoder.decode();
		if (buffer) consumeLine(buffer);
	}

	_openAIMessageParts(message = {}) {
		let reasoning = [message.reasoning_content, message.reasoning, message.thinking].find(value => typeof value === "string") || "";
		let content = typeof message.content === "string"
			? message.content
			: (message.content || []).filter(part => part?.type === "text").map(part => part.text || "").join("");
		return { reasoning, content };
	}

	_anthropicMessageParts(data = {}) {
		let reasoning = "", content = "";
		for (let block of data.content || []) {
			if (block?.type === "text") content += block.text || "";
			if (block?.type === "thinking") reasoning += block.thinking || "";
		}
		return { reasoning, content };
	}

	_anthropicRequest(messages, model) {
		let system = messages.filter(message => message.role === "system").map(message => String(message.content || "")).join("\n\n");
		let conversation = messages.filter(message => message.role !== "system").map(message => ({
			role: message.role === "assistant" ? "assistant" : "user",
			content: message.content,
		}));
		return { model: this._normalizeModel(this.config.baseURL, model), max_tokens: 4096, stream: true, ...(system ? { system } : {}), messages: conversation };
	}

	_isEventStream(response) {
		let contentType = response.headers?.get?.("content-type") || "";
		if (contentType) return /text\/event-stream/i.test(contentType) && Boolean(response.body?.getReader);
		return Boolean(response.body?.getReader);
	}

	async _streamOpenAI(messages, { signal, onDelta, onReasoning, window }) {
		let { model } = this.config;
		let response = await this.request("/chat/completions", {
			method: "POST", signal, protocol: "openai",
			body: JSON.stringify({ model, temperature: 0.2, stream: true, messages }),
		});
		if (!response.ok) throw new Error(await this._errorDetail(response, "模型接口调用失败"));
		if (!this._isEventStream(response)) {
			let { reasoning, content } = this._openAIMessageParts((await response.json()).choices?.[0]?.message || {});
			if (!content) throw new Error("模型没有返回正文");
			if (reasoning) onReasoning?.(reasoning);
			onDelta(content);
			return content;
		}
		let result = "";
		await this._readSSE(response, window, payload => {
			let data;
			try { data = JSON.parse(payload); } catch (_) { return; }
			if (data.error) throw new Error(data.error.message || "OpenAI 流式接口返回错误");
			let { reasoning, content } = this._openAIMessageParts(data.choices?.[0]?.delta || {});
			if (reasoning) onReasoning?.(reasoning);
			if (content) { result += content; onDelta(content); }
		});
		if (!result) throw new Error("模型没有返回正文");
		return result;
	}

	async _streamAnthropic(messages, { signal, onDelta, onReasoning, window }) {
		let { model } = this.config;
		let response = await this.request("/v1/messages", {
			method: "POST", signal, protocol: "anthropic",
			body: JSON.stringify(this._anthropicRequest(messages, model)),
		});
		if (!response.ok) throw new Error(await this._errorDetail(response, "模型接口调用失败"));
		if (!this._isEventStream(response)) {
			let { reasoning, content } = this._anthropicMessageParts(await response.json());
			if (!content) throw new Error("模型没有返回正文");
			if (reasoning) onReasoning?.(reasoning);
			onDelta(content);
			return content;
		}
		let result = "";
		await this._readSSE(response, window, payload => {
			let data;
			try { data = JSON.parse(payload); } catch (_) { return; }
			if (data.type === "error") throw new Error(data.error?.message || "Anthropic 流式接口返回错误");
			let delta = data.type === "content_block_start" ? data.content_block : data.delta;
			let reasoning = delta?.type === "thinking_delta" ? delta.thinking || "" : (delta?.type === "thinking" ? delta.thinking || "" : "");
			let content = delta?.type === "text_delta" ? delta.text || "" : (delta?.type === "text" ? delta.text || "" : "");
			if (reasoning) onReasoning?.(reasoning);
			if (content) { result += content; onDelta(content); }
		});
		if (!result) throw new Error("模型没有返回正文");
		return result;
	}

	async stream(messages, options) {
		return this.config.protocol === "anthropic"
			? this._streamAnthropic(messages, options)
			: this._streamOpenAI(messages, options);
	}
};
