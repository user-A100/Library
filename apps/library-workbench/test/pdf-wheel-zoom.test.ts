import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	bindWheelZoomGesture,
	createWheelZoomCoalescer,
} from "@/lib/pdf/wheel-zoom";

function frameHarness() {
	let callback: FrameRequestCallback | null = null;
	return {
		requestFrame: vi.fn((next: FrameRequestCallback) => {
			callback = next;
			return 7;
		}),
		cancelFrame: vi.fn(() => {
			callback = null;
		}),
		flush: () => {
			const next = callback;
			callback = null;
			next?.(0);
		},
		hasPending: () => callback !== null,
	};
}

describe("PDF wheel zoom coalescer", () => {
	it("coalesces deltas from multiple wheel events into one frame flush", () => {
		const frames = frameHarness();
		const onZoomIn = vi.fn();
		const onZoomOut = vi.fn();
		const coalescer = createWheelZoomCoalescer({
			onZoomIn,
			onZoomOut,
			requestFrame: frames.requestFrame,
			cancelFrame: frames.cancelFrame,
		});

		coalescer.addDelta(-60);
		coalescer.addDelta(-60);
		coalescer.addDelta(-60);
		expect(frames.requestFrame).toHaveBeenCalledTimes(1);
		expect(onZoomIn).not.toHaveBeenCalled();

		frames.flush();
		// -180 accumulated → one zoom-in step, -80 remainder kept.
		expect(onZoomIn).toHaveBeenCalledTimes(1);
		expect(onZoomOut).not.toHaveBeenCalled();
	});

	it("applies multiple steps in one batch and keeps the remainder", () => {
		const frames = frameHarness();
		const onZoomIn = vi.fn();
		const onZoomOut = vi.fn();
		const coalescer = createWheelZoomCoalescer({
			onZoomIn,
			onZoomOut,
			requestFrame: frames.requestFrame,
			cancelFrame: frames.cancelFrame,
		});

		coalescer.addDelta(350);
		frames.flush();
		expect(onZoomOut).toHaveBeenCalledTimes(3);
		expect(onZoomIn).not.toHaveBeenCalled();

		// Remainder 50 carries into the next gesture window.
		coalescer.addDelta(50);
		frames.flush();
		expect(onZoomOut).toHaveBeenCalledTimes(4);
	});

	it("cancels opposite deltas within the same frame", () => {
		const frames = frameHarness();
		const onZoomIn = vi.fn();
		const onZoomOut = vi.fn();
		const coalescer = createWheelZoomCoalescer({
			onZoomIn,
			onZoomOut,
			requestFrame: frames.requestFrame,
			cancelFrame: frames.cancelFrame,
		});

		coalescer.addDelta(-150);
		coalescer.addDelta(120);
		frames.flush();
		// Net -30 → below threshold, no step.
		expect(onZoomIn).not.toHaveBeenCalled();
		expect(onZoomOut).not.toHaveBeenCalled();
	});

	it("reset drops pending accumulation before the frame fires", () => {
		const frames = frameHarness();
		const onZoomIn = vi.fn();
		const onZoomOut = vi.fn();
		const coalescer = createWheelZoomCoalescer({
			onZoomIn,
			onZoomOut,
			requestFrame: frames.requestFrame,
			cancelFrame: frames.cancelFrame,
		});

		coalescer.addDelta(-250);
		coalescer.reset();
		frames.flush();
		expect(onZoomIn).not.toHaveBeenCalled();
		expect(onZoomOut).not.toHaveBeenCalled();
	});

	it("dispose cancels the pending frame and ignores later deltas", () => {
		const frames = frameHarness();
		const onZoomIn = vi.fn();
		const onZoomOut = vi.fn();
		const coalescer = createWheelZoomCoalescer({
			onZoomIn,
			onZoomOut,
			requestFrame: frames.requestFrame,
			cancelFrame: frames.cancelFrame,
		});

		coalescer.addDelta(-250);
		expect(frames.hasPending()).toBe(true);
		coalescer.dispose();
		expect(frames.cancelFrame).toHaveBeenCalledWith(7);

		coalescer.addDelta(-250);
		expect(frames.requestFrame).toHaveBeenCalledTimes(1);
		frames.flush();
		expect(onZoomIn).not.toHaveBeenCalled();
	});
});

/** Records listeners per type and dispatches wheel events to the wheel one. */
function wheelTargetHarness() {
	const listeners = new Map<string, (event: WheelEvent) => void>();
	let attachedPassive: boolean | undefined;
	return {
		target: {
			addEventListener: vi.fn(
				(
					type: string,
					next: (event: WheelEvent) => void,
					options?: AddEventListenerOptions,
				) => {
					listeners.set(type, next);
					if (type === "wheel") attachedPassive = options?.passive;
				},
			),
			removeEventListener: vi.fn((type: string, prev: unknown) => {
				if (listeners.get(type) === prev) listeners.delete(type);
			}),
		} as unknown as HTMLElement,
		isPassive: () => attachedPassive,
		hasListener: () => listeners.has("wheel"),
		dispatch: (init: { deltaY: number; ctrlKey?: boolean }) => {
			const preventDefault = vi.fn();
			listeners.get("wheel")?.({
				deltaY: init.deltaY,
				ctrlKey: init.ctrlKey ?? false,
				metaKey: false,
				cancelable: true,
				preventDefault,
			} as unknown as WheelEvent);
			return preventDefault;
		},
	};
}

