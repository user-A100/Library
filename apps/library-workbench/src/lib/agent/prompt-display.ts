/**
 * Host wraps Composer turns with a system envelope (`build_prompt`) before
 * sending to ACP/Codex. Codex also injects separate `<environment_context>`
 * user turns. Transcripts store those bodies; the chat UI must show only the
 * human request (empty string ⇒ skip the line).
 */

const USER_REQUEST_MARKER = "User request:\n";

const ENVELOPE_PREFIXES = [
	"You are an assistant working inside a Agentero research Vault",
	"You are an assistant working inside a Motif research Vault",
	"You are running the Agentero paper-reader workflow",
	"You are helping with a research vault",
	"You are answering questions about a local research vault",
	"Draft a Related Work section from local papers",
	// PDF visual-annotation / pin-chat system wrappers (hide in transcript UI).
	"You are reviewing",
	"You are helping the user discuss a visual region from a research paper PDF",
	"You are helping the user read a research paper PDF in Agentero",
] as const;

/** True when title/body looks like a visual-annotation system prompt (history filter). */
export function isVisualAnnotationPromptText(text: string): boolean {
	const t = text.trim();
	if (!t) return false;
	const lower = t.toLowerCase();
	return (
		(lower.startsWith("you are reviewing") &&
			lower.includes("visual annotation")) ||
		lower.startsWith(
			"you are helping the user discuss a visual region from a research paper pdf",
		) ||
		(lower.includes("## annotation 1") && lower.includes("user comment:"))
	);
}

const SKILL_TAIL_MARKERS = [
	"\n\n## Skill:",
	"\n\n# Skill:",
	"\n\n### Skill:",
	"\n\n<skill",
	"\n\nActive skills use the $ trigger",
	"\n\nActive skills use the / trigger",
	"\n\nAgentero injects skill instructions",
] as const;

function stripEnvironmentContextBlocks(text: string): string {
	let out = text;
	while (true) {
		const lower = out.toLowerCase();
		const start = lower.indexOf("<environment_context");
		if (start < 0) break;
		const closeRel = lower.indexOf("</environment_context>", start);
		const end =
			closeRel >= 0 ? closeRel + "</environment_context>".length : out.length;
		out = out.slice(0, start) + out.slice(end);
	}
	return out;
}

function looksLikeMachineOnlyUserTurn(text: string): boolean {
	const t = text.trim();
	if (!t) return true;
	const lower = t.toLowerCase();
	if (
		lower.startsWith("<environment_context") &&
		lower.includes("</environment_context>")
	) {
		if (!stripEnvironmentContextBlocks(t).trim()) return true;
	}
	if (
		lower.startsWith("<permissions instructions>") ||
		lower.startsWith("<skills_instructions>") ||
		lower.startsWith("<multi_agent_mode>")
	) {
		return true;
	}
	return false;
}

function cutSkillTail(text: string): string {
	let out = text;
	for (const marker of SKILL_TAIL_MARKERS) {
		const i = out.indexOf(marker);
		if (i >= 0) out = out.slice(0, i);
	}
	return out.trim();
}

/**
 * Pull the human question out of visual-annotation / PDF-ask wrapper prompts.
 * Prefer explicit markers; fall back to last non-instruction paragraph.
 */
function stripVisualAnnotationEnvelope(raw: string): string | null {
	if (
		!isVisualAnnotationPromptText(raw) &&
		!raw.startsWith("You are helping the user")
	) {
		// Still handle "User comment:" / "User question:" when prefixes match loosely.
		if (
			!raw.includes("User comment:") &&
			!raw.includes("User question:") &&
			!raw.includes("## Annotation")
		) {
			return null;
		}
	}
	const markers = ["User question:\n", "User comment: ", "User comment:\n"];
	for (const marker of markers) {
		const idx = raw.lastIndexOf(marker);
		if (idx >= 0) {
			const rest = raw.slice(idx + marker.length).trim();
			// Stop at next section heading if present.
			const cut = rest.split(/\n\n(?=[A-Z#])/)[0]?.trim() ?? rest;
			const line = cut
				.split(/\r?\n/)
				.map((l) => l.trim())
				.find(Boolean);
			if (line && line !== "(no text)" && line !== "(no comment)") {
				return cutSkillTail(line);
			}
		}
	}
	// "Annotation N — page X\nUser comment: …" style (comment on same block).
	const commentLine = raw.match(/User comment:\s*(.+)/i);
	if (commentLine?.[1]?.trim()) {
		const c = commentLine[1].trim();
		if (c !== "(no comment)") return cutSkillTail(c);
	}
	return null;
}

/** Recover the human-visible user text from a stored Agentero / Codex turn. */
export function stripPromptEnvelopeForDisplay(text: string): string {
	const raw = stripEnvironmentContextBlocks(text.trim()).trim();
	if (!raw || looksLikeMachineOnlyUserTurn(raw)) return "";

	const visual = stripVisualAnnotationEnvelope(raw);
	if (visual !== null) return visual;

	const markerIdx = raw.lastIndexOf(USER_REQUEST_MARKER);
	if (markerIdx >= 0) {
		return cutSkillTail(raw.slice(markerIdx + USER_REQUEST_MARKER.length));
	}

	if (ENVELOPE_PREFIXES.some((p) => raw.startsWith(p))) {
		const parts = raw.split(/\n\n+/);
		const last = parts[parts.length - 1]?.trim() ?? "";
		if (last && last !== raw && !looksLikeMachineOnlyUserTurn(last)) {
			return cutSkillTail(last);
		}
		return "";
	}

	if (looksLikeMachineOnlyUserTurn(raw)) return "";
	return raw;
}

/** One-line history label from a (possibly enveloped) title or first user turn. */
export function displayHistoryTitle(raw: string, fallback = ""): string {
	const cleaned = stripPromptEnvelopeForDisplay(raw);
	const first =
		cleaned
			.split(/\r?\n/)
			.map((l) => l.trim())
			.find(Boolean) ?? "";
	if (!first) return fallback || "";
	return first.length > 120 ? `${first.slice(0, 117)}…` : first;
}
