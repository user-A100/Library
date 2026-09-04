import { afterEach, describe, expect, it, vi } from "vitest";
import { backgroundTasksStore } from "@/lib/core/background-tasks";
import {
	type JobChangedSnapshot,
	projectJobToBackgroundTask,
} from "@/lib/core/job-center";

const globalWithWindow = globalThis as typeof globalThis & {
	window?: { setTimeout: typeof setTimeout };
};
globalWithWindow.window = { setTimeout };

vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn(async () => () => undefined),
}));

vi.mock("@/lib/core/ipc", () => ({
	invokeApi: vi.fn(async () => undefined),
}));

vi.mock("@/lib/core/tauri", () => ({
	isTauri: () => false,
}));

function layoutJob(
	overrides: Partial<JobChangedSnapshot> = {},
): JobChangedSnapshot {
	return {
		id: "job-layout-1",
		kind: "layoutAnalyze",
		state: "running",
		vaultPath: "/vault",
		paperPath: "papers/a",
		progress: 40,
		phase: "analyzing",
		...overrides,
	};
}

describe("job task projection", () => {
	afterEach(() => {
		backgroundTasksStore.setState({ tasks: [], expanded: false });
	});

	it("mirrors a running layout job into the background-task panel", () => {
		projectJobToBackgroundTask(layoutJob());
		const task = backgroundTasksStore
			.getState()
			.tasks.find((item) => item.id === "job-layout-1");
		expect(task?.kind).toBe("layout");
		expect(task?.status).toBe("running");
		expect(task?.progress).toBe(40);
	});

	it("does not resurrect a cancelled layout job from a late running event", () => {
		projectJobToBackgroundTask(layoutJob({ state: "running" }));
		projectJobToBackgroundTask(layoutJob({ state: "cancelled" }));
		projectJobToBackgroundTask(
			layoutJob({ state: "running", progress: 80, phase: "analyzing" }),
		);

		const task = backgroundTasksStore
			.getState()
			.tasks.find((item) => item.id === "job-layout-1");
		expect(task?.status).toBe("cancelled");
	});

	it("does not resurrect a completed layout job from a late running event", () => {
		projectJobToBackgroundTask(layoutJob({ state: "running" }));
		projectJobToBackgroundTask(
			layoutJob({ state: "succeeded", progress: 100 }),
		);
		projectJobToBackgroundTask(
			layoutJob({ state: "running", progress: 55, phase: "analyzing" }),
		);

		const task = backgroundTasksStore
			.getState()
			.tasks.find((item) => item.id === "job-layout-1");
		expect(task?.status).toBe("completed");
	});
});