describe("PDF wheel zoom gesture binding", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("starts non-passive so a cold pinch can cancel platform zoom", () => {
		const harness = wheelTargetHarness();
		const onZoomWheel = vi.fn();
		bindWheelZoomGesture({ target: harness.target, onZoomWheel });

		expect(harness.isPassive()).toBe(false);
		const preventDefault = harness.dispatch({ deltaY: -40, ctrlKey: true });
		expect(preventDefault).toHaveBeenCalledTimes(1);
		expect(onZoomWheel).toHaveBeenCalledTimes(1);
		expect(harness.isPassive()).toBe(false);
	});

	it("goes passive for a plain scroll gesture and back after it idles", () => {
		const harness = wheelTargetHarness();
		const onZoomWheel = vi.fn();
		bindWheelZoomGesture({
			target: harness.target,
			onZoomWheel,
			scrollIdleMs: 200,
		});

		harness.dispatch({ deltaY: 30 });
		expect(harness.isPassive()).toBe(true);
		expect(onZoomWheel).not.toHaveBeenCalled();

		// Continued scrolling keeps the listener passive.
		vi.advanceTimersByTime(150);
		harness.dispatch({ deltaY: 30 });
		vi.advanceTimersByTime(150);
		expect(harness.isPassive()).toBe(true);

		vi.advanceTimersByTime(200);
		expect(harness.isPassive()).toBe(false);
	});

	it("still zooms when a pinch starts mid-scroll, without a passive preventDefault", () => {
		const harness = wheelTargetHarness();
		const onZoomWheel = vi.fn();
		bindWheelZoomGesture({ target: harness.target, onZoomWheel });

		harness.dispatch({ deltaY: 30 });
		expect(harness.isPassive()).toBe(true);

		const preventDefault = harness.dispatch({ deltaY: -40, ctrlKey: true });
		expect(preventDefault).not.toHaveBeenCalled();
		expect(onZoomWheel).toHaveBeenCalledTimes(1);
		// Next tick of the same pinch is cancelable again.
		expect(harness.isPassive()).toBe(false);
	});

	it("dispose detaches the listener and drops the idle timer", () => {
		const harness = wheelTargetHarness();
		const onZoomWheel = vi.fn();
		const binding = bindWheelZoomGesture({
			target: harness.target,
			onZoomWheel,
		});

		harness.dispatch({ deltaY: 30 });
		binding.dispose();
		expect(harness.hasListener()).toBe(false);
		vi.advanceTimersByTime(1000);
		// wheel + 3 WebKit gesture listeners, plus one passive-toggle re-add.
		expect(harness.target.addEventListener).toHaveBeenCalledTimes(5);
	});
});

/** Records listeners per event type so gesture events can be dispatched. */
function gestureTargetHarness() {
	const listeners = new Map<string, (event: unknown) => void>();
	return {
		target: {
			addEventListener: vi.fn(
				(type: string, listener: (event: unknown) => void) => {
					listeners.set(type, listener);
				},
			),
			removeEventListener: vi.fn((type: string) => {
				listeners.delete(type);
			}),
		} as unknown as HTMLElement,
		dispatch: (type: string, scale: number) => {
			const preventDefault = vi.fn();
			listeners.get(type)?.({ scale, preventDefault });
			return preventDefault;
		},
		hasListener: (type: string) => listeners.has(type),
	};
}

describe("PDF wheel zoom WebKit gesture binding", () => {
	it("translates pinch-out scale increases into zoom-in deltas", () => {
		const harness = gestureTargetHarness();
		const onZoomWheel = vi.fn();
		bindWheelZoomGesture({ target: harness.target, onZoomWheel });

		const startPrevent = harness.dispatch("gesturestart", 1);
		expect(startPrevent).toHaveBeenCalledTimes(1);

		const changePrevent = harness.dispatch("gesturechange", 1.1);
		expect(changePrevent).toHaveBeenCalledTimes(1);
		expect(onZoomWheel).toHaveBeenCalledTimes(1);
		// ln(1.1) * 1000 ≈ 95, negated → zoom-in direction.
		expect(onZoomWheel.mock.calls[0][0].deltaY).toBeCloseTo(-95.3, 0);

		onZoomWheel.mockClear();
		harness.dispatch("gesturechange", 0.99);
		expect(onZoomWheel).toHaveBeenCalledTimes(1);
		// ratio 0.9 → positive delta (zoom out).
		expect(onZoomWheel.mock.calls[0][0].deltaY).toBeGreaterThan(0);
	});

	it("resets the scale baseline when the gesture ends", () => {
		const harness = gestureTargetHarness();
		const onZoomWheel = vi.fn();
		bindWheelZoomGesture({ target: harness.target, onZoomWheel });

		harness.dispatch("gesturestart", 1);
		harness.dispatch("gesturechange", 2);
		harness.dispatch("gestureend", 2);
		onZoomWheel.mockClear();

		// A fresh gesture starts from baseline 1 again, not the previous 2.
		harness.dispatch("gesturestart", 1);
		harness.dispatch("gesturechange", 1.1);
		expect(onZoomWheel).toHaveBeenCalledTimes(1);
		expect(onZoomWheel.mock.calls[0][0].deltaY).toBeCloseTo(-95.3, 0);
	});

	it("dispose detaches the gesture listeners", () => {
		const harness = gestureTargetHarness();
		const onZoomWheel = vi.fn();
		const binding = bindWheelZoomGesture({
			target: harness.target,
			onZoomWheel,
		});

		expect(harness.hasListener("gesturestart")).toBe(true);
		expect(harness.hasListener("gesturechange")).toBe(true);
		expect(harness.hasListener("gestureend")).toBe(true);

		binding.dispose();
		expect(harness.hasListener("gesturestart")).toBe(false);
		expect(harness.hasListener("gesturechange")).toBe(false);
		expect(harness.hasListener("gestureend")).toBe(false);

		harness.dispatch("gesturechange", 2);
		expect(onZoomWheel).not.toHaveBeenCalled();
	});
});
