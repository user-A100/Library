// 侧栏内设置标签：模型连接（多 Profile）/ 可用模型 / 高级（系统提示词）。
// 与外部 preferences-ai 面板共用 LibraryAIProviderAdapter，两边互通。
LibraryAISettingsTab = class LibraryAISettingsTab {
	constructor(host) {
		this.host = host;
		this.defaultSystemPrompt = "你是 Library 的论文阅读助手。优先依据提供的论文片段回答；每个可核验结论后使用形如 [[S1-C1]] 的引用标记。只能使用给定 citation ID；没有可靠页码时不要猜测页码。涉及某一节的内容、方法或结论时，必须引用该节正文片段，不得用引言中的目录、结构预告或摘要代替。若没有该节正文证据，应明确说明材料不足。使用清晰的中文 Markdown。";
	}

	get prefRoot() { return this.host.workspace.aiPrefRoot; }

	systemPrompt() {
		return Services.prefs.getStringPref(this.prefRoot + "aiSystemPrompt", this.defaultSystemPrompt);
	}

	html(doc, name) { return doc.createElementNS("http://www.w3.org/1999/xhtml", name); }

	render(window) {
		let state = this.host.windows.get(window); if (!state) return;
		let panel = state.view.querySelector('[data-tab-panel="setting"]');
		if (!panel) return;
		panel.textContent = "";
		let doc = panel.ownerDocument;
		let scroll = this.html(doc, "div"); scroll.className = "library-ai-settings-scroll";
		scroll.append(
			this.connectionCard(window, doc),
			this.modelsCard(window, doc),
			this.advancedCard(window, doc),
		);
		panel.append(scroll);
		let more = this.html(doc, "button");
		more.type = "button"; more.className = "library-ai-settings-more"; more.textContent = "打开完整配置面板（导入 / 导出）→";
		more.addEventListener("click", () => Zotero.Utilities.Internal.openPreferences("research-workspace-ai"));
		panel.append(more);
		this.fill(window, doc);
	}

	card(doc, title, subtitle) {
		let details = this.html(doc, "details"); details.className = "library-ai-set-card"; details.open = true;
		let summary = this.html(doc, "summary");
		let strong = this.html(doc, "strong"); strong.textContent = title;
		let small = this.html(doc, "small"); small.textContent = subtitle;
		summary.append(strong, small); details.append(summary);
		let body = this.html(doc, "div"); body.className = "library-ai-set-card-body"; details.append(body);
		return { details, body };
	}

	field(doc, label, control, hint = "") {
		let field = this.html(doc, "label"); field.className = "library-ai-field";
		let span = this.html(doc, "span"); span.textContent = label;
		if (hint) { let small = this.html(doc, "small"); small.textContent = hint; span.append(small); }
		field.append(span, control);
		return field;
	}

	// —— 卡片 1：模型连接（Profile 选择 + 预设/协议/地址/模型/密钥 + 保存测试）——
	connectionCard(window, doc) {
		let { details, body } = this.card(doc, "模型连接", "提供商 · API 协议 · 接口地址 · 密钥");
		let profileSelect = this.html(doc, "select"); profileSelect.dataset.aiField = "profile";
		let profileRow = this.html(doc, "div"); profileRow.className = "library-ai-set-profile-row";
		profileRow.append(profileSelect);
		let newButton = this.html(doc, "button"); newButton.type = "button"; newButton.textContent = "新建"; newButton.dataset.aiAction = "new-profile";
		let deleteButton = this.html(doc, "button"); deleteButton.type = "button"; deleteButton.textContent = "删除"; deleteButton.dataset.aiAction = "delete-profile";
		profileRow.append(newButton, deleteButton);
		body.append(profileRow);

		let preset = this.html(doc, "select"); preset.dataset.aiField = "preset";
		for (let [id, [name]] of Object.entries(this.host.provider.presets)) {
			let option = this.html(doc, "option"); option.value = id; option.textContent = name; preset.append(option);
		}
		preset.addEventListener("change", () => {
			let chosen = this.host.provider.presets[preset.value]; if (!chosen) return;
			doc.querySelector('[data-tab-panel="setting"] [data-ai-field="baseURL"]').value = chosen[1];
			doc.querySelector('[data-tab-panel="setting"] [data-ai-field="model"]').value = chosen[2];
			doc.querySelector('[data-tab-panel="setting"] [data-ai-field="protocol"]').value = chosen[3];
		});
		let protocol = this.html(doc, "select"); protocol.dataset.aiField = "protocol";
		for (let [id, name] of Object.entries(this.host.provider.protocols)) {
			let option = this.html(doc, "option"); option.value = id; option.textContent = name; protocol.append(option);
		}
		let baseURL = this.html(doc, "input"); baseURL.type = "url"; baseURL.spellcheck = false; baseURL.placeholder = "https://api.example.com/v1"; baseURL.dataset.aiField = "baseURL";
		let model = this.html(doc, "input"); model.type = "text"; model.spellcheck = false; model.placeholder = "选择或输入模型 ID"; model.dataset.aiField = "model";
		let datalist = this.html(doc, "datalist"); datalist.id = "library-ai-settings-model-list"; model.setAttribute("list", datalist.id);
		let apiKey = this.html(doc, "input"); apiKey.type = "password"; apiKey.autocomplete = "off"; apiKey.placeholder = "留空则保留现有密钥"; apiKey.dataset.aiField = "apiKey";
		body.append(
			this.field(doc, "提供商预设", preset),
			this.field(doc, "API 协议", protocol),
			this.field(doc, "接口地址", baseURL),
			this.field(doc, "模型 ID", model),
			this.field(doc, "API 密钥", apiKey, "安全保存到系统凭据"),
			datalist,
		);
		let status = this.html(doc, "div"); status.className = "library-ai-set-status"; status.dataset.aiRole = "status"; status.setAttribute("role", "status");
		let actions = this.html(doc, "div"); actions.className = "library-ai-set-actions";
		let fetchButton = this.html(doc, "button"); fetchButton.type = "button"; fetchButton.textContent = "抓取模型列表"; fetchButton.dataset.aiAction = "fetch-models";
		let saveButton = this.html(doc, "button"); saveButton.type = "button"; saveButton.className = "primary"; saveButton.textContent = "保存并测试"; saveButton.dataset.aiAction = "save";
		actions.append(fetchButton, saveButton);
		body.append(status, actions);

		profileSelect.addEventListener("change", () => this.fill(window, doc));
		newButton.addEventListener("click", () => this.newProfile(window, doc));
		deleteButton.addEventListener("click", () => this.deleteProfile(window, doc, profileSelect.value));
		fetchButton.addEventListener("click", () => this.fetchModels(window, doc));
		saveButton.addEventListener("click", () => this.save(window, doc));
		return details;
	}

	// —— 卡片 2：可用模型（当前 Profile 缓存列表，点击切换）——
	modelsCard(window, doc) {
		let { details, body } = this.card(doc, "可用模型", "当前配置抓取到的模型，点击切换");
		let list = this.html(doc, "div"); list.className = "library-ai-set-models"; list.dataset.aiRole = "models";
		let hint = this.html(doc, "small"); hint.className = "library-ai-set-hint"; hint.textContent = "尚未抓取，可在上方“模型连接”里点击“抓取模型列表”。";
		body.append(list, hint);
		list.addEventListener("click", event => {
			let model = event.target.closest?.("[data-set-model]");
			if (model) this.applyModel(window, doc, model.dataset.setModel);
		});
		return details;
	}

	// —— 卡片 3：高级（系统提示词）——
	advancedCard(window, doc) {
		let { details, body } = this.card(doc, "高级", "系统提示词（RAG 指令，慎改）");
		let textarea = this.html(doc, "textarea"); textarea.rows = 6; textarea.dataset.aiField = "systemPrompt"; textarea.className = "library-ai-set-system";
		let row = this.html(doc, "div"); row.className = "library-ai-set-actions";
		let reset = this.html(doc, "button"); reset.type = "button"; reset.textContent = "恢复默认";
		let save = this.html(doc, "button"); save.type = "button"; save.className = "primary"; save.textContent = "保存";
		row.append(reset, save);
		body.append(textarea, row);
		textarea.value = this.systemPrompt();
		reset.addEventListener("click", () => { textarea.value = this.defaultSystemPrompt; Services.prefs.setStringPref(this.prefRoot + "aiSystemPrompt", this.defaultSystemPrompt); this.notifyChanged(window); });
		save.addEventListener("click", () => { Services.prefs.setStringPref(this.prefRoot + "aiSystemPrompt", textarea.value.trim() || this.defaultSystemPrompt); this.host.setStatus(window, "系统提示词已保存"); });
		return details;
	}

	// —— 数据填充 / 操作 ——
	panel(doc) { return doc.querySelector('[data-tab-panel="setting"]'); }

	selectedProfileId(doc) { return this.panel(doc)?.querySelector('[data-ai-field="profile"]')?.value || ""; }

	fill(window, doc) {
		let panel = this.panel(doc); if (!panel) return;
		let profiles = this.host.provider.listProfiles();
		let select = panel.querySelector('[data-ai-field="profile"]');
		select.textContent = "";
		for (let profile of profiles) {
			let option = this.html(doc, "option");
			option.value = profile.id; option.textContent = `${profile.name}${profile.active ? " ✓" : ""}`;
			select.append(option);
		}
		select.value = profiles.find(p => p.active)?.id || profiles[0]?.id || "";
		let current = this.host.provider.getProfile(select.value) || {};
		panel.querySelector('[data-ai-field="preset"]').value = current.preset || "custom";
		panel.querySelector('[data-ai-field="protocol"]').value = current.protocol || "openai";
		panel.querySelector('[data-ai-field="baseURL"]').value = current.baseURL || "";
		panel.querySelector('[data-ai-field="model"]').value = current.model || "";
		panel.querySelector('[data-ai-field="apiKey"]').value = "";
		this.fillModels(window, doc);
	}

	fillModels(window, doc) {
		let panel = this.panel(doc); if (!panel) return;
		let profileId = this.selectedProfileId(doc);
		let profile = this.host.provider.getProfile(profileId);
		let list = panel.querySelector('[data-ai-role="models"]'), hint = panel.querySelector(".library-ai-set-hint");
		list.textContent = "";
		let models = profile?.models || [];
		hint.hidden = Boolean(models.length);
		for (let model of models) {
			let button = this.html(doc, "button");
			button.type = "button"; button.dataset.setModel = model;
			button.textContent = model;
			button.classList.toggle("active", model === profile?.model);
			list.append(button);
		}
		let datalist = panel.querySelector("#library-ai-settings-model-list");
		datalist.textContent = "";
		for (let model of models) { let option = this.html(doc, "option"); option.value = model; datalist.append(option); }
	}

	async save(window, doc) {
		let panel = this.panel(doc); if (!panel) return;
		let status = panel.querySelector('[data-ai-role="status"]');
		let profileId = this.selectedProfileId(doc);
		status.textContent = "正在保存…";
		try {
			let existing = this.host.provider.getProfile(profileId);
			await this.host.provider.upsertProfile({
				id: profileId, name: existing?.name, preset: panel.querySelector('[data-ai-field="preset"]').value,
				protocol: panel.querySelector('[data-ai-field="protocol"]').value,
				baseURL: panel.querySelector('[data-ai-field="baseURL"]').value.trim(),
				model: panel.querySelector('[data-ai-field="model"]').value.trim(),
				apiKey: panel.querySelector('[data-ai-field="apiKey"]').value.trim(),
			});
			if (existing && this.host.provider.activeId !== profileId) this.host.provider.setActiveProfile(profileId);
			panel.querySelector('[data-ai-field="apiKey"]').value = "";
			this.notifyChanged(window);
			status.textContent = "已保存，正在测试连接…";
			try {
				await this.host.provider.test();
				status.textContent = "已保存，连接成功";
			}
			catch (testError) { status.textContent = `已保存；连接测试失败：${testError.message || testError}`; }
			this.fill(window, doc);
		} catch (error) { status.textContent = error.message || String(error); }
	}

	async fetchModels(window, doc) {
		let panel = this.panel(doc); if (!panel) return;
		let status = panel.querySelector('[data-ai-role="status"]');
		status.textContent = "正在抓取模型列表…";
		try {
			// 先保存当前表单（以未保存的地址/密钥为准），再按协议抓取
			await this.save(window, doc);
			let models = await this.host.provider.fetchModels(this.selectedProfileId(doc));
			status.textContent = `抓取到 ${models.length} 个模型`;
			this.fillModels(window, doc);
		} catch (error) { status.textContent = `抓取失败：${error.message || error}`; }
	}

	applyModel(window, doc, modelId) {
		let panel = this.panel(doc); if (!panel) return;
		panel.querySelector('[data-ai-field="model"]').value = modelId;
		this.save(window, doc);
	}

	async newProfile(window, doc) {
		let name = window.prompt("新配置名称", "新配置");
		if (name === null) return;
		let profile = await this.host.provider.upsertProfile({ name: name.trim() || "新配置", preset: "custom", protocol: "openai", baseURL: "https://api.example.com/v1", model: "gpt-4.1-mini" });
		this.fill(window, doc);
		let select = this.panel(doc)?.querySelector('[data-ai-field="profile"]');
		if (select) select.value = profile.id;
		this.notifyChanged(window);
	}

	deleteProfile(window, doc, profileId) {
		let profiles = this.host.provider.listProfiles();
		if (profiles.length <= 1) { window.alert("至少保留一个配置档案"); return; }
		if (!window.confirm("删除该配置档案？密钥也会一并清除。")) return;
		this.host.provider.deleteProfile(profileId);
		this.fill(window, doc);
		this.notifyChanged(window);
	}

	notifyChanged(window) {
		this.host.renderAll();
		window.dispatchEvent(new window.CustomEvent("library-ai-config-changed"));
	}
};
