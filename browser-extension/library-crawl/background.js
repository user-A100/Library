// Library Crawl — background service worker (MV3)
// 协议来自对 Library（Zotero 内核）Connector Server 的逆向：
//   GET  /connector/ping                        探活
//   POST /connector/saveStandaloneAttachment    导入 PDF 流（X-Metadata: sessionID/url/title）
// 服务端收到 PDF 后会自动执行元数据识别（RecognizeDocument）。

const DEFAULT_SERVER = "http://127.0.0.1:23119";

async function getServer() {
	let { libraryServer } = await chrome.storage.local.get("libraryServer");
	return (libraryServer || DEFAULT_SERVER).replace(/\/+$/, "");
}

async function ping(server) {
	try {
		let response = await fetch(`${server}/connector/ping`, { method: "GET" });
		return response.ok;
	} catch {
		return false;
	}
}

function newSessionID() {
	return `lc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// 抓取单个 PDF：先在浏览器侧下载（带站点 Cookie），再把字节流推给 Library
async function crawlPDF({ url, title }) {
	let server = await getServer();
	if (!await ping(server)) {
		return { ok: false, error: `无法连接 Library（${server}）。请确认应用已打开。` };
	}
	let pdfResponse;
	try {
		pdfResponse = await fetch(url, { credentials: "include" });
	} catch (error) {
		return { ok: false, error: `下载失败：${error.message}` };
	}
	if (!pdfResponse.ok) {
		return { ok: false, error: `下载失败：HTTP ${pdfResponse.status}` };
	}
	let buffer = await pdfResponse.arrayBuffer();
	if (!buffer.byteLength) return { ok: false, error: "下载内容为空" };
	let head = new Uint8Array(buffer.slice(0, 5));
	if (String.fromCharCode(...head) !== "%PDF-") {
		return { ok: false, error: "目标不是有效的 PDF 文件" };
	}

	let metadata = {
		sessionID: newSessionID(),
		url,
		title: title || guessFileName(url),
	};
	let saveResponse = await fetch(`${server}/connector/saveStandaloneAttachment`, {
		method: "POST",
		headers: {
			"Content-Type": "application/pdf",
			"X-Metadata": JSON.stringify(metadata),
		},
		body: buffer,
	});
	if (saveResponse.status === 201) {
		return { ok: true, title: metadata.title, size: buffer.byteLength };
	}
	let text = await saveResponse.text().catch(() => "");
	return { ok: false, error: `Library 拒绝导入：HTTP ${saveResponse.status} ${text.slice(0, 120)}` };
}

function guessFileName(url) {
	try {
		let name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
		return name || "抓取文档.pdf";
	} catch {
		return "抓取文档.pdf";
	}
}

// ---- 消息路由（popup / content script）----
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message?.type === "library-crawl:crawl") {
		crawlPDF(message).then(sendResponse);
		return true; // 异步响应
	}
	if (message?.type === "library-crawl:ping") {
		getServer().then(server => ping(server).then(ok => sendResponse({ ok, server })));
		return true;
	}
});

// ---- 右键菜单 ----
chrome.runtime.onInstalled.addListener(() => {
	chrome.contextMenus.create({
		id: "library-crawl-page",
		title: "抓取本页 PDF 到 Library",
		contexts: ["page"],
		documentUrlPatterns: ["*://*/*.pdf*", "*://*/*.PDF*"],
	});
	chrome.contextMenus.create({
		id: "library-crawl-link",
		title: "抓取此 PDF 链接到 Library",
		contexts: ["link"],
		targetUrlPatterns: ["*://*/*.pdf*", "*://*/*.PDF*"],
	});
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
	let url = info.linkUrl || info.pageUrl;
	if (!url) return;
	let result = await crawlPDF({ url, title: guessFileName(url) });
	// 在页面上给出结果提示（通过 content script 角标）
	if (tab?.id) {
		chrome.tabs.sendMessage(tab.id, {
			type: "library-crawl:toast",
			ok: result.ok,
			text: result.ok ? `已抓取：${result.title}` : result.error,
		}).catch(() => {});
	}
});
