import { ACTS } from './slides.js';

const $ = (s) => document.querySelector(s);

// Capa HTML: títulos, progreso de la ruta, cabina con HUD y velo de transición
export class UI {
  constructor(slides) {
    this.slides = slides;
    this.slideEl = $('#slide');
    this.kicker = $('#kicker');
    this.title = $('#title');
    this.subtitle = $('#subtitle');
    this.act = $('#act');
    this.counter = $('#counter');
    this.veil = $('#veil');
    this.rain = $('#rain');
    this.scrim = $('#scrim');
    this.canvas = $('#gl');
    this.cockpit = $('#cockpit');
    const ticks = $('#route .ticks');
    this.ticks = slides.map((_, i) => {
      const d = document.createElement('i');
      d.className = 'tick';
      d.style.left = `${(i / (slides.length - 1)) * 100}%`;
      ticks.appendChild(d);
      return d;
    });
    this.fill = $('#route .fill');
    this.planeIcon = $('#route .planeicon');
    this.photos = document.createElement('div');
    this.photos.id = 'practice-photos';
    document.querySelector('#ui').append(this.photos);
    this.points = document.createElement('ul');
    this.points.id = 'practice-points';
    this.slideEl.append(this.points);
    this.buildCockpit();
  }

  show(i) {
    const s = this.slides[i];
    const n = String(i + 1).padStart(2, '0');
    this.kicker.textContent = s.kicker ? `${n} · ${s.kicker}` : n;
    this.title.innerHTML = '';
    const words = s.title.split(' ');
    words.forEach((w, k) => {
      const outer = document.createElement('span');
      outer.className = 'w';
      const inner = document.createElement('span');
      inner.textContent = w;
      inner.style.transitionDelay = `${0.12 + k * 0.06}s`;
      outer.appendChild(inner);
      this.title.appendChild(outer);
      if (k < words.length - 1) this.title.appendChild(document.createTextNode(' '));
    });
    this.title.className = s.title.length > 42 ? 'xlong' : s.title.length > 24 ? 'long' : '';
    this.subtitle.textContent = s.subtitle || '';
    this.points.replaceChildren(...s.points.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
    this.photos.replaceChildren(...s.photos.map(p=>{
      const fig=document.createElement('figure'),img=new Image(),cap=document.createElement('figcaption');
      img.src=p.src;img.alt=p.caption;img.decoding='async';cap.textContent=p.caption;
      fig.append(img,cap);return fig;
    }));
    this.photos.className=s.photos.length>2?'gallery':'pair';
    this.slideEl.className = `pos-${s.pos} with-photos ${s.photos.length>2?'gallery-heading':''}`;
    document.querySelector('#ui').classList.add('content-visible');
    void this.slideEl.offsetWidth;
    this.slideEl.classList.add('in');
    this.act.textContent = ACTS[s.act];
    this.counter.textContent = `${n} / ${this.slides.length}`;
    this.setScrim(s.pos);
    this.setProgress(i);
    document.title = `${s.title} · Práctica profesional`;
  }

  hide() {
    document.querySelector('#ui').classList.remove('content-visible');
    this.slideEl.classList.remove('in');
    this.slideEl.classList.add('out');
    this.scrim.style.opacity = 0;
  }

  setScrim(pos) {
    const g = {
      left: 'radial-gradient(70% 90% at 0% 50%, rgba(5,10,20,0.55), rgba(5,10,20,0) 70%)',
      right: 'radial-gradient(70% 90% at 100% 50%, rgba(5,10,20,0.55), rgba(5,10,20,0) 70%)',
      top: 'radial-gradient(90% 45% at 50% 12%, rgba(5,10,20,0.5), rgba(5,10,20,0) 75%)',
      hud: 'none',
    }[pos];
    this.scrim.style.background = g;
    this.scrim.style.opacity = 1;
  }

  setProgress(i) {
    const f = (i / (this.slides.length - 1)) * 100;
    this.fill.style.width = `${f}%`;
    this.planeIcon.style.left = `${f}%`;
    this.ticks.forEach((t, k) => t.classList.toggle('done', k <= i));
  }

  frame(pose, flight) {
    this.veil.style.opacity = pose.veil.toFixed(3);
    this.rain.style.opacity = (pose.rain * 0.9).toFixed(3);
    if (pose.veil > 0.001) {
      const [r, g, b] = pose.veilColor;
      const c = (x) => Math.round(Math.min(1, x) * 255);
      this.veil.style.background = `radial-gradient(circle at 50% 45%, rgb(${c(r * 1.04)},${c(g * 1.04)},${c(b * 1.04)}), rgb(${c(r * 0.86)},${c(g * 0.86)},${c(b * 0.86)}))`;
    }
    const blur = pose.blur * 16;
    this.canvas.style.filter = blur > 0.2 ? `blur(${blur.toFixed(1)}px)` : '';
    this.cockpit.style.opacity = pose.hud.toFixed(3);
    if (pose.hud > 0.01) {
      this.updateHud(flight);
      this.updateLock(pose.lock, flight.time);
    }
  }

  buildCockpit() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 1600 900');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    svg.innerHTML = `
      <defs>
        <linearGradient id="frm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#151a21"/><stop offset="1" stop-color="#07090c"/></linearGradient>
        <linearGradient id="glare" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2027"/><stop offset="1" stop-color="#090b0e"/></linearGradient>
        <filter id="hg"><feGaussianBlur stdDeviation="1.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <path fill="url(#frm)" fill-rule="evenodd" d="M0 0H1600V900H0Z
        M70 150 L770 92 L770 640 L120 690 Z
        M830 92 L1530 150 L1480 690 L830 640 Z"/>
      <path fill="url(#glare)" d="M0 640 Q800 600 1600 640 V900 H0Z"/>
      <g opacity="0.9">
        <rect x="300" y="720" width="190" height="130" rx="6" fill="#06080b" stroke="#2a3038"/>
        <rect x="520" y="720" width="190" height="130" rx="6" fill="#06080b" stroke="#2a3038"/>
        <rect x="890" y="720" width="190" height="130" rx="6" fill="#06080b" stroke="#2a3038"/>
        <rect x="1110" y="720" width="190" height="130" rx="6" fill="#06080b" stroke="#2a3038"/>
        <rect x="310" y="730" width="170" height="55" fill="#1f63a8"/><rect x="310" y="785" width="170" height="55" fill="#7a4b23"/>
        <line x1="310" y1="785" x2="480" y2="785" stroke="#fff" stroke-width="2"/>
        <circle cx="615" cy="785" r="44" fill="none" stroke="#6ddc8c" stroke-width="2"/>
        <text x="985" y="770" text-anchor="middle" fill="#6ddc8c" font-size="16" font-family="Bahnschrift">N1 92.4</text>
        <text x="985" y="800" text-anchor="middle" fill="#6ddc8c" font-size="16" font-family="Bahnschrift">EGT 612</text>
        <text x="1205" y="790" text-anchor="middle" fill="#e8c35a" font-size="16" font-family="Bahnschrift">NAV · RUTA</text>
        <circle cx="800" cy="700" r="5" fill="#2bd46a"/><circle cx="830" cy="700" r="5" fill="#f2b544"/><circle cx="770" cy="700" r="5" fill="#2bd46a"/>
      </g>
      <g id="hud" filter="url(#hg)" stroke="#8dffc0" fill="none" stroke-width="2">
        <g id="ladder"></g>
        <g id="fpm"><circle cx="800" cy="370" r="11"/><line x1="770" y1="370" x2="789" y2="370"/><line x1="811" y1="370" x2="830" y2="370"/><line x1="800" y1="359" x2="800" y2="347"/></g>
        <rect x="455" y="350" width="86" height="34"/><rect x="1060" y="350" width="100" height="34"/>
        <text id="spd" class="hudtxt" x="498" y="374" text-anchor="middle" stroke="none">250</text>
        <text id="alt" class="hudtxt" x="1110" y="374" text-anchor="middle" stroke="none">11000</text>
        <g id="hdg"></g>
        <text class="hudtxt" x="498" y="406" text-anchor="middle" stroke="none" opacity="0.8">KT</text>
        <text class="hudtxt" x="1110" y="406" text-anchor="middle" stroke="none" opacity="0.8">FT</text>
        <text class="hudtxt" x="560" y="612" stroke="none" opacity="0.85">AP1 · A/THR</text>
        <text class="hudtxt" x="980" y="612" stroke="none" opacity="0.85">LNAV · VNAV</text>
        <g id="lock" opacity="0">
          <g id="seeker"><path d="M0 -46 L46 0 L0 46 L-46 0 Z"/><circle r="5" fill="#8dffc0" stroke="none"/></g>
          <g id="brackets"></g>
          <text id="locktxt" class="hudtxt" x="800" y="632" text-anchor="middle" stroke="none" style="font-size:22px;letter-spacing:0.3em">OBJETIVO FIJADO</text>
        </g>
      </g>`;
    this.cockpit.appendChild(svg);
    this.hud = {
      ladder: svg.querySelector('#ladder'), spd: svg.querySelector('#spd'), alt: svg.querySelector('#alt'), hdg: svg.querySelector('#hdg'),
      lock: svg.querySelector('#lock'), seeker: svg.querySelector('#seeker'), brackets: svg.querySelector('#brackets'), locktxt: svg.querySelector('#locktxt'),
    };
  }

  // Retícula que busca y fija el título: 0 = buscando, 1 = fijado
  updateLock(l, time) {
    const h = this.hud;
    h.lock.setAttribute('opacity', l > 0.001 ? '1' : '0');
    if (l <= 0.001) return;
    const tx = 800, ty = 500;
    const seek = Math.min(l / 0.62, 1);
    const e = 1 - Math.pow(1 - seek, 3);
    // la retícula entra desde arriba a la derecha y zigzaguea hasta el centro
    const wob = (1 - e) * 70;
    const x = 1240 + (tx - 1240) * e + Math.sin(l * 31) * wob;
    const y = 220 + (ty - 220) * e + Math.cos(l * 23) * wob * 0.6;
    const sc = 1.4 - e * 0.5;
    h.seeker.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${((1 - e) * 180 + 45).toFixed(1)}) scale(${sc.toFixed(3)})`);
    h.seeker.setAttribute('opacity', l < 0.75 ? '1' : (1 - (l - 0.75) / 0.25).toFixed(2));
    // corchetes que se cierran alrededor del título
    const c = Math.max(0, Math.min(1, (l - 0.55) / 0.3));
    const ce = 1 - Math.pow(1 - c, 3);
    const hw = 640 - ce * 250, hh = 260 - ce * 140, k = 46;
    let b = '';
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const cx = tx + sx * hw, cy = ty + sy * hh;
      b += `<path d="M${cx - sx * -0} ${cy + -sy * k} L${cx} ${cy} L${cx + -sx * k} ${cy}"/>`;
    }
    h.brackets.innerHTML = b;
    h.brackets.setAttribute('opacity', c > 0 ? (0.4 + ce * 0.6).toFixed(2) : '0');
    h.brackets.setAttribute('stroke-width', (2 + (c >= 1 ? 1 : 0)).toString());
    // texto de confirmación con parpadeo al fijar
    const blink = l >= 1 ? 1 : l > 0.85 ? (Math.sin(time * 18) > 0 ? 1 : 0.2) : 0;
    h.locktxt.setAttribute('opacity', blink.toString());
  }

  updateHud(f) {
    const pxPerDeg = 14;
    const cy = 370 + f.pitch * pxPerDeg;
    let s = '';
    for (let d = -10; d <= 10; d += 5) {
      const y = cy - d * pxPerDeg;
      if (d === 0) s += `<line x1="560" y1="${y}" x2="1040" y2="${y}"/>`;
      else {
        const dash = d < 0 ? ' stroke-dasharray="10 7"' : '';
        s += `<line x1="700" y1="${y}" x2="760" y2="${y}"${dash}/><line x1="840" y1="${y}" x2="900" y2="${y}"${dash}/>`;
        s += `<text class="hudtxt" x="680" y="${y + 5}" text-anchor="end" stroke="none">${Math.abs(d)}</text>`;
      }
    }
    this.hud.ladder.setAttribute('transform', `rotate(${(-f.roll).toFixed(2)} 800 370)`);
    this.hud.ladder.innerHTML = s;
    this.hud.spd.textContent = Math.round(f.speed);
    this.hud.alt.textContent = Math.round(f.alt / 10) * 10;
    let h = '';
    const hdg = f.heading;
    for (let k = -30; k <= 30; k += 5) {
      const v = Math.round(hdg / 5) * 5 + k;
      const x = 800 + (v - hdg) * 9;
      if (x < 560 || x > 1040) continue;
      const big = v % 10 === 0;
      h += `<line x1="${x}" y1="200" x2="${x}" y2="${big ? 186 : 193}"/>`;
      if (big) h += `<text class="hudtxt" x="${x}" y="180" text-anchor="middle" stroke="none">${String(((v % 360) + 360) % 360 / 10).padStart(2, '0')}</text>`;
    }
    h += `<path d="M800 204 l-7 10 h14z" fill="#8dffc0" stroke="none"/>`;
    this.hud.hdg.innerHTML = h;
  }
}
