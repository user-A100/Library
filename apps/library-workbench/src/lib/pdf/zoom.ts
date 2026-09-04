export const PDF_ZOOM_MIN = 0.5;
export const PDF_ZOOM_MAX = 3;

/** Parse a user-entered percentage and clamp it to the viewer's zoom range. */
export function parsePdfZoomPercentage(value: string): number | null {
	const normalized = value.trim().replace(/%$/, "").trim();
	if (!normalized) return null;

	const percentage = Number(normalized);
	if (!Number.isFinite(percentage)) return null;

	return (
		Math.min(PDF_ZOOM_MAX * 100, Math.max(PDF_ZOOM_MIN * 100, percentage)) / 100
	);
}

/** Keep one decimal place when needed without showing a trailing `.0`. */
export function formatPdfZoomPercentage(zoom: number): string {
	const percentage = Math.round(zoom * 1000) / 10;
	return Number.isInteger(percentage)
		? String(percentage)
		: percentage.toFixed(1);
}
