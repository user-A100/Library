// 斜杠命令注册中心（Claudian 移植版）
// 交互与模型复刻自 Claudian（yishentu/claudian）：
// - `matchTrigger` 对应 SlashCommandSource.match：/ 必须位于词首（行首或空白后），query 不含空白
// - 内置动作命令对应 builtInCommands.ts（clear/help 等 app 侧动作）
// - 用户命令对应 SlashCommandStorage + parseSlashCommandContent：
//   数据目录 library-ai/commands/*.md，YAML frontmatter（description / argument-hint），正文为提示词模板，$ARGUMENTS 在发送时展开
LibraryAISlashCommands = class LibraryAISlashCommands {
	constructor() {
		this.directory = PathUtils.join(Zotero.DataDirectory.dir, "library-ai", "commands");
		this.userCommands = [];
		this.lastLoad = 0;
		this.reloadInterval = 5000;
		this.builtIns = [
			{ id: "builtin:clear", name: "clear", aliases: ["new"], kind: "action", description: "开始新会话", source: "builtin" },
			{ id: "builtin:help", name: "help", aliases: ["commands"], kind: "action", description: "查看全部斜杠命令", source: "builtin" },
			{
				id: "builtin:summary", name: "summary", kind: "prompt", source: "builtin",
				description: "结构化总结当前来源论文",
				content: "请对当前来源论文做结构化总结：1）研究问题与动机；2）方法框架；3）核心结果与关键数据；4）局限与开放问题。每个要点都给出可核验的引用标记。",
			},
			{
				id: "builtin:explain", name: "explain", kind: "prompt", source: "builtin",
				description: "结合论文上下文解释概念", argumentHint: "[概念/术语]",
				content: "请结合当前论文解释以下概念或术语：$ARGUMENTS\n要求：给出它在本文中的定义、作用、与相邻概念的区别，并附出处引用标记。",
			},
			{
				id: "builtin:translate", name: "translate", kind: "prompt", source: "builtin",
				description: "翻译参考片段或指定文本", argumentHint: "[目标语言，默认英文]",
				content: "请将当前参考片段翻译成$ARGUMENTS；若未指定目标语言则翻译为英文。保持学术术语一致，逐段给出原文与译文对照。若没有参考片段，请提示我先划词或复制文本。",
			},
			{
				id: "builtin:compare", name: "compare", kind: "prompt", source: "builtin",
				description: "对比当前多个来源论文",
				content: "请对比当前所有来源论文：研究问题、方法、实验数据与结论的异同。用表格呈现，并在每个单元格的结论后附引用标记；若当前只有一个来源，请说明并改为总结该来源。",
			},
			{
				id: "builtin:review", name: "review", kind: "prompt", source: "builtin",
				description: "同行评审视角批判性评审",
				content: "请以同行评审视角评审当前论文：主要优点、方法与论证缺陷、可复现性风险、修改建议。按严重度排序，每条附引用标记。",
			},
			{
				id: "builtin:questions", name: "questions", kind: "prompt", source: "builtin",
				description: "列出可继续追问的研究问题",
				content: "基于当前论文列出 5 个值得继续追问的研究问题，说明每个问题的价值，并附相关段落的引用标记。",
			},
		];
		this.nameMap = new Map();
		this.rebuildIndex();
	}

	async init() {
		await IOUtils.makeDirectory(this.directory, { ignoreExisting: true });
		await this.refresh(true);
	}

	// 每次唤起下拉框时按需重载（5 秒节流），用户改完 .md 文件立即生效
	async refresh(force = false) {
		let now = Date.now();
		if (!force && now - this.lastLoad < this.reloadInterval) return;
		this.lastLoad = now;
		this.userCommands = await this.loadUserCommands();
		this.rebuildIndex();
	}

	async loadUserCommands() {
		let commands = [];
		let children;
		try {
			children = await IOUtils.getChildren(this.directory);
		}
		catch (error) {
			if (!String(error).includes("NotFound")) Zotero.logError(error);
			return commands;
		}
		for (let path of children) {
			if (!/\.md$/i.test(path)) continue;
			let name = PathUtils.filename(path).replace(/\.md$/i, "");
			if (!/^[a-z0-9][a-z0-9-_]{0,31}$/i.test(name)) continue;
			try {
				let content = await IOUtils.readUTF8(path);
				commands.push(this.parseUserCommand(name, content));
			}
			catch (error) {
				Zotero.debug(`Library AI slash command ${name}: ${error}`);
			}
		}
		return commands;
	}

	// 复刻 Claudian parseSlashCommandContent 的最小 frontmatter 子集：
	// --- 包裹的 key: value 行（description / argument-hint），其余正文为提示词模板
	parseUserCommand(name, content) {
		let description = "", argumentHint = "", body = content;
		let frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
		if (frontmatter) {
			body = frontmatter[2];
			for (let line of frontmatter[1].split(/\r?\n/)) {
				let pair = line.match(/^([A-Za-z-]+):\s*(.*)$/);
				if (!pair) continue;
				let value = pair[2].trim().replace(/^"(.*)"$/, "$1");
				if (pair[1] === "description") description = value;
				else if (pair[1] === "argument-hint") argumentHint = value;
			}
		}
		return {
			id: `user:${name}`, name, kind: "prompt", source: "user",
			description: description || "自定义命令",
			argumentHint, content: body.trim(),
		};
	}

	rebuildIndex() {
		this.nameMap.clear();
		for (let command of [...this.builtIns, ...this.userCommands]) {
			let key = command.name.toLowerCase();
			if (!this.nameMap.has(key)) this.nameMap.set(key, command);
			for (let alias of command.aliases || []) {
				let aliasKey = alias.toLowerCase();
				if (!this.nameMap.has(aliasKey)) this.nameMap.set(aliasKey, command);
			}
		}
	}

	// Claudian SlashCommandSource.match：从光标向前扫描，触发符 / 必须在词首，query 不含空白
	matchTrigger(input, cursor) {
		let before = input.slice(0, cursor);
		for (let index = cursor - 1; index >= 0; index--) {
			let char = before[index];
			if (/\s/.test(char)) break;
			if (char !== "/") continue;
			if (index > 0 && !/\s/.test(before[index - 1])) return null;
			let query = before.slice(index + 1);
			if (/\s/.test(query)) return null;
			return { start: index, end: cursor, query, trigger: "/" };
		}
		return null;
	}

	// Claudian load()：label/detail 子串过滤（大小写不敏感）+ localeCompare 排序
	list(query = "") {
		let normalized = query.toLocaleLowerCase();
		return [...this.builtIns, ...this.userCommands]
			.filter(command => command.name.toLocaleLowerCase().includes(normalized)
				|| (command.description || "").toLocaleLowerCase().includes(normalized))
			.sort((left, right) => left.name.localeCompare(right.name));
	}

	// Claudian detectBuiltInCommand：仅匹配消息开头的 /name args；未知命令返回 unknown 供上层提示
	detect(text) {
		let trimmed = text.trim();
		if (!trimmed.startsWith("/")) return null;
		let match = trimmed.match(/^\/([a-zA-Z0-9_-]+)(?:\s([\s\S]*))?$/);
		if (!match) return null;
		let command = this.nameMap.get(match[1].toLowerCase());
		if (!command) return { unknown: match[1] };
		return { command, args: (match[2] || "").trim() };
	}

	// Claude Code 语义：$ARGUMENTS 在发送时展开为命令后跟随的参数
	expand(command, args) {
		return command.content.replaceAll("$ARGUMENTS", args);
	}
};
