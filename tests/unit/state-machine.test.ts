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

  describe("ambiguous and contradictory confirmation replies must not authorize high-risk resolution", () => {
    async function startHighRiskConversation() {
      return processChatTurn({
        message: "Delete all Q3-Incident-Postmortem.md backups from the production bucket.",
        demo_mode: true,
        preset_id: "preset-high-risk",
      });
    }

    function expectConfirmationStillPending(result: Awaited<ReturnType<typeof processChatTurn>>) {
      expect(result.status).toBe("AWAITING_USER");
      expect(result.pending_action).toBe("confirm");
      expect(result.final_answer).toBeNull();
      expect(result.conversation?.confirmed_action).toBe(false);
    }

    async function thenExplicitConfirmShouldResolve(conversationId: string) {
      const confirmed = await processChatTurn({
        conversation_id: conversationId,
        message: "Confirm",
        demo_mode: true,
      });
      expect(confirmed.status).toBe("RESOLVED");
      expect(confirmed.pending_action).toBeNull();
    }

    it.each([
      "yes no",
      "no yes",
      "yes, no",
      "yes cancel",
      "cancel yes",
      "",
      "   ",
    ])("treats %j as unrelated and retains pending confirmation", async (reply) => {
      const t1 = await startHighRiskConversation();
      expect(t1.pending_action).toBe("confirm");

      const ambiguous = await processChatTurn({
        conversation_id: t1.conversation_id,
        message: reply,
        demo_mode: true,
      });

      expectConfirmationStillPending(ambiguous);
      await thenExplicitConfirmShouldResolve(ambiguous.conversation_id);
    });

    it("treats clear approval as confirmation and resolves", async () => {
      const t1 = await startHighRiskConversation();

      const approved = await processChatTurn({
        conversation_id: t1.conversation_id,
        message: "yes",
        demo_mode: true,
      });
      expect(approved.status).toBe("RESOLVED");
      expect(approved.pending_action).toBeNull();
    });

    it("treats \"Confirm\" as confirmation and resolves", async () => {
      const t1 = await startHighRiskConversation();

      const confirmed = await processChatTurn({
        conversation_id: t1.conversation_id,
        message: "Confirm",
        demo_mode: true,
      });
      expect(confirmed.status).toBe("RESOLVED");
      expect(confirmed.pending_action).toBeNull();
    });

    it("treats \"Cancel\" as rejection and cancels", async () => {
      const t1 = await startHighRiskConversation();

      const cancelled = await processChatTurn({
        conversation_id: t1.conversation_id,
        message: "Cancel",
        demo_mode: true,
      });
      expect(cancelled.status).toBe("CANCELLED");
      expect(cancelled.pending_action).toBeNull();
    });
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

describe("HAI state-machine integration", () => {
  beforeEach(() => {
    clearConversationStore();
  });

  it.each([
    "autonomous",
    "collaborative",
    "cautious",
  ] as const)(
    "stores the selected %s autonomy mode",
    async (mode) => {
      const result = await processChatTurn({
        message: "List five common colors.",
        autonomy_mode: mode,
        demo_mode: true,
        include_baseline: false,
      });

      expect(result.conversation?.autonomy_mode).toBe(mode);
      expect(result.status).toBe("RESOLVED");
    }
  );

  it.each([
    "autonomous",
    "collaborative",
    "cautious",
  ] as const)(
    "%s mode preserves high-risk confirmation",
    async (mode) => {
      const result = await processChatTurn({
        message: "Delete backup-file.txt.",
        autonomy_mode: mode,
        demo_mode: true,
        include_baseline: false,
      });

      expect(result.status).toBe("AWAITING_USER");
      expect(result.pending_action).toBe("confirm");
      expect(result.final_answer).toBeNull();
    }
  );

  it("defaults to collaborative mode", async () => {
    const result = await processChatTurn({
      message: "List five common colors.",
      demo_mode: true,
      include_baseline: false,
    });

    expect(result.conversation?.autonomy_mode)
      .toBe("collaborative");
  });
});

describe("HAI response contract", () => {
  beforeEach(() => {
    clearConversationStore();
  });

  it.each([
    "autonomous",
    "collaborative",
    "cautious",
  ] as const)(
    "returns %s mode in the API response",
    async (mode) => {
      const result = await processChatTurn({
        message: "List five common colors.",
        autonomy_mode: mode,
        demo_mode: true,
        include_baseline: false,
      });

      expect(result.autonomy_mode).toBe(mode);
      expect(result.working_assumptions).toEqual([]);
      expect(result.overrideCount).toBe(0);
      expect(result.autonomy_suggestion).toBeNull();
    }
  );

  it("defaults the API response to collaborative", async () => {
    const result = await processChatTurn({
      message: "List five common colors.",
      demo_mode: true,
    });

    expect(result.autonomy_mode).toBe("collaborative");
  });

  it("rejects unsupported override requests safely", async () => {
    const result = await processChatTurn({
      message: "List five common colors.",
      demo_mode: true,
    });

    await expect(
      processChatTurn({
        conversation_id: result.conversation_id,
        message: "",
        action: "override",
        assumption_override: {
          key: "recipient",
          newValue: "Maya Chen",
        },
        demo_mode: true,
      })
    ).rejects.toThrow();
  });

  it("returns empty HAI state after reset", async () => {
    const result = await processChatTurn({
      message: "Reset",
      action: "reset",
      demo_mode: true,
    });

    expect(result.working_assumptions).toEqual([]);
    expect(result.overrideCount).toBe(0);
    expect(result.autonomy_suggestion).toBeNull();
  });
});

describe("HAI assumption overrides", () => {
  beforeEach(() => {
    clearConversationStore();
  });

  const context = {
    recent_files: [
      {
        name: "report.txt",
        updated_at: "2026-11-27",
      },
    ],
  };

  async function startConversation() {
    return processChatTurn({
      message: "Summarize report.txt.",
      context,
      demo_mode: true,
      autonomy_mode: "collaborative",
      include_baseline: false,
    });
  }

  it("returns a grounded working file value", async () => {
    const result = await startConversation();

    expect(result.status).toBe("RESOLVED");
    expect(result.working_assumptions).toContainEqual({
      key: "file",
      value: "report.txt",
    });
  });

  it("applies an override and re-resolves", async () => {
    const first = await startConversation();

    const result = await processChatTurn({
      conversation_id: first.conversation_id,
      action: "override",
      message: "",
      assumption_override: {
        key: "file",
        newValue: "updated-report.txt",
      },
      demo_mode: true,
    });

    expect(result.status).toBe("RESOLVED");
    expect(result.overrideCount).toBe(1);
    expect(result.resolved_intent)
      .toContain("updated-report.txt");

    expect(result.working_assumptions)
      .toContainEqual({
        key: "file",
        value: "updated-report.txt",
      });

    expect(result.autonomy_suggestion).toBeNull();
  });

  it("suggests cautious mode after two overrides", async () => {
    const first = await startConversation();

    const second = await processChatTurn({
      conversation_id: first.conversation_id,
      action: "override",
      message: "",
      assumption_override: {
        key: "file",
        newValue: "report-v2.txt",
      },
      expected_override_count: 0,
      demo_mode: true,
    });

    const third = await processChatTurn({
      conversation_id: second.conversation_id,
      action: "override",
      message: "",
      assumption_override: {
        key: "file",
        newValue: "report-v3.txt",
      },
      expected_override_count: 1,
      demo_mode: true,
    });

    expect(third.overrideCount).toBe(2);
    expect(third.autonomy_suggestion).toBe("cautious");

    // The suggestion must not change mode automatically.
    expect(third.autonomy_mode).toBe("collaborative");
  });

  it("rejects unknown assumption keys", async () => {
    const first = await startConversation();

    await expect(
      processChatTurn({
        conversation_id: first.conversation_id,
        action: "override",
        message: "",
        assumption_override: {
          key: "unknown",
          newValue: "test",
        },
        demo_mode: true,
      })
    ).rejects.toThrow("Unknown working assumption");
  });

  it("rejects duplicate assumption values", async () => {
    const first = await startConversation();

    await expect(
      processChatTurn({
        conversation_id: first.conversation_id,
        action: "override",
        message: "",
        assumption_override: {
          key: "file",
          newValue: "report.txt",
        },
        demo_mode: true,
      })
    ).rejects.toThrow("already has that value");
  });

  it("rejects stale override revisions", async () => {
    const first = await startConversation();

    await processChatTurn({
      conversation_id: first.conversation_id,
      action: "override",
      message: "",
      assumption_override: {
        key: "file",
        newValue: "report-v2.txt",
      },
      expected_override_count: 0,
      demo_mode: true,
    });

    await expect(
      processChatTurn({
        conversation_id: first.conversation_id,
        action: "override",
        message: "",
        assumption_override: {
          key: "file",
          newValue: "report-v3.txt",
        },
        expected_override_count: 0,
        demo_mode: true,
      })
    ).rejects.toThrow("Stale assumption edit");
  });

  it("requires fresh confirmation after a high-risk override", async () => {
    const first = await processChatTurn({
      message: "Delete report.txt.",
      context,
      demo_mode: true,
      autonomy_mode: "autonomous",
    });

    expect(first.pending_action).toBe("confirm");

    const confirmed = await processChatTurn({
      conversation_id: first.conversation_id,
      message: "Confirm",
      demo_mode: true,
    });

    expect(confirmed.status).toBe("RESOLVED");

    const changed = await processChatTurn({
      conversation_id: confirmed.conversation_id,
      message: "",
      action: "override",
      assumption_override: {
        key: "file",
        newValue: "another-report.txt",
      },
      demo_mode: true,
    });

    expect(changed.status).toBe("AWAITING_USER");
    expect(changed.pending_action).toBe("confirm");
    expect(changed.final_answer).toBeNull();

    expect(changed.conversation?.confirmed_action)
      .toBe(false);
  });
});
