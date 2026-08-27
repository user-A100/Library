ResearchWorkspace = {
	id: null,
	version: null,
	rootURI: null,
	initialized: false,
	preferencePaneID: null,
	menuIDs: [],
	prefObserver: null,
	shellStates: new Map(),
	readerDocuments: new Set(),
	readerInitialModes: new Set(),
	sidenoteLayouts: new Map(),
	readerSurfacesRegistered: false,
	annotationNotifierID: null,
	aiViewHost: null,
	annotationModePref: "extensions.zotero.researchWorkspace.annotationDisplayMode",
	aiPrefRoot: "extensions.zotero.researchWorkspace.",

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
				{ id: "mint", color: "#72e3a6", x: 20, y: 20, isPrimary: true },
				{ id: "aqua", color: "#83d9d4", x: 76, y: 34 },
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
		root.style.setProperty("--research-custom-accent", primary?.color || "#72e3a6");
		root.style.setProperty("--research-glow", `color-mix(in srgb, ${primary?.color || "#72e3a6"} 22%, transparent)`);
		root.style.setProperty("--research-grain-opacity", String((Number(config.texture) || 0) / 100));
		for (let doc of this.readerDocuments) this.applyReaderAppearance(doc, config);
	},

	applyReaderAppearance(doc, providedConfig = null) {
		if (!doc?.documentElement) return;
		let config = providedConfig || this.getThemeConfig();
		let primary = config.points.find(point => point.isPrimary) || config.points[0];
		doc.documentElement.style.setProperty("--library-reader-accent", primary?.color || "#72e3a6");
	},

	applyAppearanceToAllWindows() {
		for (let window of Zotero.getMainWindows()) {
			this.applyAppearance(window);
		}
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

		let makeEdge = side => {
			let edge = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
			edge.className = `research-shell-edge research-shell-edge-${side}`;
			edge.dataset.side = side;
			edge.setAttribute("aria-hidden", "true");
			return edge;
		};
		let edge = makeEdge("left");
		doc.documentElement.append(edge);

		let bind = (target, type, handler, options) => {
			if (!target) return;
			target.addEventListener(type, handler, options);
			state.listeners.push([target, type, handler, options]);
		};
		bind(edge, "mouseenter", () => this.revealShellSide(window, "left"));
		bind(edge, "mouseleave", () => this.scheduleShellHide(window, "left"));
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
		root.dataset[`research${side[0].toUpperCase()}${side.slice(1)}Open`] = String(Boolean(open));
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
		for (let element of doc.querySelectorAll(".research-shell-edge")) element.remove();
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

		this.registerReaderSurfaces();
	},

	registerReaderSurfaces() {
		if (this.readerSurfacesRegistered) return;

		Zotero.Reader.registerEventListener(
			"renderToolbar",
			event => this.renderAnnotationModeSwitch(event),
			this.id,
		);
		Zotero.Reader.registerEventListener(
			"renderTextSelectionPopup",
			event => this.handleTextSelectionPopup(event),
			this.id,
		);
		Zotero.Reader.registerEventListener(
			"createAnnotationContextMenu",
			event => this.extendAnnotationContextMenu(event),
			this.id,
		);
		this.annotationNotifierID = Zotero.Notifier.registerObserver({
			notify: (event, type, ids) => {
				if (type !== "item" || !["add", "modify", "trash", "delete"].includes(event)) return;
				for (let reader of Zotero.Reader._readers || []) {
					if (reader?.itemID && this.readerDocuments.has(reader._iframeWindow?.document)) {
						this.refreshSidenotes(reader, ids);
					}
				}
			},
		}, ["item"], "research-workspace-annotations");
		this.readerSurfacesRegistered = true;
	},

	getAnnotationMode() {
		let mode = Services.prefs.getStringPref(this.annotationModePref, "sidenotes");
		if (mode === "sidebar") {
			mode = "sidenotes";
			Services.prefs.setStringPref(this.annotationModePref, mode);
		}
		return mode === "popup" ? "popup" : "sidenotes";
	},

	setAnnotationMode(mode, reader = null) {
		mode = mode === "popup" ? "popup" : "sidenotes";
		Services.prefs.setStringPref(this.annotationModePref, mode);
		this.updateReaderDocuments(mode);
		if (reader) {
			if (mode === "sidenotes") this.openAnnotationSidebar(reader);
			else this.closeAnnotationSidebar(reader);
		}
	},

	ensureReaderStyle(doc) {
		if (!doc?.documentElement) return;
		this.readerDocuments.add(doc);
		this.applyReaderAppearance(doc);
		if (doc.getElementById("library-annotation-mode-style")) return;

		let style = doc.createElement("style");
		style.id = "library-annotation-mode-style";
		style.textContent = `
			.library-annotation-mode {
				display: inline-flex;
				align-items: center;
				gap: 2px;
				margin-inline-end: 6px;
				padding: 2px;
				border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
				border-radius: 9px;
				background: color-mix(in srgb, Canvas 88%, transparent);
				box-shadow: 0 1px 2px rgba(0, 0, 0, .06);
			}
			.library-annotation-mode-label {
				padding-inline: 6px 4px;
				font-size: 11px;
				font-weight: 600;
				opacity: .64;
				white-space: nowrap;
			}
			.library-annotation-mode-button {
				min-width: 42px;
				height: 26px;
				padding: 0 8px;
				border: 0;
				border-radius: 7px;
				background: transparent;
				color: inherit;
				font: inherit;
				font-size: 12px;
				cursor: pointer;
			}
			.library-annotation-mode-button:hover {
				background: color-mix(in srgb, currentColor 8%, transparent);
			}
			.library-annotation-mode-button[aria-pressed="true"] {
				background: color-mix(in srgb, var(--library-reader-accent, #72e3a6) 22%, Canvas);
				color: color-mix(in srgb, var(--library-reader-accent, #23865f) 76%, CanvasText);
				box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--library-reader-accent, #72e3a6) 32%, transparent);
				font-weight: 600;
			}
			html[data-library-sidenotes-open="true"] .split-view {
				inset-inline-end: var(--library-sidenotes-width, 340px) !important;
				transition: inset-inline-end 180ms cubic-bezier(.2,.82,.2,1);
			}
			html[data-library-annotation-mode="sidenotes"] .annotation-popup {
				display: none !important;
			}
			.library-sidenotes {
				position: fixed; z-index: 40; top: 41px; inset-inline-end: 0; bottom: var(--bottom-placeholder-height, 0);
				box-sizing: border-box; width: var(--library-sidenotes-width, 340px); display: grid;
				grid-template-rows: auto minmax(0, 1fr); overflow: hidden;
				border-inline-start: 1px solid color-mix(in srgb, CanvasText 14%, transparent);
				background: color-mix(in srgb, Canvas 88%, var(--library-reader-accent, #72e3a6) 12%);
				color: CanvasText; box-shadow: -12px 0 34px color-mix(in srgb, CanvasText 8%, transparent);
			}
			.library-sidenotes-header { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 12px 10px 15px; border-bottom:1px solid color-mix(in srgb,CanvasText 10%,transparent); }
			.library-sidenotes-heading { display:grid; gap:2px; }
			.library-sidenotes-heading strong { font-size:15px; font-weight:700; }
			.library-sidenotes-heading small,.library-sidenote-card>small { color:color-mix(in srgb,CanvasText 58%,transparent); font-size:10px; }
			.library-sidenotes-close,.library-sidenote-delete { border:0; background:transparent; color:color-mix(in srgb,CanvasText 62%,transparent); cursor:pointer; }
			.library-sidenotes-close { width:28px; height:28px; border-radius:9px; font-size:22px; }
			.library-sidenotes-close:hover,.library-sidenote-delete:hover { background:color-mix(in srgb,CanvasText 8%,transparent); color:CanvasText; }
			.library-sidenotes-list { position:relative; min-height:0; overflow:hidden; padding:0; isolation:isolate; }
			.library-sidenotes-empty { margin:8px; padding:18px 12px; border:1px dashed color-mix(in srgb,CanvasText 18%,transparent); border-radius:12px; color:color-mix(in srgb,CanvasText 58%,transparent); font-size:12px; line-height:1.55; }
			.library-sidenotes-viewport-hint { position:absolute; z-index:2; inset-inline:18px; top:50%; translate:0 -50%; padding:14px 16px; border:1px dashed color-mix(in srgb,CanvasText 18%,transparent); border-radius:12px; color:color-mix(in srgb,CanvasText 52%,transparent); background:color-mix(in srgb,Canvas 72%,transparent); font-size:12px; line-height:1.55; text-align:center; pointer-events:none; }
			.library-sidenotes-viewport-hint[hidden] { display:none; }
			.library-sidenotes-leaders { position:absolute; z-index:0; inset:0; width:100%; height:100%; overflow:visible; pointer-events:none; }
			.library-sidenote-leader { fill:none; stroke:var(--annotation-color,#f4c542); stroke-width:1.35; stroke-linecap:round; opacity:.72; }
			.library-sidenote-anchor { fill:var(--annotation-color,#f4c542); stroke:Canvas; stroke-width:1.5; }
			.library-sidenote-card { position:absolute; z-index:1; inset-inline:12px 10px; top:0; box-sizing:border-box; display:grid; gap:8px; margin:0; padding:10px; border:1px solid color-mix(in srgb,var(--annotation-color,#f4c542) 48%,CanvasText); border-radius:13px; background:color-mix(in srgb,var(--annotation-color,#f4c542) 14%,Canvas); box-shadow:0 8px 22px color-mix(in srgb,CanvasText 7%,transparent); transform:translateY(var(--library-sidenote-y,0px)); transform-origin:top; opacity:0; pointer-events:none; transition:opacity 100ms ease, transform 130ms cubic-bezier(.2,.82,.2,1); }
			.library-sidenote-card[data-anchor-visible="true"] { opacity:1; pointer-events:auto; }
			.library-sidenote-card>header { display:flex; align-items:center; gap:6px; }
			.library-sidenote-locate { display:inline-flex; align-items:center; gap:7px; min-width:0; flex:1; padding:0; border:0; background:transparent; color:CanvasText; font:inherit; text-align:start; cursor:pointer; }
			.library-sidenote-locate b { display:grid; place-items:center; width:23px; height:23px; flex:0 0 23px; border-radius:50%; background:var(--annotation-color,#f4c542); color:#222; font-size:12px; }
			.library-sidenote-locate span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; font-weight:680; }
			.library-sidenote-delete { padding:3px 5px; border-radius:6px; font-size:10px; }
			.library-sidenote-card blockquote { margin:0; color:CanvasText; font-size:12px; line-height:1.5; }
			.library-sidenote-card textarea { box-sizing:border-box; width:100%; min-height:46px; resize:vertical; padding:8px; border:1px solid color-mix(in srgb,CanvasText 18%,transparent); border-radius:9px; background:color-mix(in srgb,Canvas 82%,transparent); color:CanvasText; font:12px/1.45 inherit; }
			.library-sidenote-card textarea:focus { outline:2px solid color-mix(in srgb,var(--library-reader-accent,#72e3a6) 46%,transparent); outline-offset:1px; }
			@media (max-width: 920px) { html { --library-sidenotes-width: 300px; } }
			@media (prefers-reduced-motion: no-preference) {
				.library-annotation-mode-button {
					transition: background-color 120ms ease, color 120ms ease, box-shadow 120ms ease;
				}
			}
		`;
		doc.head?.append(style);
	},

	updateReaderDocuments(mode = this.getAnnotationMode()) {
		for (let doc of [...this.readerDocuments]) {
			try {
				if (!doc?.documentElement?.isConnected) {
					this.readerDocuments.delete(doc);
					continue;
				}
				doc.documentElement.dataset.libraryAnnotationMode = mode;
				for (let button of doc.querySelectorAll(".library-annotation-mode-button")) {
					button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
				}
			}
			catch (error) {
				this.readerDocuments.delete(doc);
			}
		}
	},

	renderAnnotationModeSwitch({ reader, doc, append }) {
		this.ensureReaderStyle(doc);

		let group = doc.createElement("div");
		group.className = "library-annotation-mode";
		group.setAttribute("role", "group");
		group.setAttribute("aria-label", "批注显示模式");

		let label = doc.createElement("span");
		label.className = "library-annotation-mode-label";
		label.textContent = "批注";
		group.append(label);

		for (let [mode, text, title] of [
			["popup", "弹窗", "在文档旁弹出批注编辑框"],
			["sidenotes", "侧边", "在页面侧边显示批注卡片"],
		]) {
			let button = doc.createElement("button");
			button.className = "library-annotation-mode-button";
			button.dataset.mode = mode;
			button.textContent = text;
			button.title = title;
			button.setAttribute("aria-pressed", String(this.getAnnotationMode() === mode));
			button.addEventListener("click", () => this.setAnnotationMode(mode, reader));
			group.append(button);
		}

		append(group);
		doc.documentElement.dataset.libraryAnnotationMode = this.getAnnotationMode();
		let readerKey = reader?._instanceID || reader?.itemID;
		if (this.getAnnotationMode() === "sidenotes" && readerKey && !this.readerInitialModes.has(readerKey)) {
			this.readerInitialModes.add(readerKey);
			doc.defaultView.setTimeout(() => this.openAnnotationSidebar(reader));
		}
	},

	handleTextSelectionPopup({ reader, doc }) {
		this.ensureReaderStyle(doc);
		doc.documentElement.dataset.libraryAnnotationMode = this.getAnnotationMode();
		if (this.getAnnotationMode() === "sidenotes") {
			this.openAnnotationSidebar(reader);
		}
	},

	extendAnnotationContextMenu({ reader, append }) {
		append({
			label: "在侧边栏编辑",
			onCommand: () => {
				this.setAnnotationMode("sidenotes", reader);
			},
		});
	},

	openAnnotationSidebar(reader) {
		try {
			let doc = reader?._iframeWindow?.document;
			if (!doc) return;
			this.readerDocuments.add(doc);
			this.renderSidenoteSidebar(reader, doc);
		}
		catch (error) {
			this.log(`Unable to open side notes: ${error}`);
		}
	},

	closeAnnotationSidebar(reader) {
		let doc = reader?._iframeWindow?.document;
		if (!doc) return;
		this.disposeSidenoteLayout(reader);
		doc.getElementById("library-sidenotes")?.remove();
		delete doc.documentElement.dataset.librarySidenotesOpen;
	},

	getReaderAnnotationItems(reader) {
		try {
			let item = Zotero.Items.get(reader?.itemID);
			if (!item?.isFileAttachment?.()) return [];
			return item.getAnnotations().filter(annotation => !annotation.deleted);
		}
		catch (error) {
			this.log(`Unable to read annotations: ${error}`);
			return [];
		}
	},

	annotationPageIndex(annotation) {
		try {
			return Number(JSON.parse(annotation.annotationPosition || "{}").pageIndex) || 0;
		}
		catch {
			return 0;
		}
	},

	annotationPosition(annotation) {
		try {
			let position = JSON.parse(annotation.annotationPosition || "{}");
			return position && Number.isFinite(Number(position.pageIndex)) ? position : null;
		}
		catch {
			return null;
		}
	},

	annotationLabel(annotation) {
		return {
			highlight: "高亮",
			underline: "下划线",
			note: "便签",
			image: "区域",
			ink: "手写",
		}[annotation.annotationType] || "批注";
	},

	renderSidenoteSidebar(reader, doc) {
		if (!doc?.documentElement) return;
		this.disposeSidenoteLayout(reader);
		let host = doc.getElementById("library-sidenotes");
		if (!host) {
			host = doc.createElement("aside");
			host.id = "library-sidenotes";
			host.className = "library-sidenotes";
			host.setAttribute("aria-label", "侧边批注");
			doc.documentElement.append(host);
		}
		doc.documentElement.dataset.librarySidenotesOpen = "true";
		doc.documentElement.dataset.libraryAnnotationMode = "sidenotes";
		host.replaceChildren();

		let annotations = this.getReaderAnnotationItems(reader).sort((a, b) => {
			let page = this.annotationPageIndex(a) - this.annotationPageIndex(b);
			return page || String(a.annotationSortIndex || "").localeCompare(String(b.annotationSortIndex || ""));
		});
		let header = doc.createElement("header");
		header.className = "library-sidenotes-header";
		let heading = doc.createElement("div");
		heading.className = "library-sidenotes-heading";
		heading.innerHTML = "<strong>侧边批注</strong><small>随划线位置同步移动</small>";
		let close = doc.createElement("button");
		close.className = "library-sidenotes-close";
		close.textContent = "×";
		close.title = "收起侧边批注";
		close.addEventListener("click", () => this.closeAnnotationSidebar(reader));
		header.append(heading, close);
		host.append(header);

		let list = doc.createElement("div");
		list.className = "library-sidenotes-list";
		let leaders = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
		leaders.classList.add("library-sidenotes-leaders");
		leaders.setAttribute("aria-hidden", "true");
		list.append(leaders);
		let viewportHint = null;
		if (annotations.length) {
			viewportHint = doc.createElement("div");
			viewportHint.className = "library-sidenotes-viewport-hint";
			viewportHint.textContent = "滚动到划线位置，批注会贴着对应原文出现。";
			list.append(viewportHint);
		}
		if (!annotations.length) {
			let empty = doc.createElement("div");
			empty.className = "library-sidenotes-empty";
			empty.textContent = "选中文字并使用高亮或下划线，批注会显示在这里。";
			list.append(empty);
		}
		for (let [index, annotation] of annotations.entries()) {
			let card = doc.createElement("article");
			card.className = "library-sidenote-card";
			card.style.setProperty("--annotation-color", annotation.annotationColor || "#f4c542");
			card.dataset.annotationID = annotation.key;
			card.dataset.pageIndex = String(this.annotationPageIndex(annotation));
			card._libraryAnnotationPosition = this.annotationPosition(annotation);
			let cardHeader = doc.createElement("header");
			let locate = doc.createElement("button");
			locate.className = "library-sidenote-locate";
			locate.innerHTML = `<b>${index + 1}</b><span>${this.annotationLabel(annotation)} · p. ${annotation.annotationPageLabel || this.annotationPageIndex(annotation) + 1}</span>`;
			locate.addEventListener("click", () => {
				reader.navigate({ annotationID: annotation.key });
			});
			let remove = doc.createElement("button");
			remove.className = "library-sidenote-delete";
			remove.textContent = "删除";
			remove.title = "删除批注（可撤销）";
			remove.disabled = !annotation.isEditable?.();
			remove.addEventListener("click", () => this.deleteAnnotation(annotation, reader));
			cardHeader.append(locate, remove);
			card.append(cardHeader);
			if (annotation.annotationText) {
				let quote = doc.createElement("blockquote");
				quote.textContent = annotation.annotationText;
				card.append(quote);
			}
			let comment = doc.createElement("textarea");
			comment.rows = 2;
			comment.placeholder = "补充你的批注…";
			comment.value = annotation.annotationComment || "";
			comment.addEventListener("focus", () => reader.navigate({ annotationID: annotation.key }));
			comment.addEventListener("change", () => this.updateAnnotationComment(annotation, comment.value, reader));
			card.append(comment);
			let meta = doc.createElement("small");
			meta.textContent = annotation.dateModified ? `更新于 ${annotation.dateModified}` : "已同步到当前文库";
			card.append(meta);
			list.append(card);
		}
			host.append(list);
		this.installSidenoteLayout(reader, doc, host, list, leaders, viewportHint);
	},

	disposeSidenoteLayout(reader) {
		let key = reader?._instanceID || reader?.itemID || reader;
		let state = this.sidenoteLayouts.get(key);
		if (!state) return;
		try {
			if (state.raf) state.window.cancelAnimationFrame(state.raf);
			if (state.trailingTimer) state.window.clearTimeout(state.trailingTimer);
			for (let cleanup of state.cleanups) cleanup();
			state.resizeObserver?.disconnect();
		}
		catch (error) {
			this.log(`Unable to dispose side-note layout: ${error}`);
		}
		this.sidenoteLayouts.delete(key);
	},

	installSidenoteLayout(reader, doc, host, list, leaders, viewportHint) {
		let key = reader?._instanceID || reader?.itemID || reader;
		let win = doc.defaultView;
		let primaryView = reader?._internalReader?._primaryView;
		let pdfWindow = primaryView?._iframeWindow;
		let viewer = pdfWindow?.PDFViewerApplication?.pdfViewer;
		let scrollElement = pdfWindow?.document?.getElementById("viewerContainer");
		if (!win || !primaryView?._iframe || !viewer || !scrollElement) {
			for (let card of list.querySelectorAll(".library-sidenote-card")) {
				card.dataset.anchorVisible = "false";
			}
			let unavailable = doc.createElement("div");
			unavailable.className = "library-sidenotes-empty";
			unavailable.textContent = "正在连接原文位置…";
			list.append(unavailable);
			let attempts = Number(host.dataset.layoutAttempts || 0) + 1;
			host.dataset.layoutAttempts = String(attempts);
			if (win && attempts < 40) {
				win.setTimeout(() => {
					if (host.isConnected && this.getAnnotationMode() === "sidenotes") {
						this.renderSidenoteSidebar(reader, doc);
					}
				}, attempts < 8 ? 140 : 300);
			}
			return;
		}
		delete host.dataset.layoutAttempts;

		let state = {
			reader,
			window: win,
			primaryView,
			pdfWindow,
			viewer,
			host,
			list,
			leaders,
			viewportHint,
			raf: 0,
			trailingTimer: 0,
			cleanups: [],
			resizeObserver: null,
			didLogPosition: false,
			lastAnchorDiagnostic: null,
		};
		this.sidenoteLayouts.set(key, state);

		let schedule = () => this.scheduleSidenoteLayout(reader);
		let scheduleTrailing = () => {
			schedule();
			if (state.trailingTimer) win.clearTimeout(state.trailingTimer);
			state.trailingTimer = win.setTimeout(schedule, 140);
		};
		scrollElement.addEventListener("scroll", schedule, { passive: true });
		pdfWindow.addEventListener("resize", scheduleTrailing, { passive: true });
		win.addEventListener("resize", scheduleTrailing, { passive: true });
		state.cleanups.push(
			() => scrollElement.removeEventListener("scroll", schedule),
			() => pdfWindow.removeEventListener("resize", scheduleTrailing),
			() => win.removeEventListener("resize", scheduleTrailing),
		);

		let eventBus = pdfWindow.PDFViewerApplication?.eventBus;
		for (let eventName of ["pagerendered", "updateviewarea", "scalechanging", "rotationchanging"]) {
			eventBus?.on?.(eventName, scheduleTrailing);
			state.cleanups.push(() => eventBus?.off?.(eventName, scheduleTrailing));
		}

		if (win.ResizeObserver) {
			state.resizeObserver = new win.ResizeObserver(scheduleTrailing);
			state.resizeObserver.observe(host);
			state.resizeObserver.observe(list);
			state.resizeObserver.observe(primaryView._iframe);
			for (let card of list.querySelectorAll(".library-sidenote-card")) {
				state.resizeObserver.observe(card);
			}
		}
		win.setTimeout(schedule);
		win.setTimeout(schedule, 220);
	},

	scheduleSidenoteLayout(reader) {
		let key = reader?._instanceID || reader?.itemID || reader;
		let state = this.sidenoteLayouts.get(key);
		if (!state || state.raf) return;
		state.raf = state.window.requestAnimationFrame(() => {
			state.raf = 0;
			this.positionSidenotes(state);
		});
	},

	getSidenoteAnchor(state, position) {
		if (!position || !Array.isArray(position.rects) || !position.rects.length) return null;
		let pageIndex = Number(position.pageIndex);
		let pageView = state.viewer.getPageView?.(pageIndex);
		let pageElement = pageView?.div;
		let viewport = pageView?.viewport;
		if (!pageElement?.isConnected || !viewport?.convertToViewportPoint) return null;

		let pageRect = pageElement.getBoundingClientRect();
		let iframeRect = state.primaryView._iframe.getBoundingClientRect();
		let firstLineTop = Infinity;
		let firstLineHeight = 0;
		for (let rect of position.rects) {
			if (!Array.isArray(rect) || rect.length < 4) continue;
			let pointA = viewport.convertToViewportPoint(rect[0], rect[1]);
			let pointB = viewport.convertToViewportPoint(rect[2], rect[3]);
			let top = Math.min(pointA[1], pointB[1]);
			let height = Math.abs(pointB[1] - pointA[1]);
			if (top < firstLineTop) {
				firstLineTop = top;
				firstLineHeight = height;
			}
		}
		if (!Number.isFinite(firstLineTop)) return null;

		let scale = pageRect.height / Math.max(1, viewport.height);
		let outerY = iframeRect.top + pageRect.top + (firstLineTop + firstLineHeight / 2) * scale;
		let listRect = state.list.getBoundingClientRect();
		state.lastAnchorDiagnostic = {
			pageIndex,
			pageTop: Math.round(pageRect.top),
			pageHeight: Math.round(pageRect.height),
			iframeTop: Math.round(iframeRect.top),
			lineTop: Math.round(firstLineTop),
			listTop: Math.round(listRect.top),
			listHeight: Math.round(listRect.height),
			anchorY: Math.round(outerY - listRect.top),
		};
		return outerY - listRect.top;
	},

	resolveSidenoteCollisions(items, height, gap = 9) {
		let nextFreeY = 4;
		for (let item of items) {
			item.y = Math.max(4, item.anchorY - 18, nextFreeY);
			nextFreeY = item.y + item.height + gap;
		}
		let ceiling = Math.max(4, height - 4);
		for (let index = items.length - 1; index >= 0; index--) {
			let item = items[index];
			let maxY = index === items.length - 1
				? ceiling - item.height
				: items[index + 1].y - gap - item.height;
			item.y = Math.max(4, Math.min(item.y, maxY));
		}
		return items;
	},

	positionSidenotes(state) {
		if (!state.list?.isConnected || !state.primaryView?._iframe?.isConnected) return;
		let listRect = state.list.getBoundingClientRect();
		let cards = [];
		for (let card of state.list.querySelectorAll(".library-sidenote-card")) {
			let anchorY = this.getSidenoteAnchor(state, card._libraryAnnotationPosition);
			let visible = Number.isFinite(anchorY) && anchorY >= -12 && anchorY <= listRect.height + 12;
			card.dataset.anchorVisible = String(visible);
			if (visible) {
				cards.push({
					card,
					anchorY: Math.max(0, Math.min(listRect.height, anchorY)),
					height: card.getBoundingClientRect().height,
				});
			}
		}
		cards.sort((a, b) => a.anchorY - b.anchorY);
		this.resolveSidenoteCollisions(cards, listRect.height);
		if (state.viewportHint) state.viewportHint.hidden = cards.length > 0;
		if (!state.didLogPosition) {
			state.didLogPosition = true;
			this.log(`Side-note anchor: ${JSON.stringify(state.lastAnchorDiagnostic)}; visible cards=${cards.length}`);
		}

		state.leaders.replaceChildren();
		state.leaders.setAttribute("viewBox", `0 0 ${Math.max(1, listRect.width)} ${Math.max(1, listRect.height)}`);
		for (let item of cards) {
			item.card.style.setProperty("--library-sidenote-y", `${Math.round(item.y)}px`);
			let color = item.card.style.getPropertyValue("--annotation-color") || "#f4c542";
			let line = state.leaders.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "path");
			line.classList.add("library-sidenote-leader");
			line.style.setProperty("--annotation-color", color);
			let cardY = item.y + 18;
			line.setAttribute("d", `M 0 ${item.anchorY.toFixed(1)} C 5 ${item.anchorY.toFixed(1)}, 7 ${cardY.toFixed(1)}, 12 ${cardY.toFixed(1)}`);
			let dot = state.leaders.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "circle");
			dot.classList.add("library-sidenote-anchor");
			dot.style.setProperty("--annotation-color", color);
			dot.setAttribute("cx", "2.5");
			dot.setAttribute("cy", item.anchorY.toFixed(1));
			dot.setAttribute("r", "2.5");
			state.leaders.append(line, dot);
		}
	},

	refreshSidenotes(reader) {
		if (this.getAnnotationMode() !== "sidenotes") return;
		let doc = reader?._iframeWindow?.document;
		if (doc?.getElementById("library-sidenotes")) this.renderSidenoteSidebar(reader, doc);
	},

	async updateAnnotationComment(annotation, comment, reader) {
		try {
			annotation.annotationComment = comment;
			await annotation.saveTx();
			this.refreshSidenotes(reader);
		}
		catch (error) {
			this.log(`Unable to save annotation comment: ${error}`);
		}
	},

	async deleteAnnotation(annotation, reader) {
		try {
			// Move the annotation to Zotero's trash instead of erasing it. This keeps
			// accidental deletions recoverable through the native trash view.
			await Zotero.Items.trashTx([annotation.id]);
			this.refreshSidenotes(reader);
		}
		catch (error) {
			this.log(`Unable to delete annotation: ${error}`);
		}
	},

	removeReaderSurfaces() {
		for (let state of [...this.sidenoteLayouts.values()]) this.disposeSidenoteLayout(state.reader);
		for (let doc of this.readerDocuments) {
			try {
				doc.getElementById("library-annotation-mode-style")?.remove();
				doc.getElementById("library-sidenotes")?.remove();
				delete doc.documentElement.dataset.libraryAnnotationMode;
				delete doc.documentElement.dataset.librarySidenotesOpen;
				for (let element of doc.querySelectorAll(".library-annotation-mode")) element.remove();
			}
			catch (error) {
				// The reader document may already have been destroyed.
			}
		}
		this.readerDocuments.clear();
		this.readerInitialModes.clear();
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
			Services.logins.addLogin(new LoginInfo(origin, null, realm, "api", apiKey, "", ""));
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

	async startReading(item) {
		let attachment = await this.getPDFAttachment(item);
		if (!attachment) {
			Services.prompt.alert(null, "Library", "当前条目没有可阅读的 PDF 附件。");
			return;
		}
		let reader = await Zotero.Reader.open(attachment.id);
		if (!reader) {
			let mainWindow = Zotero.getMainWindow?.();
			let tabID = mainWindow?.Zotero_Tabs?.getTabIDByItemID?.(attachment.id);
			if (tabID) reader = Zotero.Reader.getByTabID(tabID);
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
