LibraryAIPaperContextService = class LibraryAIPaperContextService {
	async target(item) { return item?.parentItemID ? Zotero.Items.getAsync(item.parentItemID) : item; }
	async attachment(item) {
		if (item?.isAttachment?.() && item.isPDFAttachment?.()) return item;
		let target = await this.target(item);
		for (let id of target?.getAttachments?.() || []) {
			let attachment = await Zotero.Items.getAsync(id);
			if (attachment?.isPDFAttachment?.()) return attachment;
		}
		return null;
	}
	async source(item) {
		let target = await this.target(item);
		if (!target) return null;
		let attachment = await this.attachment(item);
		return { itemID: target.id, attachmentID: attachment?.id || null, title: target.getDisplayTitle?.() || "未命名文献" };
	}
	async collect(source, question) {
		let item = await Zotero.Items.getAsync(source.itemID);
		let attachment = source.attachmentID ? await Zotero.Items.getAsync(source.attachmentID) : await this.attachment(item);
		let records = [{
			id: `${source.itemID}:meta`, sourceItemID: source.itemID, attachmentID: attachment?.id || null, page: null,
			text: `标题：${item.getDisplayTitle()}\n作者：${item.getCreators().map(c => [c.firstName, c.lastName].filter(Boolean).join(" ")).join("；")}\n年份：${item.getField("date") || "未知"}\n摘要：${item.getField("abstractNote") || "未提供"}`,
		}];
		for (let id of item.getNotes?.() || []) {
			let note = await Zotero.Items.getAsync(id);
			let text = String(note?.getNote?.() || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
			if (text) records.push({ id: `${source.itemID}:note:${id}`, sourceItemID: source.itemID, attachmentID: attachment?.id || null, page: null, text: `笔记：${text}` });
		}
		if (attachment) {
			// Zotero 9 的 getAnnotations() 默认直接返回 Zotero.Item 对象数组，
			// 不是 itemID（asIDs=true 才返回 ID），不能再拿去 getAsync()
			let annotations = [];
			try { annotations = attachment.isFileAttachment?.() ? (attachment.getAnnotations?.() || []) : []; }
			catch (error) { Zotero.debug(`Library AI annotations: ${error}`); }
			for (let annotation of annotations) {
				if (!annotation?.annotationType) continue;
				let position = {}; try { position = JSON.parse(annotation.annotationPosition || "{}"); } catch (_) {}
				let text = [annotation.annotationText, annotation.annotationComment].filter(Boolean).join("\n");
				if (text) records.push({ id: `${source.itemID}:annotation:${annotation.id}`, sourceItemID: source.itemID, attachmentID: attachment.id, page: Number.isInteger(position.pageIndex) ? position.pageIndex + 1 : null, text: `批注：${text}` });
			}
			try {
				let minerPath = PathUtils.join(PathUtils.parent(await attachment.getFilePathAsync()), "mineru.json");
				if (await IOUtils.exists(minerPath)) {
					let miner = await IOUtils.readJSON(minerPath);
					for (let [index, block] of (miner.blocks || miner.pages || []).entries()) {
						let text = typeof block === "string" ? block : (block.text || block.content || "");
						if (text) records.push({ id: `${source.itemID}:mineru:${index}`, sourceItemID: source.itemID, attachmentID: attachment.id, page: block.page || block.page_no || null, text });
					}
				}
				else {
					let cache = Zotero.Fulltext.getItemCacheFile(attachment);
					if (cache.exists()) {
						let text = await Zotero.File.getContentsAsync(cache);
						for (let [index, chunk] of this.chunk(text).entries()) records.push({ id: `${source.itemID}:fulltext:${index}`, sourceItemID: source.itemID, attachmentID: attachment.id, page: null, text: chunk });
					}
				}
			}
			catch (error) { Zotero.debug(`Library AI context: ${error}`); }
		}
		return this.rank(records, question).slice(0, 10);
	}
	chunk(text, size = 1800, overlap = 240) {
		let clean = String(text || "").replace(/\s+/g, " ").trim(), chunks = [];
		for (let start = 0; start < clean.length; start += size - overlap) chunks.push(clean.slice(start, start + size));
		return chunks;
	}
	tokens(text) { return [...new Set(String(text || "").toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [])]; }
	rank(records, question) {
		let terms = this.tokens(question);
		return records.map((record, index) => ({ record, index, score: terms.reduce((score, term) => score + (record.text.toLowerCase().includes(term) ? 1 : 0), 0) + (index === 0 ? .5 : 0) }))
			.sort((a, b) => b.score - a.score || a.index - b.index).map(entry => entry.record);
	}
};
