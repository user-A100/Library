import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("Library UI entry regressions", () => {
  it("uses one clean translation control without the nested 译 badge", async () => {
    const source = await readFile("desktop/addons/research-workspace/research-workspace.js", "utf8");

    expect(source).toContain("library-full-translate-icon");
    expect(source).toContain("ensureReaderToolbarStyles(doc)");
    expect(source).not.toContain('mark.textContent = "译"');
		expect(source).not.toContain("library-full-translate-label");
		expect(source).toContain('button.setAttribute("aria-label", text)');
  });

  it("keeps the floating AI launcher as a hidden fallback when the native rail exists", async () => {
    const view = await readFile("desktop/addons/research-workspace/ai-view.js", "utf8");
    const style = await readFile("desktop/addons/research-workspace/style.css", "utf8");

    expect(view).toContain("launcher.hidden = true");
    expect(view).toContain("state.launcher.hidden = railExists || attempt < 40");
    expect(style).toContain(".library-ai-floating-launcher[hidden]");
  });

  it("invalidates the desktop addon cache when a same-version development XPI changes", async () => {
    const runner = await readFile("scripts/run-desktop.ps1", "utf8");

    expect(runner).toContain("$addonChanged = Copy-AddonIfChanged");
    expect(runner).toContain("$installedVersion -ne $addonVersion -or $addonChanged");
  });

	it("keeps an explicit source removal control outside the compact action row", async () => {
		const view = await readFile("desktop/addons/research-workspace/ai-view.js", "utf8");

		expect(view).toContain('remove.textContent = "移除"');
		expect(view).toContain('controls.className = "library-ai-source-controls"');
		expect(view).toContain("chip.append(icon, title, remove)");
	});

	it("does not replay message entrance animation on every streaming token", async () => {
		const view = await readFile("desktop/addons/research-workspace/ai-view.js", "utf8");
		const style = await readFile("desktop/addons/research-workspace/style.css", "utf8");

		expect(view).toContain("scheduleRenderAll(delay = 40)");
		expect(view).toContain('node.className += " is-new"');
		expect(style).toContain(".library-ai-message.is-new");
		expect(style).not.toContain(".library-ai-message { display:grid; gap:5px; margin:0 0 16px; animation:");
	});
});
