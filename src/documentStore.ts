import type { ParsedDocument } from "./documentModel";

const DATABASE_NAME = "zen-research-parsed-documents";
const STORE_NAME = "documents";

function openDocumentDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveParsedDocument(document: ParsedDocument): Promise<void> {
  const database = await openDocumentDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(document, document.paperId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function loadParsedDocument(paperId: string): Promise<ParsedDocument | null> {
  const database = await openDocumentDatabase();
  const result = await new Promise<ParsedDocument | null>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(paperId);
    request.onsuccess = () => resolve(request.result && typeof request.result === "object" ? request.result as ParsedDocument : null);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return result;
}
