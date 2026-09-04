export type MobileReaderMode = "pdf" | "notes";

export type AgentLine = {
	id: string;
	role: "assistant" | "user";
	text: string;
	streaming?: boolean;
};

export type AgentPermissionOption = {
	optionId: string;
	name: string;
	kind: string;
};

export type AgentPermissionRequest = {
	requestId: string;
	sessionId: string;
	title: string;
	paths: string[];
	options: AgentPermissionOption[];
};

export type AgentStreamEvent = {
	sessionId: string;
	chunk: string;
};

export type AgentResultEvent = {
	sessionId: string;
	content: string;
};

export type AgentFailedEvent = {
	sessionId: string;
	error?: string;
};

export type AcpSessionInfo = {
	sessionId: string;
	title?: string;
	updatedAt?: string;
};

export type AcpListSessionsResult = {
	sessions: AcpSessionInfo[];
	supported: boolean;
};

export type AcpHistoryLine = {
	id: string;
	kind: string;
	text: string;
};

export type AcpLoadSessionResult = {
	sessionId: string;
	title?: string;
	lines: AcpHistoryLine[];
};
