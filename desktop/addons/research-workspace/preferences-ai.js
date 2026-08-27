// Library AI 多配置设置页（Zotero 首选项窗格：工具 → AI 服务…）
// 布局仿 DSH 设置页：左侧配置档案卡片列表，右侧选中档案的编辑表单；
// 支持测试连接、抓取模型列表、设为当前、JSON 导入/导出。
var LibraryAISettings = {
	initialized: false,
	provider: null,
	selectedId: null,

	init() {
		let root = document.getElementById("research-workspace-ai-root");
		if (!root || this.initialized) return;
		this.initialized = true;
		this.provider = new LibraryAIProviderAdapter("extensions.zotero.researchWorkspace.");

		let preset = root.querySelector("#ai-preset");
		for (let [key, [label]] of Object.entries(this.provider.presets)) {
			let option = document.createElement("option");
			option.value = key; option.textContent = label;
			preset.append(option);
		}
		preset.addEventListener("change", () => {
			let [, baseURL, model] = this.provider.presets[preset.value] || [];
			if (baseURL && !root.querySelector("#ai-baseurl").value.trim()) root.querySelector("#ai-baseurl").value = baseURL;
			if (model && !root.querySelector("#ai-model").value.trim()) root.querySelector("#ai-model").value = model;
		});

		root.querySelector("#ai-add").addEventListener("click", () => this.select(null));
		root.querySelector("#ai-save").addEventListener("click", () => this.save());
		root.querySelector("#ai-activate").addEventListener("click", () => this.activate());
		root.querySelector("#ai-delete").addEventListener("click", () => this.remove());
		root.querySelector("#ai-test").addEventListener("click", () => this.test());
		root.querySelector("#ai-fetch").addEventListener("click", () => this.fetchModels());
		root.querySelector("#ai-import").addEventListener("click", () => this.importProfiles());
		root.querySelector("#ai-export").addEventListener("click", () => this.exportProfiles());

		this.renderList();
		this.select(this.provider.activeId || null);
	},

	field(name) { return document.querySelector(`#research-workspace-ai-root #ai-${name}`); },

	status(text, isError = false) {
		let el = this.field("status");
		el.textContent = text;
		el.dataset.state = isError ? "error" : "ok";
	},

	renderList() {
		let list = this.field("profile-list");
		list.textContent = "";
		let profiles = this.provider.listProfiles();
		if (!profiles.length) {
			let empty = document.createElement("div");
			empty.className = "ai-prefs-empty";
			empty.textContent = "还没有配置。点击「＋ 新增配置」或直接「导入配置」。";
			list.append(empty);
			return;
		}
		for (let profile of profiles) {
			let card = document.createElement("div");
			card.className = "ai-prefs-card";
			card.classList.toggle("selected", profile.id === this.selectedId);
			card.setAttribute("role", "option");
			let title = document.createElement("div"); title.className = "ai-prefs-card-title";
			let name = document.createElement("strong"); name.textContent = profile.name;
			title.append(name);
			if (profile.active) {
				let badge = document.createElement("span"); badge.className = "ai-prefs-badge active"; badge.textContent = "使用中";
				title.append(badge);
			}
			let url = document.createElement("div"); url.className = "ai-prefs-card-url"; url.textContent = profile.baseURL;
			let meta = document.createElement("div"); meta.className = "ai-prefs-card-meta";
			meta.textContent = `${profile.model || "未设模型"} · ${profile.models?.length || 0} 个模型${profile.hasKey ? " · 已存密钥" : " · 未存密钥"}`;
			card.append(title, url, meta);
			card.addEventListener("click", () => this.select(profile.id));
			list.append(card);
		}
	},

	select(id) {
		this.selectedId = id;
		let profile = id ? this.provider.getProfile(id) : null;
		this.field("name").value = profile?.name || "";
		this.field("preset").value = profile?.preset || "custom";
		this.field("baseurl").value = profile?.baseURL || "";
		this.field("model").value = profile?.model || "";
		let key = this.field("key");
		key.value = "";
		key.placeholder = profile ? (this.provider.listProfiles().find(p => p.id === id)?.hasKey ? "留空则保持不变（已保存）" : "尚未保存密钥") : "";
		this.fillModelOptions(profile?.models || []);
		this.field("delete").disabled = !profile;
		this.field("activate").disabled = !profile || profile.id === this.provider.activeId;
		this.status(profile ? "" : "填写新配置后点「保存配置」");
		this.renderList();
	},

	fillModelOptions(models) {
		let datalist = this.field("model-options");
		datalist.textContent = "";
		for (let model of models) {
			let option = document.createElement("option");
			option.value = model;
			datalist.append(option);
		}
	},

	formKey() {
		// 表单里输入了新密钥就用新的；否则用该档案已保存的密钥
		let typed = this.field("key").value.trim();
		if (typed) return Promise.resolve(typed);
		return this.selectedId ? this.provider.getKey(this.selectedId) : Promise.resolve("");
	},

	async save() {
		try {
			let profile = await this.provider.upsertProfile({
				id: this.selectedId || undefined,
				name: this.field("name").value,
				preset: this.field("preset").value,
				baseURL: this.field("baseurl").value,
				model: this.field("model").value,
				apiKey: this.field("key").value.trim(),
			});
			this.selectedId = profile.id;
			this.field("key").value = "";
			this.status(`「${profile.name}」已保存`);
			this.renderList();
			this.select(profile.id);
		}
		catch (error) { this.status(error.message || String(error), true); }
	},

	async activate() {
		try {
			this.provider.setActiveProfile(this.selectedId);
			this.status("已设为当前配置，AI 面板即刻生效");
			this.renderList();
			this.select(this.selectedId);
		}
		catch (error) { this.status(error.message || String(error), true); }
	},

	async remove() {
		if (!this.selectedId) return;
		let profile = this.provider.getProfile(this.selectedId);
		let confirmed = Services.prompt.confirm(null, "删除配置", `确定删除「${profile?.name}」？保存的密钥会一并删除。`);
		if (!confirmed) return;
		await this.provider.deleteProfile(this.selectedId);
		this.status("已删除");
		this.select(this.provider.activeId || null);
	},

	async test() {
		this.status("正在测试连接…");
		try {
			await this.provider.test({ baseURL: this.field("baseurl").value.trim(), apiKey: await this.formKey() });
			this.status("连接成功");
		}
		catch (error) { this.status(error.message || String(error), true); }
	},

	async fetchModels() {
		this.status("正在抓取模型列表…");
		try {
			let models = await this.provider.listModels({ baseURL: this.field("baseurl").value.trim(), apiKey: await this.formKey() });
			this.fillModelOptions(models);
			if (this.selectedId) this.provider.storeModels(this.selectedId, models);
			this.status(`抓取到 ${models.length} 个模型，可在「默认模型」中点选`);
			this.renderList();
		}
		catch (error) { this.status(error.message || String(error), true); }
	},

	async exportProfiles() {
		let profiles = this.provider.listProfiles();
		if (!profiles.length) { this.status("没有可导出的配置", true); return; }
		let data = {
			format: "library-ai-profiles",
			version: 1,
			profiles: await Promise.all(profiles.map(async p => ({
				name: p.name, preset: p.preset, baseURL: p.baseURL, model: p.model,
				models: p.models || [], apiKey: await this.provider.getKey(p.id),
			}))),
		};
		let picked = await this.pickFile("导出 AI 配置", "save", "library-ai-profiles.json");
		if (!picked) return;
		await IOUtils.writeUTF8(picked, JSON.stringify(data, null, 2));
		this.status(`已导出 ${profiles.length} 个配置到 ${picked}`);
	},

	async importProfiles() {
		let picked = await this.pickFile("导入 AI 配置", "open");
		if (!picked) return;
		try {
			let data = JSON.parse(await IOUtils.readUTF8(picked));
			let profiles = Array.isArray(data) ? data : data.profiles;
			if (!Array.isArray(profiles) || !profiles.length) throw new Error("文件里没有配置");
			let count = 0;
			for (let entry of profiles) {
				if (!entry?.baseURL || !entry?.model) continue;
				// 导入一律新建（不带 id），同名配置成为副本，绝不覆盖现有档案
				await this.provider.upsertProfile({
					name: entry.name, preset: entry.preset || "custom",
					baseURL: entry.baseURL, model: entry.model,
					apiKey: entry.apiKey || "",
				});
				let created = this.provider.profiles[this.provider.profiles.length - 1];
				if (Array.isArray(entry.models) && entry.models.length) this.provider.storeModels(created.id, entry.models);
				count++;
			}
			if (!count) throw new Error("没有有效配置（需要 baseURL 与 model 字段）");
			this.status(`已导入 ${count} 个配置`);
			this.renderList();
		}
		catch (error) { this.status(`导入失败：${error.message || error}`, true); }
	},

	pickFile(title, mode, defaultName) {
		let nsIFilePicker = Components.interfaces.nsIFilePicker;
		let picker = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
		picker.init(window, title, mode === "save" ? nsIFilePicker.modeSave : nsIFilePicker.modeOpen);
		if (defaultName) picker.defaultString = defaultName;
		picker.appendFilter("JSON", "*.json");
		return new Promise(resolve => picker.open(rv => {
			resolve((rv === nsIFilePicker.returnOK || rv === nsIFilePicker.returnReplace) ? picker.file.path : null);
		}));
	},
};
// 与主题面板相同的初始化时机：Zotero 先加载脚本再注入 XHTML 片段，
// 监听 pane 的 showing 事件，同时保留超时兜底。
document.addEventListener("showing", event => {
	if (event.target?.id === "research-workspace-ai-root") {
		LibraryAISettings.init();
	}
}, true);
setTimeout(() => LibraryAISettings.init(), 0);
