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
		let state = { contextPane, nativeContent, view, open: false, buttons: [], railButtons: [], listeners: [], syncTimer: null };
		this.windows.set(window, state);
		this.buildView(window, state);
		let launcher = doc.createElementNS("http://www.w3.org/1999/xhtml", "button");
		launcher.type = "button"; launcher.className = "library-ai-floating-launcher"; launcher.title = "Library AI"; launcher.setAttribute("aria-label", "打开 Library AI");
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
			<div class="library-ai-model-strip"><span class="library-ai-model-dot"></span><span data-role="model-name">尚未配置模型</span><button type="button" data-action="settings">配置</button></div>
			<section class="library-ai-history" hidden><header><strong>会话历史</strong><button type="button" data-action="history">完成</button></header><div data-role="history-list"></div></section>
			<section class="library-ai-settings" hidden>
				<header><div><strong>模型设置</strong><small>OpenAI 兼容接口</small></div><button type="button" data-action="settings">×</button></header>
				<label>提供商<select data-field="preset"></select></label>
				<label>接口地址<input data-field="baseURL" type="url" spellcheck="false"></label>
				<label>模型 ID<input data-field="model" type="text" spellcheck="false"></label>
				<label>API 密钥<input data-field="apiKey" type="password" autocomplete="off" placeholder="保存在系统凭据存储"></label>
				<div class="library-ai-settings-actions"><button type="button" data-action="save-settings">保存并测试</button><span data-role="settings-status"></span></div>
			</section>
			<main class="library-ai-messages" aria-live="polite"></main>
			<footer class="library-ai-composer-shell">
				<div class="library-ai-slash" data-role="slash" hidden></div>
				<div class="library-ai-source-row"><div data-role="sources"></div><button type="button" data-action="add-source" title="从文库选择其他论文">＋来源</button></div>
				<div class="library-ai-references" data-role="references" hidden></div>
				<div class="library-ai-composer"><textarea rows="3" placeholder="向论文提问…（输入 / 唤起命令）"></textarea><div class="library-ai-send-stack"><button type="button" data-action="stop" hidden title="停止生成">■</button><button type="button" data-action="send" title="发送">↑</button></div></div>
				<div class="library-ai-composer-foot"><span data-role="status">准备就绪</span><button type="button" data-action="save-note">保存为笔记</button></div>
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
			let citation = event.target.closest?.("[data-citation-id]"); if (citation) this.openCitation(citation.dataset.citationId);
			let sourceRemove = event.target.closest?.("[data-remove-source]"); if (sourceRemove) this.removeSource(window, sourceRemove.dataset.removeSource);
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
		select.addEventListener("change", () => {
			let preset = this.provider.presets[select.value]; if (!preset) return;
			view.querySelector('[data-field="baseURL"]').value = preset[1]; view.querySelector('[data-field="model"]').value = preset[2];
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
		else if (action === "save-settings") this.saveSettings(window);
		else if (action === "save-note") this.saveAsNote(window);
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
		view.querySelector('[data-field="baseURL"]').value = config.baseURL;
		view.querySelector('[data-field="model"]').value = config.model;
		view.querySelector('[data-field="apiKey"]').value = "";
		view.querySelector('[data-role="settings-status"]').textContent = "";
	}

	async saveSettings(window) {
		let view = this.windows.get(window).view, status = view.querySelector('[data-role="settings-status"]');
		status.textContent = "正在保存…";
		try {
			await this.provider.save({
				preset: view.querySelector('[data-field="preset"]').value,
				baseURL: view.querySelector('[data-field="baseURL"]').value.trim(),
				model: view.querySelector('[data-field="model"]').value.trim(),
				apiKey: view.querySelector('[data-field="apiKey"]').value.trim(),
			});
			view.querySelector('[data-field="apiKey"]').value = "";
			this.renderAll();
			status.textContent = "设置已保存，正在测试连接…";
			try {
				await this.provider.test();
				status.textContent = "设置已保存，连接成功";
			}
			catch (testError) {
				status.textContent = `设置已保存；连接测试失败：${testError.message || testError}`;
			}
		} catch (error) { status.textContent = error.message || String(error); }
	}

	async syncCurrentSource(window, forceSelected = false) {
		let item = forceSelected ? window.ZoteroPane?.getSelectedItems?.()[0] : await this.workspace.getCurrentWindowItem(window);
		let source = await this.context.source(item); if (!source) return;
		let conversation = this.repository.active; if (!conversation.sources.some(candidate => candidate.itemID === source.itemID)) conversation.sources.push(source);
		this.repository.update(conversation);
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
			added++;
		}
		if (added) {
			this.repository.update(conversation);
			await this.repository.save();
			this.renderAll();
		}
		this.setStatus(window, added ? `已添加 ${added} 篇论文来源` : "所选论文已在来源中");
	}

	removeSource(window, itemID) {
		let conversation = this.repository.active; conversation.sources = conversation.sources.filter(source => String(source.itemID) !== String(itemID));
		this.repository.update(conversation); this.renderAll();
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
		let assistant = { id: Zotero.Utilities.randomString(8), role: "assistant", content: "", citations: {}, state: "streaming", createdAt: new Date().toISOString() };
		conversation.messages.push(assistant); this.repository.update(conversation); this.abortController = new window.AbortController(); this.renderAll();
		try {
			// 发送时兜底同步：来源只会在打开面板/切换标签时同步，
			// 在文库中换选条目后再提问时可能仍为空，导致“无法识别当前论文”
			if (!conversation.sources.length) { await this.syncCurrentSource(window); this.renderAll(); }
			let snippets = [], citations = {}, sourceNumber = 0;
			for (let source of conversation.sources) {
				sourceNumber++;
				let records = await this.context.collect(source, question);
				for (let [index, record] of records.entries()) { let id = `S${sourceNumber}-C${index + 1}`; citations[id] = { ...record, title: source.title }; snippets.push(`[${id}] ${source.title}${record.page ? ` · 第 ${record.page} 页` : ""}\n${record.text}`); }
			}
			assistant.citations = citations;
			// 用户选中的参考片段（复制监测 / 阅读器划词 / 选择区域）优先进入上下文
			let references = conversation.references || [];
			let referenceBlock = references.length
				? `\n\n用户选中的参考片段（这些内容来自用户主动复制或在阅读器中框选，请优先围绕它们理解与作答）：\n${references.map((ref, index) => `[参考${index + 1}] ${ref.label}\n${ref.text}`).join("\n\n")}`
				: "";
			assistant.references = references.map(ref => ref.label);
			let messages = [{ role: "system", content: "你是 Library 的论文阅读助手。优先依据提供的论文片段回答；每个可核验结论后使用形如 [[S1-C1]] 的引用标记。只能使用给定 citation ID；没有可靠页码时不要猜测页码。使用清晰的中文 Markdown。" }, ...conversation.messages.filter(message => message !== assistant).slice(-12).map(message => ({ role: message.role, content: message.role === "user" && message.prompt ? message.prompt : message.content })), { role: "user", content: `问题：${question}\n\n可用论文片段：\n${snippets.join("\n\n") || "当前未添加论文来源，请按普通对话回答，并说明没有论文来源。"}${referenceBlock}` }];
			await this.provider.stream(messages, {
				signal: this.abortController.signal,
				window,
				onDelta: delta => { assistant.content += delta; this.renderAll(); },
				onReasoning: delta => { assistant.reasoning = (assistant.reasoning || "") + delta; this.renderAll(); },
			});
			assistant.state = "done";
		} catch (error) {
			Zotero.debug(`Library AI send: ${error.stack || error}`);
			assistant.state = error.name === "AbortError" ? "stopped" : "error"; assistant.error = error.name === "AbortError" ? "已停止生成" : (error.message || String(error));
		} finally { this.abortController = null; this.repository.update(conversation); await this.repository.save(); this.renderAll(); }
	}

	renderAll() { for (let window of this.windows.keys()) this.render(window); }
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
		for (let message of conversation.messages) messages.append(this.messageNode(view.ownerDocument, message));
		let sourceHost = view.querySelector('[data-role="sources"]'); sourceHost.textContent = "";
		for (let source of conversation.sources) { let chip = view.ownerDocument.createElement("span"); chip.className = "library-ai-source-chip"; chip.innerHTML = `<span>▤</span><span title="${this.escape(source.title)}">${this.escape(source.title)}</span><button type="button" data-remove-source="${source.itemID}" title="移除来源">×</button>`; sourceHost.append(chip); }
		if (!conversation.sources.length) { let empty = view.ownerDocument.createElement("span"); empty.className = "library-ai-no-source"; empty.textContent = "未添加论文来源"; sourceHost.append(empty); }
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
			? (streamingMessage?.reasoning && !streamingMessage?.content ? "正在思考（推理阶段）…" : "正在生成…")
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

	messageNode(doc, message) {
		let article = doc.createElement("article"); article.className = `library-ai-message ${message.role}${message.compacted ? " compacted" : ""}`; article.dataset.messageId = message.id;
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
		let body = doc.createElement("div"); body.className = "library-ai-message-body"; body.innerHTML = this.renderMarkdown(content, message.citations || {});
		article.append(body);
		if (message.state === "streaming") { let cursor = doc.createElement("span"); cursor.className = "library-ai-cursor"; cursor.textContent = ""; body.append(cursor); }
		if (message.error) { let error = doc.createElement("div"); error.className = "library-ai-error"; error.innerHTML = `<span>${this.escape(message.error)}</span>${message.state === "error" ? `<button type="button" data-retry-message="${message.id}">重试</button>` : ""}`; article.append(error); }
		return article;
	}

	renderMarkdown(markdown, citations = {}) {
		let text = String(markdown || ""), codeBlocks = [];
		text = text.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_, language, code) => { let id = codeBlocks.length; codeBlocks.push(`<pre><code>${this.escape(code)}</code></pre>`); return `\n@@CODE${id}@@\n`; });
		let inline = value => this.escape(value)
			.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>")
			.replace(/\[\[([A-Z]\d+-C\d+)\]\]/g, (all, id) => citations[id] ? `<button type="button" class="library-ai-citation" data-citation-id="${id}" title="打开引用">${this.escape(citations[id].title || "来源")}${citations[id].page ? ` · p.${citations[id].page}` : ""}</button>` : all);
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

	async openCitation(id) {
		let message = [...(this.repository.active?.messages || [])].reverse().find(item => item.citations?.[id]); let citation = message?.citations?.[id]; if (!citation) return;
		let item = citation.attachmentID ? await Zotero.Items.getAsync(citation.attachmentID) : await Zotero.Items.getAsync(citation.sourceItemID);
		let reader = await this.workspace.startReading(item); if (citation.page) await reader?.navigate?.({ pageIndex: citation.page - 1 });
	}

	async saveAsNote(window) {
		let conversation = this.repository.active, answer = [...conversation.messages].reverse().find(message => message.role === "assistant" && message.content); let source = conversation.sources[0];
		if (!answer || !source) { this.setStatus(window, "先完成一次基于论文的回答"); return; }
		try {
			let item = await Zotero.Items.getAsync(source.itemID), note = new Zotero.Item("note"); note.parentID = item.id;
			let citations = Object.entries(answer.citations || {}).map(([id, citation]) => `${id}：${citation.title}${citation.page ? `，第 ${citation.page} 页` : ""}`).join("\n");
			note.setNote(`<h1>${this.escape(conversation.title)}</h1>${this.renderMarkdown(answer.content, {})}<h2>引用</h2><pre>${this.escape(citations)}</pre>`); await note.saveTx(); this.setStatus(window, "已保存到当前文献的笔记");
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
		panel.textContent = "";
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
	selectSlashCommand(window, index) {
		let state = this.windows.get(window); if (!state?.slash) return;
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

	// /model [模型ID]：无参数打开设置面板；有参数直接切换（沿用已保存的接口与密钥）
	async switchModel(window, args) {
		if (!args) {
			this.togglePanel(window, "settings", true);
			this.setStatus(window, "在设置中选择模型，或直接 /model <模型ID>");
			return;
		}
		try {
			let config = this.provider.config;
			await this.provider.save({ preset: config.preset, baseURL: config.baseURL, model: args, apiKey: "" });
			this.renderAll();
			this.setStatus(window, `模型已切换为 ${args}`);
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
