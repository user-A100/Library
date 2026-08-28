import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import vm from "node:vm";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";

let artifacts;
let validateSchema;

beforeAll(async () => {
  const source = await readFile("desktop/addons/research-workspace/ai-artifacts.js", "utf8");
  const context = { structuredClone, crypto: webcrypto, TextEncoder };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "ai-artifacts.js" });
  artifacts = context.LibraryAIArtifacts;

  const schema = JSON.parse(await readFile("schemas/library-ai-artifact.schema.json", "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  validateSchema = ajv.compile(schema);
});

function input(overrides = {}) {
  return {
    runID: "run-001",
    question: "作者报告了什么结果？",
    content: "作者报告准确率达到 91%。[[S1-C1]] 该结果仍需在外部数据上验证。[[S1-C2]]",
    citations: {
      "S1-C1": {
        id: "11:annotation:31",
        sourceItemID: 11,
        sourceItemKey: "ITEMKEY1",
        attachmentID: 21,
        attachmentKey: "ATTACH01",
        annotationKey: "ANNOT001",
        page: 3,
        text: "The model achieves 91% accuracy.",
        parserVersion: "zotero-annotation/v1"
      },
      "S1-C2": {
        id: "11:mineru:8",
        sourceItemID: 11,
        sourceItemKey: "ITEMKEY1",
        attachmentID: 21,
        attachmentKey: "ATTACH01",
        page: 9,
        text: "External validation remains future work.",
        parserVersion: "mineru/1"
      }
    },
    audit: { mode: "ask", queries: ["accuracy", "limitations"] },
    providerID: "profile-hy3",
    providerPreset: "custom",
    model: "hy3",
    sourceScope: [{ itemID: 11, itemKey: "ITEMKEY1", attachmentID: 21, attachmentKey: "ATTACH01", title: "Example Paper", level: "full" }],
    requestMessages: [{ role: "user", content: "作者报告了什么结果？" }],
    state: "done",
    createdAt: "2026-08-28T00:00:00.000Z",
    completedAt: "2026-08-28T00:00:01.000Z",
    cryptoProvider: webcrypto,
    TextEncoderImpl: TextEncoder,
    ...overrides
  };
}

