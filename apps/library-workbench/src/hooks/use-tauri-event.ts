import { useEffect, useRef } from "react";
import { listenSafe, type TauriEventHandler } from "@/lib/core/tauri-events";

/**
 * Subscribe to a Tauri wire event for the lifetime of the component.
 *
 * The handler is held in a ref, so an inline closure does not resubscribe on
 * every render — only a changed `event` name does.
 */
export function useTauriEvent<T>(
	event: string,
	handler: TauriEventHandler<T>,
): void {
	const handlerRef = useRef(handler);
	handlerRef.current = handler;
	useEffect(
		() => listenSafe<T>(event, (payload) => handlerRef.current(payload)),
		[event],
	);
}
