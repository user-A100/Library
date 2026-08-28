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
	libraryCrawlDownloadURL: "https://github.com/user-A100/Library/releases/latest/download/library-crawl.zip",

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
		let doc = window.document;
		if (this.shellStates.has(window) || doc.querySelector(".research-shell-edge")) return;

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

		let rail = doc.createElementNS("http://www.w3.org/1999/xhtml", "nav");
		rail.className = "research-shell-rail";
		rail.setAttribute("aria-label", "Library 导航");
		let railIcons = {
			library: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h5.5a3 3 0 0 1 3 3v10H7a3 3 0 0 0-3 3z"/><path d="M20 5.5h-5.5a3 3 0 0 0-3 3v10H17a3 3 0 0 1 3 3z"/></svg>',
			ai: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.45 4.55L18 9l-4.55 1.45L12 15l-1.45-4.55L6 9l4.55-1.45z"/><path d="m18.2 14 .75 2.25L21.2 17l-2.25.75L18.2 20l-.75-2.25L15.2 17l2.25-.75z"/></svg>',
			focus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4"/></svg>',
		};
		let makeRailButton = (action, label) => {
			let button = doc.createElementNS("http://www.w3.org/1999/xhtml", "button");
			button.type = "button";
			button.className = "research-shell-rail-button";
			button.dataset.action = action;
			button.setAttribute("aria-label", label);
			button.title = label;
			button.innerHTML = railIcons[action];
			return button;
		};
		let edge = makeRailButton("library", "显示文库侧栏");
		edge.classList.add("research-shell-edge", "research-shell-edge-left");
		edge.dataset.side = "left";
		edge.setAttribute("aria-pressed", "false");
		let aiButton = makeRailButton("ai", "打开 AI 研究助手");
		let focusButton = makeRailButton("focus", "退出紧凑模式");
		let railSpacer = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
		railSpacer.className = "research-shell-rail-spacer";
		rail.append(edge, aiButton, railSpacer, focusButton);
		doc.documentElement.append(rail);

		let bind = (target, type, handler, options) => {
			if (!target) return;
			target.addEventListener(type, handler, options);
			state.listeners.push([target, type, handler, options]);
		};
		bind(edge, "mouseenter", () => this.revealShellSide(window, "left"));
		bind(edge, "focus", () => this.revealShellSide(window, "left"));
		bind(edge, "click", () => {
			state.pinned.left = !state.pinned.left;
			this.setShellSide(window, "left", state.pinned.left);
			edge.setAttribute("aria-pressed", String(state.pinned.left));
			edge.title = state.pinned.left ? "取消固定文库侧栏" : "显示文库侧栏";
		});
		bind(edge, "keydown", event => {
			if (event.key === "Escape") {
				state.pinned.left = false;
				edge.setAttribute("aria-pressed", "false");
				this.setShellSide(window, "left", false);
				edge.blur();
			}
		});
		bind(edge, "mouseleave", () => this.scheduleShellHide(window, "left"));
		bind(edge, "blur", () => this.scheduleShellHide(window, "left"));
		bind(aiButton, "click", () => this.aiViewHost?.toggle?.(window));
		bind(focusButton, "click", () => this.setShellCompact(window, false));
		bind(rail, "mouseenter", () => window.clearTimeout(state.timers.left));
		bind(rail, "mouseleave", event => {
			if (!event.relatedTarget?.closest?.("#zotero-collections-pane")) {
				this.scheduleShellHide(window, "left");
			}
		});
		let collectionsPane = doc.getElementById("zotero-collections-pane");
		bind(collectionsPane, "mouseenter", () => this.revealShellSide(window, "left"));
		bind(collectionsPane, "mouseleave", () => this.scheduleShellHide(window, "left"));
		bind(window, "deactivate", () => {
			if (!state.pinned.left) this.setShellSide(window, "left", false);
		});
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

	renderItemPanePlaceholder(doc, body, message = "选择文献后开始阅读") {
		if (!doc || !body) return;
		body.textContent = "";
		let placeholder = doc.createElement("div");
		placeholder.className = "research-workspace-placeholder";
		placeholder.textContent = message;
		body.appendChild(placeholder);
	},

	async renderItemPaneWithFallback(props) {
		if (!props?.doc || !props?.body) return;
		let item = props.item || await this.getCurrentWindowItem(props.doc.defaultView);
		if (item) this.renderItemPane({ ...props, item });
	},

	renderItemPane({ doc, body, item }) {
		if (!doc || !body) return;
		body.textContent = "";
		if (!item) {
			this.renderItemPanePlaceholder(doc, body);
			return;
		}

		let root = doc.createElement("div");
		root.className = "research-workspace-panel";
		body.appendChild(root);
		try {
			this.renderItemPaneContents({ doc, root, item });
			let bodyRect = body.getBoundingClientRect();
			let rootRect = root.getBoundingClientRect();
			let style = doc.defaultView.getComputedStyle(root);
			this.log(`AI pane DOM: ${body.childElementCount} body children, ${root.childElementCount} panel children, body ${Math.round(bodyRect.x)},${Math.round(bodyRect.y)} ${Math.round(bodyRect.width)}x${Math.round(bodyRect.height)}, panel ${Math.round(rootRect.x)},${Math.round(rootRect.y)} ${Math.round(rootRect.width)}x${Math.round(rootRect.height)}, ${style.display}/${style.visibility}/${style.opacity}`);
		}
		catch (error) {
			root.textContent = "";
			let failure = doc.createElement("div");
			failure.className = "research-workspace-error";
			failure.textContent = `AI 工作台加载失败：${error?.message || error}`;
			root.appendChild(failure);
			this.log(error);
		}
	},

	renderItemPaneContents({ doc, root, item }) {
		root.dataset.researchItemId = String(item.id);

		let modelBar = doc.createElement("div");
		modelBar.className = "research-model-bar";
		let modelState = doc.createElement("div");
		modelState.className = "research-model-state";
		modelState.innerHTML = "<strong>模型连接</strong><small>正在检查配置…</small>";
		let configure = this.createButton(doc, "配置", () => {
			let panel = root.querySelector(".research-model-settings");
			panel.hidden = !panel.hidden;
			if (!panel.hidden) panel.querySelector("input")?.focus();
		});
		modelBar.append(modelState, configure);
		root.appendChild(modelBar);
		this.renderInlineAISettings({ doc, root, modelState });

		let source = doc.createElement("div");
		source.className = "research-source-card";
		let eyebrow = doc.createElement("div");
		eyebrow.className = "research-workspace-eyebrow";
		eyebrow.textContent = "当前来源";
		let title = doc.createElement("div");
		title.className = "research-workspace-title";
		title.textContent = item.getDisplayTitle();
		let sourceMeta = doc.createElement("div");
		sourceMeta.className = "research-source-meta";
		sourceMeta.textContent = "题录 · 摘要 · 本地 PDF 全文";
		source.appendChild(eyebrow);
		source.appendChild(title);
		source.appendChild(sourceMeta);
		root.appendChild(source);

		let sourceTools = doc.createElement("div");
		sourceTools.className = "research-source-tools";
		let sourceCount = doc.createElement("span");
		sourceCount.className = "research-source-count";
		let selectedCount = this.aiSourceSelections.get(item.id)?.length || 1;
		sourceCount.textContent = selectedCount > 1 ? `已选 ${selectedCount} 个来源` : "仅使用当前来源";
		let addSources = this.createButton(doc, "添加选中来源", async () => {
			let selected = doc.defaultView?.ZoteroPane?.getSelectedItems?.() || [];
			let ids = new Set([item.id]);
			for (let selectedItem of selected) {
				let target = await this.getTargetItem(selectedItem);
				if (target?.isRegularItem?.()) ids.add(target.id);
			}
			this.aiSourceSelections.set(item.id, [...ids]);
			sourceCount.textContent = ids.size > 1 ? `已选 ${ids.size} 个来源` : "仅使用当前来源";
		});
		let clearSources = this.createButton(doc, "清除其他来源", () => {
			this.aiSourceSelections.delete(item.id);
			sourceCount.textContent = "仅使用当前来源";
		});
		sourceTools.append(sourceCount, addSources, clearSources);
		root.appendChild(sourceTools);

		let quick = doc.createElement("div");
		quick.className = "research-quick-actions";
		for (let [label, prompt] of [
			["摘要", "请概括本文的研究问题、方法、核心发现和局限。"],
			["提纲", "请按论文结构生成层级清晰的阅读提纲。"],
			["概念", "请解释本文最重要的概念、术语及其相互关系。"],
			["问题", "请提出值得继续研究的问题，并说明它们来自文中的哪些不足。"],
		]) {
			quick.appendChild(this.createButton(doc, label, () => this.askAI(item, prompt, root)));
		}
		root.appendChild(quick);

		let composer = doc.createElement("div");
		composer.className = "research-ai-composer";
		let input = doc.createElement("textarea");
		input.className = "research-ai-input";
		input.rows = 3;
		input.placeholder = "向当前来源提问…";
		let send = this.createButton(doc, "提问", async () => {
			let question = input.value.trim();
			if (!question) return;
			await this.askAI(item, question, root);
		}, true);
		composer.appendChild(input);
		composer.appendChild(send);
		root.appendChild(composer);

		let answer = doc.createElement("div");
		answer.className = "research-ai-answer";
		answer.hidden = true;
		root.appendChild(answer);

		let actions = doc.createElement("div");
		actions.className = "research-workspace-actions research-secondary-actions";
		for (let button of [
			this.createButton(doc, "开始阅读", () => this.startReading(item)),
			this.createButton(doc, "保存为笔记", () => this.saveAIAnswer(item, root)),
			this.createButton(doc, "MinerU", () => this.submitToMinerU(item, root)),
			this.createButton(doc, "模型设置", () => {
				let panel = root.querySelector(".research-model-settings");
				panel.hidden = false;
				panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
				panel.querySelector("input")?.focus();
			}),
		]) actions.appendChild(button);
		root.appendChild(actions);

		let status = doc.createElement("div");
		status.className = "research-workspace-status";
		status.textContent = "就绪";
		root.appendChild(status);
	let session = this.aiSessions.get(item.id);
		if (session?.answer) this.showAIAnswer(root, session.answer);
	},

	renderInlineAISettings({ doc, root, modelState }) {
		let panel = doc.createElement("form");
		panel.className = "research-model-settings";
		panel.hidden = true;
		let baseURL = Services.prefs.getStringPref(this.aiPrefRoot + "aiBaseURL", "https://api.openai.com/v1");
		let model = Services.prefs.getStringPref(this.aiPrefRoot + "aiModel", "gpt-4.1-mini");
		panel.innerHTML = `
			<label><span>接口地址</span><input name="baseURL" type="url" value="${this.escapeHTML(baseURL)}" placeholder="https://api.openai.com/v1"></label>
			<label><span>模型 ID</span><input name="model" type="text" value="${this.escapeHTML(model)}" placeholder="gpt-4.1-mini"></label>
			<label><span>API 密钥</span><input name="apiKey" type="password" autocomplete="off" placeholder="输入或更新密钥"></label>
			<div class="research-model-settings-footer"><small>密钥保存在系统凭据存储中，不写入文库。</small><button type="submit" class="research-workspace-button primary">保存配置</button></div>
			<div class="research-model-message" role="status"></div>`;
		panel.addEventListener("submit", async event => {
			event.preventDefault();
			let submit = panel.querySelector('button[type="submit"]');
			submit.disabled = true;
			try {
				await this.saveInlineAISettings(panel);
				panel.querySelector(".research-model-message").textContent = "配置已保存，可以开始提问。";
				panel.querySelector('[name="apiKey"]').value = "";
				await this.refreshAIModelState(modelState);
			}
			catch (error) {
				panel.querySelector(".research-model-message").textContent = error?.message || String(error);
			}
			finally { submit.disabled = false; }
		});
		root.appendChild(panel);
		this.refreshAIModelState(modelState).then(configured => {
			if (!configured) panel.hidden = false;
		});
	},

	async refreshAIModelState(node) {
		let configured = Boolean(await this.getAPIKey());
		let model = Services.prefs.getStringPref(this.aiPrefRoot + "aiModel", "gpt-4.1-mini");
		node.innerHTML = configured
			? `<strong>${this.escapeHTML(model)}</strong><small>已配置 · 基于当前论文回答</small>`
			: "<strong>尚未配置模型</strong><small>填写接口、模型与密钥后即可对话</small>";
		node.dataset.configured = configured ? "true" : "false";
		return configured;
	},

	async saveInlineAISettings(panel) {
		let baseURL = panel.querySelector('[name="baseURL"]').value.trim().replace(/\/$/, "");
		let model = panel.querySelector('[name="model"]').value.trim();
		let apiKey = panel.querySelector('[name="apiKey"]').value.trim();
		if (!/^https?:\/\//i.test(baseURL)) throw new Error("请填写有效的接口地址。");
		if (!model) throw new Error("请填写模型 ID。");
		Services.prefs.setStringPref(this.aiPrefRoot + "aiBaseURL", baseURL);
		Services.prefs.setStringPref(this.aiPrefRoot + "aiModel", model);
		if (apiKey) {
			let origin = "library-ai://model", realm = "Library AI";
			for (let login of Services.logins.findLogins(origin, null, realm)) Services.logins.removeLogin(login);
			let LoginInfo = Components.Constructor("@mozilla.org/login-manager/loginInfo;1", "nsILoginInfo", "init");
			let loginInfo = new LoginInfo(origin, null, realm, "api", apiKey, "", "");
			if (typeof Services.logins.addLoginAsync === "function") await Services.logins.addLoginAsync(loginInfo);
			else if (typeof Services.logins.addLogin === "function") Services.logins.addLogin(loginInfo);
			else throw new Error("当前 Zotero 运行时不支持保存系统凭据");
		}
		if (!(await this.getAPIKey())) throw new Error("请输入 API 密钥。");
	},

	escapeHTML(value) {
		return Zotero.Utilities.htmlSpecialChars(String(value ?? ""));
	},

	renderMarkdown(markdown) {
		let inline = value => this.escapeHTML(value)
			.replace(/`([^`]+)`/g, "<code>$1</code>")
			.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
			.replace(/\[来源\s*([0-9]+)(?:\s*[·,，]?\s*p\.?\s*([0-9]+))?\]/g, (_all, source, page) => `<button type=\"button\" class=\"research-citation\" data-source=\"${source}\"${page ? ` data-page=\"${page}\"` : ""}>来源 ${source}${page ? ` · p.${page}` : ""}</button>`);
		let blocks = [];
		let list = [];
		let flushList = () => { if (list.length) { blocks.push(`<ul>${list.map(line => `<li>${inline(line)}</li>`).join("")}</ul>`); list = []; } };
		for (let raw of String(markdown || "").split(/\r?\n/)) {
			let line = raw.trim();
			if (!line) { flushList(); continue; }
			let heading = line.match(/^(#{1,3})\s+(.+)$/);
			if (heading) { flushList(); let level = Math.min(4, heading[1].length + 1); blocks.push(`<h${level}>${inline(heading[2])}</h${level}>`); continue; }
			let bullet = line.match(/^[-*]\s+(.+)$/);
			if (bullet) { list.push(bullet[1]); continue; }
			flushList(); blocks.push(`<p>${inline(line)}</p>`);
		}
		flushList();
		return blocks.join("");
	},

	showAIAnswer(root, answer) {
		let output = root.querySelector(".research-ai-answer");
		if (!output) return;
		output.innerHTML = this.renderMarkdown(answer);
		output.hidden = false;
		for (let citation of output.querySelectorAll(".research-citation")) {
			citation.addEventListener("click", () => {
				let source = Number(citation.dataset.source || 1);
				let page = Number(citation.dataset.page || 0);
				this.openCitation(root, source, page);
			});
		}
	},

	async openCitation(root, sourceIndex, page) {
		let itemID = Number(root.dataset.researchItemId || 0);
		let session = this.aiSessions.get(itemID);
		let sourceID = session?.sources?.[sourceIndex - 1] || itemID;
		let item = sourceID ? await Zotero.Items.getAsync(sourceID) : null;
		if (!item) return;
		let reader = await this.startReading(item);
		if (!page) return;
		try { await reader?.navigate?.({ pageIndex: page - 1 }); } catch (error) { this.log(`Unable to navigate to citation: ${error}`); }
	},

	async getAPIKey() {
		let origin = "library-ai://model";
		let realm = "Library AI";
		let logins = Services.logins.findLogins(origin, null, realm);
		return logins[0]?.password || "";
	},

	async buildSourceContext(item) {
		let target = await this.getTargetItem(item);
		let parts = [
			`标题：${target?.getDisplayTitle?.() || item.getDisplayTitle()}`,
			`作者：${target?.getCreators?.().map(creator => [creator.firstName, creator.lastName].filter(Boolean).join(" ")).join("；") || "未知"}`,
			`年份：${target?.getField?.("date") || "未知"}`,
			`摘要：${target?.getField?.("abstractNote") || "未提供"}`,
		];
		let attachment = await this.getPDFAttachment(item);
		if (attachment) {
			try {
				let cacheFile = Zotero.Fulltext.getItemCacheFile(attachment);
				if (cacheFile.exists()) {
					let fulltext = await Zotero.File.getContentsAsync(cacheFile);
					parts.push(`PDF 全文（可能截断）：\n${fulltext.slice(0, 24000)}`);
				}
			}
			catch (error) { this.log(`Unable to read full text: ${error}`); }
		}
		return parts.join("\n\n");
	},

	async getAISourceItems(item) {
		let ids = this.aiSourceSelections.get(item.id) || [item.id];
		let items = [];
		for (let id of ids) {
			let candidate = await Zotero.Items.getAsync(id);
			let target = await this.getTargetItem(candidate);
			if (target?.isRegularItem?.() && !items.some(existing => existing.id === target.id)) items.push(target);
		}
		if (!items.some(existing => existing.id === item.id)) items.unshift(item);
		return items;
	},

	async askAI(item, question, root) {
		let status = root.querySelector(".research-workspace-status");
		let answerNode = root.querySelector(".research-ai-answer");
		status.textContent = "正在阅读当前来源…";
		answerNode.hidden = false;
		answerNode.textContent = "正在生成回答…";
		try {
			let apiKey = await this.getAPIKey();
			if (!apiKey) throw new Error("请先在“皮肤”设置页的“模型”区域配置密钥。");
			let baseURL = Services.prefs.getStringPref(this.aiPrefRoot + "aiBaseURL", "https://api.openai.com/v1").replace(/\/$/, "");
			let model = Services.prefs.getStringPref(this.aiPrefRoot + "aiModel", "gpt-4.1-mini");
			let sources = await this.getAISourceItems(item);
			let contexts = [];
			for (let [index, source] of sources.entries()) {
				contexts.push(`【来源 ${index + 1}】\n${await this.buildSourceContext(source)}`);
			}
			let context = contexts.join("\n\n");
			let response = await fetch(`${baseURL}/chat/completions`, {
				method: "POST",
				headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
				body: JSON.stringify({
					model,
					temperature: 0.2,
					messages: [
						{ role: "system", content: "你是 Library 的论文阅读助手。只能依据给定来源回答；证据不足时明确说明。使用清晰的 Markdown，但不要输出代码围栏。引用来源时使用 [来源 1]、[来源 2]，页码可写成 [来源 1 · p. 2]。" },
						{ role: "user", content: `${context}\n\n【问题】\n${question}` },
					],
				}),
			});
			if (!response.ok) throw new Error(`模型接口返回 ${response.status}`);
			let data = await response.json();
			let answer = data.choices?.[0]?.message?.content?.trim();
			if (!answer) throw new Error("模型没有返回正文。");
			this.aiSessions.set(item.id, { question, answer, sources: sources.map(source => source.id) });
			this.showAIAnswer(root, answer);
			status.textContent = "回答仅基于当前来源";
		}
		catch (error) {
			answerNode.textContent = error.message || String(error);
			status.textContent = "模型未连接";
			this.log(error);
		}
	},

	async saveAIAnswer(item, root) {
		let session = this.aiSessions.get(item.id);
		let status = root.querySelector(".research-workspace-status");
		if (!session?.answer) { status.textContent = "请先生成回答"; return; }
		let target = await this.getTargetItem(item);
		if (!target?.isRegularItem()) { status.textContent = "请选择文献条目"; return; }
		let note = new Zotero.Item("note");
		note.libraryID = target.libraryID;
		note.parentID = target.id;
		note.setNote(`<h1>${this.escapeHTML(session.question)}</h1>${this.renderMarkdown(session.answer)}<p><small>由 Library AI 基于当前来源生成</small></p>`);
		await note.saveTx();
		status.textContent = "已保存到当前文献的笔记";
	},

	createButton(doc, label, onCommand, primary = false) {
		let button = doc.createElement("button");
		button.className = primary
			? "research-workspace-button primary"
			: "research-workspace-button";
		button.textContent = label;
		button.addEventListener("click", async () => {
			button.disabled = true;
			try {
				await onCommand();
			}
			catch (error) {
				this.log(error);
			}
			finally {
				button.disabled = false;
			}
		});
		return button;
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

	async createNote(item) {
		let target = await this.getTargetItem(item);
		if (!target || !target.isRegularItem()) {
			Services.prompt.alert(null, "Library", "请选择一个文献条目后再新建笔记。");
			return;
		}
		let note = new Zotero.Item("note");
		note.libraryID = target.libraryID;
		note.parentID = target.id;
		note.setNote(`<h1>研究笔记</h1><p><strong>${Zotero.Utilities.htmlSpecialChars(target.getDisplayTitle())}</strong></p><p></p>`);
		await note.saveTx();
		await Zotero.getActiveZoteroPane()?.selectItem(note.id);
	},

	async submitToMinerU(item, root) {
		let status = root.querySelector(".research-workspace-status");
		let attachment = await this.getPDFAttachment(item);
		if (!attachment) {
			status.textContent = "解析失败：当前条目没有 PDF 附件。";
			return;
		}

		let path = await attachment.getFilePathAsync();
		if (!path) {
			status.textContent = "解析失败：PDF 文件不在本地。";
			return;
		}

		status.textContent = "正在提交到本地 MinerU…";
		try {
			let bytes = await IOUtils.read(path);
			let form = new FormData();
			form.append("files", new File([bytes], PathUtils.filename(path), { type: "application/pdf" }));
			form.append("backend", "hybrid-engine");
			form.append("effort", "medium");
			form.append("parse_method", "auto");
			form.append("return_md", "false");
			form.append("return_middle_json", "true");
			form.append("return_content_list", "true");
			form.append("return_images", "false");
			form.append("response_format_zip", "false");

			let response = await fetch("http://127.0.0.1:8000/tasks", {
				method: "POST",
				body: form,
			});
			if (!response.ok) throw new Error(`MinerU HTTP ${response.status}`);
			let result = await response.json();
			status.textContent = result.task_id
				? `MinerU 已接收，任务 ${result.task_id}`
				: "MinerU 已接收解析任务。";
		}
		catch (error) {
			this.log(error);
			status.textContent = "无法连接本地 MinerU。请先启动 MinerU 服务（127.0.0.1:8000）。";
		}
	},
};
