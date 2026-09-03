// 会话仓库 v2：消息树（nodes map + activeChild 链），支持重试/编辑产生的兄弟分支
// 与 < n/m > 变体导航。为兼容旧 UI，conversation.messages 始终同步为当前活动路径数组。
LibraryAIConversationRepository = class LibraryAIConversationRepository {
	constructor() {
		this.directory = PathUtils.join(Zotero.DataDirectory.dir, "library-ai");
		this.path = PathUtils.join(this.directory, "conversations.json");
		this.state = { version: 2, activeID: null, openIDs: [], conversations: [] };
		this.saveTail = Promise.resolve();
	}

	async init() {
		await IOUtils.makeDirectory(this.directory, { ignoreExisting: true });
		try {
			let parsed = await IOUtils.readJSON(this.path);
			if (parsed?.version === 1 && Array.isArray(parsed.conversations)) {
				this.state = this.migrateV1(parsed);
				await this.save();
			}
			else if (parsed?.version === 2 && Array.isArray(parsed.conversations)) {
				this.state = parsed;
			}
		}
		catch (error) {
			if (!String(error).includes("NotFound")) Zotero.logError(error);
		}
		this.state.openIDs = [...new Set(this.state.openIDs || [])].slice(0, 6)
			.filter(id => this.state.conversations.some(conversation => conversation.id === id));
		for (let conversation of this.state.conversations) this.normalize(conversation);
		if (!this.state.openIDs.length) this.create();
		if (!this.state.openIDs.includes(this.state.activeID)) this.state.activeID = this.state.openIDs[0];
		return this.state;
	}

	// v1 扁平 messages[] → v2 链式树：前一条是后一条的 parent，全链为活动路径。
	migrateV1(parsed) {
		let conversations = [];
		for (let old of parsed.conversations || []) {
			let conversation = {
				id: old.id, title: old.title || "新对话",
				createdAt: old.createdAt, updatedAt: old.updatedAt,
				providerID: old.providerID || "openai-compatible", model: old.model || "",
				sources: Array.isArray(old.sources) ? old.sources : [],
				dismissedSourceIDs: Array.isArray(old.dismissedSourceIDs) ? old.dismissedSourceIDs : [],
				references: Array.isArray(old.references) ? old.references : [],
				askMode: Boolean(old.askMode), pinned: false,
				nodes: {}, rootId: null, activeLeafId: null,
			};
			let previous = null;
			for (let message of Array.isArray(old.messages) ? old.messages : []) {
				let node = { ...message, parentId: previous?.id || null, children: [] };
				conversation.nodes[node.id] = node;
				if (previous) previous.children.push(node.id);
				else conversation.rootId = node.id;
				previous = node;
			}
			conversation.activeLeafId = previous?.id || null;
			conversations.push(conversation);
		}
		return { version: 2, activeID: parsed.activeID || null, openIDs: parsed.openIDs || [], conversations };
	}

	// 结构兜底 + 上次运行中断的流式节点标记为可重试错误 + messages 兼容数组重算
	normalize(conversation) {
		if (!Array.isArray(conversation.sources)) conversation.sources = [];
		if (!Array.isArray(conversation.dismissedSourceIDs)) conversation.dismissedSourceIDs = [];
		if (!Array.isArray(conversation.references)) conversation.references = [];
		if (!conversation.nodes || typeof conversation.nodes !== "object") conversation.nodes = {};
		conversation.pinned = Boolean(conversation.pinned);
		conversation.askMode = Boolean(conversation.askMode);
		for (let source of conversation.sources) {
			source.level ??= "full";
			source.insight ??= null;
		}
		// 祖先环防护：沿着 activeChild 链走，遇到环或断链即截断
		let path = this.activePath(conversation);
		conversation.rootId = path[0]?.id || null;
		conversation.activeLeafId = path.at(-1)?.id || null;
		for (let node of Object.values(conversation.nodes)) {
			if (!Array.isArray(node.children)) node.children = [];
			node.children = [...new Set(node.children)].filter(id => conversation.nodes[id]);
			if (node.state === "streaming") {
				node.state = "error";
				node.error = node.content || node.reasoning ? "回答中断，可点击重试" : "上次生成未完成（应用已退出），可点击重试";
			}
		}
		this.syncMessages(conversation);
	}

	// 沿 activeChild 链取活动路径；链上任何节点缺失即停止
	activePath(conversation) {
		let path = [];
		if (!conversation.nodes) return path;
		// 起点：根（无 parent 的节点）；rootId 不可靠时回退搜索
		let root = conversation.rootId && conversation.nodes[conversation.rootId]
			? conversation.nodes[conversation.rootId]
			: Object.values(conversation.nodes).find(node => !node.parentId) || null;
		if (!root) return path;
		let seen = new Set();
		let current = root;
		while (current && !seen.has(current.id)) {
			seen.add(current.id);
			path.push(current);
			let next = current.activeChild ? conversation.nodes[current.activeChild] : null;
			if (next && next.parentId !== current.id) next = current.children.map(id => conversation.nodes[id]).find(child => child.id === current.activeChild) || null;
			current = next;
		}
		return path;
	}

	// 兼容层：旧 UI 与渲染器统一读 conversation.messages（活动路径数组）
	syncMessages(conversation) {
		conversation.messages = this.activePath(conversation);
		return conversation.messages;
	}

	appendNode(conversation, node) {
		node.parentId = conversation.activeLeafId || null;
		node.children = node.children || [];
		conversation.nodes[node.id] = node;
		if (node.parentId) {
			let parent = conversation.nodes[node.parentId];
			parent.children.push(node.id);
			parent.activeChild = node.id;
		}
		else conversation.rootId = node.id;
		conversation.activeLeafId = node.id;
		this.syncMessages(conversation);
		this.update(conversation);
		return node;
	}

	// 重试/编辑：新建同 parent 的兄弟节点并设为活动分支。base 可空（全新重试）。
	createSibling(conversation, nodeId, base = null) {
		let original = conversation.nodes[nodeId];
		if (!original) return null;
		let node = {
			id: Zotero.Utilities.randomString(8), role: original.role,
			parentId: original.parentId, children: [],
			content: base?.content ?? "", createdAt: new Date().toISOString(),
			...(base?.extra || {}),
		};
		conversation.nodes[node.id] = node;
		let parent = original.parentId ? conversation.nodes[original.parentId] : null;
		if (parent) {
			let index = parent.children.indexOf(nodeId);
			parent.children.splice(index + 1, 0, node.id);
			parent.activeChild = node.id;
		}
		else {
			conversation.rootId = node.id;
			conversation.activeLeafId = node.id;
		}
		// 新分支成为叶子；活动链从 parent 起改走新节点
		conversation.activeLeafId = node.id;
		this.syncMessages(conversation);
		this.update(conversation);
		return node;
	}

	// 变体切换：把 node 的 parent 的 activeChild 移到相邻兄弟；返回是否切换成功
	switchVariant(conversation, nodeId, dir) {
		let node = conversation.nodes[nodeId];
		if (!node?.parentId) return false;
		let parent = conversation.nodes[node.parentId];
		let siblings = parent.children.filter(id => conversation.nodes[id]);
		let index = siblings.indexOf(nodeId);
		let next = siblings[index + dir];
		if (!next) return false;
		parent.activeChild = next;
		// 活动链走新节点后，叶子为其最深活动后代
		let leaf = conversation.nodes[next];
		while (leaf?.activeChild && conversation.nodes[leaf.activeChild]) leaf = conversation.nodes[leaf.activeChild];
		conversation.activeLeafId = leaf?.id || next;
		this.syncMessages(conversation);
		this.update(conversation);
		return true;
	}

	// < n/m > 导航信息：node 在兄弟中的位置
	variantInfo(conversation, nodeId) {
		let node = conversation.nodes[nodeId];
		if (!node?.parentId) return { index: 1, count: 1 };
		let siblings = (conversation.nodes[node.parentId]?.children || []).filter(id => conversation.nodes[id]);
		return { index: Math.max(1, siblings.indexOf(nodeId) + 1), count: siblings.length };
	}

	// 分支到新会话：把 nodeId 之前（含自身）的活动路径深拷贝为一条新链
	cloneActivePathPrefixTo(conversation, nodeId) {
		let path = this.activePath(conversation);
		let cut = path.findIndex(node => node.id === nodeId);
		if (cut < 0) return null;
		let now = new Date().toISOString();
		let clone = {
			id: Zotero.Utilities.randomString(12), title: "新对话", createdAt: now, updatedAt: now,
			providerID: conversation.providerID, model: conversation.model,
			sources: structuredClone(conversation.sources), dismissedSourceIDs: [...conversation.dismissedSourceIDs],
			references: structuredClone(conversation.references), askMode: conversation.askMode, pinned: false,
			nodes: {}, rootId: null, activeLeafId: null, messages: [],
		};
		let previous = null;
		for (let node of path.slice(0, cut + 1)) {
			let copy = { ...structuredClone({ ...node, children: [], activeChild: null }), parentId: previous?.id || null };
			clone.nodes[copy.id] = copy;
			if (previous) { previous.children.push(copy.id); previous.activeChild = copy.id; }
			else clone.rootId = copy.id;
			previous = copy;
		}
		clone.activeLeafId = previous?.id || null;
		clone.title = conversation.title === "新对话" ? "新对话" : `${conversation.title} · 分支`;
		this.state.conversations.unshift(clone);
		this.state.openIDs = [...this.state.openIDs, clone.id].slice(-6);
		this.state.activeID = clone.id;
		this.syncMessages(clone);
		this.save();
		return clone;
	}

	togglePin(conversation) {
		conversation.pinned = !conversation.pinned;
		this.save();
		return conversation.pinned;
	}

	create(source = null) {
		let now = new Date().toISOString();
		let conversation = {
			id: Zotero.Utilities.randomString(12), title: "新对话", createdAt: now, updatedAt: now,
			providerID: "openai-compatible", model: "",
			sources: source ? [source] : [], dismissedSourceIDs: [], references: [],
			askMode: false, pinned: false, nodes: {}, rootId: null, activeLeafId: null, messages: [],
		};
		this.state.conversations.unshift(conversation);
		this.state.openIDs = [...this.state.openIDs, conversation.id].slice(-6);
		this.state.activeID = conversation.id;
		this.save();
		return conversation;
	}

	get active() { return this.get(this.state.activeID); }
	get(id) { return this.state.conversations.find(conversation => conversation.id === id) || null; }
	list() {
		return [...this.state.conversations].sort((a, b) =>
			(b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
	}
	activate(id) {
		if (!this.get(id)) return null;
		if (!this.state.openIDs.includes(id)) this.state.openIDs = [...this.state.openIDs, id].slice(-6);
		this.state.activeID = id;
		this.save();
		return this.get(id);
	}
	close(id) {
		this.state.openIDs = this.state.openIDs.filter(candidate => candidate !== id);
		if (!this.state.openIDs.length) return this.create();
		if (this.state.activeID === id) this.state.activeID = this.state.openIDs.at(-1);
		this.save();
		return this.active;
	}
	update(conversation, { save = true } = {}) {
		conversation.updatedAt = new Date().toISOString();
		if (conversation.title === "新对话") {
			let first = (conversation.messages || []).find(message => message.role === "user");
			if (first) conversation.title = first.content.replace(/\s+/g, " ").slice(0, 24) || "新对话";
		}
		if (save) this.save();
	}
	async save({ throwOnError = false } = {}) {
		let snapshot = JSON.stringify(this.state, null, 2);
		let operation = this.saveTail.then(async () => {
			let temp = this.path + ".tmp";
			await IOUtils.writeUTF8(temp, snapshot);
			await IOUtils.move(temp, this.path, { noOverwrite: false });
		});
		this.saveTail = operation.catch(error => Zotero.logError(error));
		return throwOnError ? operation : this.saveTail;
	}
};
