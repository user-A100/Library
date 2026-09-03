// 聊天渲染器：消息气泡、单气泡流式补丁（30ms 合并）、变体导航、消息 meta 操作。
// 从 ai-view.js 拆出；宿主（LibraryAIViewHost）提供 repository/provider/workspace/windows。
LibraryAIChatRenderer = class LibraryAIChatRenderer {
	constructor(host) {
		this.host = host;
	}

	// ---- 全量渲染（会话/来源/结构变更时调用）----
	render(window) {
		let state = this.host.windows.get(window); if (!state) return;
		let view = state.view, conversation = this.host.repository.active;
		let box = view.querySelector(".library-ai-messages"); if (!box) return;
		box.textContent = "";
		if (!conversation) return;
		let messages = conversation.messages || [];
		if (!messages.length) box.append(this.emptyState(view.ownerDocument));
		let lastAssistantID = [...messages].reverse().find(message => message.role === "assistant")?.id || null;
		for (let message of messages) {
			let node = this.messageNode(view.ownerDocument, message, {
				conversation,
				isLastAssistant: message.id === lastAssistantID,
			});
			if (!state.seenMessageIDs.has(message.id)) {
				node.classList.add("is-new");
				state.seenMessageIDs.add(message.id);
			}
			box.append(node);
		}
		box.scrollTop = box.scrollHeight;
	}

	emptyState(doc) {
		let html = name => doc.createElementNS("http://www.w3.org/1999/xhtml", name);
		let node = html("section"); node.className = "library-ai-empty";
		node.append(this.host.createRobotIcon(doc));
		let heading = html("h2"); heading.textContent = "和论文一起思考";
		let blurb = html("p"); blurb.textContent = "当前论文会自动成为来源。回答中的引用可直接定位回原文。";
		let suggestions = html("div");
		for (let label of ["概括本文的核心贡献", "解释作者的方法与证据", "列出可继续追问的问题"]) {
			let button = html("button"); button.type = "button"; button.textContent = label;
			button.addEventListener("click", () => {
				let view = node.closest(".library-ai-view"); let composer = view.querySelector(".library-ai-composer textarea");
				composer.value = button.textContent; composer.focus();
			});
			suggestions.append(button);
		}
		node.append(heading, blurb, suggestions);
		return node;
	}

	// ---- 单气泡流式补丁：只重写最后一个流式气泡，30ms 合并一次 ----
	patchStreaming(window, message) {
		let state = this.host.windows.get(window); if (!state) return;
		if (state.chatPatchTimer) return;
		state.chatPatchTimer = window.setTimeout(() => {
			state.chatPatchTimer = null;
			this.patchNow(window, message);
		}, 30);
	}

	patchNow(window, message) {
		let state = this.host.windows.get(window); if (!state) return;
		let view = state.view;
		let box = view.querySelector(".library-ai-messages"); if (!box) return;
		let wrapper = box.querySelector(`.library-ai-message[data-message-id="${message.id}"]`);
		if (!wrapper) { this.render(window); return; }
		// 写入前判断是否贴底，用户上滚即停止跟随
		let follow = box.scrollTop + box.clientHeight >= box.scrollHeight - 40;
		let body = wrapper.querySelector("[data-streaming-content]");
		if (body) {
			wrapper.querySelector(".library-ai-streaming-skeleton")?.remove();
			this.setBodyHTML(body, this.renderMarkdown(message.content, message.citations || {}, message.id));
		}
		let thinkingBody = wrapper.querySelector(".library-ai-thinking-body");
		if (thinkingBody && message.reasoning) thinkingBody.textContent = message.reasoning;
		let progress = wrapper.querySelector(".library-ai-progress");
		if (progress) progress.textContent = message.activity?.label || "";
		if (follow) box.scrollTop = box.scrollHeight;
	}

	// 流结束：骨架/光标随全量重建消失
	finalize(window) {
		let state = this.host.windows.get(window);
		if (state?.chatPatchTimer) { window.clearTimeout(state.chatPatchTimer); state.chatPatchTimer = null; }
		this.render(window);
	}

	// Gecko 下 XUL 文档的节点不能直接写 innerHTML；统一走 DOMParser + importNode
	setBodyHTML(element, markup) {
		let doc = element.ownerDocument;
		let HTMLParser = doc.defaultView?.DOMParser || DOMParser;
		let parsed = new HTMLParser().parseFromString(`<body>${markup}</body>`, "text/html").body;
		element.textContent = "";
		for (let child of [...parsed.childNodes]) element.append(doc.importNode(child, true));
	}

	// ---- 气泡构建 ----
	messageNode(doc, message, { conversation = null, isLastAssistant = false } = {}) {
		let host = this.host;
		let article = doc.createElement("article");
		article.className = `library-ai-message ${message.role}${message.compacted ? " compacted" : ""}${message.state === "streaming" ? " streaming" : ""}`;
		article.dataset.messageId = message.id;
		let role = doc.createElement("div"); role.className = "library-ai-message-role";
		role.textContent = message.role === "user" ? "你" : (message.compacted ? "上下文摘要" : "Library AI");
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
		let bubble = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
		bubble.className = `library-ai-bubble ${message.role}`;
		if (message.role === "assistant") {
			let modelName = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
			modelName.className = "library-ai-model-name";
			modelName.textContent = message.model || host.provider?.config?.model || "";
			bubble.append(modelName);
		}
		let body = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
		body.className = "library-ai-message-body";
		let streamingBody = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
		streamingBody.dataset.streamingContent = "";
		body.append(streamingBody);
		this.setBodyHTML(streamingBody, this.renderMarkdown(content, message.citations || {}, message.id));
		bubble.append(body);
		if (message.state === "streaming" && !content) {
			let skeleton = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
			skeleton.className = `library-ai-streaming-skeleton phase-${message.activity?.phase || "preparing"}`;
			skeleton.setAttribute("role", "status"); skeleton.setAttribute("aria-label", message.activity?.label || "正在准备回答…");
			for (let index = 0; index < 3; index++) skeleton.append(doc.createElementNS("http://www.w3.org/1999/xhtml", "i"));
			bubble.append(skeleton);
		}
		if (message.state === "streaming" && content) {
			let cursor = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
			cursor.className = "library-ai-cursor"; cursor.textContent = "";
			bubble.append(cursor);
		}
		article.append(bubble);
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
		if (message.error) {
			let html = name => doc.createElementNS("http://www.w3.org/1999/xhtml", name);
			let error = html("div"); error.className = "library-ai-error";
			let text = html("span"); text.textContent = message.error;
			error.append(text);
			if (message.state === "error") {
				let retry = html("button"); retry.type = "button"; retry.dataset.retryMessage = message.id; retry.textContent = "重试";
				error.append(retry);
			}
			article.append(error);
		}
		article.append(this.metaNode(doc, message, { conversation, isLastAssistant }));
		return article;
	}

	// 消息 meta 行：变体导航（树分支 >1 时）、复制、存为笔记、编辑（user）、重试（末条 assistant）
	metaNode(doc, message, { conversation = null, isLastAssistant = false } = {}) {
		let html = name => doc.createElementNS("http://www.w3.org/1999/xhtml", name);
		let meta = html("div"); meta.className = "library-ai-message-meta";
		if (conversation) {
			let info = this.host.repository.variantInfo(conversation, message.id);
			if (info.count > 1) {
				let nav = html("span"); nav.className = "library-ai-variant-nav";
				let prev = html("button"); prev.type = "button"; prev.dataset.variantPrev = message.id; prev.title = "上一个变体"; prev.textContent = "‹"; prev.disabled = info.index <= 1;
				let label = html("span"); label.textContent = `${info.index}/${info.count}`;
				let next = html("button"); next.type = "button"; next.dataset.variantNext = message.id; next.title = "下一个变体"; next.textContent = "›"; next.disabled = info.index >= info.count;
				nav.append(prev, label, next);
				meta.append(nav);
			}
		}
		let actions = html("span"); actions.className = "library-ai-message-actions";
		let time = html("small"); time.className = "library-ai-message-time";
		time.textContent = new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
		if (message.content) {
			let copy = html("button"); copy.type = "button"; copy.dataset.copyMessage = message.id; copy.title = "复制原文（Markdown）"; copy.textContent = "复制";
			actions.append(copy);
			if (message.role === "assistant") {
				let note = html("button"); note.type = "button"; note.dataset.noteMessage = message.id; note.title = "把这条回答保存为笔记"; note.textContent = "存为笔记";
				actions.append(note);
			}
		}
		if (message.role === "user") {
			let edit = html("button"); edit.type = "button"; edit.dataset.editMessage = message.id; edit.title = "编辑并重新生成"; edit.textContent = "编辑";
			actions.append(edit);
		}
		else if (isLastAssistant && message.state !== "streaming") {
			let retry = html("button"); retry.type = "button"; retry.dataset.retryMessage = message.id; retry.title = "重新生成"; retry.textContent = "重试";
			actions.append(retry);
		}
		meta.append(actions, time);
		return meta;
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

	renderMarkdown(markdown, citations = {}, messageID = "") {
		let escape = value => this.host.escape(value);
		let text = String(markdown || ""), codeBlocks = [];
		// 流式安全：未闭合的 ``` 代码块先按普通代码行处理，等闭合后再格式化
		text = text.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_, language, code) => { let id = codeBlocks.length; codeBlocks.push(`<pre><code>${escape(code)}</code></pre>`); return `\n@@CODE${id}@@\n`; });
		let unclosed = text.match(/```[^\n]*\n([\s\S]*)$/);
		if (unclosed) { let id = codeBlocks.length; codeBlocks.push(`<pre><code>${escape(unclosed[1])}</code></pre>`); text = text.slice(0, unclosed.index) + `\n@@CODE${id}@@\n`; }
		let messageAttribute = messageID ? ` data-citation-message-id="${escape(messageID)}"` : "";
		let inline = value => {
			let claimAttribute = ` data-citation-claim="${escape(String(value || "").replace(/\[\[[A-Z]\d+-C\d+\]\]/g, "").slice(0, 500))}"`;
			return escape(value)
			.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>")
			.replace(/\[\[([A-Z]\d+-C\d+)\]\]/g, (all, id) => citations[id] ? `<span class="library-ai-citation-wrap"><button type="button" class="library-ai-citation" data-citation-id="${id}"${messageAttribute}${claimAttribute} title="打开原文">${escape(citations[id].title || "来源")}${citations[id].page ? ` · p.${citations[id].page}` : ""}</button><button type="button" class="library-ai-citation-preview-button" data-preview-citation="${id}" title="预览引用原文">⌄</button><span class="library-ai-citation-preview" hidden><strong>${escape(id)}</strong>${escape(citations[id].text || "暂无原文预览")}</span></span>` : all);
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
};
