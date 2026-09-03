// 翻译标签：全文翻译（复用 workspace 的 PDFTranslate 流程，产出文献笔记）
// 与划词翻译开关（阅读器选中文本后流式翻译）。
LibraryAITranslateTab = class LibraryAITranslateTab {
	constructor(host) {
		this.host = host;
		this.languages = [
			["auto", "自动检测"], ["zh", "中文"], ["en", "英语"], ["ja", "日语"], ["ko", "韩语"],
			["fr", "法语"], ["de", "德语"], ["es", "西班牙语"], ["ru", "俄语"], ["pt", "葡萄牙语"], ["it", "意大利语"],
		];
		this.translateTargets = [
			["zh", "中文"], ["en", "英语"], ["ja", "日语"], ["ko", "韩语"],
			["fr", "法语"], ["de", "德语"], ["es", "西班牙语"], ["ru", "俄语"],
		];
	}

	get prefRoot() { return this.host.workspace.aiPrefRoot; }
	html(doc, name) { return doc.createElementNS("http://www.w3.org/1999/xhtml", name); }

	fromLang() { return Services.prefs.getStringPref(this.prefRoot + "aiTranslateFrom", "auto"); }
	toLang() { return Services.prefs.getStringPref(this.prefRoot + "aiTranslateTo", "zh"); }
	selectionEnabled() { return Services.prefs.getBoolPref(this.prefRoot + "aiSelectionTranslate", false); }

	render(window) {
		let state = this.host.windows.get(window); if (!state) return;
		let panel = state.view.querySelector('[data-tab-panel="translate"]');
		if (!panel) return;
		panel.textContent = "";
		let doc = panel.ownerDocument;
		let scroll = this.html(doc, "div"); scroll.className = "library-ai-settings-scroll";
		scroll.append(this.fullDocumentCard(window, doc), this.selectionCard(window, doc));
		panel.append(scroll);
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

	// —— 全文翻译：当前选中文献的 PDF → 分段翻译 → 双语/单语文献笔记 ——
	fullDocumentCard(window, doc) {
		let { details, body } = this.card(doc, "全文翻译", "翻译当前论文并生成文献笔记");
		let item = this.currentTranslatableItem(window);
		let target = this.html(doc, "p");
		target.className = "library-ai-set-hint";
		target.textContent = item ? `目标：${item.title}` : "在文库中选中一篇带 PDF 的文献后点击开始";
		body.append(target);
		let status = this.html(doc, "div"); status.className = "library-ai-set-status"; status.setAttribute("role", "status"); status.dataset.trRole = "status";
		let start = this.html(doc, "button"); start.type = "button"; start.className = "library-ai-set-actions primary"; start.textContent = "开始全文翻译";
		let actions = this.html(doc, "div"); actions.className = "library-ai-set-actions";
		actions.append(start);
		body.append(status, actions);
		start.addEventListener("click", () => this.startFullTranslation(window, doc, status, start));
		return details;
	}

	currentTranslatableItem(window) {
		let selected = window.ZoteroPane?.getSelectedItems?.()[0];
		if (!selected) return null;
		if (selected.isPDFAttachment?.()) return { id: selected.id, title: selected.getDisplayTitle?.() || "PDF" };
		if (selected.isRegularItem?.()) {
			let attachmentID = selected.getAttachments?.().find(id => (Zotero.Items.get(id)?.isPDFAttachment?.()));
			if (attachmentID) return { id: attachmentID, title: selected.getDisplayTitle() };
		}
		return null;
	}

	async startFullTranslation(window, doc, status, start) {
		if (this.host.abortController) { status.textContent = "正在生成回答，请稍后再试"; return; }
		let item = this.currentTranslatableItem(window);
		if (!item) { status.textContent = "请先在文库中选中一篇带 PDF 的文献"; return; }
		if (!Zotero.PDFTranslate?.api?.translate) { status.textContent = "翻译组件尚未就绪（需 PDFTranslate 插件），重启后再试"; return; }
		start.disabled = true;
		status.textContent = "全文翻译已开始，进度见右下角进度窗；完成后会自动打开生成的笔记";
		try {
			// runFullDocumentTranslation 只依赖 reader.itemID 与可选按钮，直接以 {itemID} 调用
			await this.host.workspace.runFullDocumentTranslation({ itemID: item.id }, null);
			status.textContent = "全文翻译完成";
		}
		catch (error) {
			status.textContent = `全文翻译失败：${error?.message || error}`;
		}
		finally { start.disabled = false; }
	}

	// —— 划词翻译：开关 + 语言对；开启后阅读器选中文本即可流式翻译 ——
	selectionCard(window, doc) {
		let { details, body } = this.card(doc, "划词翻译", "阅读器中选中文字后一键流式翻译");
		let toggleRow = this.html(doc, "label"); toggleRow.className = "library-ai-set-toggle";
		let checkbox = this.html(doc, "input"); checkbox.type = "checkbox"; checkbox.checked = this.selectionEnabled();
		let toggleText = this.html(doc, "span"); toggleText.textContent = "启用划词翻译按钮";
		toggleRow.append(checkbox, toggleText);
		checkbox.addEventListener("change", () => {
			Services.prefs.setBoolPref(this.prefRoot + "aiSelectionTranslate", checkbox.checked);
			this.host.setStatus(window, checkbox.checked ? "划词翻译已启用：在阅读器中选中文字后点击“翻译”" : "划词翻译已关闭");
		});
		let pairRow = this.html(doc, "div"); pairRow.className = "library-ai-set-lang-row";
		let from = this.html(doc, "select");
		for (let [id, name] of this.languages) { let option = this.html(doc, "option"); option.value = id; option.textContent = name; from.append(option); }
		from.value = this.fromLang();
		let swap = this.html(doc, "button"); swap.type = "button"; swap.textContent = "⇄"; swap.title = "交换语言";
		let to = this.html(doc, "select");
		for (let [id, name] of this.translateTargets) { let option = this.html(doc, "option"); option.value = id; option.textContent = name; to.append(option); }
		to.value = this.toLang();
		from.addEventListener("change", () => Services.prefs.setStringPref(this.prefRoot + "aiTranslateFrom", from.value));
		to.addEventListener("change", () => Services.prefs.setStringPref(this.prefRoot + "aiTranslateTo", to.value));
		swap.addEventListener("click", () => {
			// “自动检测”不能作为目标语言：交换时把它落到中文
			let nextFrom = to.value, nextTo = from.value === "auto" ? "zh" : from.value;
			from.value = nextFrom; to.value = nextTo;
			Services.prefs.setStringPref(this.prefRoot + "aiTranslateFrom", nextFrom);
			Services.prefs.setStringPref(this.prefRoot + "aiTranslateTo", nextTo);
		});
		pairRow.append(from, swap, to);
		body.append(toggleRow, pairRow);
		let hint = this.html(doc, "small"); hint.className = "library-ai-set-hint";
		hint.textContent = "使用当前 AI 配置的模型流式翻译，与聊天共用同一接口。";
		body.append(hint);
		return details;
	}

	// 阅读器划词翻译执行（由 research-workspace 的选区弹窗调用）：
	// 在阅读器文档内挂一个流式结果浮层
	async runSelectionTranslate({ reader, doc, text }) {
		if (!reader || !text) return;
		let provider = this.host.provider;
		let fromName = this.languages.find(([id]) => id === this.fromLang())?.[1] || "自动检测";
		let toName = this.translateTargets.find(([id]) => id === this.toLang())?.[1] || "中文";
		let hostDoc = reader._iframeWindow?.document || doc;
		// 阅读器文档没有我们的 style.css，浮层样式就地注入
		if (hostDoc && !hostDoc.getElementById("library-ai-selection-translate-style")) {
			let style = hostDoc.createElement("style");
			style.id = "library-ai-selection-translate-style";
			style.textContent = `
				.library-ai-selection-translate{position:fixed;z-index:9999;inset-block-end:26px;inset-inline:0 auto;margin-inline:auto;width:min(520px,86vw);max-height:45vh;display:grid;grid-template-rows:auto 1fr auto;overflow:hidden;border:1px solid rgba(120,130,125,.4);border-radius:12px;background:rgba(252,252,250,.97);box-shadow:0 6px 20px rgba(0,0,0,.18);font:12px/1.6 system-ui,sans-serif;color:#20231f}
				.library-ai-selection-translate header{display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border-bottom:1px solid rgba(120,130,125,.25);font-size:11px}
				.library-ai-selection-translate [data-role=result]{padding:10px 12px;overflow:auto;white-space:pre-wrap}
				.library-ai-selection-translate footer{display:flex;gap:6px;justify-content:flex-end;padding:7px 10px;border-top:1px solid rgba(120,130,125,.25)}
				.library-ai-selection-translate footer button,.library-ai-selection-translate header button{padding:3px 10px;border:1px solid rgba(120,130,125,.4);border-radius:6px;background:transparent;font-size:10.5px;cursor:pointer}
				.library-ai-selection-translate header button{border:0;font-size:14px}
			`;
			(hostDoc.head || hostDoc.documentElement).append(style);
		}
		let panel = this.html(hostDoc, "div");
		panel.className = "library-ai-selection-translate";
		panel.innerHTML = `<header><strong>翻译 → ${toName}</strong><button type="button" data-close>×</button></header><div data-role="result"></div><footer><button type="button" data-copy>复制</button><button type="button" data-add-ref>加入参考</button></footer>`;
		(hostDoc.body || hostDoc.documentElement).append(panel);
		let result = panel.querySelector("[data-role=result]");
		let close = () => panel.remove();
		panel.querySelector("[data-close]").addEventListener("click", close);
		panel.querySelector("[data-copy]").addEventListener("click", () => {
			Zotero.Utilities.Internal.copyTextToClipboard(result.textContent);
		});
		panel.querySelector("[data-add-ref]").addEventListener("click", () => {
			let mainWindow = Zotero.getMainWindows()[0];
			this.host.addReference(mainWindow, { id: Zotero.Utilities.randomString(6), kind: "reader", label: `划词翻译（${toName}）`, text: `${text}\n\n译文：${result.textContent}` });
			this.host.open(mainWindow);
			close();
		});
		result.textContent = "正在翻译…";
		let buffer = "";
		let render = () => { result.textContent = buffer; };
		try {
			await provider.stream([
				{ role: "system", content: `你是翻译引擎。把用户提供的文本从${fromName}翻译成${toName}，只输出译文本身，不要任何解释、注音或原文。` },
				{ role: "user", content: text },
			], {
				window: reader._iframeWindow || Zotero.getMainWindows()[0],
				onDelta: delta => { buffer += delta; render(); },
				onReasoning: () => {},
			});
			if (!buffer.trim()) throw new Error("没有返回译文");
		}
		catch (error) {
			result.textContent = `${buffer}\n[翻译失败：${error.message || error}]`.trim();
		}
	}
};
