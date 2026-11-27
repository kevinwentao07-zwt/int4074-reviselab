const paths = {
  home: '<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 21v-7h6v7"/>',
  book: '<path d="M12 7v13M3 5h4a5 5 0 0 1 5 2 5 5 0 0 1 5-2h4v13h-4a6 6 0 0 0-5 2 6 6 0 0 0-5-2H3z"/>',
  trend: '<path d="M4 4v16h16M8 15l4-4 3 2 5-6"/>',
  chart: '<path d="M4 4v16h16M8 15v-3m4 3V8m4 7v-5m4 5V6"/>',
  edit: '<path d="M12 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 5l3 3m-9 7 1-4 7-7a2 2 0 0 1 3 3l-7 7z"/>',
  file: '<path d="M6 3h8l4 4v14H6zM14 3v5h4m-9 4h6m-6 4h6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  star: '<path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2ZM20 16v5m-2.5-2.5h5"/>',
  history: '<path d="M4 11a8 8 0 1 1 2 6M4 6v5h5m3-4v5l3 2"/>',
  save: '<path d="M5 4h12l3 3v13H4V4zM8 4v6h8V4m-8 16v-6h8v6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  photo: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m3 16 4-4 4 4 4-5 6 6"/>',
  camera: '<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="3"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  filter: '<path d="M4 7h16M7 12h10m-7 5h4"/>',
  listen: '<path d="M4 10v4h4l5 4V6l-5 4zm12-1a4 4 0 0 1 0 6m2-8a7 7 0 0 1 0 10"/>',
  mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 11v1a6 6 0 0 0 12 0v-1m-6 7v3m-3 0h6"/>',
  hint: '<path d="M9 17v-2a6 6 0 1 1 6 0v2m-6 0h6m-5 4h4"/>',
  message: '<path d="M4 5h16v12H9l-5 4z"/><path d="M8 9h8m-8 4h5"/>',
  practise: '<path d="M5 7h6V3h3v4h5v5h-3v4h3v3H5v-5h3v-3H5z"/>',
  zoom: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5M10 7.5v5m-2.5-2.5h5"/>',
  delete: '<path d="M4 7h16m-2 0-1 13H7L6 7m3 0V4h6v3m-5 4v5m4-5v5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3m-4 4v2"/>',
};

export function icon(name) {
  if (!paths[name]) return '';
  return `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}
