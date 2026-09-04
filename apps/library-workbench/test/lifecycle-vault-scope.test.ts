import { beforeEach, describe, expect, it, vi } from "vitest";
import { emitScoped } from "@/lib/lifecycle/bus";
import { registerLifecycleHandlers } from "@/lib/lifecycle/register";

const mocks = vi.hoisted(() => ({
	invokeApi: vi.fn(async () => undefined),
	clearLibraryVaultState: vi.fn(),
	clearWikiVaultState: vi.fn(),
	clearAgentVaultState: vi.fn(),
	clearAnnotationsVaultState: vi.fn(),
	clearLayoutVaultState: vi.fn(),
	clearUiVaultState: vi.fn(),
	refreshTree: vi.fn(async () => undefined),
	refreshLibrary: vi.fn(async () => undefined),
	seedVaultSkills: vi.fn(),
	scheduleTreeRefresh: vi.fn(),
	getVaultPath: vi.fn(() => "/vault-a"),
}));

vi.mock("@/lib/core/ipc", () => ({ invokeApi: mocks.invokeApi }));
vi.mock("@/lib/core/tauri", () => ({ isTauri: () => true }));
vi.mock("@/lib/core/logger", () => ({
	logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/agent/agent-session-store", () => ({
	clearAgentVaultState: mocks.clearAgentVaultState,
}));
vi.mock("@/lib/paper/library-store", () => ({
	clearLibraryVaultState: mocks.clearLibraryVaultState,
	refreshLibrary: mocks.refreshLibrary,
	scheduleLibraryRefresh: vi.fn(),
}));
vi.mock("@/lib/pdf/annotations-store", () => ({
	clearAnnotationsVaultState: mocks.clearAnnotationsVaultState,
}));
vi.mock("@/lib/pdf/layout/store", () => ({
	clearLayoutVaultState: mocks.clearLayoutVaultState,
}));
vi.mock("@/lib/shell/feature-window", () => ({
	isFeatureViewType: (v: unknown) => v === "agent",
}));
vi.mock("@/lib/shell/ui-store", () => ({
	clearUiVaultState: mocks.clearUiVaultState,
	setFeaturePoppedOut: vi.fn(),
	setSettingsOpenState: vi.fn(),
}));
vi.mock("@/lib/vault/actions", () => ({
	seedVaultSkills: mocks.seedVaultSkills,
}));
vi.mock("@/lib/vault/path", () => ({
	joinVaultPath: (a: string, b: string) => `${a}/${b}`,
}));
vi.mock("@/lib/vault/remote/remote-vault", () => ({
	isRemoteVaultHandle: (p: string) => p.startsWith("remote:"),
}));
vi.mock("@/lib/vault/store", () => ({
	getVaultPath: mocks.getVaultPath,
	refreshTree: mocks.refreshTree,
	scheduleTreeRefresh: mocks.scheduleTreeRefresh,
}));
vi.mock("@/lib/wiki/store", () => ({
	clearWikiVaultState: mocks.clearWikiVaultState,
	rebuildWikiAndNotify: vi.fn(async () => undefined),
}));

async function drain(): Promise<void> {
	for (let i = 0; i < 6; i += 1) await new Promise((r) => setTimeout(r, 0));
}

const clears = [
	mocks.clearLibraryVaultState,
	mocks.clearWikiVaultState,
	mocks.clearAgentVaultState,
	mocks.clearAnnotationsVaultState,
	mocks.clearLayoutVaultState,
	mocks.clearUiVaultState,
];

describe("vault:opened scope", () => {
	let unregister: () => void;

	beforeEach(async () => {
		unregister?.();
		await drain();
		vi.clearAllMocks();
		unregister = registerLifecycleHandlers();
	});

	it("sets up the vault without clearing anything yet", async () => {
		const release = emitScoped("vault:opened", {
			vaultId: "/vault-a",
			timestamp: 1,
		});
		await drain();

		expect(mocks.refreshTree).toHaveBeenCalledWith("/vault-a");
		expect(mocks.seedVaultSkills).toHaveBeenCalledWith("/vault-a");
		for (const clear of clears) expect(clear).not.toHaveBeenCalled();

		release();
		await drain();
	});

	it("clears every vault-scoped store and releases the Host catalog", async () => {
		const release = emitScoped("vault:opened", {
			vaultId: "/vault-a",
			timestamp: 1,
		});
		await drain();
		release();
		await drain();

		for (const clear of clears) expect(clear).toHaveBeenCalledTimes(1);
		expect(mocks.invokeApi).toHaveBeenCalledWith(
			"vault_release",
			{ path: "/vault-a" },
			expect.anything(),
		);
	});

	it("skips the Host release for remote vaults, which have no local catalog", async () => {
		const release = emitScoped("vault:opened", {
			vaultId: "remote:abc",
			timestamp: 1,
		});
		await drain();
		release();
		await drain();

		for (const clear of clears) expect(clear).toHaveBeenCalledTimes(1);
		expect(mocks.invokeApi).not.toHaveBeenCalledWith(
			"vault_release",
			expect.anything(),
			expect.anything(),
		);
	});

	it("releases the previous vault before setting up the next one", async () => {
		const order: string[] = [];
		mocks.clearLibraryVaultState.mockImplementation(() => {
			order.push("release");
		});
		mocks.refreshTree.mockImplementation(async (vault: string) => {
			order.push(`setup:${vault}`);
		});

		const release = emitScoped("vault:opened", {
			vaultId: "/vault-a",
			timestamp: 1,
		});
		await drain();
		// A vault switch releases the old scope and opens the new one in one tick.
		release();
		const release2 = emitScoped("vault:opened", {
			vaultId: "/vault-b",
			timestamp: 2,
		});
		await drain();

		expect(order).toEqual(["setup:/vault-a", "release", "setup:/vault-b"]);
		release2();
		await drain();
	});
});
