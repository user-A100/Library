import { beforeEach, describe, expect, it, vi } from "vitest";
import { listenSafe } from "@/lib/core/tauri-events";

const mocks = vi.hoisted(() => ({
	tauri: true,
	subscriptions: [] as Array<{
		event: string;
		cb: (e: { payload: unknown }) => void;
		resolve: (off: () => void) => void;
	}>,
}));

vi.mock("@/lib/core/tauri", () => ({ isTauri: () => mocks.tauri }));

vi.mock("@tauri-apps/api/event", () => ({
	listen: (event: string, cb: (e: { payload: unknown }) => void) =>
		new Promise((resolve) => {
			mocks.subscriptions.push({ event, cb, resolve });
		}),
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("listenSafe", () => {
	beforeEach(() => {
		mocks.tauri = true;
		mocks.subscriptions.length = 0;
	});

	it("unlistens even when disposed before listen resolves", async () => {
		const off = vi.fn();

		const dispose = listenSafe("vault:file-changed", () => undefined);
		await flush(); // dynamic import lands, listen is pending
		dispose(); // the leaky pattern would no-op here

		mocks.subscriptions[0]?.resolve(off);
		await flush();

		expect(off).toHaveBeenCalledTimes(1);
	});

	it("delivers the unwrapped payload to the handler", async () => {
		const handler = vi.fn();

		listenSafe<{ kind: string }>("window:closed", handler);
		await flush();
		mocks.subscriptions[0]?.cb({ payload: { kind: "settings" } });

		expect(handler).toHaveBeenCalledWith({ kind: "settings" });
	});

	it("is idempotent on repeated dispose", async () => {
		const off = vi.fn();

		const dispose = listenSafe("job:changed", () => undefined);
		await flush();
		mocks.subscriptions[0]?.resolve(off);
		await flush();

		dispose();
		dispose();
		await flush();

		expect(off).toHaveBeenCalledTimes(1);
	});

	it("does not subscribe outside Tauri", async () => {
		mocks.tauri = false;

		const dispose = listenSafe("job:changed", () => undefined);
		await flush();
		dispose();

		expect(mocks.subscriptions).toHaveLength(0);
	});
});
