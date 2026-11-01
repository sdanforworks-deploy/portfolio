// MU case study: optional enhancements. The page reads fine without this file.
(() => {
  const root = document.getElementById('mu-case-study');
  if (!root) return;

  // Fade sections in as they scroll into view.
  const items = root.querySelectorAll('.cs-reveal');
  if ('IntersectionObserver' in window) {
    document.documentElement.classList.add('cs-js');
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px' });
    items.forEach(el => io.observe(el));
  }

  // Dashed connectors between two anchors, redrawn whenever the layout changes.
  // Each pair is [from, to]; the line leaves the bottom of `from` and lands on top of `to`.
  const connectors = [['#cs-anchor-lotus', '#cs-anchor-problem']];
  const NS = 'http://www.w3.org/2000/svg';
  const overlay = document.createElementNS(NS, 'svg');
  overlay.setAttribute('class', 'cs-links');
  overlay.setAttribute('aria-hidden', 'true');
  root.append(overlay);
  const drawLinks = () => {
    overlay.replaceChildren();
    if (innerWidth <= 820) return;
    const base = root.getBoundingClientRect();
    overlay.setAttribute('viewBox', `0 0 ${base.width} ${base.height}`);
    for (const [fromSel, toSel] of connectors) {
      const from = root.querySelector(fromSel), to = root.querySelector(toSel);
      if (!from || !to) continue;
      const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
      const x1 = a.left + a.width / 2 - base.left, y1 = a.bottom - base.top + 6;
      const x2 = b.left + b.width / 2 - base.left, y2 = b.top - base.top - 10;
      const dy = y2 - y1;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', `M${x1} ${y1} C${x1} ${y1 + dy * .95}, ${x2} ${y2 - Math.min(70, dy * .3)}, ${x2} ${y2}`);
      overlay.append(path);
      for (const [cx, cy, cls] of [[x1, y1, 'start'], [x2, y2, 'end']]) {
        const dot = document.createElementNS(NS, 'circle');
        dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('r', cls === 'end' ? 5 : 4);
        dot.setAttribute('class', cls);
        overlay.append(dot);
      }
    }
  };
  drawLinks();
  addEventListener('load', drawLinks);
  // Anchors inside .cs-reveal move 18px when they fade in, so redraw once they settle.
  root.addEventListener('transitionend', e => { if (e.target.classList.contains('cs-reveal')) drawLinks(); });
  if ('ResizeObserver' in window) new ResizeObserver(drawLinks).observe(root);
  document.fonts?.ready.then(drawLinks);

  // Thai / English switch. English lives in the HTML; Thai comes from js/case-study-th.js.
  // A text element is translated when its whole innerHTML matches an English key.
  const norm = s => s.replace(/\s+/g, ' ').trim();
  const thai = new Map((window.CS_TH || []).map(([en, th]) => [norm(en), th]));
  const langBtn = root.querySelector('.cs-lang');
  if (thai.size && langBtn) {
    const hasText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    const targets = [];
    root.querySelectorAll('*').forEach(el => {
      if (!hasText(el) || targets.some(t => t.el.contains(el))) return;
      const th = thai.get(norm(el.innerHTML));
      if (th) targets.push({ el, en: el.innerHTML, th });
    });
    const titles = { en: document.title, th: 'MU — กรณีศึกษา' };
    const setLang = lang => {
      for (const t of targets) t.el.innerHTML = lang === 'th' ? t.th : t.en;
      document.documentElement.lang = lang;
      root.dataset.lang = lang;
      document.title = titles[lang];
      langBtn.textContent = lang === 'th' ? 'EN' : 'ไทย';
      langBtn.setAttribute('aria-label', lang === 'th' ? 'Switch to English' : 'เปลี่ยนเป็นภาษาไทย');
      // shared with the portfolio site (sdn-lang), so both remember one choice
      try { localStorage.setItem('sdn-lang', lang); } catch {}
      drawLinks();
    };
    let start = new URLSearchParams(location.search).get('lang');
    if (start !== 'th' && start !== 'en') { try { start = localStorage.getItem('sdn-lang'); } catch {} }
    if (start !== 'th' && start !== 'en') start = /^th\b/i.test(navigator.language || '') ? 'th' : 'en';
    langBtn.hidden = false;
    langBtn.addEventListener('click', () => setLang(root.dataset.lang === 'th' ? 'en' : 'th'));
    setLang(start === 'th' ? 'th' : 'en');
  }

  // Highlight the current chapter in the top bar.
  const links = [...root.querySelectorAll('.cs-toc a')];
  const byId = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
  if ('IntersectionObserver' in window && links.length) {
    const spy = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        links.forEach(a => a.removeAttribute('aria-current'));
        byId.get(e.target.id)?.setAttribute('aria-current', 'true');
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    byId.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
  }
})();
