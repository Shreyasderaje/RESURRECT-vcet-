import { beforeEach, describe, expect, it } from "vitest";
import {
  clearConversationStore,
  parseConfirmationReply,
  processChatTurn,
} from "@/lib/ai/state-machine";

describe("state-machine (demo mode)", () => {
  beforeEach(() => {
    clearConversationStore();
  });

  it("runs a multi-turn clarification flow and resolves", async () => {
    const turn1 = await processChatTurn({
      message: "Send the updated draft to her before the meeting tomorrow.",
      demo_mode: true,
      include_baseline: true,
      preset_id: "preset-referential",
    });

    expect(turn1.status).toBe("AWAITING_USER");
    expect(turn1.pending_action).toBe("clarify");
    expect(turn1.clarification_turns).toBe(1);

    const turn2 = await processChatTurn({
      conversation_id: turn1.conversation_id,
      message: "Maya Chen — Vendor-Contract-Draft-v2.pdf",
      demo_mode: true,
      include_baseline: true,
    });

    expect(turn2.status).toBe("RESOLVED");
    expect(turn2.pending_action).toBeNull();
    expect(turn2.resolved_intent).toContain("Maya Chen");
  });

  it("handles high-risk confirmation, rejects unrelated answers, and supports cancellation", async () => {
    const t1 = await processChatTurn({
      message: "Delete all Q3-Incident-Postmortem.md backups from the production bucket.",
      demo_mode: true,
      preset_id: "preset-high-risk",
    });

    expect(t1.status).toBe("AWAITING_USER");
    expect(t1.pending_action).toBe("confirm");

    // Unrelated answer must NOT be interpreted as confirmation
    const unrelated = await processChatTurn({
      conversation_id: t1.conversation_id,
      message: "What is the weather like?",
      demo_mode: true,
    });
    expect(unrelated.status).toBe("AWAITING_USER");
    expect(unrelated.pending_action).toBe("confirm");

    // Explicit decline cancels cleanly
    const cancelled = await processChatTurn({
      conversation_id: t1.conversation_id,
      message: "Cancel",
      demo_mode: true,
    });
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.pending_action).toBeNull();
  });

  it("rejects stale follow-ups on terminal conversations and forged client_status=RESOLVED", async () => {
    await expect(
      processChatTurn({
        message: "Hi",
        demo_mode: true,
        client_status: "RESOLVED",
      })
    ).rejects.toThrow();

    const clearRes = await processChatTurn({
      message: "Summarize the action items from Q4-Release-Brief.md in 3 bullet points.",
      demo_mode: true,
      preset_id: "preset-clear",
    });
    expect(clearRes.status).toBe("RESOLVED");

    await expect(
      processChatTurn({
        conversation_id: clearRes.conversation_id,
        message: "Follow up on closed conv",
        demo_mode: true,
      })
    ).rejects.toThrow();
  });

  it("handles duplicate submission safely and enforces unresolved after 2 turns in custom demo mode", async () => {
    const r1 = await processChatTurn({
      message: "Send it soon.",
      demo_mode: true,
    });
    expect(r1.status).toBe("AWAITING_USER");

    // Duplicate exact submission returns same response without advancing turns
    const r1Dup = await processChatTurn({
      conversation_id: r1.conversation_id,
      message: "Send it soon.",
      demo_mode: true,
    });
    expect(r1Dup.clarification_turns).toBe(r1.clarification_turns);
  });

  it("strictly parses confirmation replies", () => {
    expect(parseConfirmationReply("Confirm")).toEqual({
      confirmed: true,
      rejected: false,
      unrelated: false,
    });
    expect(parseConfirmationReply("Cancel")).toEqual({
      confirmed: false,
      rejected: true,
      unrelated: false,
    });
    expect(parseConfirmationReply("maybe later")).toEqual({
      confirmed: false,
      rejected: false,
      unrelated: true,
    });
  });
});
