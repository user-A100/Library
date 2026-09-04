export type SettingsSection =
	| "general"
	| "appearance"
	| "agent"
	| "translate"
	| "layout"
	| "doctor"
	| "keyboard"
	| "remote-access"
	| "sync"
	| "about";

/** Which machine the Agent catalog / probe targets. */
export type SettingsHostContext =
	| { kind: "local" }
	| {
			kind: "remote";
			label: string;
			sessionId: string;
			host: string;
			remotePath: string;
	  };
