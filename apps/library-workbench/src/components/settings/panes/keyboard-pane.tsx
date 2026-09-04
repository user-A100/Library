import { useTranslation } from "react-i18next";
import {
	PageTitle,
	SettingsGroup,
} from "@/components/settings/settings-layout";
import {
	formatShortcut,
	type ShortcutDef,
	type ShortcutGroup,
	shortcutsByGroup,
} from "@/lib/shell/shortcuts";
import { revealInOsLabelKey } from "@/lib/vault/reveal";

const GROUP_KEY: Record<ShortcutGroup, "app" | "navigation" | "vault"> = {
	App: "app",
	Navigation: "navigation",
	Vault: "vault",
};

export function KeyboardPane() {
	const { t } = useTranslation(["settings", "shortcuts"]);
	const groups = shortcutsByGroup();

	return (
		<>
			<PageTitle title={t("keyboard.title")} />
			{groups.map(({ group, items }) => (
				<div key={group} className="mb-5">
					<p className="mb-1.5 px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
						{t(`shortcuts:groups.${GROUP_KEY[group]}`)}
					</p>
					<SettingsGroup>
						{items.map((item) => (
							<ShortcutRow key={item.id} def={item} />
						))}
					</SettingsGroup>
				</div>
			))}
		</>
	);
}

export function ShortcutRow({ def }: { def: ShortcutDef }) {
	const { t } = useTranslation(["shortcuts", "sidebar"]);
	// "Show in Finder" is macOS wording; use the platform-specific file-manager name.
	const label =
		def.id === "revealInFinder"
			? t(`sidebar:${revealInOsLabelKey()}`)
			: t(`labels.${def.id}`);
	return (
		<div className="flex items-center justify-between gap-4 border-b px-3.5 py-2.5 last:border-b-0">
			<span className="text-[13px]">{label}</span>
			<kbd className="rounded-md border bg-muted/60 px-1.5 py-0.5 font-medium font-sans text-[12px] text-foreground tracking-wide">
				{formatShortcut(def)}
			</kbd>
		</div>
	);
}
