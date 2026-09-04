/** Open an http(s) URL in the system browser (window.open fallback). */
export function openExternalUrl(url: string): void {
	void import("@tauri-apps/plugin-opener")
		.then(({ openUrl }) => openUrl(url))
		.catch(() => {
			window.open(url, "_blank", "noopener,noreferrer");
		});
}
