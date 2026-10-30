(() => {
  'use strict';
  const total = 20;
  const select = document.getElementById('page-select');
  const previous = document.getElementById('previous');
  const next = document.getElementById('next');
  const pages = document.getElementById('pages');
  const toolbar = document.querySelector('.toolbar');
  const region = document.getElementById('document-region');
  const zoomOut = document.getElementById('zoom-out');
  const zoomIn = document.getElementById('zoom-in');
  const zoomReset = document.getElementById('zoom-reset');
  const records = [];
  let current = 1;
  let zoom = 100;
  let scrollFrame = 0;
  let toastTimer;

  for (let number = 1; number <= total; number += 1) {
    select.add(new Option(String(number), String(number)));
    const figure = document.createElement('figure');
    figure.className = 'page';
    figure.id = `pagina-${number}`;
    figure.dataset.page = String(number);
    figure.innerHTML = `<div class="paper" aria-busy="true">
      <canvas role="img" aria-label="Página ${number} de ${total} del informe de práctica profesional de Yatcelys Grajales" hidden></canvas>
      <div class="loading" aria-hidden="true"><span class="spinner"></span><span>Cargando página ${number}…</span></div>
      <div class="error" role="alert" hidden><strong>No se pudo cargar esta página.</strong><p>Comprueba tu conexión y vuelve a intentarlo.</p><button class="retry" data-page="${number}">Reintentar página ${number}</button></div>
    </div><figcaption class="page-number">Página ${number} de ${total}</figcaption>`;
    pages.append(figure);
    records.push({
      number, figure, paper: figure.querySelector('.paper'),
      canvas: figure.querySelector('canvas'), loading: figure.querySelector('.loading'),
      error: figure.querySelector('.error'), state: 'idle', request: 0
    });
  }

  function parseHash() {
    const match = location.hash.match(/^#pagina=(\d+)$/);
    return match ? Math.min(total, Math.max(1, Number(match[1]))) : 1;
  }

  function setCurrent(number) {
    current = Math.min(total, Math.max(1, number));
    select.value = String(current);
    previous.disabled = current === 1;
    next.disabled = current === total;
    document.getElementById('page-caption').textContent = `Página ${current} de ${total}`;
    if (location.hash !== `#pagina=${current}`) history.replaceState(null, '', `#pagina=${current}`);
  }

  async function renderPage(record, retry = false) {
    if (record.state === 'loading' || record.state === 'ready' || (record.state === 'error' && !retry)) return;
    const request = ++record.request;
    record.state = 'loading';
    record.loading.hidden = false;
    record.error.hidden = true;
    record.paper.setAttribute('aria-busy', 'true');
    try {
      const image = await new Promise((resolve, reject) => {
        const source = new Image();
        source.decoding = 'async';
        source.onload = () => resolve(source);
        source.onerror = () => reject(new Error('Página no disponible'));
        const revision = record.number === 1 ? '?v=20261030' : '';
        source.src = `paginas/pagina-${String(record.number).padStart(2, '0')}.webp${revision}`;
      });
      if (request !== record.request) return;
      const context = record.canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Este navegador no admite el visor');
      const width = Math.min(image.naturalWidth, Math.max(850, Math.ceil(record.paper.clientWidth * (window.devicePixelRatio || 1))));
      record.canvas.width = width;
      record.canvas.height = Math.round(width * image.naturalHeight / image.naturalWidth);
      context.drawImage(image, 0, 0, record.canvas.width, record.canvas.height);
      record.canvas.hidden = false;
      record.loading.hidden = true;
      record.paper.setAttribute('aria-busy', 'false');
      record.state = 'ready';
    } catch (_) {
      if (request !== record.request) return;
      record.loading.hidden = true;
      record.error.hidden = false;
      record.paper.setAttribute('aria-busy', 'false');
      record.state = 'error';
    }
  }

  function releasePage(record) {
    if (record.state === 'idle' || record.state === 'error') return;
    // Leave every paper in the scroll layout, but release distant canvas memory.
    record.request += 1;
    record.canvas.hidden = true;
    record.canvas.width = 1;
    record.canvas.height = 1;
    record.state = 'idle';
    record.loading.hidden = false;
    record.paper.setAttribute('aria-busy', 'true');
  }

  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      const record = records[Number(entry.target.dataset.page) - 1];
      if (entry.isIntersecting) renderPage(record);
      else releasePage(record);
    }
  }, { rootMargin: '700px 0px' }) : null;
  for (const record of records) {
    if (observer) observer.observe(record.figure);
    else renderPage(record);
  }

  function updateFromScroll() {
    scrollFrame = 0;
    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 3) {
      setCurrent(total);
      return;
    }
    const readingLine = toolbar.getBoundingClientRect().bottom + Math.min(180, window.innerHeight * 0.2);
    let number = 1;
    for (const record of records) {
      if (record.figure.getBoundingClientRect().top <= readingLine) number = record.number;
      else break;
    }
    setCurrent(number);
  }

  function scheduleScrollUpdate() {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateFromScroll);
  }

  function goToPage(number) {
    setCurrent(number);
    const record = records[current - 1];
    renderPage(record);
    const top = record.figure.getBoundingClientRect().top + window.scrollY - toolbar.offsetHeight - 16;
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
    scheduleScrollUpdate();
  }

  function changeZoom(value) {
    const record = records[current - 1];
    const bounds = record.figure.getBoundingClientRect();
    const readingOffset = toolbar.offsetHeight + 16;
    const fraction = Math.max(0, Math.min(1, (readingOffset - bounds.top) / bounds.height));
    zoom = Math.max(100, Math.min(250, value));
    document.documentElement.style.setProperty('--zoom', String(zoom / 100));
    zoomReset.textContent = `${zoom}%`;
    zoomOut.disabled = zoom === 100;
    zoomIn.disabled = zoom === 250;
    if (zoom === 100) region.scrollLeft = 0;
    requestAnimationFrame(() => {
      const updated = record.figure.getBoundingClientRect();
      window.scrollTo({ top: updated.top + window.scrollY + updated.height * fraction - readingOffset, behavior: 'instant' });
      for (const candidate of records) {
        const box = candidate.figure.getBoundingClientRect();
        if (candidate.state === 'ready' && box.bottom >= -700 && box.top <= window.innerHeight + 700) {
          candidate.state = 'idle';
          renderPage(candidate);
        }
      }
      scheduleScrollUpdate();
    });
  }

  function readingNotice() {
    const toast = document.getElementById('toast');
    toast.textContent = 'Este visor está preparado para lectura en línea.';
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2800);
  }

  previous.addEventListener('click', () => goToPage(current - 1));
  next.addEventListener('click', () => goToPage(current + 1));
  select.addEventListener('change', () => goToPage(Number(select.value)));
  pages.addEventListener('click', event => {
    const retry = event.target.closest('.retry');
    if (retry) renderPage(records[Number(retry.dataset.page) - 1], true);
  });
  zoomOut.addEventListener('click', () => changeZoom(zoom - 25));
  zoomIn.addEventListener('click', () => changeZoom(zoom + 25));
  zoomReset.addEventListener('click', () => changeZoom(100));
  window.addEventListener('hashchange', () => goToPage(parseHash()));
  window.addEventListener('scroll', scheduleScrollUpdate, { passive: true });
  window.addEventListener('resize', scheduleScrollUpdate, { passive: true });
  pages.addEventListener('contextmenu', event => {
    if (event.target.matches('canvas')) { event.preventDefault(); readingNotice(); }
  });
  pages.addEventListener('dragstart', event => event.preventDefault());
  document.addEventListener('keydown', event => {
    // UI deterrents only: public rendered pages can still be saved or captured.
    if ((event.ctrlKey || event.metaKey) && ['s', 'p'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      readingNotice();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest('select,input,textarea,button,[contenteditable]')) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); goToPage(current + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); goToPage(current - 1); }
    if (event.key === 'Home') { event.preventDefault(); goToPage(1); }
    if (event.key === 'End') { event.preventDefault(); goToPage(total); }
  });
  const initial = parseHash();
  setCurrent(initial);
  renderPage(records[initial - 1]);
  if (initial > 1) requestAnimationFrame(() => goToPage(initial));
})();
