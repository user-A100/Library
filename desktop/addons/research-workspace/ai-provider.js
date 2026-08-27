// Library AI 多配置档案适配器
// 存储模型：prefs 里的 aiProfiles（JSON 数组，不含密钥）+ aiActiveProfile（当前档案 id），
// 每个档案的 API Key 存系统凭据库（LoginManager），origin 为 library-ai://model/<id>。
// 兼容：0.15.x 之前的单配置（aiProvider/aiBaseURL/aiModel + library-ai://model 密钥）
// 在首次读取时自动迁移为 default 档案。
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

	// —— 配置档案存储 ——
	_keyOrigin(id) { return `library-ai://model/${id}`; }

	_readProfiles() {
		let profiles = [];
		try { profiles = JSON.parse(Services.prefs.getStringPref(this.prefRoot + "aiProfiles", "[]")); }
		catch (_) { profiles = []; }
		if (!Array.isArray(profiles)) profiles = [];
		if (!profiles.length) profiles = this._migrateLegacy();
		return profiles;
	}

	_writeProfiles(profiles) {
		Services.prefs.setStringPref(this.prefRoot + "aiProfiles", JSON.stringify(profiles));
	}

	_migrateLegacy() {
		let preset = Services.prefs.getStringPref(this.prefRoot + "aiProvider", "openai");
		let baseURL = Services.prefs.getStringPref(this.prefRoot + "aiBaseURL", "https://api.openai.com/v1").replace(/\/$/, "");
		let model = Services.prefs.getStringPref(this.prefRoot + "aiModel", "gpt-4.1-mini");
		let legacyKey = Services.logins.findLogins("library-ai://model", null, "Library AI")[0];
		let name = this.presets[preset]?.[0] || "默认配置";
		let legacyCache = {};
		try { legacyCache = JSON.parse(Services.prefs.getStringPref(this.prefRoot + "aiModelCache", "{}")); }
		catch (_) {}
		let profiles = [{
			id: "default", name, preset, baseURL, model,
			models: legacyCache[baseURL]?.models || [], fetchedAt: legacyCache[baseURL]?.fetchedAt || 0,
		}];
		this._writeProfiles(profiles);
		Services.prefs.setStringPref(this.prefRoot + "aiActiveProfile", "default");
		if (legacyKey) {
			this._writeKey("default", legacyKey.password);
			try { Services.logins.removeLogin(legacyKey); } catch (_) {}
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
		let profile = this.activeProfile || { preset: "openai", baseURL: "https://api.openai.com/v1", model: "gpt-4.1-mini" };
		return { preset: profile.preset, baseURL: profile.baseURL.replace(/\/$/, ""), model: profile.model };
	}

	listProfiles() {
		let activeId = this.activeId;
		return this._readProfiles().map(p => ({
			...p, active: p.id === activeId,
			hasKey: Boolean(Services.logins.findLogins(this._keyOrigin(p.id), null, "Library AI")[0]?.password),
		}));
	}

	getProfile(id) { return this._readProfiles().find(p => p.id === id) || null; }

	async getKey(id = this.activeId) {
		if (!id) return "";
		return Services.logins.findLogins(this._keyOrigin(id), null, "Library AI")[0]?.password || "";
	}

	_writeKey(id, apiKey) {
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
		else {
			Services.logins.addLogin(loginInfo);
		}
	}

	_validate({ name, preset, baseURL, model }) {
		if (!/^https?:\/\//i.test(baseURL || "")) throw new Error("请填写有效的接口地址");
		if (!String(model || "").trim()) throw new Error("请填写模型 ID");
		return {
			name: String(name || "").trim() || this.presets[preset]?.[0] || baseURL.replace(/^https?:\/\//, "").split("/")[0],
			preset: preset || "custom",
			baseURL: baseURL.replace(/\/$/, ""),
			model: String(model).trim(),
		};
	}

	async upsertProfile({ id, name, preset, baseURL, model, apiKey }) {
		let clean = this._validate({ name, preset, baseURL, model });
		let profiles = this._readProfiles();
		let profile = profiles.find(p => p.id === id);
		if (profile) Object.assign(profile, clean);
		else {
			profile = { id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, models: [], fetchedAt: 0, ...clean };
			profiles.push(profile);
		}
		if (apiKey) this._writeKey(profile.id, apiKey);
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
	async save({ preset, baseURL, model, apiKey }) {
		let active = this.activeProfile;
		return this.upsertProfile({ id: active?.id, name: active?.name, preset, baseURL, model, apiKey });
	}

	// —— 请求（baseURL/apiKey 可覆盖，用于对未激活档案做测试与抓取）——
	async request(path, options = {}) {
		let { baseURL, apiKey, ...fetchOptions } = options;
		baseURL = (baseURL || this.config.baseURL).replace(/\/$/, "");
		let key = apiKey !== undefined ? apiKey : await this.getKey();
		let headers = { "Content-Type": "application/json", ...(fetchOptions.headers || {}) };
		if (key) headers.Authorization = `Bearer ${key}`;
		return fetch(`${baseURL}${path}`, { ...fetchOptions, headers });
	}

	async test({ baseURL, apiKey } = {}) {
		let response = await this.request("/models", { method: "GET", baseURL, apiKey });
		if (!response.ok) throw new Error(`连接失败（${response.status}）`);
		return true;
	}

	// —— 模型列表自动抓取（OpenAI 兼容标准：URL + Key → GET /models）——
	// 归一化策略对齐 Claudian extractModels 的宽松风格：兼容 {data:[{id}]}、
	// {models:[...]} 与裸数组三种返回形态，去重排序后存回对应档案。
	async listModels({ baseURL, apiKey } = {}) {
		let response = await this.request("/models", { method: "GET", baseURL, apiKey });
		if (!response.ok) throw new Error(`模型列表抓取失败（${response.status}）`);
		let data = await response.json();
		let raw = Array.isArray(data) ? data : (data.data || data.models || data.available_models || []);
		let ids = [...new Set(raw.map(item => typeof item === "string" ? item : item?.id).filter(Boolean))];
		ids.sort((a, b) => a.localeCompare(b));
		return ids;
	}

	getCachedModels() { return this.activeProfile?.models || []; }

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
		let models = await this.listModels({ baseURL: profile.baseURL, apiKey: await this.getKey(profile.id) });
		let profiles = this._readProfiles();
		let target = profiles.find(p => p.id === profile.id);
		if (target) { target.models = models; target.fetchedAt = Date.now(); this._writeProfiles(profiles); }
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
