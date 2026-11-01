/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StyledDisplayName, StyledUsername } from "@/components/profile/styled-name";

const baseProfile = { display_name: "Alex McFurry", username: "alexmcfurry", profile_customisation: null as Record<string, unknown> | null };

afterEach(() => {
  cleanup();
});

describe("StyledDisplayName", () => {
  it("renders the profile font class on own and public profiles", () => {
    render(<StyledDisplayName profile={baseProfile} size="lg" />);
    expect(screen.getByText("Alex McFurry")).toHaveClass("af-font-mock");
  });

  it("applies a custom display-name colour as an inline style", () => {
    render(<StyledDisplayName profile={{ ...baseProfile, profile_customisation: { displayNameColor: "#ff0000" } }} />);
    expect(screen.getByText("Alex McFurry")).toHaveStyle("color: #ff0000");
  });

  it("renders a gradient effect with start and end colours", () => {
    render(
      <StyledDisplayName
        profile={{ ...baseProfile, profile_customisation: { displayNameEffect: "gradient", gradientStart: "#ff0000", gradientEnd: "#0000ff" } }}
      />,
    );
    const el = screen.getByText("Alex McFurry");
    expect(el).toHaveClass("af-effect-gradient");
    expect(el.getAttribute("style")).toContain("linear-gradient(135deg, rgb(255, 0, 0), rgb(0, 0, 255))");
  });

  it("honours the reduced-motion prop for animated effects", () => {
    render(<StyledDisplayName profile={{ ...baseProfile, profile_customisation: { displayNameEffect: "glitch" } }} reducedMotion={true} />);
    expect(screen.getByText("Alex McFurry")).toHaveClass("af-effect-none");
    cleanup();
    render(<StyledDisplayName profile={{ ...baseProfile, profile_customisation: { displayNameEffect: "glitch" } }} reducedMotion={false} />);
    expect(screen.getByText("Alex McFurry")).toHaveClass("af-effect-glitch");
  });

  it("falls back to the username when the display name is missing", () => {
    render(<StyledDisplayName profile={{ ...baseProfile, display_name: null } } />);
    expect(screen.getByText("alexmcfurry")).toBeInTheDocument();
  });
});

describe("StyledUsername", () => {
  it("applies a custom username colour and effect class", () => {
    render(<StyledUsername profile={{ ...baseProfile, profile_customisation: { usernameColor: "#00ff00", usernameEffect: "neon" } }} />);
    const el = screen.getByText("@alexmcfurry");
    expect(el).toHaveStyle("color: #00ff00");
    expect(el).toHaveClass("af-effect-neon");
  });

  it("applies reduced motion to animated username effects", () => {
    render(<StyledUsername profile={{ ...baseProfile, profile_customisation: { usernameEffect: "aurora" } }} reducedMotion={true} />);
    expect(screen.getByText("@alexmcfurry")).toHaveClass("af-effect-none");
  });
});
