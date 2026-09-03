// 快捷操作按钮行：点击直接发送预设指令；右键编辑/删除/新增（存 pref，上限 8 个自定义）。
// 内置指令不可删除，仅可被同名自定义覆盖前的顺序固定在最前。
LibraryAIShortcuts = class LibraryAIShortcuts {
	constructor(prefRoot = "extensions.zotero.researchWorkspace.") {
		this.prefRoot = prefRoot;
		this.builtin = [
			{ id: "translate", label: "翻译成中文", prompt: "请把本文的核心内容翻译成流畅的中文，保留关键术语的英文原文。基于已添加的论文来源回答，并使用 [[S#-C#]] 引用标记。" },
			{ id: "summarize", label: "总结全文", prompt: "请总结本文的主要内容：研究问题、方法、关键发现与结论。基于已添加的论文来源回答，并使用 [[S#-C#]] 引用标记。" },
			{ id: "key-points", label: "核心观点", prompt: "请列出本文最重要的 3-5 个核心观点，每条附一句证据说明。基于已添加的论文来源回答，并使用 [[S#-C#]] 引用标记。" },
			{ id: "methodology", label: "研究方法", prompt: "请解释作者的研究方法与实验/论证设计，指出其优势与适用范围。基于已添加的论文来源回答，并使用 [[S#-C#]] 引用标记。" },
			{ id: "limitations", label: "局限与展望", prompt: "请分析本文的局限性以及作者或你看到的未来研究方向。基于已添加的论文来源回答，并使用 [[S#-C#]] 引用标记。" },
		];
	}

	readCustom() {
		try {
			let raw = Services.prefs.getStringPref(this.prefRoot + "aiShortcuts", "[]");
			let list = JSON.parse(raw);
			return Array.isArray(list) ? list.filter(item => item?.id && item?.label && item?.prompt).slice(0, 8) : [];
		}
		catch (_) { return []; }
	}

	writeCustom(list) {
		Services.prefs.setStringPref(this.prefRoot + "aiShortcuts", JSON.stringify(list.slice(0, 8)));
	}

	list() { return [...this.builtin, ...this.readCustom()]; }

	// 渲染按钮行；点击发送，右键弹编辑菜单
	render(window, host) {
		let state = host.windows.get(window); if (!state) return;
		let host_ = state.view.querySelector('[data-role="shortcuts"]');
		if (!host_) return;
		host_.textContent = "";
		for (let shortcut of this.list()) {
			let button = host_.ownerDocument.createElement("button");
			button.type = "button"; button.title = shortcut.prompt; button.textContent = shortcut.label;
			button.addEventListener("click", () => this.execute(window, host, shortcut));
			button.addEventListener("contextmenu", event => {
				event.preventDefault();
				this.openEditMenu(window, event, host, shortcut);
			});
			host_.append(button);
		}
	}

	execute(window, host, shortcut) {
		let state = host.windows.get(window); if (!state) return;
		let input = state.view.querySelector(".library-ai-composer textarea");
		if (!input) return;
		input.value = shortcut.prompt;
		host.send(window);
	}

	// 右键菜单：自定义项可编辑/删除；任意位置可新增
	openEditMenu(window, event, host, shortcut) {
		let state = host.windows.get(window); if (!state) return;
		let doc = state.view.ownerDocument;
		let menu = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
		menu.className = "library-ai-shortcut-menu";
		menu.style.left = `${Math.min(event.clientX - state.view.getBoundingClientRect().left, state.view.clientWidth - 170)}px`;
		menu.style.top = `${event.clientY - state.view.getBoundingClientRect().top}px`;
		let custom = this.readCustom();
		let isCustom = custom.some(item => item.id === shortcut.id);
		let addItem = (label, handler) => {
			let button = doc.createElementNS("http://www.w3.org/1999/xhtml", "button");
			button.type = "button"; button.textContent = label;
			button.addEventListener("click", () => { menu.remove(); handler(); });
			menu.append(button);
		};
		if (isCustom) {
			addItem("编辑", () => this.openEditDialog(window, host, shortcut));
			addItem("删除", () => { this.writeCustom(custom.filter(item => item.id !== shortcut.id)); this.render(window, host); });
			addItem("上移", () => { let index = custom.findIndex(item => item.id === shortcut.id); if (index > 0) { [custom[index - 1], custom[index]] = [custom[index], custom[index - 1]]; this.writeCustom(custom); this.render(window, host); } });
		}
		addItem("新增自定义…", () => this.openEditDialog(window, host, null));
		state.view.append(menu);
		let dismiss = clickEvent => {
			if (!clickEvent.target.closest?.(".library-ai-shortcut-menu")) { menu.remove(); state.view.ownerDocument.removeEventListener("click", dismiss, true); }
		};
		doc.addEventListener("click", dismiss, true);
	}

	// 简易编辑对话框：label/prompt 两个输入框（复用 prompt()/confirm() 在主窗口可用）
	openEditDialog(window, host, existing) {
		let custom = this.readCustom();
		let isEdit = Boolean(existing && custom.some(item => item.id === existing.id));
		let label = window.prompt("按钮名称（最多 12 字）", existing?.label || "");
		if (label === null) return;
		label = label.trim().slice(0, 12);
		if (!label) return;
		let prompt = window.prompt("指令内容（发送给 AI 的完整提示词）", existing?.prompt || "");
		if (prompt === null || !prompt.trim()) return;
		if (isEdit) {
			let item = custom.find(item => item.id === existing.id);
			item.label = label; item.prompt = prompt.trim();
		}
		else {
			if (custom.length >= 8) { window.alert("自定义按钮最多 8 个，请先删除一些"); return; }
			custom.push({ id: `custom-${Zotero.Utilities.randomString(6)}`, label, prompt: prompt.trim() });
		}
		this.writeCustom(custom);
		this.render(window, host);
	}
};
