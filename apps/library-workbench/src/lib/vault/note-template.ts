/**
 * Vault NOTES.md starter template (`.agentero/templates/NOTES.md`).
 * Used by the `custom` paperNoteMode; seeded on demand from Settings → General.
 */

import { invokeApi } from "@/lib/core/ipc";

export type NotesTemplateSeedResult = {
	/** `false` when `.agentero/templates/NOTES.md` already exists. */
	created: boolean;
};

/** Seed the starter template in `vaultPath`; existing files are left untouched. */
export async function notesTemplateSeed(
	vaultPath: string,
): Promise<NotesTemplateSeedResult> {
	return invokeApi<NotesTemplateSeedResult>("notes_template_seed", {
		vaultPath,
	});
}
