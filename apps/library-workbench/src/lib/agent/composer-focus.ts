/**
 * Focus the Agent composer input (⇧⌘A / palette). React `autoFocus` only fires
 * on mount, and the rail composer stays mounted while hidden, so callers that
 * just expanded the rail need an imperative focus. The composer may appear a few
 * frames later (rail expand + lazy panel), hence the bounded retry.
 */

export const AGENT_COMPOSER_INPUT_ATTR = "data-agent-composer-input";

const FOCUS_TIMEOUT_MS = 800;

function visibleComposerInput(): HTMLTextAreaElement | null {
	const nodes = document.querySelectorAll<HTMLTextAreaElement>(
		`[${AGENT_COMPOSER_INPUT_ATTR}]`,
	);
	for (const node of nodes) {
		if (node.offsetParent !== null) return node;
	}
	return null;
}

export function focusAgentComposer(): void {
	if (typeof document === "undefined") return;
	const deadline = Date.now() + FOCUS_TIMEOUT_MS;
	const attempt = () => {
		const input = visibleComposerInput();
		if (input) {
			input.focus();
			input.setSelectionRange(input.value.length, input.value.length);
			return;
		}
		if (Date.now() < deadline) requestAnimationFrame(attempt);
	};
	requestAnimationFrame(attempt);
}
