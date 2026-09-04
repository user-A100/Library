import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { useEffect, useRef } from "react";
import { isTauri } from "@/lib/core/tauri";

export function isPairOfferUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return (
			url.protocol === "agentero:" &&
			url.hostname === "pair" &&
			url.hash.startsWith("#offer=")
		);
	} catch {
		return false;
	}
}

/**
 * Accepts `agentero://pair#offer=…` deep links, both for the URL that launched
 * the app and for links opened while it is running.
 */
export function usePairOfferLinks(onOffer: (offerUrl: string) => void) {
	const onOfferRef = useRef(onOffer);
	onOfferRef.current = onOffer;

	useEffect(() => {
		if (!isTauri()) return;
		let active = true;
		const acceptOffer = (value: string) => {
			if (isPairOfferUrl(value)) onOfferRef.current(value);
		};
		void getCurrent()
			.then((urls) => urls?.forEach(acceptOffer))
			.catch(() => undefined);
		let unlisten: (() => void) | undefined;
		void onOpenUrl((urls) => urls.forEach(acceptOffer))
			.then((off) => {
				if (active) unlisten = off;
				else off();
			})
			.catch(() => undefined);
		return () => {
			active = false;
			unlisten?.();
		};
	}, []);
}
