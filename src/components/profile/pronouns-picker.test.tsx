/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import React, { useState } from "react";
import { PronounsPicker } from "@/components/profile/pronouns-picker";

afterEach(() => {
  cleanup();
});

function ControlledPicker({ initial }: { initial: string | null }) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <>
      <PronounsPicker value={value} onChange={setValue} />
      <span data-testid="serialized">{value ?? ""}</span>
    </>
  );
}

describe("PronounsPicker", () => {
  it("renders all preset pronouns", () => {
    render(<ControlledPicker initial={null} />);
    expect(screen.getByRole("button", { name: "he/him" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "she/her" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "they/them" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "it/its" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "he/they" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "she/they" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "any pronouns" })).toBeInTheDocument();
  });

  it("selects and deselects a preset pronoun", () => {
    render(<ControlledPicker initial={null} />);
    fireEvent.click(screen.getByRole("button", { name: "they/them" }));
    expect(screen.getByTestId("serialized")).toHaveTextContent("they/them");
    fireEvent.click(screen.getByRole("button", { name: "they/them" }));
    expect(screen.getByTestId("serialized")).toHaveTextContent("");
  });

  it("supports multiple pronoun selections", () => {
    render(<ControlledPicker initial={null} />);
    fireEvent.click(screen.getByRole("button", { name: "he/him" }));
    fireEvent.click(screen.getByRole("button", { name: "they/them" }));
    expect(screen.getByTestId("serialized")).toHaveTextContent("he/him, they/them");
  });

  it("prefills and toggles existing pronouns", () => {
    render(<ControlledPicker initial="she/her" />);
    fireEvent.click(screen.getByRole("button", { name: "she/her" }));
    expect(screen.getByTestId("serialized")).toHaveTextContent("");
  });

  it("adds a custom pronoun", () => {
    render(<ControlledPicker initial={null} />);
    const input = screen.getByPlaceholderText("e.g. ey/em");
    fireEvent.input(input, { target: { value: "ey/em" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("serialized")).toHaveTextContent("ey/em");
  });

  it("removes an individual pronoun", () => {
    render(<ControlledPicker initial="he/him, she/her" />);
    fireEvent.click(screen.getByRole("button", { name: /Remove he\/him/i }));
    expect(screen.getByTestId("serialized")).toHaveTextContent("she/her");
  });

  it("clears all pronouns", () => {
    render(<ControlledPicker initial="he/him, they/them" />);
    fireEvent.click(screen.getByRole("button", { name: /Clear all/i }));
    expect(screen.getByTestId("serialized")).toHaveTextContent("");
  });

  it("serializes custom pronouns joined with comma", () => {
    render(<ControlledPicker initial={null} />);
    const input = screen.getByPlaceholderText("e.g. ey/em");
    fireEvent.input(input, { target: { value: "ey/em" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.input(input, { target: { value: "ne/nem" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("serialized")).toHaveTextContent("ey/em, ne/nem");
  });
});
