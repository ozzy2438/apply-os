/**
 * Browser extensions (Grammarly, LanguageTool, LastPass, Dark Reader, ColorZilla)
 * inject attributes onto <html>/<body> before React hydrates. That is the mismatch
 * Next reports at RootLayout <body> — not invalid app markup.
 */
export const EXTENSION_ATTRIBUTE_RE =
  /^(data-gr-|data-new-gr-|data-gramm$|data-lt-|data-lastpass|data-darkreader-|cz-shortcut-listen$)/i;

export function isBrowserExtensionAttribute(name: string): boolean {
  return EXTENSION_ATTRIBUTE_RE.test(name);
}

export function stripExtensionAttributes(el: { attributes: ArrayLike<{ name: string }>; removeAttribute: (name: string) => void } | null | undefined): void {
  if (!el) return;
  const names: string[] = [];
  for (let i = 0; i < el.attributes.length; i++) {
    names.push(el.attributes[i]!.name);
  }
  for (const name of names) {
    if (isBrowserExtensionAttribute(name)) el.removeAttribute(name);
  }
}

/** Inline script: run as soon as body exists, then once more on DOMContentLoaded. */
export const STRIP_EXTENSION_ATTRIBUTES_SCRIPT = `"use strict";
(function () {
  var re = ${EXTENSION_ATTRIBUTE_RE};
  function strip(el) {
    if (!el || !el.attributes) return;
    var names = [];
    for (var i = 0; i < el.attributes.length; i++) names.push(el.attributes[i].name);
    for (var j = 0; j < names.length; j++) {
      if (re.test(names[j])) el.removeAttribute(names[j]);
    }
  }
  function run() {
    strip(document.documentElement);
    strip(document.body);
  }
  run();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  }
})();
`;
