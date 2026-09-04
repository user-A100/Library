/** Absolute-style path under a remote handle: `remote:<id>/papers/...` */
export function joinRemotePath(handle: string, rel: string): string {
	const r = rel.replace(/^\/+/, "").replace(/\\/g, "/");
	if (!r) return handle;
	return `${handle}/${r}`;
}

/** Vault-relative path from a remote absolute-style path. */
export function remoteRelFromJoined(handle: string, joined: string): string {
	if (joined === handle) return "";
	const prefix = `${handle}/`;
	if (joined.startsWith(prefix)) return joined.slice(prefix.length);
	return joined.replace(/\\/g, "/").replace(/^\/+/, "");
}
