LibraryAIConversationRepository = class LibraryAIConversationRepository {
	constructor() {
		this.directory = PathUtils.join(Zotero.DataDirectory.dir, "library-ai");
		this.path = PathUtils.join(this.directory, "conversations.json");
		this.state = { version: 1, activeID: null, openIDs: [], conversations: [] };
		this.saveTail = Promise.resolve();
	}

	async init() {
		await IOUtils.makeDirectory(this.directory, { ignoreExisting: true });
		try {
			let parsed = await IOUtils.readJSON(this.path);
			if (parsed?.version === 1 && Array.isArray(parsed.conversations)) this.state = parsed;
		}
		catch (error) {
			if (!String(error).includes("NotFound")) Zotero.logError(error);
		}
		this.state.openIDs = [...new Set(this.state.openIDs || [])].slice(0, 6)
			.filter(id => this.state.conversations.some(conversation => conversation.id === id));
		// 上次运行中断时，流式消息会停留在 streaming 状态并永远显示转圈光标，
		// 启动时统一标记为已中断，允许用户重试。
		for (let conversation of this.state.conversations) {
			if (!Array.isArray(conversation.messages)) conversation.messages = [];
			if (!Array.isArray(conversation.sources)) conversation.sources = [];
			if (!Array.isArray(conversation.references)) conversation.references = [];
			for (let message of conversation.messages) {
				if (message.state === "streaming") {
					message.state = "error";
					message.error = message.content || message.reasoning ? "回答中断，可点击重试" : "上次生成未完成（应用已退出），可点击重试";
				}
			}
		}
		if (!this.state.openIDs.length) this.create();
		if (!this.state.openIDs.includes(this.state.activeID)) this.state.activeID = this.state.openIDs[0];
		return this.state;
	}

	create(source = null) {
		let now = new Date().toISOString();
		let conversation = {
			id: Zotero.Utilities.randomString(12), title: "新对话", createdAt: now, updatedAt: now,
			providerID: "openai-compatible", model: "", messages: [], sources: source ? [source] : [], references: [],
		};
		this.state.conversations.unshift(conversation);
		this.state.openIDs = [...this.state.openIDs, conversation.id].slice(-6);
		this.state.activeID = conversation.id;
		this.save();
		return conversation;
	}

	get active() { return this.get(this.state.activeID); }
	get(id) { return this.state.conversations.find(conversation => conversation.id === id) || null; }
	list() { return [...this.state.conversations].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))); }
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
	update(conversation) {
		conversation.updatedAt = new Date().toISOString();
		if (conversation.title === "新对话") {
			let first = conversation.messages.find(message => message.role === "user");
			if (first) conversation.title = first.content.replace(/\s+/g, " ").slice(0, 24) || "新对话";
		}
		this.save();
	}
	async save() {
		let snapshot = JSON.stringify(this.state, null, 2);
		this.saveTail = this.saveTail.then(async () => {
			let temp = this.path + ".tmp";
			await IOUtils.writeUTF8(temp, snapshot);
			await IOUtils.move(temp, this.path, { noOverwrite: false });
		}).catch(error => Zotero.logError(error));
		return this.saveTail;
	}
};
