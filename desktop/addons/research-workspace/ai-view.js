LibraryAIViewHost = class LibraryAIViewHost {
	constructor(workspace) {
		this.workspace = workspace;
		this.repository = new LibraryAIConversationRepository();
		this.provider = new LibraryAIProviderAdapter(workspace.aiPrefRoot);
		this.context = new LibraryAIPaperContextService();
		this.commands = new LibraryAISlashCommands();
		this.windows = new Map();
		this.abortController = null;
		this.notifierID = null;
		this.reviewLocks = new Set();
		this.lastClipboardText = "";
		this.clipboardDismissed = new Set();
	}

	async init() {
		await this.repository.init();
		try { await this.commands.init(); }
		catch (error) { Zotero.debug(`Library AI slash commands init: ${error}`); }
		this.notifierID = Zotero.Notifier.registerObserver({
			notify: (event, type) => {
				if (type !== "tab" || !["select", "add", "close"].includes(event)) return;
				for (let window of Zotero.getMainWindows()) {
					window.setTimeout(() => {
						this.ensureButtons(window);
						if (this.windows.get(window)?.open) this.open(window, { syncSource: true });
					}, 30);
				}
			},
		}, ["tab"], "library-ai-view-tabs");
		for (let window of Zotero.getMainWindows()) {
			this.addToWindow(window);
			this.ensureButtons(window);
			if (Services.prefs.getBoolPref(this.workspace.aiPrefRoot + "aiViewOpen", false)) await this.open(window, { syncSource: true });
		}
	}

	addToWindow(window) {
		if (!window?.document || this.windows.has(window)) return;
		let doc = window.document;
		let contextPane = doc.getElementById("zotero-context-pane");
		if (!contextPane) {
			window.setTimeout(() => this.addToWindow(window), 120);
			return;
		}
		let nativeContent = [...contextPane.children].find(element => element.localName === "vbox") || contextPane.firstElementChild;
		let view = doc.createElementNS("http://www.w3.org/1999/xhtml", "section");
		view.className = "library-ai-view";
		view.hidden = true;
		view.setAttribute("aria-label", "Library AI");
		contextPane.insertBefore(view, doc.getElementById("zotero-context-pane-sidenav"));
		let state = { contextPane, nativeContent, view, open: false, buttons: [], railButtons: [], listeners: [], syncTimer: null, renderTimer: null, seenMessageIDs: new Set() };
		this.windows.set(window, state);
		this.buildView(window, state);
		let launcher = doc.createElementNS("http://www.w3.org/1999/xhtml", "button");
		launcher.type = "button"; launcher.className = "library-ai-floating-launcher"; launcher.title = "Library AI"; launcher.setAttribute("aria-label", "打开 Library AI");
		launcher.hidden = true;
		launcher.append(this.createRobotIcon(doc));
		launcher.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); this.toggle(window); });
		doc.documentElement.append(launcher); state.launcher = launcher; state.buttons.push(launcher);
		this.ensureButtons(window);
		let onResizeEnd = () => {
			if (!state.open) return;
			let width = Math.round(contextPane.getBoundingClientRect().width);
			if (width >= 320 && width <= 760) Services.prefs.setIntPref(this.workspace.aiPrefRoot + "aiViewWidth", width);
		};
		window.addEventListener("mouseup", onResizeEnd);
		state.listeners.push([window, "mouseup", onResizeEnd]);
	}

	removeFromWindow(window) {
		let state = this.windows.get(window);
		if (!state) return;
		this.stopClipboardMonitor(window);
		window.clearTimeout(state.buttonTimer);
		window.clearTimeout(state.renderTimer);
		for (let [target, type, listener, options] of state.listeners) target.removeEventListener(type, listener, options);
		for (let button of state.buttons) { button.closest(".library-ai-nav-wrapper")?.remove(); if (button === state.launcher || button.classList.contains("library-ai-floating-launcher")) button.remove(); }
		state.view.remove();
		if (state.nativeContent) state.nativeContent.hidden = false;
		this.windows.delete(window);
	}

	destroy() {
		this.abortController?.abort();
		if (this.notifierID) Zotero.Notifier.unregisterObserver(this.notifierID);
		this.notifierID = null;
		for (let window of [...this.windows.keys()]) this.removeFromWindow(window);
	}

	ensureButtons(window, attempt = 0) {
		let state = this.windows.get(window);
		if (!state) return;
		let foundContainer = false;
		for (let sidenav of [
			window.document.getElementById("zotero-context-pane-sidenav"),
			window.document.getElementById("zotero-view-item-sidenav"),
		]) {
			let container = sidenav?._buttonContainer || sidenav?.querySelector?.(".button-container");
			if (!container) continue;
			foundContainer = true;
			if (container.querySelector(".library-ai-nav-button")) continue;
			let wrapper = window.document.createElement("div");
			wrapper.className = "pin-wrapper library-ai-nav-wrapper";
			let button = window.document.createElement("button");
			button.type = "button";
			button.className = "btn library-ai-nav-button";
			button.title = "Library AI";
			button.setAttribute("aria-label", "打开 Library AI");
			button.append(this.createRobotIcon(window.document));
			button.addEventListener("click", event => {
				event.preventDefault(); event.stopPropagation();
				this.toggle(window);
			});
			wrapper.append(button); container.append(wrapper); state.buttons.push(button); state.railButtons.push(button);
			let nativeClick = event => {
				if (!state.open || event.target.closest?.(".library-ai-nav-button")) return;
				if (event.target.closest?.("[data-pane]")) this.showNative(window);
			};
			sidenav.addEventListener("click", nativeClick, true);
			state.listeners.push([sidenav, "click", nativeClick, true]);
		}
		let railExists = Boolean(window.document.querySelector(".library-ai-nav-button"));
		if (state.launcher) state.launcher.hidden = railExists || attempt < 40;
		if ((!foundContainer || state.railButtons.length < 2) && attempt < 40) {
			window.clearTimeout(state.buttonTimer);
			state.buttonTimer = window.setTimeout(() => this.ensureButtons(window, attempt + 1), 150);
		}
	}

	createRobotIcon(doc) {
		let svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("aria-hidden", "true");
		svg.classList.add("library-ai-robot-mark");
		let path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
		path.setAttribute("d", "M9 7V4.5h4.25M4.5 11H2.75v4H4.5M19.5 11h1.75v4h-1.75");
		path.setAttribute("fill", "none"); path.setAttribute("stroke", "currentColor"); path.setAttribute("stroke-width", "2"); path.setAttribute("stroke-linecap", "round"); path.setAttribute("stroke-linejoin", "round");
		let body = doc.createElementNS("http://www.w3.org/2000/svg", "rect");
		body.setAttribute("x", "4.5"); body.setAttribute("y", "7"); body.setAttribute("width", "15"); body.setAttribute("height", "12"); body.setAttribute("rx", "3"); body.setAttribute("fill", "none"); body.setAttribute("stroke", "currentColor"); body.setAttribute("stroke-width", "2");
		let leftEye = doc.createElementNS("http://www.w3.org/2000/svg", "circle"); leftEye.setAttribute("cx", "9"); leftEye.setAttribute("cy", "13"); leftEye.setAttribute("r", "1"); leftEye.setAttribute("fill", "currentColor");
		let rightEye = doc.createElementNS("http://www.w3.org/2000/svg", "circle"); rightEye.setAttribute("cx", "15"); rightEye.setAttribute("cy", "13"); rightEye.setAttribute("r", "1"); rightEye.setAttribute("fill", "currentColor");
		svg.append(path, body, leftEye, rightEye);
		return svg;
	}

	async toggle(window) {
		let state = this.windows.get(window);
		if (!state) return;
		if (state.open) this.close(window); else await this.open(window, { syncSource: true });
	}

	async open(window, { syncSource = false } = {}) {
		let state = this.windows.get(window);
		if (!state) return;
		state.open = true;
		Services.prefs.setBoolPref(this.workspace.aiPrefRoot + "aiViewOpen", true);
		if (state.nativeContent) state.nativeContent.hidden = true;
		state.view.hidden = false;
		state.contextPane.hidden = false;
		state.contextPane.removeAttribute("collapsed");
		try { window.ZoteroContextPane.collapsed = false; } catch (_) {}
		let splitter = window.document.getElementById("zotero-context-pane-splitter");
		if (splitter) { splitter.hidden = false; splitter.setAttribute("state", "open"); }
		let width = Services.prefs.getIntPref(this.workspace.aiPrefRoot + "aiViewWidth", 420);
		let boundedWidth = Math.max(320, Math.min(760, width));
		state.contextPane.style.width = `${boundedWidth}px`;
		window.document.documentElement.style.setProperty("--library-ai-panel-width", `${boundedWidth}px`);
		for (let button of state.buttons) button.classList.add("active");
		if (syncSource) await this.syncCurrentSource(window);
		this.startClipboardMonitor(window);
		this.render(window);
	}

	close(window) {
		let state = this.windows.get(window);
		if (!state) return;
		state.open = false; state.view.hidden = true; if (state.nativeContent) state.nativeContent.hidden = false;
		Services.prefs.setBoolPref(this.workspace.aiPrefRoot + "aiViewOpen", false);
		this.stopClipboardMonitor(window);
		for (let button of state.buttons) button.classList.remove("active");
		try { window.ZoteroContextPane.collapsed = true; } catch (_) { state.contextPane.setAttribute("collapsed", "true"); }
	}

	showNative(window) {
		let state = this.windows.get(window);
		if (!state) return;
		state.open = false; state.view.hidden = true; if (state.nativeContent) state.nativeContent.hidden = false;
		Services.prefs.setBoolPref(this.workspace.aiPrefRoot + "aiViewOpen", false);
		for (let button of state.buttons) button.classList.remove("active");
	}

	buildView(window, state) {
		let markup = `
			<header class="library-ai-topbar">
				<div class="library-ai-tabs" role="tablist"></div>
				<div class="library-ai-top-actions">
					<button type="button" data-action="new" title="新建会话">＋</button>
					<button type="button" data-action="history" title="历史记录">◷</button>
					<button type="button" data-action="settings" title="模型设置">⚙</button>
					<button type="button" data-action="close" title="收起">×</button>
				</div>
			</header>
			<div class="library-ai-model-strip"><span class="library-ai-model-dot"></span><button type="button" data-action="models" data-role="model-name" title="点击切换模型">尚未配置模型</button><button type="button" data-action="settings">配置</button></div>
			<section class="library-ai-history" hidden><header><strong>会话历史</strong><button type="button" data-action="history">完成</button></header><div data-role="history-list"></div></section>
			<section class="library-ai-settings" hidden aria-label="模型设置">
				<header class="library-ai-settings-head">
					<div class="library-ai-settings-title"><span class="library-ai-settings-mark" aria-hidden="true">AI</span><span><strong>模型连接</strong><small>OpenAI / Anthropic 兼容接口</small></span></div>
					<button type="button" data-action="settings" aria-label="关闭模型设置">×</button>
				</header>
				<div class="library-ai-settings-form">
					<label class="library-ai-field library-ai-field-provider"><span>提供商</span><select data-field="preset"></select></label>
					<label class="library-ai-field library-ai-field-protocol"><span>API 协议</span><select data-field="protocol"></select></label>
					<label class="library-ai-field library-ai-field-url"><span>接口地址</span><input data-field="baseURL" type="url" spellcheck="false" placeholder="https://api.example.com/v1"></label>
					<label class="library-ai-field library-ai-field-model"><span>模型 ID</span><input data-field="model" type="text" spellcheck="false" list="library-ai-model-list" placeholder="选择或输入模型 ID"></label>
					<datalist id="library-ai-model-list"></datalist>
					<label class="library-ai-field library-ai-field-key"><span>API 密钥 <small>安全保存到系统凭据</small></span><input data-field="apiKey" type="password" autocomplete="off" placeholder="留空则保留现有密钥"></label>
				</div>
				<div class="library-ai-settings-status" data-role="settings-status" role="status"></div>
				<footer class="library-ai-settings-actions">
					<button type="button" class="library-ai-settings-link" data-action="open-ai-prefs"><span>配置档案</span><small>导入、导出与多接口</small><b aria-hidden="true">→</b></button>
					<button type="button" class="library-ai-settings-save" data-action="save-settings">保存并测试</button>
				</footer>
			</section>
			<main class="library-ai-messages" aria-live="polite"></main>
			<footer class="library-ai-composer-shell">
				<div class="library-ai-slash" data-role="slash" hidden></div>
				<div class="library-ai-source-row"><div data-role="sources"></div><button type="button" data-action="add-source" title="从文库选择其他论文">＋来源</button></div>
				<div class="library-ai-references" data-role="references" hidden></div>
				<div class="library-ai-composer"><textarea rows="3" placeholder="向论文提问…（输入 / 唤起命令）"></textarea><div class="library-ai-send-stack"><button type="button" data-action="stop" hidden title="停止生成">■</button><button type="button" data-action="send" title="发送">↑</button></div></div>
				<div class="library-ai-composer-foot"><span data-role="status">准备就绪</span><span class="library-ai-composer-actions"><button type="button" data-action="toggle-ask" title="Ask 模式（Open Notebook 式）：先让模型把问题分解为多个检索词，再多路检索合并后回答。跨多篇论文的综合问题更准。">Ask</button><button type="button" data-action="save-note">保存为笔记</button></span></div>
			</footer>`;
		let view = state.view;
		let parsed = new window.DOMParser().parseFromString(`<body>${markup}</body>`, "text/html");
		for (let child of [...parsed.body.children]) view.append(view.ownerDocument.importNode(child, true));
		for (let button of view.querySelectorAll("[data-action]")) button.addEventListener("click", () => this.handleAction(window, button.dataset.action));
		let textarea = view.querySelector("textarea");
		textarea.addEventListener("input", () => this.updateSlashDropdown(window));
		textarea.addEventListener("click", () => this.updateSlashDropdown(window));
		textarea.addEventListener("keydown", event => {
			if (this.handleSlashKeydown(window, event)) return;
			if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); this.send(window); }
		});
		view.addEventListener("click", event => {
			let citation = event.target.closest?.("[data-citation-id]");
			if (citation) {
				event.preventDefault();
				this.openCitation(citation.dataset.citationMessageId || citation.closest?.("[data-message-id]")?.dataset.messageId, citation.dataset.citationId, window, citation.dataset.citationClaim || "");
			}
			let claimAction = event.target.closest?.("[data-claim-action]"); if (claimAction) this.handleClaimAction(window, claimAction);
			let sourceRemove = event.target.closest?.("[data-remove-source]"); if (sourceRemove) this.removeSource(window, sourceRemove.dataset.removeSource);
			let sourceLevel = event.target.closest?.("[data-cycle-source-level]"); if (sourceLevel) this.cycleSourceLevel(window, sourceLevel.dataset.cycleSourceLevel);
			let sourceInsight = event.target.closest?.("[data-source-insight]"); if (sourceInsight) this.generateSourceInsight(window, sourceInsight.dataset.sourceInsight);
			let auditToggle = event.target.closest?.("[data-toggle-audit]"); if (auditToggle) this.toggleMessageAudit(auditToggle);
			let citationPreview = event.target.closest?.("[data-preview-citation]"); if (citationPreview) { event.preventDefault(); event.stopPropagation(); this.toggleCitationPreview(citationPreview); }
			let referenceRemove = event.target.closest?.("[data-remove-reference]"); if (referenceRemove) this.removeReference(window, referenceRemove.dataset.removeReference);
			let tab = event.target.closest?.("[data-conversation-id]"); if (tab && !event.target.closest("[data-close-tab]")) { this.repository.activate(tab.dataset.conversationId); this.render(window); }
			let closeTab = event.target.closest?.("[data-close-tab]"); if (closeTab) { this.repository.close(closeTab.dataset.closeTab); this.renderAll(); }
			let history = event.target.closest?.("[data-open-history]"); if (history) { this.repository.activate(history.dataset.openHistory); this.renderAll(); this.togglePanel(window, "history", false); }
			let retry = event.target.closest?.("[data-retry-message]"); if (retry) { let active = this.repository.active; let index = active.messages.findIndex(message => message.id === retry.dataset.retryMessage); let previous = [...active.messages.slice(0, index)].reverse().find(message => message.role === "user"); if (previous) this.send(window, previous.prompt || previous.content, previous.prompt ? previous.content : null); }
		});
		let select = view.querySelector('[data-field="preset"]');
		for (let [id, [name]] of Object.entries(this.provider.presets)) {
			let option = view.ownerDocument.createElementNS("http://www.w3.org/1999/xhtml", "option");
			option.value = id; option.textContent = name; select.append(option);
		}
		let protocolSelect = view.querySelector('[data-field="protocol"]');
		for (let [id, name] of Object.entries(this.provider.protocols)) {
			let option = view.ownerDocument.createElementNS("http://www.w3.org/1999/xhtml", "option");
			option.value = id; option.textContent = name; protocolSelect.append(option);
		}
		select.addEventListener("change", () => {
			let preset = this.provider.presets[select.value]; if (!preset) return;
			view.querySelector('[data-field="baseURL"]').value = preset[1];
			view.querySelector('[data-field="model"]').value = preset[2];
			view.querySelector('[data-field="protocol"]').value = preset[3];
		});
	}

	async handleAction(window, action) {
		if (action === "new") { this.repository.create(); await this.syncCurrentSource(window); this.renderAll(); }
		else if (action === "history") this.togglePanel(window, "history");
		else if (action === "settings") this.togglePanel(window, "settings");
		else if (action === "close") this.close(window);
		else if (action === "send") this.send(window);
		else if (action === "stop") this.abortController?.abort();
		else if (action === "add-source") await this.chooseSources(window);
		else if (action === "models") await this.showModelPicker(window);
		else if (action === "save-settings") this.saveSettings(window);
		else if (action === "open-ai-prefs") Zotero.Utilities.Internal.openPreferences("research-workspace-ai");
		else if (action === "save-note") this.saveAsNote(window);
		else if (action === "toggle-ask") {
			let conversation = this.repository.active;
			if (conversation) {
				conversation.askMode = !conversation.askMode;
				this.repository.update(conversation);
				this.renderAll();
				this.setStatus(window, conversation.askMode ? "Ask 模式已开启：提问将先分解为多路检索" : "Ask 模式已关闭：直接基于来源全文上下文回答");
			}
		}
	}

	togglePanel(window, name, force = null) {
		let state = this.windows.get(window); if (!state) return;
		for (let panelName of ["history", "settings"]) {
			let panel = state.view.querySelector(`.library-ai-${panelName}`);
			let next = panelName === name ? (force === null ? !panel.hidden : !force) : true;
			panel.hidden = next;
		}
		if (name === "settings" && !state.view.querySelector(".library-ai-settings").hidden) this.fillSettings(window);
	}

	fillSettings(window) {
		let view = this.windows.get(window).view, config = this.provider.config;
		view.querySelector('[data-field="preset"]').value = config.preset;
		view.querySelector('[data-field="protocol"]').value = config.protocol;
		view.querySelector('[data-field="baseURL"]').value = config.baseURL;
		view.querySelector('[data-field="model"]').value = config.model;
		view.querySelector('[data-field="apiKey"]').value = "";
		view.querySelector('[data-role="settings-status"]').textContent = "";
		this.fillModelDatalist(window);
	}

	// 把当前 baseURL 缓存的模型列表回填到设置页的 datalist（输入即自动补全）
	fillModelDatalist(window) {
		let datalist = this.windows.get(window)?.view.querySelector("#library-ai-model-list");
		if (!datalist) return;
		datalist.textContent = "";
		for (let model of this.provider.getCachedModels()) {
			let option = datalist.ownerDocument.createElement("option");
			option.value = model;
			datalist.append(option);
		}
	}

	async saveSettings(window) {
		let view = this.windows.get(window).view, status = view.querySelector('[data-role="settings-status"]');
		status.textContent = "正在保存…";
		try {
			await this.provider.save({
				preset: view.querySelector('[data-field="preset"]').value,
				protocol: view.querySelector('[data-field="protocol"]').value,
				baseURL: view.querySelector('[data-field="baseURL"]').value.trim(),
				model: view.querySelector('[data-field="model"]').value.trim(),
				apiKey: view.querySelector('[data-field="apiKey"]').value.trim(),
			});
			view.querySelector('[data-field="apiKey"]').value = "";
			this.renderAll();
			status.textContent = "设置已保存，正在测试连接…";
			try {
				await this.provider.test();
				// 连接成功后按协议抓取模型列表；兼容端点不支持时保留手动模型 ID。
				status.textContent = "设置已保存，连接成功，正在抓取模型列表…";
				try {
					let models = await this.provider.fetchModels();
					this.fillModelDatalist(window);
					status.textContent = `设置已保存，连接成功，抓取到 ${models.length} 个模型`;
				}
				catch (fetchError) {
					status.textContent = `设置已保存，连接成功；模型列表抓取失败：${fetchError.message || fetchError}`;
				}
			}
			catch (testError) {
				status.textContent = `设置已保存；连接测试失败：${testError.message || testError}`;
			}
		} catch (error) { status.textContent = error.message || String(error); }
	}

	async syncCurrentSource(window, forceSelected = false) {
		let item = forceSelected ? window.ZoteroPane?.getSelectedItems?.()[0] : await this.workspace.getCurrentWindowItem(window);
		let source = await this.context.source(item); if (!source) return;
		let conversation = this.repository.active;
		let sourceID = String(source.itemID);
		let dismissedSourceIDs = new Set((conversation.dismissedSourceIDs || []).map(String));
		if (!forceSelected && dismissedSourceIDs.has(sourceID)) return;
		if (forceSelected && dismissedSourceIDs.delete(sourceID)) conversation.dismissedSourceIDs = [...dismissedSourceIDs];
		let added = !conversation.sources.some(candidate => candidate.itemID === source.itemID);
		if (added) conversation.sources.push(source);
		this.repository.update(conversation);
		if (added) window.setTimeout(() => this.generateSourceInsight(window, source.itemID, { automatic: true }), 50);
	}

	async chooseSources(window) {
		let conversation = this.repository.active;
		if (!conversation) return;
		let io = {
			dataIn: null,
			dataOut: null,
			deferred: Zotero.Promise.defer(),
			itemTreeID: `library-ai-source-picker-${conversation.id}`,
			onlyRegularItems: true,
			multiSelect: true,
		};
		try {
			window.openDialog(
				"chrome://zotero/content/selectItemsDialog.xhtml",
				"",
				"chrome,dialog=no,centerscreen,resizable=yes",
				io,
			);
			await io.deferred.promise;
		}
		catch (error) {
			this.workspace.log(`Unable to open AI source picker: ${error}`);
			this.setStatus(window, `无法打开论文来源选择器：${error.message || error}`);
			return;
		}
		if (!Array.isArray(io.dataOut) || !io.dataOut.length) {
			this.setStatus(window, "未添加新的论文来源");
			return;
		}

		let selectedItems = await Zotero.Items.getAsync(io.dataOut);
		let added = 0;
		for (let item of selectedItems) {
			if (!item?.isRegularItem?.() || item.deleted) continue;
			let source = await this.context.source(item);
			if (!source || conversation.sources.some(candidate => candidate.itemID === source.itemID)) continue;
			conversation.sources.push(source);
			conversation.dismissedSourceIDs = (conversation.dismissedSourceIDs || [])
				.filter(itemID => String(itemID) !== String(source.itemID));
			added++;
		}
		if (added) {
			this.repository.update(conversation);
			await this.repository.save();
			this.renderAll();
			for (let source of conversation.sources.filter(candidate => !candidate.insight)) window.setTimeout(() => this.generateSourceInsight(window, source.itemID, { automatic: true }), 50);
		}
		this.setStatus(window, added ? `已添加 ${added} 篇论文来源` : "所选论文已在来源中");
	}

	removeSource(window, itemID) {
		let conversation = this.repository.active;
		if (!conversation) return;
		let sourceID = String(itemID);
		conversation.sources = conversation.sources.filter(source => String(source.itemID) !== sourceID);
		conversation.dismissedSourceIDs = [...new Set([
			...(conversation.dismissedSourceIDs || []).map(String),
			sourceID,
		])];
		this.repository.update(conversation);
		this.renderAll();
		this.setStatus(window, "已移除来源；需要恢复时可点击“＋来源”重新添加");
	}

	async send(window, retryQuestion = null, displayOverride = null) {
		let state = this.windows.get(window), conversation = this.repository.active;
		let input = state.view.querySelector("textarea"), question = (retryQuestion || input.value).trim();
		if (!question || this.abortController) return;
		// 斜杠命令（Claudian 式）：消息以 / 开头时先查注册中心；
		// 动作命令直接执行，提示词命令展开 $ARGUMENTS 后作为真实提问发送
		if (!retryQuestion) {
			let detected = this.commands.detect(question);
			if (detected?.unknown) this.setStatus(window, `未知命令 /${detected.unknown}，已按普通问题发送`);
			else if (detected) {
				input.value = "";
				this.hideSlashDropdown(window);
				if (detected.command.kind === "action") { await this.executeSlashAction(window, detected.command, detected.args); return; }
				return this.send(window, this.commands.expand(detected.command, detected.args), question);
			}
		}
		if (!retryQuestion) {
			let outgoing = { id: Zotero.Utilities.randomString(8), role: "user", content: displayOverride || question, createdAt: new Date().toISOString() };
			if (displayOverride) { outgoing.command = displayOverride.split(/\s+/)[0]; outgoing.prompt = question; }
			conversation.messages.push(outgoing);
			input.value = "";
		}
		let assistant = {
			id: Zotero.Utilities.randomString(8), role: "assistant", content: "", citations: {}, state: "streaming",
			activity: { phase: "preparing", label: "正在准备回答…" }, createdAt: new Date().toISOString(),
		};
		conversation.messages.push(assistant); this.repository.update(conversation); this.abortController = new window.AbortController(); this.renderAll();
		let setActivity = (phase, label) => {
			assistant.activity = { phase, label };
			this.renderAll();
		};
		let artifactContext = { citations: {}, audit: {}, sourceScope: [], requestMessages: [] };
		try {
			// 发送时兜底同步：来源只会在打开面板/切换标签时同步，
			// 在文库中换选条目后再提问时可能仍为空，导致“无法识别当前论文”
			if (!conversation.sources.length) {
				setActivity("syncing", "正在同步当前论文…");
				await this.syncCurrentSource(window);
				this.renderAll();
			}
			// Open Notebook 三级上下文：off 直接排除，summary 只送元数据卡片
			if (conversation.sources.length) setActivity("reading", "正在读取论文来源…");
			let activeSources = await Promise.all((conversation.sources || [])
				.filter(source => (source.level || "full") !== "off")
				.map(async source => {
					let item = await Zotero.Items.getAsync(source.itemID);
					let attachment = source.attachmentID ? await Zotero.Items.getAsync(source.attachmentID) : null;
					return { ...source, itemKey: source.itemKey || item?.key || "", attachmentKey: source.attachmentKey || attachment?.key || null };
				}));
			for (let hydrated of activeSources) {
				let stored = conversation.sources.find(source => String(source.itemID) === String(hydrated.itemID));
				if (stored) { stored.itemKey = hydrated.itemKey; stored.attachmentKey = hydrated.attachmentKey; }
			}
			artifactContext.sourceScope = activeSources;
			// Ask 模式（Open Notebook 式 RAG）：先让模型把问题分解为多个检索词，再多路检索合并去重
			let queries = [question];
			if (conversation.askMode && activeSources.length) {
				setActivity("planning", "正在分析检索策略…");
				this.setStatus(window, "Ask 模式：正在分析检索策略…");
				queries = await this.askStrategy(window, question);
				this.setStatus(window, `Ask 模式：${queries.length} 路检索中…`);
			}
			let snippets = [], citations = {}, sourceNumber = 0;
			for (let source of activeSources) {
				sourceNumber++;
				setActivity("retrieving", `正在检索论文来源 ${sourceNumber}/${activeSources.length}…`);
				let level = source.level || "full";
				let merged = new Map();
				for (let query of queries) {
					let records = level === "summary" ? await this.context.collectSummary(source) : await this.context.collect(source, query, { provider: this.provider, limit: 10 });
					for (let record of records) { let existing = merged.get(record.id); if (!existing || (record.score || 0) > (existing.score || 0)) merged.set(record.id, record); }
				}
				let records = [...merged.values()].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 10);
				for (let [index, record] of records.entries()) { let id = `S${sourceNumber}-C${index + 1}`; citations[id] = { ...record, title: source.title }; snippets.push(`[${id}] ${source.title}${level === "summary" ? "（仅摘要）" : ""}${record.page ? ` · 第 ${record.page} 页` : ""}\n${record.text}`); }
			}
			assistant.citations = citations;
			assistant.audit = {
				mode: conversation.askMode ? "ask" : "chat",
				queries,
				sources: activeSources.map(source => ({ itemID: source.itemID, title: source.title, level: source.level || "full" })),
				chunks: Object.entries(citations).map(([id, citation]) => ({ id, title: citation.title, page: citation.page || null, recordID: citation.id, text: citation.text })),
				createdAt: new Date().toISOString(),
			};
			artifactContext.citations = citations;
			artifactContext.audit = assistant.audit;
			// 用户选中的参考片段（复制监测 / 阅读器划词 / 选择区域）优先进入上下文
			let references = conversation.references || [];
			let referenceBlock = references.length
				? `\n\n用户选中的参考片段（这些内容来自用户主动复制或在阅读器中框选，请优先围绕它们理解与作答）：\n${references.map((ref, index) => `[参考${index + 1}] ${ref.label}\n${ref.text}`).join("\n\n")}`
				: "";
			assistant.references = references.map(ref => ref.label);
			let messages = [{ role: "system", content: "你是 Library 的论文阅读助手。优先依据提供的论文片段回答；每个可核验结论后使用形如 [[S1-C1]] 的引用标记。只能使用给定 citation ID；没有可靠页码时不要猜测页码。涉及某一节的内容、方法或结论时，必须引用该节正文片段，不得用引言中的目录、结构预告或摘要代替。若没有该节正文证据，应明确说明材料不足。使用清晰的中文 Markdown。" }, ...conversation.messages.filter(message => message !== assistant).slice(-12).map(message => ({ role: message.role, content: message.role === "user" && message.prompt ? message.prompt : message.content })), { role: "user", content: `问题：${question}\n\n可用论文片段：\n${snippets.join("\n\n") || "当前未添加论文来源，请按普通对话回答，并说明没有论文来源。"}${referenceBlock}` }];
			artifactContext.requestMessages = messages;
			setActivity("waiting", `正在等待 ${this.provider.config.model || "模型"} 响应…`);
			await this.provider.stream(messages, {
				signal: this.abortController.signal,
				window,
				onDelta: delta => { assistant.activity = { phase: "writing", label: "正在生成回答…" }; assistant.content += delta; this.scheduleRenderAll(); },
				onReasoning: delta => { assistant.activity = { phase: "reasoning", label: "模型正在思考…" }; assistant.reasoning = (assistant.reasoning || "") + delta; this.scheduleRenderAll(); },
			});
			assistant.state = "done";
			assistant.citationAudit = this.auditAnswerCitations(assistant.content, citations);
		} catch (error) {
			Zotero.debug(`Library AI send: ${error.stack || error}`);
			assistant.state = error.name === "AbortError" ? "stopped" : "error"; assistant.error = error.name === "AbortError" ? "已停止生成" : (error.message || String(error));
		} finally {
			try {
				assistant.citationAudit ||= this.auditAnswerCitations(assistant.content, artifactContext.citations);
				assistant.artifact = await LibraryAIArtifacts.buildBundle({
					runID: assistant.id,
					question,
					content: assistant.content,
					citations: artifactContext.citations,
					audit: artifactContext.audit,
					providerID: this.provider.activeId,
					providerPreset: this.provider.config.preset || "custom",
					model: this.provider.config.model,
					sourceScope: artifactContext.sourceScope,
					requestMessages: artifactContext.requestMessages,
					state: assistant.state,
					createdAt: assistant.createdAt,
					completedAt: new Date().toISOString(),
					cryptoProvider: window.crypto,
					TextEncoderImpl: window.TextEncoder,
				});
			}
			catch (artifactError) {
				assistant.artifactError = artifactError.message || String(artifactError);
				Zotero.debug(`Library AI artifact: ${artifactError.stack || artifactError}`);
			}
			delete assistant.activity;
			this.abortController = null; this.repository.update(conversation); await this.repository.save(); this.renderAll();
		}
	}

	cycleSourceLevel(window, itemID) {
		let conversation = this.repository.active; if (!conversation) return;
		let source = (conversation.sources || []).find(candidate => String(candidate.itemID) === String(itemID));
		if (!source) return;
		source.level = { full: "summary", summary: "off", off: "full" }[source.level || "full"];
		this.repository.update(conversation);
		this.renderAll();
	}

	renderAll() {
		for (let [window, state] of this.windows) {
			if (state.renderTimer) {
				window.clearTimeout(state.renderTimer);
				state.renderTimer = null;
			}
			this.render(window);
		}
	}

	// 模型流式响应可能每秒触发数十次。将这些更新合并到 40ms 一帧，
	// 避免同一视觉帧内反复清空/重建消息与来源区域。
	scheduleRenderAll(delay = 40) {
		for (let [window, state] of this.windows) {
			if (state.renderTimer) continue;
			state.renderTimer = window.setTimeout(() => {
				state.renderTimer = null;
				this.render(window);
			}, delay);
		}
	}

	// Ask 模式的检索策略规划（逆向自 open-notebook prompts/ask/entry.jinja）：
	// 先让模型输出 {reasoning, searches:[{term, instructions}]}，term 用于多路全文检索
	async askStrategy(window, question) {
		let prompt = `你是检索策略规划器。针对用户问题，先简要推理，再给出 1-3 个适合全文检索的关键词短语（保留中英文术语原文）。\n严格只输出一个 JSON 对象：{"reasoning":"...","searches":[{"term":"...","instructions":"..."}]}\n不要输出任何其他文字或代码块标记。\n\n用户问题：${question}`;
		let buffer = "";
		try {
			await this.provider.stream([{ role: "user", content: prompt }], {
				signal: this.abortController?.signal,
				window,
				onDelta: delta => { buffer += delta; },
			});
			let match = buffer.match(/\{[\s\S]*\}/);
			let parsed = JSON.parse(match?.[0] || "");
			let terms = (parsed.searches || []).map(search => String(search?.term || "").trim()).filter(Boolean).slice(0, 3);
			if (terms.length) return [question, ...terms];
		} catch (error) { Zotero.debug(`Library AI ask strategy: ${error.stack || error}`); }
		return [question];
	}


	render(window) {
		// 单条异常消息不应拖垮整个侧栏渲染
		try { this.renderUnsafe(window); }
		catch (error) { Zotero.debug(`Library AI render: ${error.stack || error}`); }
	}
	renderUnsafe(window) {
		let state = this.windows.get(window); if (!state) return;
		let view = state.view, conversation = this.repository.active, config = this.provider.config;
		view.querySelector('[data-role="model-name"]').textContent = config.model || "尚未配置模型";
		view.querySelector(".library-ai-model-dot").classList.toggle("configured", Boolean(config.model));
		let tabs = view.querySelector(".library-ai-tabs"); tabs.textContent = "";
		for (let id of this.repository.state.openIDs) {
			let current = this.repository.get(id); if (!current) continue;
			let tab = view.ownerDocument.createElement("button"); tab.type = "button"; tab.className = "library-ai-tab"; tab.dataset.conversationId = id; tab.classList.toggle("active", id === conversation.id);
			tab.innerHTML = `<span>${this.escape(current.title)}</span><span data-close-tab="${id}" title="关闭">×</span>`; tabs.append(tab);
		}
		let history = view.querySelector('[data-role="history-list"]'); history.textContent = "";
		for (let item of this.repository.list()) { let button = view.ownerDocument.createElement("button"); button.type = "button"; button.dataset.openHistory = item.id; button.innerHTML = `<strong>${this.escape(item.title)}</strong><small>${new Date(item.updatedAt).toLocaleString()}</small>`; history.append(button); }
		let messages = view.querySelector(".library-ai-messages"); messages.textContent = "";
		if (!conversation.messages.length) messages.append(this.emptyState(view.ownerDocument));
		for (let message of conversation.messages) {
			let node = this.messageNode(view.ownerDocument, message);
			if (!state.seenMessageIDs.has(message.id)) {
				node.className += " is-new";
				state.seenMessageIDs.add(message.id);
			}
			messages.append(node);
		}
		let sourceHost = view.querySelector('[data-role="sources"]'); sourceHost.textContent = "";
		for (let source of conversation.sources) {
			let wrapper = view.ownerDocument.createElement("span"); wrapper.className = "library-ai-source-stack";
			let chip = view.ownerDocument.createElement("span");
			let level = source.level || "full";
			let levelMeta = { full: ["全文", "全文进上下文"], summary: ["摘要", "仅提供元数据摘要"], off: ["隐藏", "对 AI 隐藏（不参与回答）"] }[level];
			chip.className = `library-ai-source-chip level-${level}`;
			let insightLabel = source.insight?.state === "generating" ? "洞察中…" : source.insight?.state === "done" ? "洞察" : source.insight?.state === "error" ? "重试洞察" : "生成洞察";
			let icon = view.ownerDocument.createElement("span"); icon.className = "library-ai-source-icon"; icon.setAttribute("aria-hidden", "true"); icon.textContent = "▤";
			let title = view.ownerDocument.createElement("span"); title.className = "library-ai-source-title"; title.title = source.title; title.textContent = source.title;
			let remove = view.ownerDocument.createElement("button"); remove.type = "button"; remove.className = "library-ai-source-remove"; remove.dataset.removeSource = source.itemID; remove.title = `移除来源：${source.title}`; remove.setAttribute("aria-label", `移除来源：${source.title}`); remove.textContent = "移除";
			chip.append(icon, title, remove);
			let controls = view.ownerDocument.createElement("span"); controls.className = "library-ai-source-controls";
			let insight = view.ownerDocument.createElement("button"); insight.type = "button"; insight.dataset.sourceInsight = source.itemID; insight.title = `${insightLabel}：${source.title}`; insight.textContent = insightLabel;
			let contextLevel = view.ownerDocument.createElement("button"); contextLevel.type = "button"; contextLevel.dataset.cycleSourceLevel = source.itemID; contextLevel.title = `上下文：${levelMeta[1]}（点击切换 全文/摘要/隐藏）`; contextLevel.textContent = `上下文 · ${levelMeta[0]}`;
			controls.append(insight, contextLevel);
			wrapper.append(chip, controls);
			if (source.insight?.state === "done" && source.insight.content) {
				let details = view.ownerDocument.createElement("details"); details.className = "library-ai-source-insight";
				let summary = view.ownerDocument.createElement("summary"); summary.textContent = "来源洞察";
				let content = view.ownerDocument.createElement("div"); content.innerHTML = this.renderMarkdown(source.insight.content, {});
				details.append(summary, content); wrapper.append(details);
			}
			sourceHost.append(wrapper);
		}
		if (!conversation.sources.length) { let empty = view.ownerDocument.createElement("span"); empty.className = "library-ai-no-source"; empty.textContent = "未添加论文来源"; sourceHost.append(empty); }
		let askToggle = view.querySelector('[data-action="toggle-ask"]');
		if (askToggle) askToggle.classList.toggle("active", Boolean(conversation.askMode));
		let referenceHost = view.querySelector('[data-role="references"]');
		referenceHost.textContent = "";
		let references = conversation.references || [];
		referenceHost.hidden = !references.length;
		for (let reference of references) {
			let chip = view.ownerDocument.createElement("span");
			chip.className = `library-ai-reference-chip ${reference.kind || "text"}`;
			chip.title = reference.text.slice(0, 300);
			let label = view.ownerDocument.createElement("span");
			label.textContent = `${reference.kind === "clipboard" ? "📋" : reference.kind === "area" ? "▣" : "❝"} ${reference.label}`;
			let remove = view.ownerDocument.createElement("button");
			remove.type = "button"; remove.dataset.removeReference = reference.id; remove.title = "移除参考"; remove.textContent = "×";
			chip.append(label, remove);
			referenceHost.append(chip);
		}
		view.querySelector('[data-action="stop"]').hidden = !this.abortController; view.querySelector('[data-action="send"]').hidden = Boolean(this.abortController);
		let streamingMessage = conversation.messages.find(message => message.state === "streaming");
		let statusText = this.abortController
			? (streamingMessage?.activity?.label || (streamingMessage?.reasoning && !streamingMessage?.content ? "正在思考（推理阶段）…" : "正在生成…"))
			: "Enter 发送 · Shift+Enter 换行 · / 命令";
		view.querySelector('[data-role="status"]').textContent = statusText;
		messages.scrollTop = messages.scrollHeight;
	}

	emptyState(doc) {
		let node = doc.createElement("section"); node.className = "library-ai-empty";
		node.append(this.createRobotIcon(doc));
		let content = doc.createElement("div");
		content.innerHTML = `<h2>和论文一起思考</h2><p>当前论文会自动成为来源。回答中的引用可直接定位回原文。</p><div><button type="button">概括本文的核心贡献</button><button type="button">解释作者的方法与证据</button><button type="button">列出可继续追问的问题</button></div>`;
		while (content.firstChild) node.append(content.firstChild);
		for (let button of node.querySelectorAll("button")) button.addEventListener("click", () => { let view = node.closest(".library-ai-view"); view.querySelector("textarea").value = button.textContent; view.querySelector("textarea").focus(); });
		return node;
	}

	auditAnswerCitations(content, citations) {
		let allowed = new Set(Object.keys(citations || {}));
		let used = [...String(content || "").matchAll(/\[\[([A-Z]\d+-C\d+)\]\]/g)].map(match => match[1]);
		let invalid = [...new Set(used.filter(id => !allowed.has(id)))];
		let valid = [...new Set(used.filter(id => allowed.has(id)))];
		let sentences = String(content || "").split(/(?<=[。！？.!?])\s*/).map(value => value.trim()).filter(value => value.length >= 18);
		let uncited = sentences.filter(sentence => !/\[\[[A-Z]\d+-C\d+\]\]/.test(sentence) && !/^([#>*-]|\d+[.)、])/.test(sentence)).slice(0, 8);
		return { allowed: [...allowed], valid, invalid, uncited, passed: !invalid.length, createdAt: new Date().toISOString() };
	}

	messageNode(doc, message) {
		let article = doc.createElement("article"); article.className = `library-ai-message ${message.role}${message.compacted ? " compacted" : ""}${message.state === "streaming" ? " streaming" : ""}`; article.dataset.messageId = message.id;
		let role = doc.createElement("div"); role.className = "library-ai-message-role"; role.textContent = message.role === "user" ? "你" : (message.compacted ? "上下文摘要" : "Library AI");
		article.append(role);
		let content = message.content;
		if (message.command) {
			let chip = doc.createElement("span"); chip.className = "library-ai-command-chip"; chip.textContent = message.command;
			article.append(chip);
			if (content.startsWith(message.command)) content = content.slice(message.command.length).trim();
		}
		if (message.references?.length) {
			let refs = doc.createElement("div"); refs.className = "library-ai-message-refs";
			refs.textContent = `参考：${message.references.join("、")}`; article.append(refs);
		}
		if (message.reasoning) {
			let thinking = doc.createElement("details"); thinking.className = "library-ai-thinking";
			let isThinking = message.state === "streaming" && !message.content;
			thinking.open = isThinking;
			let summary = doc.createElement("summary"); summary.textContent = isThinking ? "正在思考…" : "思考过程";
			let thinkingBody = doc.createElement("div"); thinkingBody.className = "library-ai-thinking-body"; thinkingBody.textContent = message.reasoning;
			thinking.append(summary, thinkingBody);
			article.append(thinking);
		}
		// Preferences/context pane 是 XUL 文档；普通 createElement("div") 会创建 XUL 节点，
		// Gecko 不允许对它写 innerHTML。显式创建 XHTML 节点才能稳定渲染 Markdown/引用。
		let body = doc.createElementNS("http://www.w3.org/1999/xhtml", "div"); body.className = "library-ai-message-body";
		let markup = this.renderMarkdown(content, message.citations || {}, message.id);
		let HTMLParser = doc.defaultView?.DOMParser || DOMParser;
		let parsedBody = new HTMLParser().parseFromString(`<body>${markup}</body>`, "text/html").body;
		for (let child of [...parsedBody.childNodes]) body.append(doc.importNode(child, true));
		if (message.state === "streaming" && !content) {
			let progress = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
			progress.className = `library-ai-progress phase-${message.activity?.phase || "preparing"}`;
			progress.setAttribute("role", "status"); progress.setAttribute("aria-live", "polite");
			let mark = doc.createElementNS("http://www.w3.org/1999/xhtml", "span"); mark.className = "library-ai-progress-mark"; mark.setAttribute("aria-hidden", "true");
			for (let index = 0; index < 3; index++) mark.append(doc.createElementNS("http://www.w3.org/1999/xhtml", "i"));
			let label = doc.createElementNS("http://www.w3.org/1999/xhtml", "span"); label.textContent = message.activity?.label || (message.reasoning ? "模型正在思考…" : "正在准备回答…");
			progress.append(mark, label); body.append(progress);
		}
		article.append(body);
		if (message.state === "streaming" && content) { let cursor = doc.createElement("span"); cursor.className = "library-ai-cursor"; cursor.textContent = ""; body.append(cursor); }
		if (message.citationAudit && (message.citationAudit.invalid.length || message.citationAudit.uncited.length)) {
			let warning = doc.createElement("div"); warning.className = "library-ai-citation-audit-warning";
			let parts = [];
			if (message.citationAudit.invalid.length) parts.push(`发现 ${message.citationAudit.invalid.length} 个非白名单引用`);
			if (message.citationAudit.uncited.length) parts.push(`${message.citationAudit.uncited.length} 条长声明未附引用`);
			warning.textContent = `引用审计：${parts.join("；")}。请结合下方实际上下文核查。`; article.append(warning);
		}
		// TRACE 主张复核是评测/研究工作流，不属于普通论文阅读界面。
		// 后台仍生成并持久化结构化工件；只有显式打开隐藏评测开关时才渲染复核卡片。
		let traceReviewUI = Services.prefs.getBoolPref("extensions.zotero.researchWorkspace.traceReviewUI", false);
		if (traceReviewUI && message.artifact) {
			let validation = message.artifact.validation;
			let status = doc.createElement("div");
			status.className = validation.structuralPassed ? "library-ai-artifact-status passed" : "library-ai-citation-audit-warning";
			let reviewedClaims = new Set(message.artifact.decisions.map(decision => decision.claimID)).size;
			let details = [`${message.artifact.claims.length} 条候选主张`, `${reviewedClaims} 条已人工复核`, `${message.artifact.evidence.length} 条证据记录`];
			if (validation.unresolvedEvidenceIDs.length) details.push(`${validation.unresolvedEvidenceIDs.length} 条缺少稳定页码/批注锚点`);
			if (validation.hardFailures.length) details.push(`${validation.hardFailures.length} 个结构硬失败`);
			status.textContent = `研究工件：${validation.structuralPassed ? "结构校验通过" : "结构校验失败"} · ${details.join(" · ")}；语义支持尚未评估。`;
			article.append(status, this.claimReviewPanel(doc, message));
		}
		else if (traceReviewUI && message.artifactError) {
			let warning = doc.createElement("div"); warning.className = "library-ai-citation-audit-warning";
			warning.textContent = `研究工件生成失败：${message.artifactError}`; article.append(warning);
		}
		if (message.audit?.chunks?.length) {
			let auditButton = doc.createElement("button"); auditButton.type = "button"; auditButton.className = "library-ai-audit-toggle"; auditButton.dataset.toggleAudit = message.id;
			auditButton.textContent = `查看 AI 实际读取内容 · ${message.audit.chunks.length} 段`;
			let audit = doc.createElement("section"); audit.className = "library-ai-audit"; audit.hidden = true;
			let head = doc.createElement("div"); head.className = "library-ai-audit-head";
			head.textContent = `${message.audit.mode === "ask" ? "Ask 多路检索" : "Chat 上下文"} · 查询：${(message.audit.queries || []).join(" / ")}`;
			audit.append(head);
			for (let chunk of message.audit.chunks) {
				let row = doc.createElement("article"); row.className = "library-ai-audit-chunk";
				let title = doc.createElement("strong"); title.textContent = `${chunk.id} · ${chunk.title}${chunk.page ? ` · p.${chunk.page}` : ""}`;
				let preview = doc.createElement("p"); preview.textContent = chunk.text;
				row.append(title, preview); audit.append(row);
			}
			article.append(auditButton, audit);
		}
		if (message.error) { let error = doc.createElement("div"); error.className = "library-ai-error"; error.innerHTML = `<span>${this.escape(message.error)}</span>${message.state === "error" ? `<button type="button" data-retry-message="${message.id}">重试</button>` : ""}`; article.append(error); }
		return article;
	}

	claimReviewPanel(doc, message) {
		let html = name => doc.createElementNS("http://www.w3.org/1999/xhtml", name);
		let artifact = message.artifact;
		let reviewEnabled = message.state === "done" && artifact.validation.structuralPassed;
		let panel = html("details"); panel.className = "library-ai-claim-review";
		let reviewed = new Set(artifact.decisions.map(decision => decision.claimID)).size;
		let summary = html("summary"); summary.textContent = `复核候选主张 · ${reviewed}/${artifact.claims.length}`;
		panel.append(summary);
		let list = html("div"); list.className = "library-ai-claim-list";
		if (!reviewEnabled) {
			let notice = html("p"); notice.className = "library-ai-claim-disabled";
			notice.textContent = message.state === "done" ? "研究制品结构校验未通过，仅允许查看。" : "该回答未完整生成，仅允许查看候选主张。";
			list.append(notice);
		}
		let verdictMeta = {
			accepted: ["已接受", "accepted"], rejected: ["已驳回", "rejected"],
			edited: ["已修改", "edited"], rebound: ["已重绑", "rebound"],
		};
		for (let claim of artifact.claims) {
			let state = LibraryAIArtifacts.claimReviewState(artifact, claim.id);
			let verdict = state.currentDecision?.verdict || "pending";
			let meta = verdictMeta[verdict] || ["待复核", "pending"];
			let card = html("article"); card.className = `library-ai-claim-card ${meta[1]}`; card.dataset.claimId = claim.id; card.dataset.messageId = message.id;
			let head = html("header");
			let title = html("strong"); title.textContent = `候选主张 ${claim.id}`;
			let badge = html("span"); badge.className = "library-ai-claim-verdict"; badge.textContent = meta[0];
			head.append(title, badge); card.append(head);
			let text = html("p"); text.className = "library-ai-claim-text"; text.textContent = state.text; card.append(text);
			let evidence = html("div"); evidence.className = "library-ai-claim-evidence";
			if (!state.evidenceIDs.length) {
				let missing = html("span"); missing.className = "missing"; missing.textContent = "未绑定证据"; evidence.append(missing);
			}
			for (let evidenceID of state.evidenceIDs) {
				let record = artifact.evidence.find(item => item.id === evidenceID);
				let citation = message.citations?.[evidenceID];
				let button = html("button"); button.type = "button"; button.dataset.citationId = evidenceID; button.dataset.citationMessageId = message.id;
				button.textContent = `${evidenceID}${record?.page ? ` · p.${record.page}` : ""}${citation?.title ? ` · ${citation.title}` : ""}`;
				button.title = record?.locatorStatus === "locatable" ? "打开证据原文" : "该证据缺少稳定定位锚点";
				button.classList.toggle("unresolved", record?.locatorStatus !== "locatable");
				evidence.append(button);
			}
			card.append(evidence);
			if (state.currentDecision?.reason) {
				let reason = html("small"); reason.className = "library-ai-claim-reason"; reason.textContent = `最近记录：${state.currentDecision.reason}`; card.append(reason);
			}
			let historyRows = artifact.decisions.filter(decision => decision.claimID === claim.id);
			if (historyRows.length) {
				let history = html("details"); history.className = "library-ai-claim-history";
				let historySummary = html("summary"); historySummary.textContent = `追加式决策记录 · ${historyRows.length}`; history.append(historySummary);
				let historyList = html("ol");
				for (let decision of historyRows) {
					let row = html("li");
					let timestamp = new Date(decision.createdAt).toLocaleString();
					row.textContent = `${timestamp} · ${verdictMeta[decision.verdict]?.[0] || decision.verdict}${decision.reason ? ` · ${decision.reason}` : ""}`;
					historyList.append(row);
				}
				history.append(historyList); card.append(history);
			}
			let actions = html("footer"); actions.className = "library-ai-claim-actions";
			let accept = html("button"); accept.type = "button"; accept.dataset.claimAction = "accepted"; accept.dataset.claimId = claim.id; accept.dataset.messageId = message.id;
			accept.textContent = "接受"; accept.disabled = !reviewEnabled || verdict === "accepted"; accept.setAttribute("aria-label", `接受候选主张 ${claim.id}`); actions.append(accept);
			let addForm = (action, label, buildFields) => {
				let details = html("details"); details.className = "library-ai-claim-form";
				let formSummary = html("summary"); formSummary.textContent = label; formSummary.setAttribute("aria-label", `${label}候选主张 ${claim.id}`); details.append(formSummary);
				let fields = html("div"); fields.className = "library-ai-claim-form-fields"; buildFields(fields);
				let submit = html("button"); submit.type = "button"; submit.dataset.claimAction = action; submit.dataset.claimId = claim.id; submit.dataset.messageId = message.id;
				submit.textContent = `记录${label}`; submit.disabled = !reviewEnabled || verdict === action; fields.append(submit); details.append(fields); actions.append(details);
			};
			addForm("rejected", "驳回", fields => {
				let label = html("label"); label.textContent = "原因（必填）";
				let input = html("textarea"); input.rows = 2; input.dataset.claimReason = "rejected"; input.placeholder = "事实错误、证据不支持、引用定位错误、范围扩大、术语错误……";
				label.append(input); fields.append(label);
			});
			addForm("edited", "修改", fields => {
				let textLabel = html("label"); textLabel.textContent = "修订后的完整主张";
				let input = html("textarea"); input.rows = 3; input.dataset.claimReplacementText = "true"; input.value = state.text; textLabel.append(input); fields.append(textLabel);
				let reasonLabel = html("label"); reasonLabel.textContent = "修改原因";
				let reason = html("input"); reason.type = "text"; reason.dataset.claimReason = "edited"; reason.value = "缩小范围或纠正表述"; reasonLabel.append(reason); fields.append(reasonLabel);
			});
			addForm("rebound", "重绑证据", fields => {
				let evidenceList = html("fieldset");
				let legend = html("legend"); legend.textContent = "选择当前回答已有证据"; evidenceList.append(legend);
				for (let record of artifact.evidence) {
					let option = html("label");
					let checkbox = html("input"); checkbox.type = "checkbox"; checkbox.dataset.claimEvidenceId = record.id; checkbox.checked = state.evidenceIDs.includes(record.id);
					let caption = html("span"); caption.textContent = `${record.id}${record.page ? ` · p.${record.page}` : " · 无页码"} · ${record.quote.slice(0, 80)}`;
					option.append(checkbox, caption); evidenceList.append(option);
				}
				fields.append(evidenceList);
				let reasonLabel = html("label"); reasonLabel.textContent = "重绑原因";
				let reason = html("input"); reason.type = "text"; reason.dataset.claimReason = "rebound"; reason.value = "纠正证据关联"; reasonLabel.append(reason); fields.append(reasonLabel);
			});
			card.append(actions); list.append(card);
		}
		panel.append(list);
		return panel;
	}

	async handleClaimAction(window, trigger) {
		let conversation = this.repository.active;
		let messageID = trigger.dataset.messageId || trigger.closest?.("[data-message-id]")?.dataset.messageId;
		let message = conversation?.messages.find(candidate => candidate.id === messageID);
		let artifact = message?.artifact, claimID = trigger.dataset.claimId, verdict = trigger.dataset.claimAction;
		if (!artifact || !claimID) return;
		let lockKey = `${conversation.id}:${messageID}:${claimID}`;
		if (this.reviewLocks.has(lockKey)) return;
		this.reviewLocks.add(lockKey); trigger.disabled = true;
		try {
			if (message.state !== "done" || !artifact.validation.structuralPassed) throw new Error("只有完整且结构校验通过的回答可以复核");
			let decision = { claimID, verdict, actor: "user", reason: "" };
			if (verdict === "accepted") decision.reason = "用户已核对并接受";
			if (verdict === "rejected") {
				decision.reason = trigger.closest(".library-ai-claim-form")?.querySelector('[data-claim-reason="rejected"]')?.value.trim() || "";
			}
			if (verdict === "edited") {
				let form = trigger.closest(".library-ai-claim-form");
				decision.reason = form?.querySelector('[data-claim-reason="edited"]')?.value.trim() || "用户修改主张";
				decision.replacementText = form?.querySelector("[data-claim-replacement-text]")?.value.trim() || "";
			}
			if (verdict === "rebound") {
				let form = trigger.closest(".library-ai-claim-form");
				decision.reason = form?.querySelector('[data-claim-reason="rebound"]')?.value.trim() || "用户重新绑定证据";
				decision.replacementEvidenceIDs = [...form.querySelectorAll("[data-claim-evidence-id]:checked")].map(input => input.dataset.claimEvidenceId);
			}
			let nextArtifact = LibraryAIArtifacts.appendDecision(artifact, decision);
			nextArtifact.validation = await LibraryAIArtifacts.verifyBundle(nextArtifact, { cryptoProvider: window.crypto, TextEncoderImpl: window.TextEncoder });
			if (!nextArtifact.validation.structuralPassed) throw new Error("追加后的研究制品未通过结构校验");
			message.artifact = nextArtifact;
			this.repository.update(conversation, { save: false }); await this.repository.save({ throwOnError: true }); this.renderAll();
			this.setStatus(window, `已记录 ${claimID} 的人工复核结果；原始回答保持不变`);
		}
		catch (error) { message.artifact = artifact; this.renderAll(); this.setStatus(window, `主张复核失败：${error.message || error}`); }
		finally { this.reviewLocks.delete(lockKey); }
	}

	renderMarkdown(markdown, citations = {}, messageID = "") {
		let text = String(markdown || ""), codeBlocks = [];
		text = text.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_, language, code) => { let id = codeBlocks.length; codeBlocks.push(`<pre><code>${this.escape(code)}</code></pre>`); return `\n@@CODE${id}@@\n`; });
		let messageAttribute = messageID ? ` data-citation-message-id="${this.escape(messageID)}"` : "";
		let inline = value => {
			let claimAttribute = ` data-citation-claim="${this.escape(String(value || "").replace(/\[\[[A-Z]\d+-C\d+\]\]/g, "").slice(0, 500))}"`;
			return this.escape(value)
			.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>")
			.replace(/\[\[([A-Z]\d+-C\d+)\]\]/g, (all, id) => citations[id] ? `<span class="library-ai-citation-wrap"><button type="button" class="library-ai-citation" data-citation-id="${id}"${messageAttribute}${claimAttribute} title="打开原文">${this.escape(citations[id].title || "来源")}${citations[id].page ? ` · p.${citations[id].page}` : ""}</button><button type="button" class="library-ai-citation-preview-button" data-preview-citation="${id}" title="预览引用原文">⌄</button><span class="library-ai-citation-preview" hidden><strong>${this.escape(id)}</strong>${this.escape(citations[id].text || "暂无原文预览")}</span></span>` : all);
		};
		let lines = text.split(/\r?\n/), html = [], list = [], table = [];
		let flushList = () => { if (list.length) { html.push(`<ul>${list.map(item => `<li>${inline(item)}</li>`).join("")}</ul>`); list = []; } };
		let flushTable = () => { if (table.length) { html.push(`<table><tbody>${table.map(row => `<tr>${row.map(cell => `<td>${inline(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`); table = []; } };
		for (let raw of lines) {
			let line = raw.trim(); if (!line) { flushList(); flushTable(); continue; }
			let code = line.match(/^@@CODE(\d+)@@$/); if (code) { flushList(); flushTable(); html.push(codeBlocks[Number(code[1])]); continue; }
			let heading = line.match(/^(#{1,4})\s+(.+)/); if (heading) { flushList(); flushTable(); html.push(`<h${heading[1].length + 1}>${inline(heading[2])}</h${heading[1].length + 1}>`); continue; }
			let bullet = line.match(/^[-*]\s+(.+)/); if (bullet) { flushTable(); list.push(bullet[1]); continue; }
			if (line.startsWith("|") && line.endsWith("|") && !/^\|[-: |]+\|$/.test(line)) { flushList(); table.push(line.slice(1, -1).split("|").map(cell => cell.trim())); continue; }
			flushList(); flushTable(); html.push(`<p>${inline(line)}</p>`);
		}
		flushList(); flushTable(); return html.join("");
	}

	toggleMessageAudit(button) {
		let article = button.closest(".library-ai-message"); let audit = article?.querySelector(".library-ai-audit"); if (!audit) return;
		audit.hidden = !audit.hidden;
		button.textContent = audit.hidden ? button.textContent.replace(/^收起/, "查看") : button.textContent.replace(/^查看/, "收起");
	}

	toggleCitationPreview(button) {
		let preview = button.closest(".library-ai-citation-wrap")?.querySelector(".library-ai-citation-preview"); if (!preview) return;
		preview.hidden = !preview.hidden;
		button.textContent = preview.hidden ? "⌄" : "⌃";
	}

	async openCitation(messageID, id, window = null, claimText = "") {
		try {
			if (window) this.setStatus(window, `正在定位引用 ${id} 的原文段落…`);
			let message = (this.repository.active?.messages || []).find(item => item.id === messageID);
			let citation = message?.citations?.[id];
			if (!citation) throw new Error("引用记录不存在或已过期");
			let itemID = Number(citation.attachmentID || citation.sourceItemID || 0);
			let item = itemID ? await Zotero.Items.getAsync(itemID) : null;
			if (!item) throw new Error("引用对应的文献或附件不存在");
			let position = this.citationPosition(citation.position);
			let target = citation.annotationKey || position ? citation : (await this.context?.resolveCitation?.(citation, claimText) || citation);
			let page = Number(target.page || 0);
			let location = citation.annotationKey ? { annotationID: String(citation.annotationKey) }
				: (position ? { position } : (Number.isInteger(page) && page > 0 ? { pageIndex: page - 1 } : null));
			let opened = await this.workspace.startReading(item, location);
			if (opened === null) throw new Error("引用对应的文献没有可阅读的 PDF 附件");
			let searched = !citation.annotationKey && !position && await this.locateCitationText(opened, target);
			if (window) this.setStatus(window, citation.annotationKey || position
				? `已定位到引用 ${id} 的原文段落`
				: (searched ? `已按当前陈述定位引用 ${id} 的正文段落` : (location ? `仅能定位到引用 ${id} 所在页` : `引用 ${id} 缺少可靠段落锚点`)));
			return true;
		}
		catch (error) {
			this.workspace.log?.(`Unable to open Library AI citation ${id}: ${error}`);
			if (window) this.setStatus(window, `无法打开引用：${error.message || error}`);
			return false;
		}
	}

	citationPosition(value) {
		if (!value || !Number.isInteger(value.pageIndex) || value.pageIndex < 0) return null;
		let rects = Array.isArray(value.rects)
			? value.rects.filter(rect => Array.isArray(rect) && rect.length >= 4 && rect.slice(0, 4).every(Number.isFinite)).map(rect => rect.slice(0, 4))
			: [];
		return rects.length ? { pageIndex: value.pageIndex, rects } : null;
	}

	citationSearchQuery(citation) {
		let source = String(citation?.anchorText || citation?.text || "").replace(/^批注：\s*/, "").replace(/\s+/g, " ").trim();
		if (!source) return "";
		let sentences = source.split(/(?<=[。！？!?])\s*|(?<=\.)\s+/).map(value => value.trim()).filter(Boolean);
		let query = sentences.find(value => value.length >= 32) || sentences[0] || source;
		if (query.length <= 64) return query;
		let sample = query.slice(0, 64), boundary = Math.max(sample.lastIndexOf(" "), sample.lastIndexOf("，"), sample.lastIndexOf(","));
		return sample.slice(0, boundary >= 18 ? boundary : 64).trim();
	}

	async locateCitationText(reader, citation) {
		let query = this.citationSearchQuery(citation);
		if (!reader || !query) return false;
		try {
			await reader._initPromise;
			let internal = reader._internalReader, previous = internal?._state?.primaryViewFindState;
			if (!internal || !previous || typeof internal._updateState !== "function") return false;
			let update = { primaryViewFindState: { ...previous, popupOpen: true, active: true, query, highlightAll: true, caseSensitive: false, entireWord: false, index: null, result: null } };
			if (reader._iframeWindow && globalThis.Components?.utils?.cloneInto) update = Components.utils.cloneInto(update, reader._iframeWindow);
			internal._updateState(update);
			for (let attempt = 0; attempt < 20; attempt++) {
				let result = internal._state?.primaryViewFindState?.result;
				if (result) return Number(result.total || 0) > 0;
				if (Zotero.Promise?.delay) await Zotero.Promise.delay(75);
				else await new Promise(resolve => setTimeout(resolve, 75));
			}
			return false;
		}
		catch (error) { this.workspace.log?.(`Unable to locate citation paragraph: ${error}`); return false; }
	}

	async generateSourceInsight(window, itemID, { automatic = false } = {}) {
		let conversation = this.repository.active; if (!conversation || this.abortController) return;
		let source = conversation.sources.find(candidate => String(candidate.itemID) === String(itemID)); if (!source) return;
		if (automatic && (source.insight?.state === "done" || source.insight?.state === "generating")) return;
		source.insight = { state: "generating", content: "", updatedAt: new Date().toISOString() };
		this.repository.update(conversation); this.renderAll();
		try {
			let records = await this.context.collectInsightMaterial(source);
			let material = records.map((record, index) => `[I${index + 1}]${record.page ? ` 第${record.page}页` : ""}\n${record.text}`).join("\n\n");
			let content = "";
			await this.provider.stream([{
				role: "user",
				content: `请为下面的论文来源生成简洁的来源洞察卡。严格用中文 Markdown，并按四项输出：\n- 一句话定位\n- 核心贡献（最多3条）\n- 方法与证据（最多3条）\n- 局限或待验证点（最多2条）\n不要编造材料中没有的信息。\n\n来源：${source.title}\n\n${material}`,
			}], { window, onDelta: delta => { content += delta; source.insight.content = content; this.scheduleRenderAll(); }, onReasoning: () => {} });
			source.insight = { state: "done", content, updatedAt: new Date().toISOString() };
		} catch (error) {
			source.insight = { state: "error", content: "", error: error.message || String(error), updatedAt: new Date().toISOString() };
		} finally { this.repository.update(conversation); await this.repository.save(); this.renderAll(); }
	}

	async saveAsNote(window) {
		let conversation = this.repository.active, answer = [...conversation.messages].reverse().find(message => message.role === "assistant" && message.content); let source = conversation.sources[0];
		if (!answer || !source) { this.setStatus(window, "先完成一次基于论文的回答"); return; }
		try {
			let item = await Zotero.Items.getAsync(source.itemID), note = new Zotero.Item("note"); note.parentID = item.id;
			let citations = Object.entries(answer.citations || {}).map(([id, citation]) => `${id}：${citation.title}${citation.page ? `，第 ${citation.page} 页` : ""}`).join("\n");
			let reviewedMarkup = "";
			if (answer.artifact?.decisions?.length) {
				let verdictLabels = { accepted: "已接受", rejected: "已驳回", edited: "已修改", rebound: "已重绑证据" };
				let rows = answer.artifact.claims.map(claim => LibraryAIArtifacts.claimReviewState(answer.artifact, claim.id)).filter(state => state.currentDecision).map(state => {
					let decision = state.currentDecision, label = verdictLabels[decision.verdict] || decision.verdict;
					let evidence = state.evidenceIDs.length ? `证据：${state.evidenceIDs.join("、")}` : "未绑定证据";
					let text = decision.verdict === "rejected" ? `<s>${this.escape(state.text)}</s>` : this.escape(state.text);
					return `<li><p>${text}</p><small>${this.escape(label)} · ${this.escape(evidence)}${decision.reason ? ` · ${this.escape(decision.reason)}` : ""}</small></li>`;
				}).join("");
				reviewedMarkup = `<h2>人工复核主张</h2><ol>${rows}</ol><h2>原始回答（只读）</h2>`;
			}
			note.setNote(`<h1>${this.escape(conversation.title)}</h1>${reviewedMarkup}${this.renderMarkdown(answer.content, {})}<h2>引用</h2><pre>${this.escape(citations)}</pre>`); await note.saveTx(); this.setStatus(window, "已保存到当前文献的笔记");
		} catch (error) { this.setStatus(window, `保存失败：${error.message || error}`); }
	}

	// ---- 参考片段（剪贴板监测 / 阅读器划词 / 选择区域）----

	addReference(window, reference) {
		let conversation = this.repository.active;
		if (!conversation) return;
		let text = (reference.text || "").trim();
		if (!text) return;
		conversation.references ??= [];
		if (conversation.references.some(existing => existing.text === text)) return;
		conversation.references.push({
			id: Zotero.Utilities.randomString(8),
			kind: reference.kind || "text",
			label: (reference.label || "参考片段").slice(0, 80),
			text: text.slice(0, 6000),
			createdAt: new Date().toISOString(),
		});
		this.repository.update(conversation);
		this.renderAll();
		this.setStatus(window, `已添加参考：${reference.label || "参考片段"}`);
	}

	removeReference(window, id) {
		let conversation = this.repository.active;
		if (!conversation) return;
		let removed = (conversation.references || []).find(ref => ref.id === id);
		conversation.references = (conversation.references || []).filter(ref => ref.id !== id);
		// 用户主动移除的剪贴板片段不再自动加回
		if (removed?.kind === "clipboard") this.clipboardDismissed.add(removed.text);
		this.repository.update(conversation);
		this.renderAll();
	}

	// 阅读器划词 → 参考片段（renderTextSelectionPopup 事件回调调用）
	async addReaderSelection({ reader, text, pageLabel }) {
		let window = Zotero.getMainWindow();
		if (!window || !text?.trim()) return;
		let attachment = Zotero.Items.get(reader.itemID);
		let parent = attachment?.parentItemID ? Zotero.Items.get(attachment.parentItemID) : null;
		let label = `${parent?.getDisplayTitle?.() || "当前文档"} · p.${pageLabel || "?"}`;
		await this.open(window, { syncSource: true });
		this.addReference(window, { kind: "selection", label, text });
		window.focus?.();
	}

	// 阅读器"选择区域"（图片批注）→ 参考片段
	async addAreaReference(annotation) {
		let window = Zotero.getMainWindow();
		if (!window) return;
		let attachment = annotation?.parentItem;
		let parent = attachment?.parentItem;
		let pageLabel = annotation.annotationPageLabel || "";
		let label = `${parent?.getDisplayTitle?.() || "当前文档"} · p.${pageLabel || "?"} 选区`;
		let text = `用户在文档第 ${pageLabel || "?"} 页框选了一个区域（图片/表格/段落）。请结合该页内容回答用户接下来关于此选区的问题。`;
		await this.open(window, { syncSource: true });
		this.addReference(window, { kind: "area", label, text });
		window.focus?.();
	}

	// 剪贴板实时监测：仅当 AI 面板打开时运行，新复制的文本自动挂为参考
	startClipboardMonitor(window) {
		let state = this.windows.get(window);
		if (!state) return;
		this.stopClipboardMonitor(window);
		// 先对齐当前剪贴板，避免把面板打开前的旧内容当成"新复制"
		this.lastClipboardText = this.readClipboardText();
		state.clipboardTimer = window.setInterval(() => this.pollClipboard(window), 1500);
	}

	stopClipboardMonitor(window) {
		let state = this.windows.get(window);
		if (state?.clipboardTimer) { window.clearInterval(state.clipboardTimer); state.clipboardTimer = null; }
	}

	readClipboardText() {
		try {
			let Ci = Components.interfaces;
			let clipboard = Components.classes["@mozilla.org/widget/clipboard;1"].getService(Ci.nsIClipboard);
			if (!clipboard.hasDataMatchingFlavors(["text/unicode"], Ci.nsIClipboard.kGlobalClipboard)) return "";
			let transferable = Components.classes["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);
			transferable.init(null);
			transferable.addDataFlavor("text/unicode");
			clipboard.getData(transferable, Ci.nsIClipboard.kGlobalClipboard);
			let data = {};
			transferable.getTransferData("text/unicode", data);
			return data.value?.QueryInterface(Ci.nsISupportsString)?.data || "";
		} catch (_) { return ""; }
	}

	pollClipboard(window) {
		let text = this.readClipboardText().trim();
		if (!text || text === this.lastClipboardText) return;
		this.lastClipboardText = text;
		if (text.length < 8 || text.length > 8000) return;
		if (this.clipboardDismissed.has(text)) return;
		let conversation = this.repository.active;
		if ((conversation?.references || []).some(ref => ref.text === text)) return;
		this.addReference(window, { kind: "clipboard", label: `剪贴板 · ${text.length} 字`, text });
	}

	// ---- 斜杠命令（Claudian 式 composer dropdown）----

	// 输入/点击时重匹配：/ 在词首则唤起下拉框，并按需节流重载用户命令
	async updateSlashDropdown(window) {
		let state = this.windows.get(window);
		if (!state) return;
		let input = state.view.querySelector("textarea");
		let match = this.commands.matchTrigger(input.value, input.selectionStart ?? 0);
		if (!match) { this.hideSlashDropdown(window); return; }
		try { await this.commands.refresh(); } catch (_) {}
		// 重载期间输入可能已变化，以最新值重新匹配
		match = this.commands.matchTrigger(input.value, input.selectionStart ?? 0);
		if (!match) { this.hideSlashDropdown(window); return; }
		let items = this.commands.list(match.query);
		state.slash = { match, items, selected: items.length ? 0 : -1, help: false };
		this.renderSlashDropdown(window);
	}

	renderSlashDropdown(window, scrollToSelected = false) {
		let state = this.windows.get(window); if (!state?.slash) return;
		let doc = state.view.ownerDocument, panel = state.view.querySelector('[data-role="slash"]');
		// 模型选择器保留搜索框（整体重建会让输入焦点丢失），其余模式整体重建
		let keepSearch = state.slash.mode === "models" && panel.querySelector(".library-ai-slash-search");
		if (!keepSearch) panel.textContent = "";
		// 卡片模式（/usage 等）：只读信息展示，Esc 关闭
		if (state.slash.card) {
			let card = doc.createElement("div"); card.className = "library-ai-slash-card";
			let title = doc.createElement("strong"); title.textContent = state.slash.card.title;
			card.append(title);
			for (let line of state.slash.card.lines) {
				let row = doc.createElement("div"); row.textContent = line; card.append(row);
			}
			panel.append(card);
			panel.hidden = false;
			return;
		}
		// 模型选择器模式（/model 或点击顶部模型名）：头部 + 搜索框 + 过滤列表
		if (state.slash.mode === "models") {
			let current = this.provider.config.model;
			let search = panel.querySelector(".library-ai-slash-search");
			if (!search) {
				panel.textContent = "";
				let header = doc.createElement("div"); header.className = "library-ai-slash-header";
				let title = doc.createElement("strong"); title.textContent = "选择模型";
				let hint = doc.createElement("span"); hint.textContent = `${state.slash.items.length} 个模型 · /model refresh 重抓`;
				header.append(title, hint);
				search = doc.createElement("input");
				search.className = "library-ai-slash-search";
				search.placeholder = "搜索模型…";
				search.value = state.slash.query || "";
				search.addEventListener("input", () => {
					if (state.slash?.mode !== "models") return;
					state.slash.query = search.value;
					state.slash.selected = 0;
					this.renderSlashDropdown(window);
				});
				search.addEventListener("keydown", event => {
					if (event.isComposing || state.slash?.mode !== "models") return;
					let count = (state.slash.filtered || state.slash.items).length;
					if (event.key === "ArrowDown" || event.key === "ArrowUp") {
						event.preventDefault();
						if (!count) return;
						let delta = event.key === "ArrowDown" ? 1 : -1;
						state.slash.selected = ((state.slash.selected + delta) % count + count) % count;
						this.renderSlashDropdown(window, true);
					}
					else if (event.key === "Enter" || event.key === "Tab") {
						event.preventDefault();
						if (state.slash.selected >= 0) this.selectSlashCommand(window, state.slash.selected);
					}
					else if (event.key === "Escape") {
						event.preventDefault();
						this.hideSlashDropdown(window);
						state.view.querySelector("textarea").focus();
					}
				});
				let list = doc.createElement("div"); list.className = "library-ai-slash-model-list";
				panel.append(header, search, list);
				window.setTimeout(() => search.focus(), 0);
			}
			else {
				// 搜索框保留时同步头部计数（后台重抓后模型数可能变化）
				let hint = panel.querySelector(".library-ai-slash-header span");
				if (hint) hint.textContent = `${state.slash.items.length} 个模型 · /model refresh 重抓`;
			}
			// 只重建列表容器，保住搜索框的焦点与光标
			let query = (state.slash.query || "").toLocaleLowerCase();
			let filtered = state.slash.items.filter(modelId => modelId.toLocaleLowerCase().includes(query));
			state.slash.filtered = filtered;
			if (state.slash.selected >= filtered.length) state.slash.selected = Math.max(0, filtered.length - 1);
			if (!filtered.length) state.slash.selected = -1;
			let list = panel.querySelector(".library-ai-slash-model-list");
			list.textContent = "";
			if (!filtered.length) {
				let empty = doc.createElement("div"); empty.className = "library-ai-slash-empty";
				empty.textContent = state.slash.items.length ? `没有匹配「${state.slash.query}」的模型` : "暂无模型列表：先在设置中保存并测试，或 /model refresh 抓取";
				list.append(empty);
			}
			filtered.forEach((modelId, index) => {
				let item = doc.createElement("div");
				item.className = "library-ai-slash-item";
				item.classList.toggle("selected", index === state.slash.selected);
				item.setAttribute("role", "option");
				let name = doc.createElement("span"); name.className = "library-ai-slash-name"; name.textContent = modelId;
				item.append(name);
				if (modelId === current) {
					let badge = doc.createElement("span"); badge.className = "library-ai-slash-badge builtin"; badge.textContent = "使用中";
					item.append(badge);
				}
				item.addEventListener("mousedown", event => { event.preventDefault(); this.selectSlashCommand(window, index); });
				item.addEventListener("mousemove", () => {
					if (state.slash && state.slash.selected !== index) { state.slash.selected = index; this.renderSlashDropdown(window); }
				});
				list.append(item);
			});
			panel.hidden = false;
			if (scrollToSelected && state.slash.selected >= 0) {
				list.children[state.slash.selected]?.scrollIntoView?.({ block: "nearest" });
			}
			return;
		}
		let offset = 0;
		if (state.slash.help) {
			let header = doc.createElement("div"); header.className = "library-ai-slash-header";
			let title = doc.createElement("strong"); title.textContent = "斜杠命令";
			let hint = doc.createElement("span"); hint.textContent = "自定义：library-ai/commands/*.md";
			header.append(title, hint); panel.append(header); offset = 1;
		}
		if (!state.slash.items.length) {
			let empty = doc.createElement("div"); empty.className = "library-ai-slash-empty";
			empty.textContent = "无匹配命令，输入 /help 查看全部"; panel.append(empty);
		}
		state.slash.items.forEach((command, index) => {
			let item = doc.createElement("div");
			item.className = "library-ai-slash-item";
			item.classList.toggle("selected", index === state.slash.selected);
			item.setAttribute("role", "option");
			let name = doc.createElement("span"); name.className = "library-ai-slash-name"; name.textContent = `/${command.name}`;
			let badge = doc.createElement("span");
			badge.className = `library-ai-slash-badge ${command.source}`;
			badge.textContent = command.source === "user" ? "自定义" : (command.kind === "action" ? "动作" : "内置");
			let desc = doc.createElement("span"); desc.className = "library-ai-slash-desc";
			desc.textContent = command.argumentHint ? `${command.description} · ${command.argumentHint}` : command.description || "";
			item.append(name, badge, desc);
			item.addEventListener("mousedown", event => { event.preventDefault(); this.selectSlashCommand(window, index); });
			item.addEventListener("mousemove", () => {
				if (state.slash && state.slash.selected !== index) { state.slash.selected = index; this.renderSlashDropdown(window); }
			});
			panel.append(item);
		});
		panel.hidden = false;
		if (scrollToSelected && state.slash.selected >= 0) {
			panel.children[state.slash.selected + offset]?.scrollIntoView?.({ block: "nearest" });
		}
	}

	// 下拉框可见时接管导航键；返回 true 表示事件已消费（Claudian handleKeydown 同款语义）
	handleSlashKeydown(window, event) {
		let state = this.windows.get(window);
		let panel = state?.view.querySelector('[data-role="slash"]');
		if (!state?.slash || panel?.hidden || event.isComposing) return false;
		let count = state.slash.items.length;
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			if (!count) return true;
			let delta = event.key === "ArrowDown" ? 1 : -1;
			state.slash.selected = ((state.slash.selected + delta) % count + count) % count;
			this.renderSlashDropdown(window, true);
			return true;
		}
		if (event.key === "Enter" || event.key === "Tab") {
			if (state.slash.selected < 0) return false;
			event.preventDefault();
			this.selectSlashCommand(window, state.slash.selected);
			return true;
		}
		if (event.key === "Escape") {
			event.preventDefault();
			this.hideSlashDropdown(window);
			return true;
		}
		return false;
	}

	// Claudian select/replaceRange：替换触发区间为 "/name "，尾部空白去重
	async selectSlashCommand(window, index) {
		let state = this.windows.get(window); if (!state?.slash) return;
		// 模型选择器：选中即切换模型（按过滤后的列表取）
		if (state.slash.mode === "models") {
			let modelId = (state.slash.filtered || state.slash.items)[index];
			this.hideSlashDropdown(window);
			state.view.querySelector("textarea").focus();
			if (modelId) await this.applyModel(window, modelId);
			return;
		}
		let command = state.slash.items[index]; if (!command) return;
		let input = state.view.querySelector("textarea");
		let replacement = `/${command.name} `;
		if (state.slash.match) {
			let { start, end } = state.slash.match;
			let after = input.value.slice(end);
			if (/^\s/.test(after)) after = after.slice(1);
			input.value = input.value.slice(0, start) + replacement + after;
			input.selectionStart = input.selectionEnd = start + replacement.length;
		}
		else {
			input.setRangeText(replacement, input.selectionStart, input.selectionEnd, "end");
		}
		this.hideSlashDropdown(window);
		input.focus();
	}

	hideSlashDropdown(window) {
		let state = this.windows.get(window); if (!state) return;
		state.slash = null;
		let panel = state.view.querySelector('[data-role="slash"]');
		if (panel) panel.hidden = true;
	}

	async executeSlashAction(window, command, args) {
		switch (command.name) {
			case "clear": {
				// Claude Code 语义：/clear [name] 可为上一会话命名，便于 /resume 找回
				let previous = this.repository.active;
				if (args && previous?.messages.length) { previous.title = args.slice(0, 40); this.repository.update(previous); }
				this.repository.create();
				await this.syncCurrentSource(window);
				this.renderAll();
				this.setStatus(window, args ? `已开始新会话（上一会话标记为「${args}」）` : "已开始新会话");
				break;
			}
			case "help": this.showSlashHelp(window); break;
			case "compact": await this.compactConversation(window, args); break;
			case "model": await this.switchModel(window, args); break;
			case "copy": this.copyLastAnswer(window, args); break;
			case "export": await this.exportConversation(window, args); break;
			case "rename": this.renameConversation(window, args); break;
			case "resume": this.resumeConversation(window, args); break;
			case "usage": this.showUsage(window); break;
			case "settings": this.togglePanel(window, "settings", true); break;
			case "exit": this.close(window); break;
		}
	}

	// /compact [压缩重点]：把当前会话压缩为一条摘要消息（Claude Code 同款语义），释放上下文
	async compactConversation(window, args) {
		let conversation = this.repository.active;
		if (this.abortController) { this.setStatus(window, "正在生成回答，请稍后再压缩"); return; }
		let history = conversation.messages.filter(message => message.content || message.reasoning);
		if (!history.length) { this.setStatus(window, "当前会话为空，无需压缩"); return; }
		let transcript = history
			.map(message => `${message.role === "user" ? "用户" : "AI"}：${(message.prompt || message.content || "").slice(0, 4000)}`)
			.join("\n\n");
		let focus = args ? `\n压缩时特别关注：${args}` : "";
		this.abortController = new window.AbortController();
		this.setStatus(window, "正在压缩上下文…");
		let summary = "";
		try {
			summary = await this.provider.stream([
				{ role: "system", content: "你是对话压缩器。把研究对话压缩为结构化中文摘要，保留：已确认的结论、关键引用标记（形如 [[S1-C1]]）、论文事实与页码、悬而未决的问题。摘要将作为唯一历史上下文继续参与后续对话。直接输出摘要正文。" },
				{ role: "user", content: `请压缩以下对话。${focus}\n\n${transcript}` },
			], {
				signal: this.abortController.signal, window,
				onDelta: delta => { summary += delta; },
				onReasoning: () => {},
			});
			conversation.messages = [{ id: Zotero.Utilities.randomString(8), role: "assistant", content: summary, citations: {}, compacted: true, createdAt: new Date().toISOString() }];
			this.repository.update(conversation);
			await this.repository.save();
			this.setStatus(window, `上下文已压缩：${history.length} 条消息 → 1 条摘要`);
		}
		catch (error) {
			this.setStatus(window, error.name === "AbortError" ? "已取消压缩" : `压缩失败：${error.message || error}`);
		}
		finally { this.abortController = null; this.renderAll(); }
	}

	// /model：无参数弹出模型选择器（自动抓取）；/model refresh 强制重新抓取；/model <id> 直接切换
	async switchModel(window, args) {
		if (!args) { await this.showModelPicker(window); return; }
		if (args === "refresh") { await this.refreshModels(window, true); await this.showModelPicker(window); return; }
		await this.applyModel(window, args);
	}

	// 模型选择器：复用斜杠面板（Claudian 快照缓存 + 过期重抓模式）
	async showModelPicker(window) {
		let state = this.windows.get(window); if (!state) return;
		let current = this.provider.config.model;
		let models = [...new Set([current, ...this.provider.getCachedModels()].filter(Boolean))];
		state.slash = { match: null, mode: "models", items: models, filtered: models, query: "", selected: Math.max(0, models.indexOf(current)) };
		this.renderSlashDropdown(window, true);
		if (this.provider.cacheStale()) await this.refreshModels(window);
	}

	async refreshModels(window, manual = false) {
		let state = this.windows.get(window); if (!state) return;
		this.setStatus(window, "正在抓取模型列表…");
		try {
			let fresh = await this.provider.fetchModels();
			this.setStatus(window, `抓取到 ${fresh.length} 个模型`);
			this.fillModelDatalist(window);
			if (state.slash?.mode === "models") {
				let current = this.provider.config.model;
				state.slash.items = [...new Set([current, ...fresh].filter(Boolean))];
				state.slash.selected = Math.max(0, state.slash.items.indexOf(current));
				this.renderSlashDropdown(window, true);
			}
		}
		catch (error) {
			this.setStatus(window, `${manual ? "" : "后台"}模型列表抓取失败：${error.message || error}`);
		}
	}

	async applyModel(window, modelId) {
		try {
			let config = this.provider.config;
			await this.provider.save({ preset: config.preset, baseURL: config.baseURL, model: modelId, apiKey: "" });
			this.renderAll();
			this.setStatus(window, `模型已切换为 ${modelId}`);
		}
		catch (error) { this.setStatus(window, `切换模型失败：${error.message || error}`); }
	}

	// /copy [N]：复制第 N 近的 AI 回答（默认最近一条）
	copyLastAnswer(window, args) {
		let answers = this.repository.active.messages.filter(message => message.role === "assistant" && message.content);
		let n = Math.max(1, parseInt(args, 10) || 1);
		let target = answers[answers.length - n];
		if (!target) { this.setStatus(window, "没有可复制的回答"); return; }
		try {
			let Ci = Components.interfaces;
			let transferable = Components.classes["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);
			transferable.init(null);
			transferable.addDataFlavor("text/unicode");
			let text = Components.classes["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
			text.data = target.content;
			transferable.setTransferData("text/unicode", text);
			Components.classes["@mozilla.org/widget/clipboard;1"].getService(Ci.nsIClipboard)
				.setData(transferable, null, Ci.nsIClipboard.kGlobalClipboard);
			// 对齐剪贴板监测基线，避免刚复制的回答被自动挂为参考片段
			this.lastClipboardText = target.content;
			this.setStatus(window, `已复制最近第 ${n} 条回答（${target.content.length} 字）`);
		}
		catch (error) { this.setStatus(window, `复制失败：${error.message || error}`); }
	}

	// /export [文件名]：导出当前会话为 Markdown 到 library-ai/exports/
	async exportConversation(window, args) {
		let conversation = this.repository.active;
		if (!conversation.messages.length) { this.setStatus(window, "当前会话为空，无法导出"); return; }
		let name = (args || conversation.title || "conversation").replace(/[\\/:*?"<>|]/g, "-").slice(0, 60);
		let lines = [
			`# ${conversation.title}`, "",
			`导出时间：${new Date().toLocaleString()}`,
			`论文来源：${conversation.sources.map(source => source.title).join("、") || "无"}`, "",
		];
		for (let message of conversation.messages) {
			lines.push(`## ${message.role === "user" ? "用户" : "Library AI"} · ${new Date(message.createdAt).toLocaleString()}`, "");
			if (message.role === "user" && message.prompt) lines.push(`${message.content}`, "", `> 展开指令：${message.prompt.slice(0, 500)}`, "");
			else lines.push(message.content || "", "");
		}
		try {
			let directory = PathUtils.join(Zotero.DataDirectory.dir, "library-ai", "exports");
			await IOUtils.makeDirectory(directory, { ignoreExisting: true });
			let path = PathUtils.join(directory, `${name}.md`);
			await IOUtils.writeUTF8(path, lines.join("\n"));
			this.setStatus(window, `已导出：${path}`);
		}
		catch (error) { this.setStatus(window, `导出失败：${error.message || error}`); }
	}

	// /rename [会话名]：无参数时按首条提问重新自动命名
	renameConversation(window, args) {
		let conversation = this.repository.active;
		conversation.title = args ? args.slice(0, 40) : "新对话";
		this.repository.update(conversation);
		this.renderAll();
		this.setStatus(window, `会话已命名为「${conversation.title}」`);
	}

	// /resume [关键词]：无参数打开历史面板；有参数按 ID 或标题关键词切换
	resumeConversation(window, args) {
		if (!args) { this.togglePanel(window, "history"); return; }
		let target = this.repository.list().find(item => item.id === args || item.title.includes(args));
		if (!target) { this.setStatus(window, `没有找到包含「${args}」的会话`); return; }
		this.repository.activate(target.id);
		this.renderAll();
		this.setStatus(window, `已切换到会话「${target.title}」`);
	}

	// /usage：在下拉面板中展示当前会话用量统计卡片
	showUsage(window) {
		let state = this.windows.get(window); if (!state) return;
		let conversation = this.repository.active;
		let user = conversation.messages.filter(message => message.role === "user").length;
		let assistant = conversation.messages.length - user;
		let chars = conversation.messages.reduce((sum, message) => sum + (message.prompt || message.content || "").length + (message.reasoning || "").length, 0);
		state.slash = {
			match: null, items: [], selected: -1,
			card: {
				title: "会话用量",
				lines: [
					`消息：${user} 问 / ${assistant} 答`,
					`来源：${conversation.sources.length} 篇 · 参考片段：${(conversation.references || []).length} 条`,
					`累计字符：约 ${chars.toLocaleString()} 字（≈ ${Math.round(chars / 4).toLocaleString()} tokens，粗略估计）`,
					`上下文策略：仅最近 12 条消息进入请求，过长时使用 /compact 压缩`,
				],
			},
		};
		this.renderSlashDropdown(window);
	}

	async showSlashHelp(window) {
		let state = this.windows.get(window); if (!state) return;
		try { await this.commands.refresh(true); } catch (_) {}
		state.slash = { match: null, items: this.commands.list(""), selected: 0, help: true };
		this.renderSlashDropdown(window);
	}

	setStatus(window, text) { let status = this.windows.get(window)?.view.querySelector('[data-role="status"]'); if (status) status.textContent = text; }

	escape(value) { return String(value ?? "").replace(/[&<>\"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]); }
};
