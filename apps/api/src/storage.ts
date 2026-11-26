// Append-only JSON-lines storage with in-memory index for the relay server (ADR-0017).
//
// Records are validated and kept in in-memory Maps for fast O(1) queries.
// When a persistent file path is configured, new writes are appended atomically
// to the JSONL log file. On initialization, any existing log entries are loaded.

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { contentAddressOf } from "./canonical.js";
import type {
  BindingRecordInput,
  CardRecordInput,
  ConfirmationRecordInput,
  EnvelopeRecordInput,
  InboxItem,
  StoredBindingRecord,
  StoredCardRecord,
  StoredConfirmationRecord,
  StoredEnvelopeRecord,
} from "./types.js";

type LogEntry =
  | { type: "envelope"; data: StoredEnvelopeRecord }
  | { type: "card"; data: StoredCardRecord }
  | { type: "binding"; data: StoredBindingRecord }
  | { type: "confirmation"; data: StoredConfirmationRecord };

export interface RelayStorage {
  insertEnvelope(input: EnvelopeRecordInput): StoredEnvelopeRecord;
  getEnvelope(id: string): StoredEnvelopeRecord | undefined;
  getInbox(walletAddress: string): InboxItem[];
  putCard(input: CardRecordInput): StoredCardRecord;
  getCard(sealAddress: string): StoredCardRecord | undefined;
  putBinding(input: BindingRecordInput): StoredBindingRecord;
  getBinding(walletAddress: string): StoredBindingRecord | undefined;
  insertConfirmation(input: ConfirmationRecordInput): StoredConfirmationRecord;
  getConfirmations(loanId: string): StoredConfirmationRecord[];
  close(): void;
}

export class MemoryRelayStorage implements RelayStorage {
  private readonly envelopes = new Map<string, StoredEnvelopeRecord>();
  private readonly cards = new Map<string, StoredCardRecord>();
  private readonly bindings = new Map<string, StoredBindingRecord>();
  private readonly confirmations = new Map<string, StoredConfirmationRecord>();
  private readonly filePath: string | null;

  constructor(filePath?: string) {
    this.filePath = filePath ?? null;
    if (this.filePath && existsSync(this.filePath)) {
      this.loadFromFile(this.filePath);
    }
  }

  private loadFromFile(path: string): void {
    const content = readFileSync(path, "utf-8");
    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const entry = JSON.parse(trimmed) as LogEntry;
        if (entry.type === "envelope") {
          this.envelopes.set(entry.data.id, entry.data);
        } else if (entry.type === "card") {
          this.cards.set(entry.data.sealAddress, entry.data);
        } else if (entry.type === "binding") {
          this.bindings.set(entry.data.walletAddress, entry.data);
        } else if (entry.type === "confirmation") {
          this.confirmations.set(entry.data.id, entry.data);
        }
      } catch {
        // Skip corrupt or incomplete lines in the log
      }
    }
  }

  private appendLog(entry: LogEntry): void {
    if (!this.filePath) return;
    const line = `${JSON.stringify(entry)}\n`;
    appendFileSync(this.filePath, line, "utf-8");
  }

  insertEnvelope(input: EnvelopeRecordInput): StoredEnvelopeRecord {
    const id = contentAddressOf(input);
    const existing = this.envelopes.get(id);
    if (existing) {
      // Content-addressed: identical content produces identical id, immutable.
      return existing;
    }
    const record: StoredEnvelopeRecord = { id, ...input };
    this.envelopes.set(id, record);
    this.appendLog({ type: "envelope", data: record });
    return record;
  }

  getEnvelope(id: string): StoredEnvelopeRecord | undefined {
    return this.envelopes.get(id);
  }

  getInbox(walletAddress: string): InboxItem[] {
    const items: InboxItem[] = [];
    for (const record of this.envelopes.values()) {
      if (record.recipientW === walletAddress) {
        items.push({
          id: record.id,
          kind: record.kind,
          loanRef: record.loanRef,
          senderW: record.senderW,
          recipientW: record.recipientW,
          createdAt: record.createdAt,
        });
      }
    }
    // Sort descending by creation date (newest first)
    items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    return items;
  }

  putCard(input: CardRecordInput): StoredCardRecord {
    const record: StoredCardRecord = {
      sealAddress: input.sealAddress,
      card: input.card,
      updatedAt: new Date().toISOString(),
    };
    this.cards.set(input.sealAddress, record);
    this.appendLog({ type: "card", data: record });
    return record;
  }

  getCard(sealAddress: string): StoredCardRecord | undefined {
    return this.cards.get(sealAddress);
  }

  putBinding(input: BindingRecordInput): StoredBindingRecord {
    const record: StoredBindingRecord = {
      walletAddress: input.walletAddress,
      statement: input.statement,
      updatedAt: new Date().toISOString(),
    };
    this.bindings.set(input.walletAddress, record);
    this.appendLog({ type: "binding", data: record });
    return record;
  }

  getBinding(walletAddress: string): StoredBindingRecord | undefined {
    return this.bindings.get(walletAddress);
  }

  insertConfirmation(input: ConfirmationRecordInput): StoredConfirmationRecord {
    const id = contentAddressOf(input);
    const existing = this.confirmations.get(id);
    if (existing) return existing;
    const record: StoredConfirmationRecord = { id, ...input };
    this.confirmations.set(id, record);
    this.appendLog({ type: "confirmation", data: record });
    return record;
  }

  getConfirmations(loanId: string): StoredConfirmationRecord[] {
    const items: StoredConfirmationRecord[] = [];
    for (const record of this.confirmations.values()) {
      if (record.loanId === loanId) items.push(record);
    }
    items.sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1,
    );
    return items;
  }

  close(): void {
    // Memory storage requires no file descriptor cleanup
  }
}
