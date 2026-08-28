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
		return { itemID: target.id, itemKey: target.key, attachmentID: attachment?.id || null, attachmentKey: attachment?.key || null, title: target.getDisplayTitle?.() || "未命名文献", level: "full", insight: null };
	}
	async collectSummary(source) {
		// 三级上下文之「仅摘要」：只提供元数据卡片，不送正文片段（Open Notebook 的 summary 级别）
		let item = await Zotero.Items.getAsync(source.itemID);
		if (!item) return [];
		return [{
			id: `${source.itemID}:meta`, sourceItemID: source.itemID, sourceItemKey: item.key, attachmentID: source.attachmentID || null, attachmentKey: source.attachmentKey || null, page: null, parserVersion: "zotero-metadata/v1",
			text: `标题：${item.getDisplayTitle()}\n作者：${item.getCreators().map(c => [c.firstName, c.lastName].filter(Boolean).join(" ")).join("；")}\n年份：${item.getField("date") || "未知"}\n摘要：${item.getField("abstractNote") || "未提供"}`,
		}];
	}
	async collect(source, question, options = {}) {
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
				let locator = this.pdfPosition(position);
				if (text) records.push({
					id: `${source.itemID}:annotation:${annotation.id}`, sourceItemID: source.itemID, attachmentID: attachment.id,
					annotationKey: annotation.key, position: locator, page: Number.isInteger(position.pageIndex) ? position.pageIndex + 1 : null,
					anchorText: this.citationAnchor(text), text: `批注：${text}`,
				});
			}
			try {
				let minerPath = PathUtils.join(PathUtils.parent(await attachment.getFilePathAsync()), "mineru.json");
				if (await IOUtils.exists(minerPath)) {
					let miner = await IOUtils.readJSON(minerPath);
					for (let [index, block] of (miner.blocks || miner.pages || []).entries()) {
						let text = typeof block === "string" ? block : (block.text || block.content || "");
						if (text) records.push({ id: `${source.itemID}:mineru:${index}`, sourceItemID: source.itemID, attachmentID: attachment.id, page: block.page || block.page_no || null, anchorText: this.citationAnchor(text), text });
					}
				}
				else {
					let cache = Zotero.Fulltext.getItemCacheFile(attachment);
					if (cache.exists()) {
						let text = await Zotero.File.getContentsAsync(cache);
						for (let [index, chunk] of this.pdfParagraphs(text).entries()) records.push({
							id: `${source.itemID}:fulltext:${index}`, sourceItemID: source.itemID, attachmentID: attachment.id,
							page: chunk.page, anchorText: chunk.anchorText, text: chunk.text,
						});
					}
				}
			}
			catch (error) { Zotero.debug(`Library AI context: ${error}`); }
		}
		records = records.map(record => ({
			...record,
			sourceItemKey: record.sourceItemKey || item.key,
			attachmentKey: record.attachmentKey || attachment?.key || null,
			parserVersion: record.parserVersion || (record.id.includes(":mineru:") ? "mineru/unversioned" : record.id.includes(":fulltext:") ? "zotero-fulltext-cache/v1" : record.id.includes(":annotation:") ? "zotero-annotation/v1" : "zotero-record/v1"),
		}));
		if (this.isOverviewQuestion(question)) {
			let overviewLimit = Math.max(options.limit || 10, 12);
			let metadataCount = records.filter((record) => record.id.includes(":meta")).length;
			return this.diverseRecords(records, Math.max(1, overviewLimit - metadataCount)).slice(0, overviewLimit);
		}
		if (options.provider?.getEmbeddingModel?.()) {
			try { return await this.hybridRank(records, question, options.provider, options.limit || 10); }
			catch (error) { Zotero.debug(`Library AI semantic retrieval fallback: ${error}`); }
		}
		return this.rank(records, question).slice(0, options.limit || 10);
	}
	async hybridRank(records, question, provider, limit = 10) {
		// 真正的双路检索：关键词路线与语义路线分别独立排序，再用 RRF 融合。
		// 不把关键词 topK 当语义候选，否则无法召回“措辞不同但语义相关”的片段。
		let lexical = this.rank(records, question).slice(0, 24);
		if (!records.length) return [];
		let vectors = await provider.embed([question, ...records.map(record => record.text.slice(0, 4000))]);
		let queryVector = vectors[0];
		let semantic = records.map((record, index) => ({ record, similarity: this.cosine(queryVector, vectors[index + 1]) }))
			.sort((left, right) => right.similarity - left.similarity).slice(0, 24);
		let fused = new Map(), k = 60;
		let addRank = (record, rank, route, rawScore) => {
			let entry = fused.get(record.id) || { record, score: 0, routes: {}, rawScores: {} };
			entry.score += 1 / (k + rank + 1); entry.routes[route] = rank + 1; entry.rawScores[route] = rawScore; fused.set(record.id, entry);
		};
		lexical.forEach((record, rank) => addRank(record, rank, "lexical", 1 - rank / Math.max(1, lexical.length)));
		semantic.forEach((entry, rank) => addRank(entry.record, rank, "semantic", entry.similarity));
		return [...fused.values()].sort((left, right) => right.score - left.score).slice(0, limit)
			.map(entry => ({ ...entry.record, score: entry.score, retrieval: "rrf-hybrid", retrievalRoutes: entry.routes, retrievalScores: entry.rawScores }));
	}
	cosine(left, right) {
		let dot = 0, leftNorm = 0, rightNorm = 0;
		for (let index = 0; index < Math.min(left?.length || 0, right?.length || 0); index++) { dot += left[index] * right[index]; leftNorm += left[index] ** 2; rightNorm += right[index] ** 2; }
		return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : 0;
	}
	async collectInsightMaterial(source, limit = 8) {
		// 洞察生成使用稳定的材料抽样，而不是按某次用户问题排名
		let records = await this.collect(source, "摘要 研究问题 方法 结果 结论 局限");
		return records.slice(0, limit);
	}
	chunk(text, size = 1800, overlap = 240) {
		let clean = String(text || "").replace(/\s+/g, " ").trim(), chunks = [];
		for (let start = 0; start < clean.length; start += size - overlap) chunks.push(clean.slice(start, start + size));
		return chunks;
	}
	pdfPosition(value) {
		if (!value || !Number.isInteger(value.pageIndex) || value.pageIndex < 0) return null;
		let rects = Array.isArray(value.rects)
			? value.rects.filter(rect => Array.isArray(rect) && rect.length >= 4 && rect.slice(0, 4).every(Number.isFinite)).map(rect => rect.slice(0, 4))
			: [];
		return rects.length ? { pageIndex: value.pageIndex, rects } : null;
	}
	citationAnchor(text, maxLength = 120) {
		let clean = String(text || "").replace(/^批注：\s*/, "").replace(/\s+/g, " ").trim();
		if (!clean) return "";
		let candidates = clean.split(/(?<=[。！？.!?])\s+/).map(value => value.trim()).filter(Boolean);
		let anchor = candidates.find(value => value.length >= 32) || candidates[0] || clean;
		if (anchor.length <= maxLength) return anchor;
		let sample = anchor.slice(0, maxLength), boundary = Math.max(sample.lastIndexOf(" "), sample.lastIndexOf("，"), sample.lastIndexOf(","));
		return sample.slice(0, boundary >= Math.floor(maxLength * .6) ? boundary : maxLength).trim();
	}
	pdfParagraphs(text, maxLength = 1800) {
		let chunks = [];
		for (let [pageIndex, pageText] of String(text || "").split("\f").entries()) {
			let paragraphs = pageText.split(/\n+/).map(value => value.replace(/\s+/g, " ").trim()).filter(Boolean);
			let pending = "";
			for (let paragraph of paragraphs) {
				if (paragraph.length < 80) { pending = [pending, paragraph].filter(Boolean).join("\n"); continue; }
				paragraph = [pending, paragraph].filter(Boolean).join("\n"); pending = "";
				for (let part of this.chunk(paragraph, maxLength, 160)) chunks.push({ page: pageIndex + 1, text: part, anchorText: this.citationAnchor(part) });
			}
			if (pending) chunks.push({ page: pageIndex + 1, text: pending, anchorText: this.citationAnchor(pending) });
		}
		return chunks;
	}
	normalizeMatchText(text) {
		return String(text || "").toLowerCase().replace(/([\p{Script=Han}])\1+/gu, "$1").replace(/\s+/g, " ").trim();
	}
	tokens(text) {
		let normalized = this.normalizeMatchText(text), result = [];
		result.push(...(normalized.match(/[a-z][a-z0-9-]{2,}/g) || []));
		for (let sequence of normalized.match(/[\p{Script=Han}]{2,}/gu) || []) {
			for (let index = 0; index < sequence.length - 1; index++) result.push(sequence.slice(index, index + 2));
		}
		return [...new Set(result)];
	}
	isOverviewQuestion(question) {
		let value = this.normalizeMatchText(question);
		return /(?:解释|总结|概括|介绍|梳理)/.test(value) && /(?:论文|文献|文章|全文|这篇)/.test(value);
	}
	diverseRecords(records, sampleCount = 9) {
		let metadata = records.filter(record => record.id.includes(":meta"));
		let body = records.filter(record => !record.id.includes(":meta"));
		if (body.length <= sampleCount) return [...metadata, ...body];
		let selectedIndexes = new Set();
		for (let index = 0; index < sampleCount; index++) selectedIndexes.add(Math.round(index * (body.length - 1) / Math.max(1, sampleCount - 1)));
		let selected = body.filter((_record, index) => selectedIndexes.has(index));
		let remaining = body.filter((_record, index) => !selectedIndexes.has(index));
		return [...metadata, ...selected, ...remaining];
	}
	sectionNumber(text) {
		let match = this.normalizeMatchText(text).match(/第\s*([一二三四五六七八九十\d]+)\s*节/);
		if (!match) return null;
		let map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
		return /^\d+$/.test(match[1]) ? Number(match[1]) : (map[match[1]] || null);
	}
	bestAnchorForClaim(text, claimText) {
		let candidates = String(text || "").split(/(?<=[。！？!?])\s*|(?<=\.)\s+/).map(value => value.replace(/\s+/g, " ").trim()).filter(Boolean);
		let terms = this.tokens(claimText);
		let score = candidate => {
			let normalized = this.normalizeMatchText(candidate);
			return terms.reduce((total, term) => total + (normalized.includes(term) ? 1 : 0), 0);
		};
		let best = candidates.sort((left, right) => score(right) - score(left) || left.length - right.length)[0] || String(text || "");
		if (/^\d+(?:\.\d+)?\s/.test(best)) {
			let starts = ["大语言模型", "如第", "本节", "除了", "由于", "产生", "最近", "现代", "("]
				.map((marker) => best.indexOf(marker)).filter((index) => index >= 8);
			if (starts.length) best = best.slice(Math.min(...starts));
		}
		return this.citationAnchor(best);
	}
	bestParagraphForClaim(records, claimText) {
		let terms = this.tokens(claimText), section = this.sectionNumber(claimText);
		if (!terms.length && !section) return null;
		let scored = records.map((record, index) => {
			let normalized = this.normalizeMatchText(record.text), overlap = 0;
			for (let term of terms) {
				let count = normalized.split(term).length - 1;
				overlap += Math.min(3, count);
			}
			let heading = section && new RegExp(`^${section}(?:\\.|\\s)`).test(normalized);
			// 小节标题是最稳定的语义锚点。例如“偏见”应落到 5.1，而不是第 5 节前言中
			// 恰好也出现了“偏见”二字的概述句。
			let subsection = /^\d+\.\d+\s/.test(normalized);
			let headingOverlap = subsection
				? terms.filter((term) => normalized.slice(0, 48).includes(term)).length
				: 0;
			let topicHeading = subsection && headingOverlap > 0;
			return {
				record, index, heading, topicHeading,
				score: overlap / Math.max(1, terms.length) + (heading ? 3 : 0) + Math.min(2, headingOverlap * 1.5),
			};
		}).sort((left, right) => right.score - left.score || Number(right.heading) - Number(left.heading) || left.index - right.index);
		let best = scored[0];
		if (!best || (!best.heading && !best.topicHeading && best.score < .18)) return null;
		return { ...best.record, anchorText: this.bestAnchorForClaim(best.record.text, claimText), locatorConfidence: best.heading || best.topicHeading ? "section" : "lexical", locatorScore: best.score };
	}
	async resolveCitation(citation, claimText) {
		if (!citation?.attachmentID || !String(claimText || "").trim()) return citation;
		try {
			let attachment = await Zotero.Items.getAsync(citation.attachmentID), cache = Zotero.Fulltext.getItemCacheFile(attachment);
			if (!cache.exists()) return citation;
			let records = this.pdfParagraphs(await Zotero.File.getContentsAsync(cache));
			let resolved = this.bestParagraphForClaim(records, claimText);
			return resolved ? { ...citation, page: resolved.page, anchorText: resolved.anchorText, resolvedText: resolved.text, locatorConfidence: resolved.locatorConfidence, locatorScore: resolved.locatorScore } : citation;
		}
		catch (error) { Zotero.debug(`Library AI citation resolver: ${error}`); return citation; }
	}
	rank(records, question) {
		let terms = this.tokens(question);
		if (!terms.length) return this.diverseRecords(records);
		return records.map((record, index) => ({ record, index, score: terms.reduce((score, term) => score + (this.normalizeMatchText(record.text).includes(term) ? 1 : 0), 0) + (index === 0 ? .5 : 0) }))
			.sort((a, b) => b.score - a.score || a.index - b.index).map(entry => entry.record);
	}
};
