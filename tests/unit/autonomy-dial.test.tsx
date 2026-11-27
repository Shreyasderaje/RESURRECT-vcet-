import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AutonomyDial } from "@/components/chat/autonomy-dial";

describe("AutonomyDial", () => {
  it("renders all three autonomy modes with labels", () => {
    render(<AutonomyDial mode="collaborative" onModeChange={vi.fn()} />);
    expect(screen.getAllByText("Autonomous").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Collaborative").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cautious").length).toBeGreaterThan(0);
  });

  it("shows the selected mode badge", () => {
    render(<AutonomyDial mode="autonomous" onModeChange={vi.fn()} />);
    expect(screen.getByText("Active").textContent).toBe("Active");
  });

  it("shows a description for the active mode", () => {
    render(<AutonomyDial mode="cautious" onModeChange={vi.fn()} />);
    expect(screen.getAllByText(/avoids guessing/i).length).toBeGreaterThan(0);
  });

  it("calls onModeChange when a mode button is clicked", () => {
    const onModeChange = vi.fn();
    render(<AutonomyDial mode="collaborative" onModeChange={onModeChange} />);
    const buttons = screen.getAllByRole("button");
    const autonomousBtn = buttons.find((b) => b.textContent?.includes("Autonomous"));
    expect(autonomousBtn).toBeDefined();
    fireEvent.click(autonomousBtn!);
    expect(onModeChange).toHaveBeenCalledWith("autonomous");
  });

  it("disables buttons when disabled prop is true", () => {
    render(<AutonomyDial mode="collaborative" onModeChange={vi.fn()} disabled />);
    const buttons = screen.getAllByRole("button") as HTMLButtonElement[];
    buttons.forEach((b) => expect(b.disabled).toBe(true));
  });
});