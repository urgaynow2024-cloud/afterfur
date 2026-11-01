/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import PostText from "@/components/PostText";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PostText link, mention and hashtag rendering", () => {
  it("renders plain text with no links unchanged", () => {
    const { container } = render(<PostText content="Hello world, this is just text." />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(container.textContent).toBe("Hello world, this is just text.");
  });

  it("renders HTTP and HTTPS URLs as external links", () => {
    const { container } = render(<PostText content="Visit http://example.com and https://afterfur.example/page." />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "http://example.com");
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(links[0]).toHaveAttribute("rel", "noopener noreferrer");
    expect(links[1]).toHaveAttribute("href", "https://afterfur.example/page");
    expect(container.textContent).toContain("Visit ");
    expect(container.textContent).toContain(" and ");
    expect(container.textContent).toContain(".");
  });

  it("keeps query strings and fragments in URLs", () => {
    render(<PostText content="https://example.com/search?q=afterfur#results" />);
    expect(screen.getByRole("link", { name: "https://example.com/search?q=afterfur#results" })).toBeTruthy();
  });

  it("strips trailing punctuation from URLs", () => {
    const { container } = render(<PostText content="Read https://example.com. Then https://example.com," />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "https://example.com");
    expect(links[1]).toHaveAttribute("href", "https://example.com");
    expect(container.textContent).toContain(". Then ");
    expect(container.textContent).toContain(",");
  });

  it("renders multiple links in one post", () => {
    const { container } = render(<PostText content="a https://one.example b https://two.example c" />);
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(container.textContent).toContain("a ");
    expect(container.textContent).toContain(" b ");
    expect(container.textContent).toContain(" c");
  });

  it("renders @mentions as links to the profile", () => {
    const { container } = render(<PostText content="Hello @artist" />);
    const link = screen.getByRole("link", { name: "@artist" });
    expect(link).toHaveAttribute("href", "/artist");
    expect(container.textContent).toContain("Hello ");
  });

  it("does not treat email addresses as mentions", () => {
    const { container } = render(<PostText content="Contact contact@artist.com or hello@domain.org." />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(container.textContent).toBe("Contact contact@artist.com or hello@domain.org.");
  });

  it("does not treat @ inside URLs as mentions", () => {
    const { container } = render(<PostText content="https://example.com/@artist is the profile" />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "https://example.com/@artist");
    expect(container.textContent).toContain(" is the profile");
  });

  it("renders hashtags as links to search", () => {
    const { container } = render(<PostText content="Loving #VRChat and #Furry" />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/search?q=%23VRChat");
    expect(links[1]).toHaveAttribute("href", "/search?q=%23Furry");
    expect(container.textContent).toContain("Loving ");
    expect(container.textContent).toContain(" and ");
  });

  it("keeps hashtag punctuation outside the link", () => {
    const { container } = render(<PostText content="#AfterFur!" />);
    const link = screen.getByRole("link", { name: "#AfterFur" });
    expect(link).toHaveAttribute("href", "/search?q=%23AfterFur");
    expect(container.textContent).toContain("!");
  });

  it("does not treat URL fragments or colour codes as hashtags", () => {
    const { container } = render(<PostText content="https://example.com/#section and #ff0000 and #FFF" />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "https://example.com/#section");
    expect(screen.getByRole("link", { name: "https://example.com/#section" })).toBeTruthy();
    expect(container.textContent).toContain(" and ");
    expect(container.textContent).toContain("#ff0000");
    expect(container.textContent).toContain("#FFF");
  });

  it("renders mixed text, emojis, links, mentions and hashtags", () => {
    const { container } = render(<PostText content="Hi 🐾 see https://example.com and @artist #VRChat!" />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(container.textContent).toContain("Hi 🐾 see ");
    expect(container.textContent).toContain(" and ");
    expect(container.textContent).toContain("!");
  });

  it("renders nonexistent usernames as profile links without fabricating data", () => {
    const { container } = render(<PostText content="Who is @nobody12345?" />);
    const link = screen.getByRole("link", { name: "@nobody12345" });
    expect(link).toHaveAttribute("href", "/nobody12345");
    expect(container.textContent).toContain("Who is ");
    expect(container.textContent).toContain("?");
  });

  it("renders links as keyboard-accessible anchor elements", () => {
    render(<PostText content="https://example.com" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href");
    expect(link.tagName).toBe("A");
  });
});

describe("PostText unsafe URL rejection", () => {
  it("does not render javascript: URLs as clickable links", () => {
    const { container } = render(<PostText content="Click javascript:alert(1) here" />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(container.textContent).toBe("Click javascript:alert(1) here");
  });

  it("does not render data: URLs as clickable links", () => {
    const { container } = render(<PostText content="See data:text/html,<h1>x</h1> here" />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(container.textContent).toBe("See data:text/html,<h1>x</h1> here");
  });

  it("does not create nested anchors when links appear in bio text", () => {
    const { container } = render(<PostText content="Visit https://example.com or contact @user" />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    // Verify no anchor is nested inside another anchor
    const anchors = container.querySelectorAll("a");
    let nested = false;
    anchors.forEach((a) => {
      if (a.closest("a") !== a) nested = true;
    });
    expect(nested).toBe(false);
  });
});

describe("PostText rich-text formatting", () => {
  it("renders bold text with double asterisks", () => {
    const { container } = render(<PostText content="This is **bold** text." />);
    const bold = container.querySelector("span.font-semibold");
    expect(bold).not.toBeNull();
    expect(bold?.textContent).toBe("bold");
    expect(container.textContent).toBe("This is bold text.");
  });

  it("renders italic text with single asterisks", () => {
    const { container } = render(<PostText content="This is *italic* text." />);
    const italic = container.querySelector("span.italic");
    expect(italic).not.toBeNull();
    expect(italic?.textContent).toBe("italic");
    expect(container.textContent).toBe("This is italic text.");
  });

  it("renders strikethrough with double tildes", () => {
    const { container } = render(<PostText content="This is ~~strikethrough~~ text." />);
    const strike = container.querySelector("span.line-through");
    expect(strike).not.toBeNull();
    expect(strike?.textContent).toBe("strikethrough");
    expect(container.textContent).toBe("This is strikethrough text.");
  });

  it("renders spoiler with double pipes", () => {
    const { container } = render(<PostText content="This is ||spoiler|| text." />);
    const spoiler = container.querySelector("span.rounded.bg-af-surface-2");
    expect(spoiler).not.toBeNull();
    expect(container.textContent).toContain("This is ");
    expect(container.textContent).toContain(" text.");
  });

  it("reveals spoiler text on click", () => {
    render(<PostText content="||hidden||" />);
    fireEvent.mouseDown(screen.getByRole("button", { name: "Reveal spoiler" }));
    expect(screen.getByText("hidden")).toBeInTheDocument();
  });

  it("combines bold, italic, strikethrough and links in one post", () => {
    const { container } = render(<PostText content="**Bold** and *italic* and ~~strike~~ and https://example.com." />);
    expect(container.querySelector("span.font-semibold")).not.toBeNull();
    expect(container.querySelector("span.italic")).not.toBeNull();
    expect(container.querySelector("span.line-through")).not.toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(container.textContent).toBe("Bold and italic and strike and https://example.com.");
  });

  it("does not break on adjacent formatting markers", () => {
    const { container } = render(<PostText content="**bold***italic*~~strike~~" />);
    expect(container.textContent).toBe("bolditalicstrike");
    expect(container.querySelector("span.font-semibold")).not.toBeNull();
    expect(container.querySelector("span.italic")).not.toBeNull();
    expect(container.querySelector("span.line-through")).not.toBeNull();
  });

  it("treats single asterisk without closing as plain text", () => {
    const { container } = render(<PostText content="This *is not italic" />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(container.textContent).toBe("This *is not italic");
  });

  it("treats unmatched tildes as plain text", () => {
    const { container } = render(<PostText content="This ~~is not strikethrough" />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(container.textContent).toBe("This ~~is not strikethrough");
  });

  it("preserves line breaks with formatting", () => {
    const { container } = render(<PostText content="Line 1 **bold**\nLine 2 *italic*" />);
    expect(container.textContent).toContain("Line 1 bold");
    expect(container.textContent).toContain("Line 2 italic");
  });
});

