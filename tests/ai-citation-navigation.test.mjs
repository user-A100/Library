import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let ViewHost;
let Workspace;
let context;

beforeAll(async () => {
  context = {
    Services: {
      prefs: { getBoolPref: () => false },
      prompt: { alert: vi.fn() },
    },
    TextDecoder,
    Zotero: {
      Items: { getAsync: vi.fn() },
      Reader: { open: vi.fn() },
      getMainWindow: vi.fn(),
    },
  };
  vm.createContext(context);
  vm.runInContext(await readFile("desktop/addons/research-workspace/ai-view.js", "utf8"), context, { filename: "ai-view.js" });
  vm.runInContext(await readFile("desktop/addons/research-workspace/research-workspace.js", "utf8"), context, { filename: "research-workspace.js" });
  ViewHost = context.LibraryAIViewHost;
  Workspace = context.ResearchWorkspace;
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Library AI citation navigation", () => {
  it("binds rendered citation controls directly to their owning message", () => {
    const host = Object.create(ViewHost.prototype);
    const markup = host.renderMarkdown("结论 [[S1-C1]]", {
      "S1-C1": { title: "测试论文", page: 7, text: "原文" },
    }, "assistant-42");

    expect(markup).toContain('data-citation-id="S1-C1"');
    expect(markup).toContain('data-citation-message-id="assistant-42"');
    expect(markup).toContain('data-citation-claim="结论 "');
  });

  it("passes a page location while opening the reader", async () => {
    const item = { id: 21 };
    context.Zotero.Items.getAsync.mockResolvedValue(item);
    const host = Object.create(ViewHost.prototype);
    host.repository = {
      active: {
        messages: [{
          id: "assistant-42",
          citations: { "S1-C1": { attachmentID: 21, sourceItemID: 11, page: 7 } },
        }],
      },
    };
    host.workspace = { startReading: vi.fn().mockResolvedValue(undefined), log: vi.fn() };
    host.setStatus = vi.fn();
    const window = {};

    await expect(host.openCitation("assistant-42", "S1-C1", window)).resolves.toBe(true);
    expect(host.workspace.startReading).toHaveBeenCalledWith(item, { pageIndex: 6 });
		expect(host.setStatus).toHaveBeenLastCalledWith(window, "仅能定位到引用 S1-C1 所在页");
  });

  it("prefers an annotation anchor over a page number", async () => {
    const item = { id: 21 };
    context.Zotero.Items.getAsync.mockResolvedValue(item);
    const host = Object.create(ViewHost.prototype);
    host.repository = {
      active: {
        messages: [{
          id: "assistant-42",
          citations: { "S1-C1": { attachmentID: 21, page: 7, annotationKey: "ANNOT001" } },
        }],
      },
    };
    host.workspace = { startReading: vi.fn().mockResolvedValue(undefined), log: vi.fn() };
    host.setStatus = vi.fn();

    await host.openCitation("assistant-42", "S1-C1", {});

    expect(host.workspace.startReading).toHaveBeenCalledWith(item, { annotationID: "ANNOT001" });
  });

  it("uses a saved PDF position for paragraph-level navigation", async () => {
    const item = { id: 21 };
    context.Zotero.Items.getAsync.mockResolvedValue(item);
    const host = Object.create(ViewHost.prototype);
    host.repository = {
      active: {
        messages: [{
          id: "assistant-42",
          citations: { "S1-C1": { attachmentID: 21, page: 7, position: { pageIndex: 6, rects: [[12, 34, 220, 58]] } } },
        }],
      },
    };
    host.workspace = { startReading: vi.fn().mockResolvedValue({}), log: vi.fn() };
    host.setStatus = vi.fn();
    const window = {};

    await host.openCitation("assistant-42", "S1-C1", window);

    expect(host.workspace.startReading).toHaveBeenCalledWith(item, { position: { pageIndex: 6, rects: [[12, 34, 220, 58]] } });
    expect(host.setStatus).toHaveBeenLastCalledWith(window, "已定位到引用 S1-C1 的原文段落");
  });

  it("opens Reader search on the citation paragraph when no coordinate exists", async () => {
    const updateState = vi.fn();
    const findState = { popupOpen: false, active: false, query: "", highlightAll: true };
    const reader = {
      _initPromise: Promise.resolve(),
      _internalReader: {
        _state: { primaryViewFindState: findState },
        _updateState: update => {
          updateState(update);
          reader._internalReader._state.primaryViewFindState = {
            ...update.primaryViewFindState,
            result: { total: 1, index: 0 },
          };
        },
      },
    };
    const host = Object.create(ViewHost.prototype);
    host.workspace = { log: vi.fn() };

    await expect(host.locateCitationText(reader, {
      anchorText: "This paragraph contains the exact evidence used by the answer and should be highlighted in the PDF reader.",
    })).resolves.toBe(true);

    const query = updateState.mock.calls[0][0].primaryViewFindState.query;
    expect(updateState).toHaveBeenCalledWith({ primaryViewFindState: expect.objectContaining({ popupOpen: true, active: true }) });
    expect(query).toMatch(/^This paragraph contains the exact evidence/);
    expect(query.length).toBeLessThanOrEqual(64);
  });

  it("does not report a precise paragraph when Reader search finds nothing", async () => {
    const reader = {
      _initPromise: Promise.resolve(),
      _internalReader: {
        _state: { primaryViewFindState: { popupOpen: false, active: false, query: "", result: null } },
        _updateState(update) {
          this._state.primaryViewFindState = { ...update.primaryViewFindState, result: { total: 0, index: -1 } };
        },
      },
    };
    const host = Object.create(ViewHost.prototype);
    host.workspace = { log: vi.fn() };

    await expect(host.locateCitationText(reader, { anchorText: "A citation phrase that does not exist in the PDF." })).resolves.toBe(false);
  });

  it("passes the initial location into Zotero.Reader.open", async () => {
    const attachment = {
      id: 21,
      isAttachment: () => true,
      attachmentContentType: "application/pdf",
    };
    const reader = {};
    context.Zotero.Reader.open.mockResolvedValue(reader);

    await expect(Workspace.startReading(attachment, { pageIndex: 6 })).resolves.toBe(reader);
    expect(context.Zotero.Reader.open).toHaveBeenCalledWith(21, { pageIndex: 6 });
  });
});
