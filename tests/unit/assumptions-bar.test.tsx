import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AssumptionsBar } from "@/components/chat/assumptions-bar";

describe("AssumptionsBar", () => {
  const baseAssumptions = [
    { key: "recipient", value: "her" },
    { key: "time", value: "tomorrow" },
  ];

  it("shows an empty state when no assumptions are provided", () => {
    render(<AssumptionsBar assumptions={[]} />);
    expect(screen.getAllByText(/No working assumptions/i).length).toBeGreaterThan(0);
    expect(screen.getByText("None").textContent).toBe("None");
  });

  it("renders assumption values, not keys", () => {
    render(<AssumptionsBar assumptions={baseAssumptions} />);
    expect(screen.getByText("her").textContent).toBe("her");
    expect(screen.getByText("tomorrow").textContent).toBe("tomorrow");
    expect(screen.queryByText("recipient")).toBeNull();
  });

  it("calls onEditAssumption when edit is clicked", () => {
    const onEditAssumption = vi.fn();
    render(
      <AssumptionsBar assumptions={baseAssumptions} onEditAssumption={onEditAssumption} />
    );
    const editButtons = screen.getAllByTitle("Edit assumption");
    expect(editButtons.length).toBe(baseAssumptions.length);
    fireEvent.click(editButtons[0]);
    expect(onEditAssumption).toHaveBeenCalledWith(baseAssumptions[0]);
  });

  it("shows an inline textarea when editing", () => {
    const onEditAssumption = vi.fn();
    render(
      <AssumptionsBar assumptions={baseAssumptions} onEditAssumption={onEditAssumption} />
    );
    fireEvent.click(screen.getAllByTitle("Edit assumption")[0]);
    expect(screen.getAllByRole("textbox").length).toBeGreaterThan(0);
  });

  it("calls onSaveAssumption with updated value on save", () => {
    const onSaveAssumption = vi.fn();
    render(
      <AssumptionsBar assumptions={baseAssumptions} onSaveAssumption={onSaveAssumption} />
    );
    fireEvent.click(screen.getAllByTitle("Edit assumption")[0]);
    const textarea = screen.getAllByRole("textbox")[0];
    fireEvent.input(textarea, { target: { value: "the manager" } });
    const saveButtons = screen.getAllByText("Save");
    fireEvent.click(saveButtons[0]);
    expect(onSaveAssumption).toHaveBeenCalledWith({
      key: "recipient",
      value: "the manager",
    });
  });

  it("calls onCancelEdit when cancel is clicked", () => {
    const onCancelEdit = vi.fn();
    render(
      <AssumptionsBar assumptions={baseAssumptions} onCancelEdit={onCancelEdit} />
    );
    fireEvent.click(screen.getAllByTitle("Edit assumption")[0]);
    const cancelButtons = screen.getAllByText("Cancel");
    fireEvent.click(cancelButtons[0]);
    expect(onCancelEdit).toHaveBeenCalled();
    expect(screen.queryAllByRole("textbox").length).toBe(0);
  });

  it("disables inputs when disabled prop is true", () => {
    render(<AssumptionsBar assumptions={baseAssumptions} disabled />);
    const editButtons = screen.getAllByTitle("Edit assumption");
    editButtons.forEach((b) =>
      expect((b as HTMLButtonElement).disabled).toBe(true)
    );
  });
});