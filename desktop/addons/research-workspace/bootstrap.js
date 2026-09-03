var ResearchWorkspace;

function log(message) {
	Zotero.debug(`Research Workspace: ${message}`);
}

function install() {
	log("Installed");
}

async function startup({ id, version, rootURI }) {
	log(`Starting ${version}`);
	Services.prefs.setStringPref("extensions.zotero.researchWorkspace.startedVersion", version);
	Services.prefs.setBoolPref("extensions.zotero.researchWorkspace.active", true);
	Services.prefs.setBoolPref("extensions.zotero.researchWorkspace.ready", false);
	for (let script of ["ai-artifacts.js", "ai-conversation.js", "ai-chat.js", "ai-provider.js", "ai-context.js", "ai-commands.js", "ai-view.js", "research-workspace.js"]) {
		Services.scriptloader.loadSubScript(rootURI + script);
	}
	ResearchWorkspace.init({ id, version, rootURI });
	try {
		ResearchWorkspace.addToAllWindows();
		await ResearchWorkspace.registerNativeSurfaces();
	}
	catch (error) {
		Zotero.logError(error);
		try {
			await IOUtils.writeUTF8(PathUtils.join(Zotero.DataDirectory.dir, "library-ai-startup-error.log"), `${error?.name || "Error"}: ${error?.message || String(error)}\n${error?.stack || ""}`);
		}
		catch (_) {}
		throw error;
	}
	Services.prefs.setBoolPref("extensions.zotero.researchWorkspace.ready", true);
	Services.prefs.setStringPref("extensions.zotero.researchWorkspace.lastReadyVersion", version);
}

function onMainWindowLoad({ window }) {
	ResearchWorkspace?.addToWindow(window);
}

function onMainWindowUnload({ window }) {
	ResearchWorkspace?.removeFromWindow(window);
}

function shutdown() {
	log("Shutting down");
	Services.prefs.setBoolPref("extensions.zotero.researchWorkspace.active", false);
	Services.prefs.setBoolPref("extensions.zotero.researchWorkspace.ready", false);
	ResearchWorkspace?.unregisterNativeSurfaces();
	ResearchWorkspace?.removeFromAllWindows();
	ResearchWorkspace = undefined;
}

function uninstall() {
	log("Uninstalled");
}