describe("Library AI research artifacts", () => {
  it("builds a schema-valid, replay-verifiable bundle", async () => {
    const bundle = await artifacts.buildBundle(input());

    expect(validateSchema(bundle), JSON.stringify(validateSchema.errors)).toBe(true);
    expect(bundle.validation.structuralPassed).toBe(true);
    expect(bundle.validation.semanticStatus).toBe("not_evaluated");
    expect(bundle.claims).toHaveLength(2);
    expect(bundle.evidence.every(item => item.locatorStatus === "locatable")).toBe(true);
    expect((await artifacts.verifyBundle(bundle, { cryptoProvider: webcrypto, TextEncoderImpl: TextEncoder })).structuralPassed).toBe(true);
  });

  it("splits consecutive Chinese sentences into candidate claims", () => {
    const claims = artifacts.claimsFromMarkdown("第一条结论有充分证据。第二条结论仍需验证。第三条结论属于假设。");
    expect(claims.map(claim => claim.text)).toEqual([
      "第一条结论有充分证据。",
      "第二条结论仍需验证。",
      "第三条结论属于假设。"
    ]);
  });

  it("fails closed for an unknown citation id", async () => {
    const bundle = await artifacts.buildBundle(input({
      content: "这个结论引用了不存在的证据。[[S1-C9]]"
    }));
    expect(bundle.validation.structuralPassed).toBe(false);
    expect(bundle.validation.hardFailures.some(item => item.code === "unknown_evidence_id" && item.evidenceID === "S1-C9")).toBe(true);
  });

  it("detects quote and response tampering during replay verification", async () => {
    const bundle = await artifacts.buildBundle(input());
    bundle.evidence[0].quote = "tampered quote";
    bundle.run.rawResponse = "tampered response";

    const validation = await artifacts.verifyBundle(bundle, { cryptoProvider: webcrypto, TextEncoderImpl: TextEncoder });
    expect(validation.structuralPassed).toBe(false);
    expect(validation.hardFailures.map(item => item.code)).toContain("quote_hash_mismatch");
    expect(validation.hardFailures.map(item => item.code)).toContain("response_hash_mismatch");
  });

  it.each(["stopped", "error"])("preserves a schema-valid %s terminal run", async state => {
    const bundle = await artifacts.buildBundle(input({ state, content: "已保留终止前的部分回答。[[S1-C1]]" }));

    expect(bundle.run.state).toBe(state);
    expect(validateSchema(bundle), JSON.stringify(validateSchema.errors)).toBe(true);
    expect((await artifacts.verifyBundle(bundle, { cryptoProvider: webcrypto, TextEncoderImpl: TextEncoder })).structuralPassed).toBe(true);
  });

  it("hashes the exact raw response, including whitespace", async () => {
    const bundle = await artifacts.buildBundle(input());
    bundle.run.rawResponse += " ";

    const validation = await artifacts.verifyBundle(bundle, { cryptoProvider: webcrypto, TextEncoderImpl: TextEncoder });
    expect(validation.hardFailures.map(item => item.code)).toContain("response_hash_mismatch");
  });

  it("marks evidence without a stable page or annotation anchor as unresolved", async () => {
    const citations = structuredClone(input().citations);
    citations["S1-C1"].page = null;
    citations["S1-C1"].annotationKey = null;
    const bundle = await artifacts.buildBundle(input({ citations }));

    expect(bundle.validation.structuralPassed).toBe(true);
    expect(bundle.validation.unresolvedEvidenceIDs).toContain("S1-C1");
  });

  it("appends an immutable user correction decision", async () => {
    const bundle = await artifacts.buildBundle(input());
    const next = artifacts.appendDecision(bundle, {
      claimID: "C1",
      verdict: "edited",
      reason: "范围扩大",
      replacementText: "该结果仅适用于当前测试集。",
      replacementEvidenceIDs: ["S1-C1"]
    });

    expect(bundle.decisions).toHaveLength(0);
    expect(next.decisions).toHaveLength(1);
    expect(next.decisions[0].replacementText).toBe("该结果仅适用于当前测试集。");
    expect(next.decisions[0].previousDecisionID).toBe(null);
    expect(artifacts.claimReviewState(next, "C1").text).toBe("该结果仅适用于当前测试集。");
    expect(validateSchema(next), JSON.stringify(validateSchema.errors)).toBe(true);
  });

  it("replays an append-only review chain into the current claim state", async () => {
    const bundle = await artifacts.buildBundle(input());
    const accepted = artifacts.appendDecision(bundle, { claimID: "C1", verdict: "accepted", reason: "已核对原文" });
    const edited = artifacts.appendDecision(accepted, {
      claimID: "C1",
      verdict: "edited",
      reason: "缩小适用范围",
      replacementText: "该准确率仅针对论文中的测试集。"
    });
    const rebound = artifacts.appendDecision(edited, {
      claimID: "C1",
      verdict: "rebound",
      reason: "补充限制条件证据",
      replacementEvidenceIDs: ["S1-C1", "S1-C2"]
    });

    expect(rebound.decisions.map(item => item.previousDecisionID)).toEqual([null, "D1", "D2"]);
    expect(artifacts.claimReviewState(rebound, "C1")).toMatchObject({
      text: "该准确率仅针对论文中的测试集。",
      evidenceIDs: ["S1-C1", "S1-C2"],
      currentDecision: { id: "D3", verdict: "rebound" }
    });
    expect((await artifacts.verifyBundle(rebound, { cryptoProvider: webcrypto, TextEncoderImpl: TextEncoder })).structuralPassed).toBe(true);
  });

  it("rejects invalid review mutations", async () => {
    const bundle = await artifacts.buildBundle(input());

    expect(() => artifacts.appendDecision(bundle, { claimID: "C1", verdict: "rejected", reason: "" })).toThrow(/reason/i);
    expect(() => artifacts.appendDecision(bundle, { claimID: "C1", verdict: "edited", replacementText: "" })).toThrow(/replacement text/i);
    expect(() => artifacts.appendDecision(bundle, { claimID: "C1", verdict: "rebound", replacementEvidenceIDs: [] })).toThrow(/require evidence/i);
    expect(() => artifacts.appendDecision(bundle, { claimID: "C1", verdict: "rebound", replacementEvidenceIDs: ["S9-C9"] })).toThrow(/unknown evidence/i);

    const accepted = artifacts.appendDecision(bundle, { id: "review-1", claimID: "C1", verdict: "accepted" });
    expect(() => artifacts.appendDecision(accepted, { id: "review-1", claimID: "C1", verdict: "accepted" })).toThrow(/already exists/i);
    expect(() => artifacts.appendDecision(accepted, { claimID: "C1", verdict: "accepted", previousDecisionID: null })).toThrow(/stale/i);
  });

  it("detects a tampered decision chain during replay", async () => {
    const bundle = await artifacts.buildBundle(input());
    const accepted = artifacts.appendDecision(bundle, { claimID: "C1", verdict: "accepted" });
    const edited = artifacts.appendDecision(accepted, { claimID: "C1", verdict: "edited", replacementText: "修订后的主张。" });
    edited.decisions[1].previousDecisionID = null;

    const validation = await artifacts.verifyBundle(edited, { cryptoProvider: webcrypto, TextEncoderImpl: TextEncoder });
    expect(validation.structuralPassed).toBe(false);
    expect(validation.hardFailures.map(item => item.code)).toContain("invalid_decision_chain");
  });

  it("never accepts arbitrary non-whitelisted citations", async () => {
    await fc.assert(fc.asyncProperty(
      fc.integer({ min: 2, max: 99 }),
      async number => {
        const evidenceID = `S9-C${number}`;
        const bundle = await artifacts.buildBundle(input({ content: `任意主张需要可核验证据。[[${evidenceID}]]` }));
        return !bundle.validation.structuralPassed && bundle.validation.hardFailures.some(item => item.evidenceID === evidenceID);
      }
    ));
  });
});
