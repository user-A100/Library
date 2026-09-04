import { describe, expect, it } from "vitest";

import {
	formatMarkdownSource,
	MARKDOWN_FORMAT_OPTIONS,
} from "@/lib/markdown/format";

const semanticCorpus = String.raw`---
title: Format probe
aliases:
  - Probe
---

#   Heading

Literal: \$a\$

Formula: $b$

[[Note#Outer#Inner|label]]

![[Note#Outer#Inner]]

> [!important] Custom title
> Body with [[Other]] and ==mark==.

Paragraph ^block-id

-   first
- second

| Name | Value |
|---|---|
| one | two |

Footnote[^1] and ![image](./assets/example.png).

[^1]: Footnote body.

<span data-kind="html">HTML</span>

<Callout kind="mdx">MDX body</Callout>

~~~ts
const   untouched = 1
~~~
`;

describe("Markdown source formatting", () => {
	it("uses the bounded source-preserving options", () => {
		expect(MARKDOWN_FORMAT_OPTIONS).toEqual({
			embeddedLanguageFormatting: "off",
			htmlWhitespaceSensitivity: "ignore",
			parser: "markdown",
			proseWrap: "preserve",
		});
	});

	it("normalizes layout while preserving Agentero Markdown semantics", async () => {
		const formatted = await formatMarkdownSource(semanticCorpus);

		expect(formatted).toContain("# Heading");
		expect(formatted).toContain(String.raw`Literal: \$a\$`);
		expect(formatted).toContain("Formula: $b$");
		expect(formatted).toContain("[[Note#Outer#Inner|label]]");
		expect(formatted).toContain("![[Note#Outer#Inner]]");
		expect(formatted).toContain("> [!important] Custom title");
		expect(formatted).toContain("Paragraph ^block-id");
		expect(formatted).toContain("- first\n- second");
		expect(formatted).toContain("| Name | Value |");
		expect(formatted).toContain("[^1]: Footnote body.");
		expect(formatted).toContain("![image](./assets/example.png)");
		expect(formatted).toContain('<span data-kind="html">HTML</span>');
		expect(formatted).toContain('<Callout kind="mdx">MDX body</Callout>');
		expect(formatted).toContain("const   untouched = 1");
	});
});
