ResearchWorkspace = {
	id: null,
	version: null,
	rootURI: null,
	initialized: false,
	preferencePaneID: null,
	menuIDs: [],
	prefObserver: null,
	shellStates: new Map(),
	readerSurfacesRegistered: false,
	annotationNotifierID: null,
	translationPaneTimer: null,
	fullTranslationJobs: new Map(),
	aiViewHost: null,
	aiPrefRoot: "extensions.zotero.researchWorkspace.",
	// Library Crawl 浏览器扩展的仓库与下载地址
	libraryCrawlRepoURL: "https://github.com/user-A100/Library",
	libraryCrawlDownloadURL: "https://github.com/user-A100/Library/releases",

	init({ id, version, rootURI }) {
		if (this.initialized) return;
		this.id = id;
		this.version = version;
		this.rootURI = rootURI;
		this.aiViewHost = new LibraryAIViewHost(this);
		this.initialized = true;
	},

	log(message) {
		Zotero.debug(`Research Workspace: ${message}`);
	},

	addToWindow(window) {
		if (!window?.ZoteroPane) return;
		let doc = window.document;
		window.MozXULElement.insertFTLIfNeeded("research-workspace.ftl");

		// 本产品不提供同步服务：永久关闭「通过Library备份你的文库」等同步提醒横幅
		try {
			Zotero.Prefs.set("sync.reminder.setUp.enabled", false);
			Zotero.Prefs.set("sync.reminder.autoSync.enabled", false);
			doc.getElementById("sync-reminder-container")?.setAttribute("collapsed", "true");
		}
		catch (error) {
			this.log(`Unable to disable sync reminders: ${error}`);
		}

		if (!doc.getElementById("research-workspace-stylesheet")) {
			let link = doc.createElement("link");
			link.id = "research-workspace-stylesheet";
			link.type = "text/css";
			link.rel = "stylesheet";
			link.href = this.rootURI + "style.css";
			doc.documentElement.appendChild(link);
		}
		this.applyAppearance(window);
		this.installShell(window);
		this.customizeToolsMenu(window);
		this.aiViewHost?.addToWindow(window);
	},

	addToAllWindows() {
		for (let window of Zotero.getMainWindows()) {
			this.addToWindow(window);
		}
	},

	removeFromWindow(window) {
		let doc = window?.document;
		if (!doc) return;
		doc.getElementById("research-workspace-stylesheet")?.remove();
		doc.querySelector('link[href="research-workspace.ftl"]')?.remove();
		this.removeShell(window);
		this.aiViewHost?.removeFromWindow(window);
		delete doc.documentElement.dataset.researchTheme;
		for (let property of ["--research-custom-gradient", "--research-custom-accent", "--research-glow", "--research-grain-opacity"]) {
			doc.documentElement.style.removeProperty(property);
		}
	},

	removeFromAllWindows() {
		for (let window of Zotero.getMainWindows()) {
			this.removeFromWindow(window);
		}
	},

	getThemeConfig() {
		let fallback = {
			version: 1,
			algorithm: "free",
			opacity: 72,
			texture: 18,
			points: [
				{ id: "mint", color: "#1b7f5c", x: 20, y: 20, isPrimary: true },
				{ id: "aqua", color: "#6ed6a4", x: 76, y: 34 },
				{ id: "cream", color: "#f1e9c9", x: 48, y: 82 },
			],
		};
		try {
			let parsed = JSON.parse(Services.prefs.getStringPref(
				"extensions.zotero.researchWorkspace.themeConfig",
				"",
			));
			if (Array.isArray(parsed.points) && parsed.points.length) return parsed;
		}
		catch (error) {
			this.log(`Invalid theme config: ${error}`);
		}
		return fallback;
	},

	hexToRGBA(color, alpha) {
		let hex = String(color || "#72e3a6").replace("#", "");
		if (hex.length === 3) hex = hex.split("").map(value => value + value).join("");
		let value = Number.parseInt(hex.slice(0, 6), 16);
		if (!Number.isFinite(value)) value = 0x72e3a6;
		return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
	},

	buildGradient(config) {
		let opacity = Math.max(18, Math.min(100, Number(config.opacity) || 72)) / 100;
		let points = config.points.slice(0, 5);
		let layers = points.map((point, index) => {
			let x = config.algorithm === "flow"
				? 10 + (index * 80) / Math.max(1, points.length - 1)
				: Number(point.x);
			let y = config.algorithm === "flow" ? 25 + (index % 2) * 55 : Number(point.y);
			return `radial-gradient(circle at ${x}% ${y}%, ${this.hexToRGBA(point.color, opacity)} 0%, ${this.hexToRGBA(point.color, 0)} 62%)`;
		});
		let grain = Math.round(((Number(config.texture) || 0) / 100) * 8) / 100;
		let texture = `repeating-radial-gradient(circle at 0 0, rgba(20, 30, 26, ${grain}) 0 .7px, transparent .8px 5px)`;
		return [texture, ...layers, "linear-gradient(155deg, var(--material-sidepane), color-mix(in srgb, var(--material-sidepane) 82%, var(--material-background)))"].join(", ");
	},

	applyAppearance(window, providedConfig = null) {
		let root = window?.document?.documentElement;
		if (!root) return;
		let config = providedConfig || this.getThemeConfig();
		let primary = config.points.find(point => point.isPrimary) || config.points[0];
		root.dataset.researchTheme = "custom";
		root.style.setProperty("--research-custom-gradient", this.buildGradient(config));
		root.style.setProperty("--research-custom-accent", primary?.color || "#1b7f5c");
		root.style.setProperty("--research-glow", `color-mix(in srgb, ${primary?.color || "#1b7f5c"} 22%, transparent)`);
		root.style.setProperty("--research-grain-opacity", String((Number(config.texture) || 0) / 100));
	},


	applyAppearanceToAllWindows() {
		for (let window of Zotero.getMainWindows()) {
			this.applyAppearance(window);
		}
	},

	// 工具菜单品牌定制：隐藏内核「插件」入口（about:addons），
	// 把「安装浏览器扩展」改为 Library Crawl 引导面板（含仓库链接与下载按钮）
	customizeToolsMenu(window) {
		let doc = window?.document;
		if (!doc) return;
		let connector = doc.getElementById("installConnector");
		if (!connector || connector.dataset.libraryCrawlPatched) return;
		let addons = doc.getElementById("menu_addons");
		if (addons) addons.hidden = true;
		connector.dataset.libraryCrawlPatched = "true";
		connector.setAttribute("label", "安装浏览器扩展（Library Crawl）…");
		connector.removeAttribute("oncommand");
		connector.removeAttribute("accesskey");
		let handler = event => {
			event.preventDefault();
			event.stopPropagation();
			this.showLibraryCrawlPanel(window);
		};
		connector.addEventListener("command", handler);
		let state = this.shellStates.get(window);
		if (state) state.listeners.push([connector, "command", handler]);

		this.installMenuL10nCompat(window);
	},

	// 插件通过 Zotero.MenuManager 注册的菜单依赖 data-l10n-id 翻译，
	// 但本构建中主窗口 DOMLocalization 无法解析插件 FTL（sync Localization 可以），
	// 导致工具菜单出现只有图标没有文字的菜单项。这里在 MenuManager 渲染菜单后
	// 用 sync Localization 解析标签并直接写入 label 属性。
	installMenuL10nCompat(window) {
		if (window.__researchMenuL10nPatched) return;
		window.__researchMenuL10nPatched = true;
		this.menuL10nCache = this.menuL10nCache || new Map();
		let manager = Zotero.MenuManager;
		if (!manager || typeof manager.updateMenuPopup !== "function") return;
		// 其他插件的 FTL 同样可能未进入 L10nRegistry。先记录自身 rootURI，
		// 再异步补全所有已安装插件的 rootURI，供 resolveMenuL10nLabel 兜底读取。
		this.pluginRootURIs = [this.rootURI].filter(Boolean);
		this.resolvePluginRootURIs();
		let original = manager.updateMenuPopup;
		manager.updateMenuPopup = (...args) => {
			let result = original.apply(manager, args);
			try {
				let popup = args[0];
				if (popup?.querySelectorAll) {
					for (let elem of popup.querySelectorAll("menuitem[data-l10n-id], menu[data-l10n-id]")) {
						this.applyMenuL10nLabel(elem);
					}
				}
			}
			catch (error) {
				this.log(`Menu l10n compat failed: ${error}`);
			}
			return result;
		};
	},

	// 枚举所有已安装插件的 rootURI（异步，完成后仅供兜底读取使用）
	async resolvePluginRootURIs() {
		try {
			let pluginIDs = await Zotero.Plugins.getAllPluginIDs();
			let uris = [];
			for (let pluginID of pluginIDs) {
				let rootURI = await Zotero.Plugins.getRootURI(pluginID);
				if (rootURI) uris.push(rootURI);
			}
			this.pluginRootURIs = uris;
		}
		catch (error) {
			this.log(`Menu l10n plugin enumeration failed: ${error}`);
		}
	},

	applyMenuL10nLabel(elem) {
		let l10nId = elem.dataset?.l10nId;
		if (!l10nId) return;
		if (elem.getAttribute("label")) return;
		let label = this.resolveMenuL10nLabel(l10nId);
		if (label) elem.setAttribute("label", label);
	},

	resolveMenuL10nLabel(l10nId, debugErrors) {
		// l10nId 形如 <addonRef>-<name>，逐级尝试 <addonRef>-mainWindow.ftl 与
		// <addonRef>.ftl（addonRef 本身可以是单段，如 BetterNotes）
		let parts = l10nId.split("-");
		while (parts.length >= 1) {
			for (let file of [`${parts.join("-")}-mainWindow.ftl`, `${parts.join("-")}.ftl`]) {
				let loc = this.menuL10nCache.get(file);
				if (loc === undefined) {
					try {
						loc = new Localization([file], true);
					}
					catch (error) {
						if (debugErrors) this.log(`menu-l10n ctor ${file} => ${error}`);
						loc = null;
					}
					this.menuL10nCache.set(file, loc);
				}
				if (loc) {
					try {
						let msg = loc.formatMessagesSync([{ id: l10nId }])[0];
						let attr = msg?.attributes?.find?.(a => a.name === "label");
						let label = attr?.value || msg?.value;
						if (label) return label;
						if (debugErrors) this.log(`menu-l10n ${file}:${l10nId} => msg=${JSON.stringify(msg)}`);
					}
					catch (error) {
						if (debugErrors) this.log(`menu-l10n ${file}:${l10nId} => ERROR ${error}`);
					}
				}
				else if (debugErrors) {
					this.log(`menu-l10n ${file} unavailable`);
				}
			}
			parts.pop();
		}
		// 回退：插件的 FTL 可能未进入 L10nRegistry，直接从各插件 XPI 内读取
		let segments = l10nId.split("-");
		let names = [];
		while (segments.length >= 1) {
			names.push(segments.join("-"));
			segments.pop();
		}
		let locale = Zotero.locale || "en-US";
		let candidates = [...new Set([locale, "zh-CN", "en-US"])];
		for (let rootURI of this.pluginRootURIs || []) {
			for (let candidate of candidates) {
				for (let name of names) {
					let url = `${rootURI}locale/${candidate}/${name}.ftl`;
					let loc = this.menuL10nCache.get(url);
					if (loc === undefined) {
						try {
							loc = new Localization([url], true);
						}
						catch (_) {
							loc = null;
						}
						this.menuL10nCache.set(url, loc);
					}
					if (!loc) continue;
					try {
						let msg = loc.formatMessagesSync([{ id: l10nId }])[0];
						let attr = msg?.attributes?.find?.(a => a.name === "label");
						let label = attr?.value || msg?.value;
						if (label) return label;
					}
					catch (_) {}
				}
			}
		}
		return null;
	},

	showLibraryCrawlPanel(window) {
		let doc = window.document;
		doc.getElementById("library-crawl-panel")?.remove();
		let panel = doc.createXULElement("panel");
		panel.id = "library-crawl-panel";
		panel.setAttribute("type", "arrow");
		panel.setAttribute("flip", "both");
		panel.setAttribute("consumeoutsideclicks", "true");
		panel.addEventListener("popuphidden", () => panel.remove());

		let box = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
		box.style.cssText = "box-sizing:border-box;width:320px;padding:16px;display:grid;gap:10px;"
			+ "background:var(--material-background);color:var(--fill-primary);"
			+ "font:12px/1.6 'Segoe UI Variable Text','Microsoft YaHei UI',sans-serif;";
		let accent = "var(--research-custom-accent, var(--accent-blue, #1b7f5c))";

		let title = doc.createElementNS("http://www.w3.org/1999/xhtml", "strong");
		title.textContent = "Library Crawl 浏览器扩展";
		title.style.cssText = "font-size:14px;font-weight:680;";

		let desc = doc.createElementNS("http://www.w3.org/1999/xhtml", "p");
		desc.style.cssText = "margin:0;color:var(--fill-secondary);";
		desc.textContent = "一键把网页上的 PDF 抓取进 Library：PDF 页面角标、本页链接扫描、右键菜单。完全本地运行，数据不出本机。";

		let repo = doc.createElementNS("http://www.w3.org/1999/xhtml", "a");
		repo.textContent = this.libraryCrawlRepoURL;
		repo.href = this.libraryCrawlRepoURL;
		repo.style.cssText = `color:${accent};word-break:break-all;cursor:pointer;`;
		repo.addEventListener("click", event => {
			event.preventDefault();
			Zotero.launchURL(this.libraryCrawlRepoURL);
		});

		let actions = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
		actions.style.cssText = "display:flex;gap:8px;margin-top:2px;";

		let download = doc.createElementNS("http://www.w3.org/1999/xhtml", "button");
		download.type = "button";
		download.textContent = "下载扩展";
		download.style.cssText = `padding:7px 14px;border:0;border-radius:7px;background:${accent};color:#fff;font-weight:650;cursor:pointer;`;
		download.addEventListener("click", () => Zotero.launchURL(this.libraryCrawlDownloadURL));

		let local = doc.createElementNS("http://www.w3.org/1999/xhtml", "button");
		local.type = "button";
		local.textContent = "打开本地扩展目录";
		local.style.cssText = "padding:7px 12px;border:1px solid var(--color-panedivider,#ccc);border-radius:7px;background:var(--material-button);color:inherit;cursor:pointer;";
		let dirPref = "";
		try { dirPref = Services.prefs.getStringPref(this.aiPrefRoot + "libraryCrawlDir", ""); } catch (_) {}
		if (dirPref) {
			local.addEventListener("click", () => {
				try { new FileUtils.File(dirPref).reveal(); }
				catch (error) { this.log(`Unable to reveal Library Crawl dir: ${error}`); }
			});
		} else {
			local.style.display = "none";
		}
		actions.append(download, local);

		let hint = doc.createElementNS("http://www.w3.org/1999/xhtml", "small");
		hint.style.cssText = "color:var(--fill-secondary);font-size:10px;";
		hint.textContent = "安装：浏览器扩展页 → 开发者模式 → 加载解压缩的扩展 → 选择解压后的 library-crawl 目录。";

		box.append(title, desc, repo, actions, hint);
		panel.appendChild(box);
		doc.documentElement.appendChild(panel);
		let anchor = doc.getElementById("toolsMenu") || doc.getElementById("menu_ToolsPopup");
		panel.openPopup(anchor, "after_start", 8, 8);
	},

	installShell(window) {
		if (this.shellStates.has(window)) return;

		// 专注布局不再安装左侧导航栏：文库侧栏与 AI 助手均有原生入口，
		// 独立侧栏既占空间又影响布局。这里仅保留紧凑模式状态本身。
		let state = {
			compact: Services.prefs.getBoolPref(
				"extensions.zotero.researchWorkspace.compactShell",
				true,
			),
			pinned: { left: false },
			timers: {},
			listeners: [],
		};
		this.shellStates.set(window, state);
		this.setShellCompact(window, state.compact, false);
	},

	setShellCompact(window, compact, persist = true) {
		let state = this.shellStates.get(window);
		let root = window?.document?.documentElement;
		if (!state || !root) return;
		state.compact = Boolean(compact);
		root.dataset.researchCompact = String(state.compact);
		root.dataset.researchShellReady = "true";
		if (!state.compact) {
			state.pinned.left = false;
			this.setShellSide(window, "left", false);
		}
		if (persist) {
			Services.prefs.setBoolPref(
				"extensions.zotero.researchWorkspace.compactShell",
				state.compact,
			);
		}
		window.requestAnimationFrame(() => window.dispatchEvent(new window.Event("resize")));
	},

	toggleShell(window) {
		let state = this.shellStates.get(window);
		if (state) this.setShellCompact(window, !state.compact);
	},

	async getCurrentWindowItem(window) {
		try {
			let tabs = window?.Zotero_Tabs || Zotero_Tabs;
			let reader = Zotero.Reader.getByTabID(tabs.selectedID);
			if (reader?.itemID) return Zotero.Items.getAsync(reader.itemID);
		}
		catch (error) {
			this.log(`Unable to resolve current reader item: ${error}`);
		}
		let item = window?.ZoteroPane?.getSelectedItems?.()[0];
		if (item) return item;
		return null;
	},


	revealShellSide(window, side) {
		let state = this.shellStates.get(window);
		if (!state?.compact) return;
		window.clearTimeout(state.timers[side]);
		this.setShellSide(window, side, true);
	},

	scheduleShellHide(window, side) {
		let state = this.shellStates.get(window);
		if (!state?.compact || state.pinned[side]) return;
		window.clearTimeout(state.timers[side]);
		state.timers[side] = window.setTimeout(() => {
			let popupOpen = window.document.querySelector(
				"panel[open='true'], menupopup[open='true'], popup[open='true']",
			);
			if (!popupOpen) this.setShellSide(window, side, false);
		}, 260);
	},

	setShellSide(window, side, open) {
		let root = window?.document?.documentElement;
		let state = this.shellStates.get(window);
		if (!root || !state) return;
		let isOpen = Boolean(open);
		root.dataset[`research${side[0].toUpperCase()}${side.slice(1)}Open`] = String(isOpen);
		let button = window.document.querySelector(`.research-shell-edge-${side}`);
		button?.setAttribute("aria-pressed", String(isOpen && state.pinned[side]));
		button?.classList.toggle("active", isOpen);
	},

	removeShell(window) {
		let state = this.shellStates.get(window);
		let doc = window?.document;
		if (!doc) return;
		if (state) {
			for (let timer of Object.values(state.timers)) window.clearTimeout(timer);
			for (let [target, type, handler, options] of state.listeners) {
				target.removeEventListener(type, handler, options);
			}
		}
		for (let element of doc.querySelectorAll(".research-shell-rail, .research-shell-edge")) element.remove();
		for (let key of [
			"researchCompact", "researchShellReady", "researchLeftOpen",
		]) delete doc.documentElement.dataset[key];
		this.shellStates.delete(window);
		window.dispatchEvent(new window.Event("resize"));
	},

	async registerNativeSurfaces() {
		await this.aiViewHost.init();
		this.preferencePaneID = await Zotero.PreferencePanes.register({
			pluginID: this.id,
			id: "research-workspace-preferences",
			label: "皮肤",
			image: this.rootURI + "theme-icon.svg",
			src: this.rootURI + "preferences.xhtml",
			scripts: [this.rootURI + "preferences.js"],
			stylesheets: [this.rootURI + "preferences.css"],
		});

		this.aiPreferencePaneID = await Zotero.PreferencePanes.register({
			pluginID: this.id,
			id: "research-workspace-ai",
			label: "AI 服务",
			image: this.rootURI + "icon.svg",
			src: this.rootURI + "preferences-ai.xhtml",
			scripts: [this.rootURI + "ai-provider.js", this.rootURI + "preferences-ai.js"],
			stylesheets: [this.rootURI + "preferences.css"],
		});

		this.prefObserver = { observe: () => this.applyAppearanceToAllWindows() };
		Services.prefs.addObserver(
			"extensions.zotero.researchWorkspace.themeConfig",
			this.prefObserver,
		);

		this.menuIDs.push(Zotero.MenuManager.registerMenu({
			menuID: "research-workspace-tools",
			pluginID: this.id,
			target: "main/menubar/tools",
			menus: [{
				menuType: "menuitem",
				l10nID: "research-workspace-menu-open",
				onCommand: () => this.openForCurrentSelection(),
			}, {
				menuType: "menuitem",
				l10nID: "research-workspace-menu-ai",
				onCommand: () => Zotero.Utilities.Internal.openPreferences("research-workspace-ai"),
			}, {
				menuType: "menuitem",
				l10nID: "research-workspace-menu-appearance",
				onCommand: () => Zotero.Utilities.Internal.openPreferences("research-workspace-preferences"),
			}, {
				menuType: "menuitem",
				l10nID: "research-workspace-menu-focus",
				onCommand: () => this.toggleShell(Zotero.getMainWindow()),
			}],
		}));

		this.menuIDs.push(Zotero.MenuManager.registerMenu({
			menuID: "research-workspace-item",
			pluginID: this.id,
			target: "main/library/item",
			menus: [{
				menuType: "menuitem",
				l10nID: "research-workspace-menu-read",
				onShowing: (event, context) => context.setEnabled(Boolean(context.items?.length)),
				onCommand: (event, context) => this.startReading(context.items?.[0]),
			}],
		}));

		this.configureTranslationExperience();
		this.registerReaderSurfaces();
	},

	configureTranslationExperience() {
		// Library 的阅读交互以用户明确点击为准。Translate for Zotero 上游默认会
		// 在划词后立即发起请求；这里设置用户级偏好，确保现有/新建 profile 都
		// 只显示「翻译」按钮，不会在选择文本时自动向第三方服务发送内容。
		Services.prefs.setBoolPref("extensions.zotero.ZoteroPDFTranslate.enableAuto", false);
		Services.prefs.setBoolPref("extensions.zotero.ZoteroPDFTranslate.enablePopup", true);
		// TRACE 复核表单属于评测工作流，普通论文阅读不显示，避免右下角出现
		// 没有阅读价值的复选框和空白输入框。
		Services.prefs.setBoolPref("extensions.zotero.researchWorkspace.traceReviewUI", false);

		let window = Zotero.getMainWindow?.();
		if (!window) return;
		if (this.translationPaneTimer) window.clearTimeout(this.translationPaneTimer);
		this.translationPaneTimer = window.setTimeout(() => {
			this.translationPaneTimer = null;
			this.removeLegacyTranslationPane();
		}, 1600);
	},

	removeLegacyTranslationPane() {
		// 翻译入口已经迁移到划词弹窗和阅读器工具栏。旧侧栏在当前 Zotero
		// 内核中会渲染出一组没有可读标签的白色控件，因此不再作为产品入口。
		Zotero.ItemPaneManager?.unregisterSection?.("translate");
	},

	registerReaderSurfaces() {
		if (this.readerSurfacesRegistered) return;

		// 阅读器划词弹窗：追加「发给 Library AI」按钮，把选中文字精准挂为 AI 参考
		Zotero.Reader.registerEventListener(
			"renderTextSelectionPopup",
			event => this.handleTextSelectionPopup(event),
			this.id,
		);

		// 阅读器右上工具区：全文翻译。Zotero 会把 renderToolbar 追加项放在
		// 搜索/侧栏控制所在的工具区，不覆盖原生批注能力。
		Zotero.Reader.registerEventListener(
			"renderToolbar",
			event => this.handleReaderToolbar(event),
			this.id,
		);

		// 「选择区域」工具产生的图片批注：自动挂为 AI 参考（仅当该文档正在阅读器中打开，避免导入时误触发）
		this.annotationNotifierID = Zotero.Notifier.registerObserver({
			notify: (event, type, ids) => {
				if (type !== "item" || event !== "add") return;
				for (let id of ids) {
					let item = Zotero.Items.get(id);
					if (!item?.isAnnotation?.() || item.annotationType !== "image") continue;
					let readerOpen = (Zotero.Reader._readers || []).some(reader => reader?.itemID === item.parentID);
					if (readerOpen) this.aiViewHost?.addAreaReference(item);
				}
			},
		}, ["item"], "research-workspace-annotations");
		this.readerSurfacesRegistered = true;
	},

	handleReaderToolbar({ reader, doc, append }) {
		this.removeLegacyTranslationPane();
		this.ensureReaderToolbarStyles(doc);
		let id = `library-full-translate-${reader?._instanceID || reader?.itemID || "reader"}`;
		if (doc.getElementById(id)) return;

		let button = doc.createElement("button");
		button.id = id;
		button.type = "button";
		button.className = "toolbar-button library-full-translate";
		button.title = "使用当前翻译引擎翻译整篇论文，并生成文献笔记";
		button.setAttribute("aria-label", "全文翻译");
		let mark = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
		mark.classList.add("library-full-translate-icon");
		mark.setAttribute("viewBox", "0 0 24 24");
		mark.setAttribute("aria-hidden", "true");
		for (let pathData of ["M5 8l6 6", "M4 14l6-6 2-3", "M2 5h12", "M7 2h1", "M22 22l-5-10-5 10", "M14 18h6"]) {
			let path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
			path.setAttribute("d", pathData);
			mark.append(path);
		}
		button.append(mark);
		button.addEventListener("click", () => this.translateWholeDocument(reader, button));
		append(button);
	},

	ensureReaderToolbarStyles(doc) {
		if (doc.getElementById("library-reader-toolbar-style")) return;
		let style = doc.createElement("style");
		style.id = "library-reader-toolbar-style";
		style.textContent = `
			.library-full-translate{display:inline-grid;place-items:center;box-sizing:border-box;width:30px;height:28px;margin-inline:2px;padding:0;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--fill-secondary);cursor:pointer;transition:background-color 120ms ease,color 120ms ease,border-color 120ms ease,transform 100ms ease}
			.library-full-translate:hover:not(:disabled){background:var(--fill-quinary);color:var(--fill-primary)}
			.library-full-translate:active:not(:disabled){transform:scale(.97)}
			.library-full-translate:focus-visible{outline:2px solid color-mix(in srgb,var(--accent-blue) 65%,transparent);outline-offset:1px}
			.library-full-translate-icon{width:18px;height:18px;flex:none;fill:none;stroke:var(--accent-blue);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
			.library-full-translate[data-busy="true"]{cursor:progress;color:var(--fill-secondary)}
			.library-full-translate[data-busy="true"] .library-full-translate-icon{animation:library-translate-pulse 900ms ease-in-out infinite alternate}
			@keyframes library-translate-pulse{to{opacity:.38}}
			@media (prefers-reduced-motion:reduce){.library-full-translate,.library-full-translate-icon{transition:none!important;animation:none!important}}
		`;
		(doc.head || doc.documentElement).append(style);
	},

	setFullTranslationButton(button, text, busy = false) {
		if (!button?.isConnected) return;
		button.disabled = busy;
		button.setAttribute("aria-busy", String(busy));
		button.setAttribute("aria-label", text);
		button.title = busy ? text : "全文翻译：使用当前翻译引擎翻译整篇论文，并生成文献笔记";
		button.dataset.busy = String(busy);
	},

	splitFullTextForTranslation(text, maxLength = 2600) {
		let blocks = String(text || "")
			.replace(/\r/g, "")
			.replace(/[ \t]+\n/g, "\n")
			.split(/\n{2,}/)
			.map(block => block.replace(/\s+/g, " ").trim())
			.filter(Boolean);
		let chunks = [], current = "";
		let flush = () => {
			if (current.trim()) chunks.push(current.trim());
			current = "";
		};
		for (let block of blocks) {
			while (block.length > maxLength) {
				let sample = block.slice(0, maxLength);
				let cut = Math.max(
					sample.lastIndexOf(". "), sample.lastIndexOf("? "),
					sample.lastIndexOf("! "), sample.lastIndexOf("; "),
				);
				if (cut < Math.floor(maxLength * .55)) cut = maxLength - 1;
				let part = block.slice(0, cut + 1).trim();
				if (current && current.length + part.length + 2 > maxLength) flush();
				current = [current, part].filter(Boolean).join("\n\n");
				flush();
				block = block.slice(cut + 1).trim();
			}
			if (!block) continue;
			if (current && current.length + block.length + 2 > maxLength) flush();
			current = [current, block].filter(Boolean).join("\n\n");
		}
		flush();
		return chunks;
	},

	renderFullTranslationNote(title, translatedChunks, { complete = false, total = 0, service = "" } = {}) {
		let escape = value => Zotero.Utilities.htmlSpecialChars(String(value || ""));
		let paragraphs = translatedChunks.map(chunk => {
			let html = escape(chunk).replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");
			return `<p>${html}</p>`;
		}).join("");
		let progress = complete
			? `已完成 ${translatedChunks.length} 个分段${service ? ` · ${escape(service)}` : ""}`
			: `正在翻译 ${translatedChunks.length}/${total} 个分段`;
		return `<h1>${escape(title)} · 全文翻译</h1><p><em>机器翻译 · ${progress}</em></p><hr>${paragraphs}`;
	},

	async translateWholeDocument(reader, button) {
		let itemID = Number(reader?.itemID || 0);
		if (!itemID || this.fullTranslationJobs.has(itemID)) return;
		let job = this.runFullDocumentTranslation(reader, button);
		this.fullTranslationJobs.set(itemID, job);
		try {
			await job;
		}
		finally {
			this.fullTranslationJobs.delete(itemID);
			this.setFullTranslationButton(button, "全文翻译", false);
		}
	},

	async runFullDocumentTranslation(reader, button) {
		if (!Zotero.PDFTranslate?.api?.translate) {
			Services.prompt.alert(null, "Library", "翻译组件尚未就绪，请重启 Library 后再试。");
			return;
		}
		let attachment = await Zotero.Items.getAsync(reader.itemID);
		if (!attachment?.isPDFAttachment?.()) {
			Services.prompt.alert(null, "Library", "当前阅读内容不是可翻译的 PDF。");
			return;
		}

		let parent = attachment.parentItemID ? await Zotero.Items.getAsync(attachment.parentItemID) : null;
		let title = parent?.getDisplayTitle?.() || attachment.getDisplayTitle?.() || "当前论文";
		let progressWindow = new Zotero.ProgressWindow({ closeOnClick: false });
		progressWindow.changeHeadline("Library 全文翻译");
		let progress = new progressWindow.ItemProgress(null, title);
		progress.setProgress(0);
		progressWindow.show();

		let note = null;
		try {
			this.setFullTranslationButton(button, "提取全文…", true);
			let cacheFile = Zotero.Fulltext.getItemCacheFile(attachment);
			let fullText = cacheFile.exists()
				? await Zotero.File.getContentsAsync(cacheFile)
				: (await Zotero.PDFWorker.getFullText(attachment.id, null, true)).text;
			let chunks = this.splitFullTextForTranslation(fullText);
			if (!chunks.length) throw new Error("没有从 PDF 中提取到可翻译文本");

			note = new Zotero.Item("note");
			note.libraryID = attachment.libraryID;
			if (parent?.isRegularItem?.()) note.parentID = parent.id;
			note.setNote(this.renderFullTranslationNote(title, [], { total: chunks.length }));
			await note.saveTx();

			let results = [], service = "";
			for (let [index, chunk] of chunks.entries()) {
				this.setFullTranslationButton(button, `翻译 ${index + 1}/${chunks.length}`, true);
				progress.setText(`正在翻译 ${index + 1}/${chunks.length}`);
				progress.setProgress(Math.round((index / chunks.length) * 100));
				let task = await Zotero.PDFTranslate.api.translate(chunk);
				let result = task?.result?.trim();
				if (!result) throw new Error(task?.status === "error" ? "翻译服务返回错误" : `第 ${index + 1} 段没有返回译文`);
				service ||= task.service || "";
				results.push(result);
				if ((index + 1) % 4 === 0 || index === chunks.length - 1) {
					note.setNote(this.renderFullTranslationNote(title, results, { total: chunks.length, service }));
					await note.saveTx();
				}
				await Zotero.Promise.delay(80);
			}

			note.setNote(this.renderFullTranslationNote(title, results, { complete: true, total: chunks.length, service }));
			await note.saveTx();
			progress.setProgress(100);
			progress.setText("翻译完成，已生成文献笔记");
			progressWindow.startCloseTimer(3500);
			Zotero.getActiveZoteroPane?.()?.openNote?.(note.id, { openInWindow: true });
		}
		catch (error) {
			this.log(`Full-document translation failed: ${error?.stack || error}`);
			progress.setError();
			progress.setText(`全文翻译失败：${error.message || error}`);
			progressWindow.startCloseTimer(8000);
			if (note?.id) {
				note.setNote(`${note.getNote()}<p><strong>翻译中断：</strong>${Zotero.Utilities.htmlSpecialChars(error.message || String(error))}</p>`);
				await note.saveTx();
			}
			Services.prompt.alert(null, "Library", `全文翻译失败：${error.message || error}`);
		}
	},

	handleTextSelectionPopup({ reader, doc, params, append }) {
		let text = (params?.annotation?.text || "").trim();
		if (!text) return;
		let button = doc.createElement("button");
		button.type = "button";
		button.style.cssText = "display:flex;align-items:center;justify-content:center;gap:6px;width:100%;margin-top:6px;padding:6px 10px;border:0;border-radius:6px;background:#1b7f5c;color:#fff;font-size:12px;cursor:pointer;";
		button.textContent = "✦ 发给 Library AI 作为参考";
		button.addEventListener("click", () => {
			this.aiViewHost?.addReaderSelection({
				reader,
				text,
				pageLabel: params?.annotation?.pageLabel || "",
			});
		});
		append(button);
		// 划词翻译（ai-translate-tab 开关控制）：流式译文浮层
		if (this.aiViewHost?.translateTab && Services.prefs.getBoolPref(this.aiPrefRoot + "aiSelectionTranslate", false)) {
			let translateButton = doc.createElement("button");
			translateButton.type = "button";
			translateButton.style.cssText = "display:flex;align-items:center;justify-content:center;gap:6px;width:100%;margin-top:4px;padding:6px 10px;border:0;border-radius:6px;background:#3f6212;color:#fff;font-size:12px;cursor:pointer;";
			translateButton.textContent = "✦ 划词翻译";
			translateButton.addEventListener("click", () => {
				this.aiViewHost.translateTab.runSelectionTranslate({ reader, doc, text });
			});
			append(translateButton);
		}
	},

	removeReaderSurfaces() {
		let window = Zotero.getMainWindow?.();
		if (this.translationPaneTimer && window) window.clearTimeout(this.translationPaneTimer);
		this.translationPaneTimer = null;
		this.fullTranslationJobs.clear();
		if (this.annotationNotifierID) {
			Zotero.Notifier.unregisterObserver(this.annotationNotifierID);
			this.annotationNotifierID = null;
		}
		this.readerSurfacesRegistered = false;
	},

	unregisterNativeSurfaces() {
		this.aiViewHost?.destroy();
		this.removeReaderSurfaces();
		if (this.prefObserver) {
			Services.prefs.removeObserver(
				"extensions.zotero.researchWorkspace.themeConfig",
				this.prefObserver,
			);
			this.prefObserver = null;
		}
		if (this.preferencePaneID) {
			Zotero.PreferencePanes.unregister(this.preferencePaneID);
			this.preferencePaneID = null;
		}
		if (this.aiPreferencePaneID) {
			Zotero.PreferencePanes.unregister(this.aiPreferencePaneID);
			this.aiPreferencePaneID = null;
		}
		for (let menuID of this.menuIDs) {
			if (menuID) Zotero.MenuManager.unregisterMenu(menuID);
		}
		this.menuIDs = [];
	},

	async getTargetItem(item) {
		if (!item) return null;
		if (item.parentItemID) {
			return Zotero.Items.getAsync(item.parentItemID);
		}
		return item;
	},

	async getPDFAttachment(item) {
		if (!item) return null;
		if (item.isAttachment() && item.attachmentContentType === "application/pdf") {
			return item;
		}
		let target = await this.getTargetItem(item);
		for (let attachmentID of target?.getAttachments?.() || []) {
			let attachment = await Zotero.Items.getAsync(attachmentID);
			if (attachment?.attachmentContentType === "application/pdf") return attachment;
		}
		return null;
	},

	async startReading(item, location = null) {
		let attachment = await this.getPDFAttachment(item);
		if (!attachment) {
			Services.prompt.alert(null, "Library", "当前条目没有可阅读的 PDF 附件。");
			return null;
		}
		let reader = await Zotero.Reader.open(attachment.id, location);
		if (!reader) {
			let mainWindow = Zotero.getMainWindow?.();
			let tabID = mainWindow?.Zotero_Tabs?.getTabIDByItemID?.(attachment.id);
			if (tabID) {
				for (let attempt = 0; attempt < 30 && !reader; attempt++) {
					reader = Zotero.Reader.getByTabID(tabID);
					if (!reader) await Zotero.Promise.delay(50);
				}
			}
		}
		return reader;
	},

	async openForCurrentSelection() {
		let item = Zotero.getActiveZoteroPane()?.getSelectedItems()?.[0];
		if (!item) {
			Services.prompt.alert(null, "Library", "请先选择一篇文献或附件。");
			return;
		}
		await this.startReading(item);
	},
};
