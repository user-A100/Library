import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { beforeAll, describe, expect, it } from "vitest";

let ContextService;

beforeAll(async () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(await readFile("desktop/addons/research-workspace/ai-context.js", "utf8"), context, { filename: "ai-context.js" });
  ContextService = context.LibraryAIPaperContextService;
});

describe("Library AI citation locators", () => {
  it("preserves PDF page and paragraph boundaries from the full-text cache", () => {
    const service = new ContextService();
    const first = "First page paragraph contains enough evidence to remain an independent retrieval record and an exact search anchor.";
    const second = "Second page paragraph contains different evidence and must retain its own physical page locator for navigation.";

    const chunks = service.pdfParagraphs(`${first}\n\f${second}\n`);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ page: 1, text: first });
    expect(chunks[1]).toMatchObject({ page: 2, text: second });
    expect(chunks[1].anchorText).toContain("Second page paragraph");
  });

  it("keeps only valid PDF rectangles in a stored position", () => {
    const service = new ContextService();

    expect(service.pdfPosition({ pageIndex: 3, rects: [[10, 20, 30, 40], [1, 2, "bad", 4]] })).toEqual({
      pageIndex: 3,
      rects: [[10, 20, 30, 40]],
    });
    expect(service.pdfPosition({ pageIndex: 3 })).toBeNull();
    expect(service.pdfPosition({ pageIndex: -1, rects: [[10, 20, 30, 40]] })).toBeNull();
  });

  it("prefers the real section body over an introduction outline", () => {
    const service = new ContextService();
    const records = [
      { page: 2, text: "本文结构如下：在第5节详述大语言模型生成内容对信息检索生态的影响，包括偏见与创作消费。" },
      { page: 10, text: "5 大大大语语语言言言模模模型型型对对对检检检索索索生生生态态态的的的影影影响响响 如第3节和第4节所述，本节系统研究偏见、公平性和创作消费问题。" },
    ];

    const best = service.bestParagraphForClaim(records, "第5节：大语言模型对内容生态的影响，包括偏见、公平性与创作消费");

    expect(best.page).toBe(10);
    expect(best.locatorConfidence).toBe("section");
  });

  it("prefers the matching subsection over a generic section introduction", () => {
    const service = new ContextService();
    const records = [
      { page: 10, text: "5 大大大语语语言言言模模模型型型对对对检检检索索索生生生态态态的的的影影影响响响 本节系统研究偏见、公平性和创作消费问题。" },
      { page: 10, text: "5.1 偏偏偏见见见问问问题题题 合成训练数据会放大检索模型对生成内容的源偏见。" },
      { page: 11, text: "5.2 不不不公公公平平平问问问题题题 检索数据中的歧视内容会造成用户不公平。" },
    ];

    const best = service.bestParagraphForClaim(records, "合成训练数据可能放大模型的偏见");

    expect(best.page).toBe(10);
    expect(best.text).toContain("5.1");
    expect(best.locatorConfidence).toBe("section");
  });

  it("samples broad paper-overview questions across the full document", () => {
    const service = new ContextService();
    const records = [
      { id: "1:meta", text: "metadata" },
      ...Array.from({ length: 30 }, (_value, index) => ({ id: `1:fulltext:${index}`, text: `paragraph ${index}` })),
    ];

    const selected = service.diverseRecords(records).slice(0, 10);

    expect(service.isOverviewQuestion("解释这篇论文")).toBe(true);
    expect(selected[0].id).toBe("1:meta");
    expect(selected.some(record => record.id === "1:fulltext:29")).toBe(true);
  });
});
