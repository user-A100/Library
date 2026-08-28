// Library Crawl — popup
const list = document.getElementById("list");
const msg = document.getElementById("msg");
const statusBox = document.getElementById("status");
const statusText = document.getElementById("status-text");

async function refreshStatus() {
	let result = await chrome.runtime.sendMessage({ type: "library-crawl:ping" }).catch(() => null);
	if (result?.ok) {
		statusBox.classList.add("ok");
		statusText.textContent = `已连接 Library（${result.server.replace(/^https?:\/\//, "")}）`;
	} else {
		statusBox.classList.remove("ok");
		statusText.textContent = "未连接 Library，请先打开桌面应用";
	}
}

async function scan() {
	list.textContent = "";
	msg.textContent = "";
	let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	if (!tab?.id) return;
	let page = await chrome.tabs.sendMessage(tab.id, { type: "library-crawl:scan" }).catch(() => null);
	if (!page) {
		list.innerHTML = `<li class="empty">此页面不支持抓取（浏览器内部页）</li>`;
		return;
	}
	let items = [];
	if (page.isPdfPage) items.push({ url: page.url, title: page.title || page.url });
	for (let pdf of page.pdfs || []) items.push(pdf);
	if (!items.length) {
		list.innerHTML = `<li class="empty">本页未发现 PDF 链接</li>`;
		return;
	}
	for (let item of items.slice(0, 30)) {
		let li = document.createElement("li");
		let label = document.createElement("span");
		label.className = "t";
		label.textContent = item.title;
		label.title = item.url;
		let button = document.createElement("button");
		button.type = "button";
		button.textContent = "抓取";
		button.addEventListener("click", async () => {
			button.disabled = true;
			button.textContent = "…";
			let result = await chrome.runtime.sendMessage({ type: "library-crawl:crawl", url: item.url, title: item.title });
			if (result?.ok) {
				button.textContent = "✓";
				msg.textContent = `已抓取：${result.title}`;
			} else {
				button.textContent = "重试";
				button.disabled = false;
				msg.textContent = result?.error || "抓取失败";
			}
		});
		li.append(label, button);
		list.append(li);
	}
}

document.getElementById("rescan").addEventListener("click", scan);
refreshStatus();
scan();
