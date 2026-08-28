import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

let ViewHost;

beforeAll(async () => {
  const source = await readFile("desktop/addons/research-workspace/ai-view.js", "utf8");
  const context = vm.createContext({});
  vm.runInContext(source, context, { filename: "ai-view.js" });
  ViewHost = context.LibraryAIViewHost;
});

function createHost(conversation, currentSource) {
  const host = Object.create(ViewHost.prototype);
  host.repository = {
    active: conversation,
    update: vi.fn(),
  };
  host.workspace = {
    getCurrentWindowItem: vi.fn(async () => ({ id: currentSource.itemID })),
  };
  host.context = {
    source: vi.fn(async () => currentSource),
  };
  host.renderAll = vi.fn();
  host.setStatus = vi.fn();
  return host;
}

describe("Library AI source removal", () => {
  it("keeps a removed current paper dismissed during automatic source sync", async () => {
    const source = { itemID: 42, title: "Current paper" };
    const conversation = { sources: [source], dismissedSourceIDs: [] };
    const host = createHost(conversation, source);

    host.removeSource({}, source.itemID);
    await host.syncCurrentSource({ setTimeout: vi.fn() });

    expect(conversation.sources).toEqual([]);
    expect(conversation.dismissedSourceIDs).toEqual(["42"]);
    expect(host.renderAll).toHaveBeenCalledOnce();
    expect(host.repository.update).toHaveBeenCalledOnce();
  });

  it("still auto-adds a different current paper", async () => {
    const source = { itemID: 99, title: "Another paper" };
    const conversation = { sources: [], dismissedSourceIDs: ["42"] };
    const host = createHost(conversation, source);

    await host.syncCurrentSource({ setTimeout: vi.fn() });

    expect(conversation.sources).toEqual([source]);
    expect(host.repository.update).toHaveBeenCalledOnce();
  });
});
