import { describe, expect, it } from "vitest";
import {
  isBrowserExtensionAttribute,
  STRIP_EXTENSION_ATTRIBUTES_SCRIPT,
  stripExtensionAttributes,
} from "./extension-attrs";

describe("browser extension attributes", () => {
  it("recognises Grammarly, LanguageTool, LastPass, Dark Reader, ColorZilla", () => {
    expect(isBrowserExtensionAttribute("data-new-gr-c-s-check-loaded")).toBe(true);
    expect(isBrowserExtensionAttribute("data-gr-ext-installed")).toBe(true);
    expect(isBrowserExtensionAttribute("data-gramm")).toBe(true);
    expect(isBrowserExtensionAttribute("data-lt-installed")).toBe(true);
    expect(isBrowserExtensionAttribute("data-lastpass-icon-root")).toBe(true);
    expect(isBrowserExtensionAttribute("data-darkreader-mode")).toBe(true);
    expect(isBrowserExtensionAttribute("cz-shortcut-listen")).toBe(true);
  });

  it("does not treat app data attributes as extension noise", () => {
    expect(isBrowserExtensionAttribute("class")).toBe(false);
    expect(isBrowserExtensionAttribute("data-demo")).toBe(false);
    expect(isBrowserExtensionAttribute("lang")).toBe(false);
  });

  it("strips only extension attributes from an element", () => {
    const attrs = [
      { name: "class" },
      { name: "data-new-gr-c-s-check-loaded" },
      { name: "data-gr-ext-installed" },
      { name: "data-demo" },
    ];
    const removed: string[] = [];
    stripExtensionAttributes({
      attributes: attrs,
      removeAttribute(name) {
        removed.push(name);
      },
    });
    expect(removed).toEqual(["data-new-gr-c-s-check-loaded", "data-gr-ext-installed"]);
  });

  it("inline script embeds the same matcher and guards a missing body", () => {
    expect(STRIP_EXTENSION_ATTRIBUTES_SCRIPT).toContain("data-new-gr-");
    expect(STRIP_EXTENSION_ATTRIBUTES_SCRIPT).toContain("data-gr-");
    expect(STRIP_EXTENSION_ATTRIBUTES_SCRIPT).toContain("document.body");
    expect(STRIP_EXTENSION_ATTRIBUTES_SCRIPT).toContain("DOMContentLoaded");
  });
});
