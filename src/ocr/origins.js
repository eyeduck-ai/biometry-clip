/** URL.origin can be "null" for extension URLs; compare the package URL itself. */
export function documentOrigin(href) {
  const url = new URL(href);
  return url.protocol === 'chrome-extension:' ? `${url.protocol}//${url.host}` : url.origin;
}

export function sandboxAssetBase(href) {
  return new URL('../../vendor-ocr/', href).href;
}

export function matchesParentOrigin(actual, expected) {
  // Some extension runtimes serialize custom-scheme origins as opaque. Source
  // window and the unguessable per-frame channel are checked independently.
  return actual === expected || (actual === 'null' && expected.startsWith('chrome-extension://'));
}
