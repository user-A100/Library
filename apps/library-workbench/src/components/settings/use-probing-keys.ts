import { useCallback, useState } from "react";

/** Track which catalog / custom rows are mid-ACP-probe (badge “probing”). */
export function useProbingKeys() {
	const [probingKeys, setProbingKeys] = useState<Set<string>>(() => new Set());

	const clearProbingKey = useCallback((key: string) => {
		setProbingKeys((prev) => {
			if (!prev.has(key)) return prev;
			const next = new Set(prev);
			next.delete(key);
			return next;
		});
	}, []);

	const clearAllProbingKeys = useCallback(() => {
		setProbingKeys(new Set());
	}, []);

	return {
		probingKeys,
		setProbingKeys,
		clearProbingKey,
		clearAllProbingKeys,
	};
}
