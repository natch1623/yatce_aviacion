(() => {
  'use strict';
  const total = 20;
  const select = document.getElementById('page-select');
  const previous = document.getElementById('previous');
  const next = document.getElementById('next');
  const canvas = document.getElementById('page-canvas');
  const context = canvas.getContext('2d', { alpha: false });
  const paper = document.getElementById('paper');
  const region = document.getElementById('document-region');
  const loading = document.getElementById('loading');
  const error = document.getElementById('error');
  const zoomOut = document.getElementById('zoom-out');
  const zoomIn = document.getElementById('zoom-in');
  const zoomReset = document.getElementById('zoom-reset');
  let current = 1;
  let zoom = 100;
  let request = 0;
  let toastTimer;
  const cache = new Map();

  for (let number = 1; number <= total; number += 1) {
    select.add(new Option(String(number), String(number)));
  }

  function imageFor(number) {
    if (cache.has(number)) return cache.get(number);
    const promise = new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => { cache.delete(number); reject(new Error('Página no disponible')); };
      image.src = `paginas/pagina-${String(number).padStart(2, '0')}.webp`;
    });
    cache.set(number, promise);
    return promise;
  }

  function parseHash() {
    const match = location.hash.match(/^#pagina=(\d+)$/);
    return match ? Math.min(total, Math.max(1, Number(match[1]))) : 1;
  }

  async function showPage(number, scroll = true) {
    const activeRequest = ++request;
    current = Math.min(total, Math.max(1, number));
    select.value = String(current);
    previous.disabled = current === 1;
    next.disabled = current === total;
    canvas.hidden = true;
    loading.hidden = false;
    error.hidden = true;
    region.setAttribute('aria-busy', 'true');
    document.getElementById('loading-text').textContent = `Cargando página ${current}…`;
    document.getElementById('page-caption').textContent = `Página ${current} de ${total}`;
    history.replaceState(null, '', `#pagina=${current}`);
    if (scroll) {
      region.scrollLeft = 0;
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    try {
      const image = await imageFor(current);
      if (activeRequest !== request) return;
      if (!context) throw new Error('Este navegador no admite el visor');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      paper.style.setProperty('--page-ratio', `${canvas.width}/${canvas.height}`);
      context.drawImage(image, 0, 0);
      canvas.setAttribute('aria-label', `Página ${current} de ${total} del informe de práctica profesional de Yatcelys Grajales`);
      canvas.hidden = false;
      loading.hidden = true;
      region.setAttribute('aria-busy', 'false');
      // Keep only the current page and its neighbours in memory on phones.
      for (const key of cache.keys()) if (Math.abs(key - current) > 1) cache.delete(key);
      for (const nearby of [current - 1, current + 1]) {
        if (nearby >= 1 && nearby <= total) imageFor(nearby).catch(() => {});
      }
    } catch (_) {
      if (activeRequest !== request) return;
      loading.hidden = true;
      error.hidden = false;
      region.setAttribute('aria-busy', 'false');
    }
  }

  function changeZoom(value) {
    zoom = Math.max(100, Math.min(250, value));
    document.documentElement.style.setProperty('--zoom', String(zoom / 100));
    zoomReset.textContent = `${zoom}%`;
    zoomOut.disabled = zoom === 100;
    zoomIn.disabled = zoom === 250;
    if (zoom === 100) region.scrollLeft = 0;
  }

  function readingNotice() {
    const toast = document.getElementById('toast');
    toast.textContent = 'Este visor está preparado para lectura en línea.';
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2800);
  }

  previous.addEventListener('click', () => showPage(current - 1));
  next.addEventListener('click', () => showPage(current + 1));
  select.addEventListener('change', () => showPage(Number(select.value)));
  document.getElementById('retry').addEventListener('click', () => showPage(current, false));
  zoomOut.addEventListener('click', () => changeZoom(zoom - 25));
  zoomIn.addEventListener('click', () => changeZoom(zoom + 25));
  zoomReset.addEventListener('click', () => changeZoom(100));
  window.addEventListener('hashchange', () => showPage(parseHash()));
  canvas.addEventListener('contextmenu', event => { event.preventDefault(); readingNotice(); });
  canvas.addEventListener('dragstart', event => event.preventDefault());
  document.addEventListener('keydown', event => {
    // UI deterrents only: public rendered pages can still be saved or captured.
    if ((event.ctrlKey || event.metaKey) && ['s', 'p'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      readingNotice();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest('select,input,textarea,button,[contenteditable]')) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); showPage(current + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); showPage(current - 1); }
    if (event.key === 'Home') { event.preventDefault(); showPage(1); }
    if (event.key === 'End') { event.preventDefault(); showPage(total); }
  });
  showPage(parseHash(), false);
})();
