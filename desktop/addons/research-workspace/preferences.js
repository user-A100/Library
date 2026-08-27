var ResearchWorkspacePreferences = {
	initialized: false,
	activePointID: null,
	draggingPointID: null,
	config: null,
	defaultConfig() { return { version: 1, algorithm: "free", opacity: 72, texture: 18, points: [{ id: "mint", color: "#72e3a6", x: 20, y: 20, isPrimary: true }, { id: "aqua", color: "#83d9d4", x: 76, y: 34 }, { id: "cream", color: "#f1e9c9", x: 48, y: 82 }] }; },
	loadConfig() {
		try { let value = Services.prefs.getStringPref("extensions.zotero.researchWorkspace.themeConfig", ""); let parsed = JSON.parse(value); if (Array.isArray(parsed.points) && parsed.points.length) return parsed; } catch (error) {}
		return this.defaultConfig();
	},
	init() {
		let root = document.getElementById("research-workspace-preferences-root");
		if (!root || this.initialized) return;
		this.initialized = true; this.config = this.loadConfig(); this.activePointID = this.config.points.find(point => point.isPrimary)?.id || this.config.points[0].id;
		for (let button of root.querySelectorAll("[data-appearance]")) button.addEventListener("click", () => {
			let appearance = Number(button.dataset.appearance);
			Services.prefs.setIntPref("browser.theme.toolbar-theme", appearance);
			document.documentElement.style.colorScheme = appearance === 0 ? "dark" : appearance === 1 ? "light" : "light dark";
			this.refreshAppearance();
		});
		for (let button of root.querySelectorAll("[data-preset]")) button.addEventListener("click", () => this.applyPreset(button.dataset.preset.split(",")));
		root.querySelector("#theme-add").addEventListener("click", event => { event.stopPropagation(); this.addPoint(); });
		root.querySelector("#theme-remove").addEventListener("click", event => { event.stopPropagation(); this.removePoint(); });
		root.querySelector("#theme-color").addEventListener("input", event => { let point = this.getActivePoint(); if (point) point.color = event.target.value; this.commit(); });
		root.querySelector("#theme-algorithm").addEventListener("click", () => { this.config.algorithm = this.config.algorithm === "free" ? "flow" : "free"; this.commit(); });
		root.querySelector("#theme-reset").addEventListener("click", () => { this.config = this.defaultConfig(); this.activePointID = this.config.points[0].id; this.commit(); });
		for (let key of ["opacity", "texture"]) root.querySelector(`#theme-${key}`).addEventListener("input", event => { this.config[key] = Number(event.target.value); this.commit(); });
		let canvas = root.querySelector("#theme-canvas");
		canvas.addEventListener("pointerdown", event => {
			if (!event.target.closest("[data-theme-control], button, input, label")) this.movePoint(event, this.activePointID);
		});
		canvas.addEventListener("pointermove", event => { if (this.draggingPointID) this.movePoint(event, this.draggingPointID); });
		for (let name of ["pointerup", "pointercancel", "pointerleave"]) canvas.addEventListener(name, () => { this.draggingPointID = null; this.refresh(); });
		this.refresh();
	},
	getActivePoint() { return this.config.points.find(point => point.id === this.activePointID) || this.config.points[0]; },
	movePoint(event, pointID) {
		let canvas = document.getElementById("theme-canvas"), rect = canvas.getBoundingClientRect(), point = this.config.points.find(candidate => candidate.id === pointID);
		if (!point || !rect.width || !rect.height) return;
		point.x = Math.max(4, Math.min(96, ((event.clientX - rect.left) / rect.width) * 100)); point.y = Math.max(4, Math.min(96, ((event.clientY - rect.top) / rect.height) * 100));
		let button = [...canvas.querySelectorAll(".theme-point")].find(candidate => candidate.getAttribute("data-point-id") === pointID); if (button) { button.style.left = `${point.x}%`; button.style.top = `${point.y}%`; }
		this.commit(false);
	},
	addPoint() { if (this.config.points.length >= 5) return; let id = `custom-${Date.now()}`; this.config.points.push({ id, color: "#f4b7c8", x: 50, y: 50 }); this.activePointID = id; this.commit(); },
	removePoint() { if (this.config.points.length <= 1) return; this.config.points = this.config.points.filter(point => point.id !== this.activePointID); if (!this.config.points.some(point => point.isPrimary)) this.config.points[0].isPrimary = true; this.activePointID = this.config.points[0].id; this.commit(); },
	applyPreset(colors) { let positions = [[20,20],[76,34],[48,82]], seed = Date.now(); this.config.points = colors.map((color,index) => ({ id:`preset-${seed}-${index}`, color, x:positions[index]?.[0] ?? 50, y:positions[index]?.[1] ?? 50, isPrimary:index === 0 })); this.activePointID = this.config.points[0].id; this.commit(); },
	commit(refresh = true) { Services.prefs.setStringPref("extensions.zotero.researchWorkspace.themeConfig", JSON.stringify(this.config)); if (refresh) this.refresh(); else { let canvas = document.getElementById("theme-canvas"); if (canvas) { canvas.style.backgroundImage = this.buildGradient(); canvas.closest(".research-preferences")?.style.setProperty("--research-custom-accent", this.getActivePoint()?.color || "#72e3a6"); } } },
	hexToRGBA(color, alpha) {
		let hex = String(color || "#72e3a6").replace("#", "");
		if (hex.length === 3) hex = hex.split("").map(value => value + value).join("");
		let value = Number.parseInt(hex.slice(0, 6), 16);
		if (!Number.isFinite(value)) value = 0x72e3a6;
		return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
	},
	buildGradient() {
		let opacity = Math.max(18, Math.min(100, this.config.opacity)) / 100;
		let layers = this.config.points.map((point,index) => { let x = this.config.algorithm === "flow" ? 10 + (index * 80) / Math.max(1,this.config.points.length - 1) : point.x; let y = this.config.algorithm === "flow" ? 25 + (index % 2) * 55 : point.y; return `radial-gradient(circle at ${x}% ${y}%, ${this.hexToRGBA(point.color,opacity)} 0%, ${this.hexToRGBA(point.color,0)} 62%)`; });
		let texture = `repeating-radial-gradient(circle at 0 0, rgba(20,30,26,${Math.round((this.config.texture / 100) * 8) / 100}) 0 .7px, transparent .8px 5px)`;
		return [texture, ...layers, "linear-gradient(155deg,#f5f3ea,#e8eee8)"].join(",");
	},
	refreshAppearance() { let appearance = String(Services.prefs.getIntPref("browser.theme.toolbar-theme",2)); for (let button of document.querySelectorAll("[data-appearance]")) { let selected = button.dataset.appearance === appearance; button.classList.toggle("selected",selected); button.setAttribute("aria-pressed",selected ? "true" : "false"); } },
	refresh() {
		let canvas = document.getElementById("theme-canvas"); if (!canvas) return; canvas.style.backgroundImage = this.buildGradient(); canvas.closest(".research-preferences")?.style.setProperty("--research-custom-accent", this.getActivePoint()?.color || "#72e3a6"); for (let oldPoint of canvas.querySelectorAll(".theme-point")) oldPoint.remove();
		for (let point of this.config.points) { let button = document.createElementNS("http://www.w3.org/1999/xhtml","button"); button.type="button"; button.className="theme-point"; button.setAttribute("data-point-id",point.id); button.style.left=`${point.x}%`; button.style.top=`${point.y}%`; button.style.background=point.color; button.setAttribute("aria-label",`编辑颜色 ${point.color}`); button.setAttribute("aria-pressed",point.id === this.activePointID ? "true" : "false"); button.addEventListener("pointerdown",event => { event.stopPropagation(); this.activePointID=point.id; this.draggingPointID=point.id; for (let candidate of canvas.querySelectorAll(".theme-point")) candidate.setAttribute("aria-pressed",candidate === button ? "true" : "false"); document.getElementById("theme-color").value=point.color; }); canvas.appendChild(button); }
		let active=this.getActivePoint(); document.getElementById("theme-color").value=active?.color || "#72e3a6"; document.getElementById("theme-add").disabled=this.config.points.length >= 5; document.getElementById("theme-remove").disabled=this.config.points.length <= 1;
		for (let key of ["opacity","texture"]) { document.getElementById(`theme-${key}`).value=this.config[key]; document.getElementById(`theme-${key}-output`).value=`${this.config[key]}%`; }
		let flow=this.config.algorithm === "flow"; document.getElementById("theme-algorithm").setAttribute("aria-pressed",flow ? "true" : "false"); document.getElementById("theme-algorithm-title").textContent=flow ? "流动配色" : "自由渐变"; document.getElementById("theme-algorithm-description").textContent=flow ? "自动排列" : "拖动光点"; this.refreshAppearance();
	},
};
// Zotero loads preference scripts before it imports the pane's XHTML fragment.
// A one-shot timeout can therefore run before our controls exist and leave the
// pane permanently uninitialized. Initialize on Zotero's pane `showing` event,
// while keeping the timeout for already-mounted/reopened panes.
document.addEventListener("showing", event => {
	if (event.target?.id === "research-workspace-preferences-root") {
		ResearchWorkspacePreferences.init();
	}
}, true);
setTimeout(() => ResearchWorkspacePreferences.init(), 0);
