import { vi } from "vitest";

const font = () => ({ className: "af-font-mock", variable: "--af-font-mock" });
vi.mock("next/font/google", () => ({
  Geist: vi.fn(font),
  Geist_Mono: vi.fn(font),
  Comfortaa: vi.fn(font),
  Indie_Flower: vi.fn(font),
  JetBrains_Mono: vi.fn(font),
  Permanent_Marker: vi.fn(font),
  Playfair_Display: vi.fn(font),
  Press_Start_2P: vi.fn(font),
}));

if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}