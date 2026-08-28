// Library Crawl — content script
// 职责：1) 当前页就是 PDF 时，右下角显示「抓取到 Library」角标
//       2) 普通页面扫描 PDF 链接，供 popup 列出
//       3) 显示抓取结果 toast

(() => {
	if (window.__libraryCrawlLoaded) return;
	window.__libraryCrawlLoaded = true;

	const isPdfPage = document.contentType === "application/pdf"
		|| /\.pdf([?#].*)?$/i.test(location.pathname + location.search);

	function findPdfLinks() {
		let seen = new Set();
		let results = [];
		for (let anchor of document.querySelectorAll("a[href]")) {
			let url;
			try { url = new URL(anchor.getAttribute("href"), location.href).href; }
			catch { continue; }
			if (!/\.pdf([?#].*)?$/i.test(new URL(url).pathname + new URL(url).search)) continue;
			if (seen.has(url)) continue;
			seen.add(url);
			let title = (anchor.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120)
				|| decodeURIComponent(new URL(url).pathname.split("/").pop() || "文档.pdf");
			results.push({ url, title });
		}
		return results;
	}

	function toast(ok, text) {
		let host = document.createElement("div");
		host.style.cssText = "position:fixed;z-index:2147483647;right:18px;bottom:18px;";
		let shadow = host.attachShadow({ mode: "open" });
		let box = document.createElement("div");
		box.textContent = text;
		box.style.cssText = `
			padding:10px 14px; border-radius:9px; font:12px/1.5 "Segoe UI Variable Text","Microsoft YaHei UI",sans-serif;
			background:${ok ? "#1b7f5c" : "#b43a32"}; color:#fff; box-shadow:0 8px 24px rgba(0,0,0,.18);
			transition:opacity .3s ease;`;
		shadow.append(box);
		document.documentElement.append(host);
		setTimeout(() => { box.style.opacity = "0"; setTimeout(() => host.remove(), 350); }, 2600);
	}

	function showBadge() {
		let host = document.createElement("div");
		host.style.cssText = "position:fixed;z-index:2147483647;right:18px;bottom:18px;";
		let shadow = host.attachShadow({ mode: "open" });
		let button = document.createElement("button");
		button.type = "button";
		button.textContent = "📄 抓取到 Library";
		button.style.cssText = `
			padding:9px 14px; border:0; border-radius:9px; cursor:pointer;
			background:#1b7f5c; color:#fff; font:600 12px/1.4 "Segoe UI Variable Text","Microsoft YaHei UI",sans-serif;
			box-shadow:0 8px 24px rgba(24,47,38,.28);`;
		button.addEventListener("click", async () => {
			button.disabled = true;
			button.textContent = "抓取中…";
			let result = await chrome.runtime.sendMessage({
				type: "library-crawl:crawl",
				url: location.href,
				title: document.title || guessName(location.href),
			}).catch(error => ({ ok: false, error: String(error) }));
			button.textContent = result.ok ? "✓ 已抓取" : "✕ 失败";
			toast(result.ok, result.ok ? `已抓取：${result.title}` : (result.error || "抓取失败"));
			setTimeout(() => { button.disabled = false; button.textContent = "📄 抓取到 Library"; }, 3000);
		});
		shadow.append(button);
		document.documentElement.append(host);
	}

	function guessName(url) {
		try { return decodeURIComponent(new URL(url).pathname.split("/").pop() || "文档.pdf"); }
		catch { return "文档.pdf"; }
	}

	chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
		if (message?.type === "library-crawl:scan") {
			sendResponse({ isPdfPage, url: location.href, title: document.title, pdfs: findPdfLinks() });
			return;
		}
		if (message?.type === "library-crawl:toast") {
			toast(Boolean(message.ok), message.text || "");
			return;
		}
	});

	if (isPdfPage) showBadge();
})();
