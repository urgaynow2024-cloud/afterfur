/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import ProfileCustomisationStudio from "@/components/settings/ProfileCustomisationStudio";

const mockRpc = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc: mockRpc }),
}));

const baseProps = {
  isPrime: true,
  customisation: {},
  displayName: "Alex McFurry",
  username: "alexmcfurry",
};

beforeEach(() => {
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ data: null, error: null });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("ProfileCustomisationStudio entitlement gating", () => {
  it("hides the studio and shows a Prime lock for non-Prime users", () => {
    render(<ProfileCustomisationStudio {...baseProps} isPrime={false} />);
    expect(screen.getByText(/Activate PawPass Prime to unlock profile customisation/)).toBeTruthy();
    expect(screen.queryByText(/Save customisation/)).not.toBeInTheDocument();
  });

  it("renders the studio for Prime users", () => {
    render(<ProfileCustomisationStudio {...baseProps} isPrime={true} />);
    expect(screen.getByText(/Public Profile Customisation/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Save customisation/ })).toBeInTheDocument();
  });
});

describe("save behaviour", () => {
  it("disables save when there are no changes", () => {
    render(<ProfileCustomisationStudio {...baseProps} isPrime={true} customisation={{ accent: "#8b5cf6" }} />);
    const save = screen.getByRole("button", { name: /Save customisation/ });
    expect(save).toBeDisabled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("saves via the update_profile_customisation RPC when changes exist", () => {
    render(<ProfileCustomisationStudio {...baseProps} isPrime={true} />);
    const input = screen.getByLabelText(/Custom display name colour hex/);
    fireEvent.input(input, { target: { value: "#ff0000" } });
    const save = screen.getByRole("button", { name: /Save customisation/ });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(mockRpc).toHaveBeenCalledWith("update_profile_customisation", expect.objectContaining({ p_config: expect.objectContaining({ displayNameColor: "#ff0000" }) }));
  });
});

describe("reset behaviour", () => {
  it("restores the saved draft and disables save", () => {
    render(<ProfileCustomisationStudio {...baseProps} isPrime={true} customisation={{ accent: "#8b5cf6" }} />);
    const input = screen.getByLabelText(/Custom profile accent hex/);
    fireEvent.input(input, { target: { value: "#ff0000" } });
    expect(screen.getByRole("button", { name: /Save customisation/ })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /Reset/ }));
    expect(screen.getByRole("button", { name: /Save customisation/ })).toBeDisabled();
    expect(input).toHaveValue("#8b5cf6");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("resets font and effect selections to the saved values", () => {
    render(<ProfileCustomisationStudio {...baseProps} isPrime={true} customisation={{ font: "pixel", usernameEffect: "neon" }} />);
    fireEvent.click(screen.getByRole("radio", { name: "Alex McFurrySerif" }));
    fireEvent.click(screen.getByRole("radio", { name: "@alexmcfurryOutline" }));
    expect(screen.getByRole("button", { name: /Save customisation/ })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /Reset/ }));
    expect(screen.getByRole("button", { name: /Save customisation/ })).toBeDisabled();
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("colour validation", () => {
  it("rejects an invalid custom hex, shows an error and disables save", () => {
    render(<ProfileCustomisationStudio {...baseProps} isPrime={true} />);
    const input = screen.getByLabelText(/Custom display name colour hex/);
    fireEvent.input(input, { target: { value: "#ff00" } });
    expect(screen.getByText(/Invalid hex/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save customisation/ })).toBeDisabled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("accepts valid 3-digit and 6-digit custom hex colours", () => {
    render(<ProfileCustomisationStudio {...baseProps} isPrime={true} />);
    const input = screen.getByLabelText(/Custom display name colour hex/);
    fireEvent.input(input, { target: { value: "#fff" } });
    expect(screen.queryByText(/Invalid hex/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save customisation/ })).toBeEnabled();
  });
});

describe("font catalogue", () => {
  it("renders all 8 font choices", () => {
    render(<ProfileCustomisationStudio {...baseProps} isPrime={true} />);
    for (const label of ["Default", "Bold", "Rounded", "Serif", "Decorative", "Pixel", "Monospace", "Handwritten"]) {
      expect(screen.getAllByRole("radio", { name: `Alex McFurry${label}` })).toHaveLength(1);
    }
  });

  it("includes the selected font in the save payload", () => {
    render(<ProfileCustomisationStudio {...baseProps} isPrime={true} />);
    fireEvent.click(screen.getByRole("radio", { name: "Alex McFurryPixel" }));
    fireEvent.click(screen.getByRole("button", { name: /Save customisation/ }));
    expect(mockRpc).toHaveBeenCalledWith("update_profile_customisation", expect.objectContaining({ p_config: expect.objectContaining({ font: "pixel" }) }));
  });
});

describe("effect catalogue", () => {
  const effects = ["Solid", "Gradient", "Neon", "Toon", "Pop", "Gummy", "Prism", "Shadow", "Outline", "Metallic", "Glitch", "Frost", "Ember", "Aurora"];

  it("renders all 14 effects for display name and username", () => {
    render(<ProfileCustomisationStudio {...baseProps} isPrime={true} />);
    for (const label of effects) {
      expect(screen.getAllByRole("radio", { name: `Alex McFurry${label}` })).toHaveLength(1);
      expect(screen.getAllByRole("radio", { name: `@alexmcfurry${label}` })).toHaveLength(1);
    }
  });

  it("includes the selected display name effect in the save payload", () => {
    render(<ProfileCustomisationStudio {...baseProps} isPrime={true} />);
    fireEvent.click(screen.getByRole("radio", { name: "Alex McFurryGlitch" }));
    fireEvent.click(screen.getByRole("button", { name: /Save customisation/ }));
    expect(mockRpc).toHaveBeenCalledWith("update_profile_customisation", expect.objectContaining({ p_config: expect.objectContaining({ displayNameEffect: "glitch" }) }));
  });
});

describe("gradient colours", () => {
  it("includes gradient start and end colours in the save payload", () => {
    render(<ProfileCustomisationStudio {...baseProps} isPrime={true} />);
    const start = screen.getByLabelText(/Gradient start colour/);
    const end = screen.getByLabelText(/Gradient end colour/);
    fireEvent.input(start, { target: { value: "#ff0000" } });
    fireEvent.input(end, { target: { value: "#0000ff" } });
    fireEvent.click(screen.getByRole("button", { name: /Save customisation/ }));
    expect(mockRpc).toHaveBeenCalledWith("update_profile_customisation", expect.objectContaining({
      p_config: expect.objectContaining({ gradientStart: "#ff0000", gradientEnd: "#0000ff" }),
    }));
  });
});

describe("responsive effect grid and display-name wrapping", () => {
  it("renders effect grids with auto-fit minimum column widths and natural word wrapping on preview names", () => {
    const { container } = render(
      <ProfileCustomisationStudio
        {...baseProps}
        isPrime={true}
        displayName="Alex McFurry"
        username="alexmcfurry"
      />,
    );

    const effectGrids = container.querySelectorAll(".af-effects-grid");
    expect(effectGrids.length).toBeGreaterThanOrEqual(2);

    const fontGrid = container.querySelector(".af-fonts-grid");
    expect(fontGrid).toBeInTheDocument();

    const effectCards = container.querySelectorAll(".af-effect-card");
    expect(effectCards.length).toBe(28);

    for (const card of Array.from(effectCards)) {
      expect(card).toHaveClass("min-w-0");
      const preview = card.querySelector(".af-effect-preview-text");
      expect(preview).toBeInTheDocument();
      expect(preview?.textContent?.trim()).toBeTruthy();
    }

    const solidDisplayNameRadio = screen.getAllByRole("radio", { name: "Alex McFurrySolid" })[0];
    const previewSpan = solidDisplayNameRadio?.querySelector(".af-effect-preview-text");
    expect(previewSpan).toHaveTextContent("Alex McFurry");
    expect(previewSpan?.className).not.toContain("break-all");
    expect(previewSpan?.className).not.toContain("leading-none");
  });
});
