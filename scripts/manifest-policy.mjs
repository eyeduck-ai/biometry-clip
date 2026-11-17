// This focused build guard catches packaged-code CSP regressions. It does not
// replace loading the extension in Chrome or validate every manifest property.
export function assertPackagedCodeCsp(manifest) {
  if (manifest.manifest_version !== 3) throw new Error('Expected a Manifest V3 extension.');
  const policy = manifest.content_security_policy?.extension_pages;
  if (typeof policy !== 'string') throw new Error('An explicit extension_pages CSP is required.');
  const directives = new Map();
  for (const part of policy.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (!name) continue;
    if (directives.has(name)) throw new Error(`Duplicate CSP directive: ${name}`);
    directives.set(name, sources);
  }
  const safe = new Set(["'self'", "'none'", "'wasm-unsafe-eval'"]);
  const effective = (...names) => names.map(name => directives.get(name)).find(Boolean);
  const checks = [
    ['script-src', effective('script-src', 'default-src')],
    ['object-src', effective('object-src', 'default-src')],
    ['worker-src', effective('worker-src', 'child-src', 'script-src', 'default-src')],
    ...['script-src-elem', 'script-src-attr'].filter(name => directives.has(name)).map(name => [name, directives.get(name)]),
  ];
  for (const [name, sources] of checks) {
    if (!sources) throw new Error(`Missing packaged-code CSP source for ${name}.`);
    for (const source of sources) if (!safe.has(source)) throw new Error(`Unsupported MV3 packaged-code CSP source ${source} in ${name}.`);
  }
  if (manifest.sandbox?.pages?.length) {
    const sandbox = manifest.content_security_policy?.sandbox || '';
    const tokens = sandbox.split(';').map(part => part.trim().split(/\s+/)).find(([name]) => name === 'sandbox');
    if (!tokens || tokens.includes('allow-same-origin')) throw new Error('OCR sandbox must retain an isolated origin.');
  }
}
