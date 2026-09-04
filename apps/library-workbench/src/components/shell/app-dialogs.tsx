/**
 * App-level dialogs: Zotero migration, rename, external-rename repair, move
 * papers, and the command palette. Each subscribes to its own store slice.
 */

import { CommandPalette } from "@/components/dialogs/command-palette";
import { ExternalRenameDialog } from "@/components/dialogs/external-rename-dialog";
import { PaperSearchDialog } from "@/components/dialogs/paper-search-dialog";
import { SkillImportDialog } from "@/components/dialogs/skill-import-dialog";
import { ZoteroMigrateDialog } from "@/components/dialogs/zotero-migrate-dialog";
import { ZoteroSyncDialog } from "@/components/dialogs/zotero-sync-dialog";
import { CitingScanDialog } from "@/components/library/citing-scan-dialog";
import { EditPaperMetaDialog } from "@/components/library/edit-paper-meta-dialog";
import { paletteCommands } from "@/components/shell/palette-commands";
import {
	useLibraryStore,
	useUiStore,
	useVaultStore,
} from "@/hooks/use-app-stores";
import {
	cancelCitingImport,
	cancelPaperSearchImport,
	cancelSkillImport,
	confirmCitingImport,
	confirmPaperSearchImport,
	confirmSkillImport,
} from "@/lib/paper/import-actions";
import { paperMetaChange } from "@/lib/paper/library-actions";
import { setEditMetaDraft } from "@/lib/paper/library-store";
import {
	setCommandOpen,
	setZoteroOpen,
	setZoteroSyncOpen,
} from "@/lib/shell/ui-store";
import { joinVaultPath } from "@/lib/vault";
import { refreshAll } from "@/lib/vault/actions";
import { openPaper, openVaultRel } from "@/lib/workspace/actions";

export function AppDialogs() {
	const vaultPath = useVaultStore((s) => s.vaultPath);
	const zoteroOpen = useUiStore((s) => s.zoteroOpen);
	const zoteroSyncOpen = useUiStore((s) => s.zoteroSyncOpen);
	const commandOpen = useUiStore((s) => s.commandOpen);
	const commandMode = useUiStore((s) => s.commandMode);
	const libraryPapers = useLibraryStore((s) => s.papers);
	const editMetaDraft = useLibraryStore((s) => s.editMetaDraft);
	const citingScanDraft = useLibraryStore((s) => s.citingScanDraft);
	const skillImportDraft = useUiStore((s) => s.skillImportDraft);
	const paperSearchDraft = useUiStore((s) => s.paperSearchDraft);

	return (
		<>
			<ZoteroMigrateDialog
				open={zoteroOpen}
				onOpenChange={setZoteroOpen}
				vaultPath={vaultPath}
				onDone={refreshAll}
			/>
			<ZoteroSyncDialog
				open={zoteroSyncOpen}
				onOpenChange={setZoteroSyncOpen}
				vaultPath={vaultPath}
				onDone={refreshAll}
			/>
			<SkillImportDialog
				discoveries={skillImportDraft}
				onCancel={cancelSkillImport}
				onConfirm={confirmSkillImport}
			/>
			<PaperSearchDialog
				groups={paperSearchDraft}
				onCancel={cancelPaperSearchImport}
				onConfirm={confirmPaperSearchImport}
			/>
			<CitingScanDialog
				result={citingScanDraft}
				onCancel={cancelCitingImport}
				onConfirm={confirmCitingImport}
			/>

			<ExternalRenameDialog />

			<EditPaperMetaDialog
				paper={editMetaDraft}
				onOpenChange={(open) => {
					if (!open) setEditMetaDraft(null);
				}}
				onConfirm={async (paper, patch) => {
					const updated = await paperMetaChange(paper, patch);
					if (updated) setEditMetaDraft(null);
				}}
			/>

			<CommandPalette
				open={commandOpen}
				onOpenChange={setCommandOpen}
				mode={commandMode}
				vaultPath={vaultPath}
				papers={libraryPapers}
				commands={paletteCommands}
				onOpenPaper={(rel) => {
					if (vaultPath) openPaper(joinVaultPath(vaultPath, rel));
				}}
				onOpenVaultRel={openVaultRel}
			/>
		</>
	);
}
