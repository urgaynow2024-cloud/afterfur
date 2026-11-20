/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewPostsIndicator } from "@/components/NewPostsIndicator";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("NewPostsIndicator", () => {
  it("renders singular wording for one new post", () => {
    const onRefresh = vi.fn();
    render(<NewPostsIndicator count={1} onRefresh={onRefresh} />);
    expect(screen.getByRole("button", { name: /1 new post/ })).toBeInTheDocument();
    expect(screen.getByText("1 new post")).toBeInTheDocument();
  });

  it("renders plural wording for multiple new posts", () => {
    const onRefresh = vi.fn();
    render(<NewPostsIndicator count={3} onRefresh={onRefresh} />);
    expect(screen.getByRole("button", { name: /3 new posts/ })).toBeInTheDocument();
    expect(screen.getByText("3 new posts")).toBeInTheDocument();
  });

  it("exposes an accessible label and polite live region", () => {
    render(<NewPostsIndicator count={2} onRefresh={vi.fn()} />);
    const button = screen.getByRole("button", { name: /2 new posts/ });
    expect(button).toHaveAttribute("aria-live", "polite");
    expect(button).toHaveAttribute("aria-label", "2 new posts");
  });

  it("calls onRefresh when activated by click and is keyboard-focusable", () => {
    const onRefresh = vi.fn();
    render(<NewPostsIndicator count={1} onRefresh={onRefresh} />);
    const button = screen.getByRole("button", { name: /1 new post/ });
    fireEvent.click(button);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    // A native button is keyboard accessible: it can be focused and activated.
    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it("disables when a refresh is in flight", () => {
    const onRefresh = vi.fn();
    render(<NewPostsIndicator count={1} onRefresh={onRefresh} refreshing />);
    const button = screen.getByRole("button", { name: /1 new post/ });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
