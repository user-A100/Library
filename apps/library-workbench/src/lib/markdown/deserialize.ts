/**
 * Prevent an unclosed block-math fence from consuming the rest of a document.
 *
 * `remark-math` treats a standalone `$$` as a block fence. When its closing
 * fence is missing, the parser legitimately puts all following Markdown into
 * the equation node, which makes unrelated content appear broken in Plate.
 */
const BLOCK_MATH_FENCE = /^ {0,3}\$\$[ \t]*\r?$/;
const CODE_FENCE = /^ {0,3}(`{3,}|~{3,})/;

export function prepareMarkdownForDeserialize(source: string): string {
	const fences: number[] = [];
	let codeFence: { character: string; length: number } | null = null;
	let offset = 0;

	for (const line of source.split("\n")) {
		const codeMatch = line.match(CODE_FENCE);
		if (codeMatch) {
			const marker = codeMatch[1];
			if (!codeFence) {
				codeFence = { character: marker[0], length: marker.length };
			} else if (
				marker[0] === codeFence.character &&
				marker.length >= codeFence.length
			) {
				codeFence = null;
			}
		} else if (!codeFence && BLOCK_MATH_FENCE.test(line)) {
			fences.push(offset + line.search(/\$\$/));
		}
		offset += line.length + 1;
	}

	if (fences.length % 2 === 0) return source;

	const dollarOffset = fences.at(-1);
	if (dollarOffset === undefined) return source;
	return `${source.slice(0, dollarOffset)}\\${source.slice(dollarOffset)}`;
}
