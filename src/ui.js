export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function icon(name,size=16) {
  const shapes={
    eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    data:'<path d="M7 3h10v18H7zM10 7h4m-4 5h4m-4 5h4"/>',
    import:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
    export:'<path d="M12 16V3m-4 4 4-4 4 4M4 16v5h16v-5"/>',
    sites:'<path d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z"/>',
    gear:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
    arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',external:'<path d="M14 3h7v7m0-7-11 11M10 3H3v18h18v-7"/>',
    check:'<path d="m5 12 4 4L19 6"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 13 3M5 15a8 8 0 0 0 13 3"/>',
    scan:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5M5 12h14"/>',
    file:'<path d="M14 2H5v20h14V7l-5-5ZM14 2v6h5M8 13h8m-8 4h6"/>',
    copy:'<path d="M8 4H4v15h12v-4M8 2h12v13H8z"/>',
    edit:'<path d="m15 4 5 5M4 20l4.5-1L20 7.5a2.1 2.1 0 0 0-3-3L5.5 16Z"/>',
    trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    plus:'<path d="M12 4v16M4 12h16"/>',
    patients:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3"/>',
    image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
    json:'<path d="M9 3H7a2 2 0 0 0-2 2v4a3 3 0 0 1-2 3 3 3 0 0 1 2 3v4a2 2 0 0 0 2 2h2M15 3h2a2 2 0 0 1 2 2v4a3 3 0 0 0 2 3 3 3 0 0 0-2 3v4a2 2 0 0 1-2 2h-2"/>',
    lens:'<circle cx="12" cy="12" r="9"/><path d="M12 3c4 3 4 6 0 9s-4 6 0 9M3 12c3-4 6-4 9 0s6 4 9 0"/>',
    save:'<path d="M4 3h13l3 3v15H4zM8 3v6h8V3M8 21v-8h8v8"/>',
    chevron:'<path d="m9 5 7 7-7 7"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .5-1.5 1-1.5 2.5M12 17h.01"/>',
    lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name] || ''}</svg>`;
}
