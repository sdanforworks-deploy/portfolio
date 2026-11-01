/* ==========================================================================
   LANDING FX  —  scroll-edition motion for the Home view
   (ported from portfolio-website-horeca, which studied horeca-social.com)
   · Selected Work as a sticky card stack: the previous card tilts back + fades
   · "From PIXELS to places" letter zoom: the I floods the screen with ink
   · Experience teaser: gravity-scrubbed title + grid lines drawn in
   · Contact CTA lines unfold (squeeze) as they enter
   · nav slides away while scrolling down, returns on scroll up
   main.js calls LandingFX.init() at the end of boot(); it owns the loader,
   router, language and Lenis — this file only listens (langchange /
   viewchange) and re-measures. Reduced motion: nothing runs, CSS shows the
   static layout.
   ========================================================================== */
(function () {
  'use strict';

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };

  function lang() { return document.documentElement.lang === 'th' ? 'th' : 'en'; }
  function segmenter(g) {
    try { return new Intl.Segmenter(lang(), { granularity: g }); } catch (e) { return null; }
  }

  /* Wrap every word in .fxw > .fxwi. Thai has no spaces, so the word
     segmenter decides the words; inline children (the D-kern span, the CTA's
     em span) stay glued to the word they touch. */
  function splitWords(el) {
    var seg = segmenter('word');
    var words = [], frag = document.createDocumentFragment(), group = [], hasWord = false;
    function flush() {
      if (!group.length) return;
      var w = document.createElement('span'); w.className = 'fxw';
      var wi = document.createElement('span'); wi.className = 'fxwi';
      group.forEach(function (n) { wi.appendChild(n); });
      w.appendChild(wi); frag.appendChild(w); words.push(w);
      group = []; hasWord = false;
    }
    [].slice.call(el.childNodes).forEach(function (n) {
      if (n.nodeType === 3) {
        var parts = seg ? Array.from(seg.segment(n.nodeValue))
          : n.nodeValue.split(/(\s+)/).filter(Boolean).map(function (s) { return { segment: s, isWordLike: !/^\s+$/.test(s) }; });
        parts.forEach(function (s) {
          if (/^\s+$/.test(s.segment)) { flush(); frag.appendChild(document.createTextNode(s.segment)); return; }
          if (s.isWordLike && hasWord) flush();
          group.push(document.createTextNode(s.segment));
          if (s.isWordLike) hasWord = true;
        });
      } else if (n.nodeName === 'BR') { flush(); frag.appendChild(n); }
      else group.push(n);
    });
    flush();
    el.replaceChildren(frag);
    return words;
  }

  function splitChars(el) {
    var seg = segmenter('grapheme');
    var text = el.textContent.trim();
    var parts = seg ? Array.from(seg.segment(text), function (s) { return s.segment; }) : Array.from(text);
    el.textContent = '';
    return parts.map(function (ch) {
      var c = document.createElement('span');
      c.className = 'fxc';
      c.textContent = ch === ' ' ? ' ' : ch;
      el.appendChild(c);
      return c;
    });
  }

  function lines(words) {
    var out = [], top = null;
    words.forEach(function (w) {
      var t = w.offsetTop;
      if (top === null || Math.abs(t - top) > 6) { out.push([]); top = t; }
      out[out.length - 1].push(w);
    });
    return out;
  }

  /* ---------- selected work: sticky stack ---------- */
  function buildStack() {
    var stack = $('.fx-stack');
    if (!stack) return;
    var slides = $$('.fx-slide', stack);
    /* sticky slides report shifted offsets, so every trigger is measured from
       the (non-sticky) stack plus the slide's natural index */
    function at(i, pos) { return function () { return 'top+=' + (i * slides[0].offsetHeight) + ' ' + pos; }; }

    slides.forEach(function (slide, i) {
      gsap.fromTo($('.fx-media img', slide), { scale: 1.3 }, {
        scale: 1, ease: 'none',
        scrollTrigger: { trigger: stack, start: at(i, 'bottom'), end: at(i, 'top'), scrub: true }
      });
      if (i === slides.length - 1) return;
      var card = $('.fx-card', slide);
      var tilt = (i % 2 ? 1 : -1) * (2.5 + (i * 37 % 25) / 10);   // fixed per card, no reshuffle on refresh
      gsap.to(card, {
        rotationZ: tilt, rotationX: 40, scale: 0.7, ease: 'none',
        scrollTrigger: { trigger: stack, start: at(i + 1, 'bottom'), end: at(i + 1, 'top'), scrub: true }
      });
      gsap.to(card, {
        autoAlpha: 0, ease: 'none',
        scrollTrigger: { trigger: stack, start: at(i + 1, '25%'), end: at(i + 1, 'top'), scrub: true }
      });
    });
  }

  /* ---------- letter zoom ---------- */
  function buildLongScroll() {
    $$('[data-fx-longscroll]').forEach(function (sec) {
      var wrap = $('.fx-ls-wrap', sec), top = $('.fx-ls-top', sec), bot = $('.fx-ls-bot', sec);
      var pivot = $('.fx-ls-pivot', sec);
      var dx = 0, smax = 40;
      function measure() {
        gsap.set(wrap, { x: 0, scale: 1 });
        var wr = wrap.getBoundingClientRect(), pr = pivot.getBoundingClientRect();
        if (!pr.width) return;
        var cx = pr.left + pr.width / 2;
        wrap.style.transformOrigin = (cx - wr.left) + 'px ' + (pr.top + pr.height / 2 - wr.top) + 'px';
        dx = window.innerWidth / 2 - cx;
        /* Heming's I is a slab: the stem is ~27% of the glyph box, and it
           must end up wider than the screen */
        smax = Math.max(window.innerWidth * 1.2 / (pr.width * 0.24), window.innerHeight * 1.3 / (pr.height * 0.6));
      }
      var inOut = gsap.parseEase('power2.inOut');
      function render(p) {
        /* 0-0.22: hold the whole phrase still so it can be read;
           0.22-0.85: zoom into the I; after that the screen is flooded */
        var p1 = Math.max(0, Math.min((p - 0.22) / 0.63, 1));
        var filled = p1 >= 1;
        gsap.set(wrap, { x: dx * inOut(p1), scale: 1 + (smax - 1) * Math.pow(p1, 2.6) });
        /* From / To places ride the zoom and only fade once it is under way */
        var fade = Math.max(0, 1 - Math.max(0, p1 - 0.25) * 2.5);
        gsap.set([top, bot], { opacity: fade });
        wrap.style.visibility = filled ? 'hidden' : '';
        sec.classList.toggle('is-filled', filled);
      }
      ScrollTrigger.create({
        trigger: sec, start: 'top top', end: 'bottom bottom',
        onUpdate: function (self) { render(self.progress); },
        onRefreshInit: function () { gsap.set(wrap, { x: 0, scale: 1 }); },
        onRefresh: function (self) { measure(); render(self.progress); }
      });
    });
  }

  /* ---------- experience teaser: gravity title (rebuilt on language swap) ---------- */
  var gravityCtx = null;
  function buildGravity() {
    var box = $('[data-fx-gravity]');
    if (!box) return;
    var title = $('.fx-gravity-title', box);
    gravityCtx = gsap.context(function () {
      var chars = splitChars(title);
      var dist = function () { return Math.max(160, box.clientHeight - title.offsetHeight - window.innerHeight * 0.14); };
      chars.forEach(function (c, i) {
        var r = 0.35 + ((i * 53) % 65) / 100;           // 0.35..1, stable per letter
        gsap.from(c, {
          y: function () { return r * dist(); },
          rotation: ((i * 71) % 28) - 14,
          ease: 'none',
          scrollTrigger: { trigger: box, start: 'top 85%', end: 'bottom bottom', scrub: true, invalidateOnRefresh: true }
        });
      });
    });
  }

  function buildGrid() {
    var cells = $$('.fx-cell');
    cells.forEach(function (cell) {
      gsap.set($('.fx-rule', cell), { scaleX: 0 });
      gsap.set([].slice.call(cell.children, 1), { y: 24, opacity: 0 });
    });
    ScrollTrigger.batch(cells, {
      start: 'top 88%', once: true,
      onEnter: function (batch) {
        batch.forEach(function (cell, i) {
          gsap.timeline({ delay: i * 0.12 })
            .to($('.fx-rule', cell), { scaleX: 1, duration: 1.1, ease: 'power3.inOut' })
            .to([].slice.call(cell.children, 1), { y: 0, opacity: 1, duration: 0.7, stagger: 0.05, ease: 'power3.out' }, 0.3);
        });
      }
    });
    var intro = $('.fx-xp-intro');
    if (intro) gsap.from(intro, { y: 24, opacity: 0, duration: 0.8, ease: 'power3.out', scrollTrigger: { trigger: intro, start: 'top 88%', once: true } });
  }

  /* ---------- toolkit: grid cells + practice pills rise in, staggered ---------- */
  function buildStagger() {
    $$('[data-fx-stagger]').forEach(function (list) {
      var kids = [].slice.call(list.children);
      gsap.set(kids, { y: 30, opacity: 0 });
      ScrollTrigger.batch(kids, {
        start: 'top 92%', once: true,
        onEnter: function (b) { gsap.to(b, { y: 0, opacity: 1, duration: 0.8, stagger: 0.06, ease: 'power3.out' }); }
      });
    });
  }

  /* ---------- squeeze: each line of the CTA unfolds from its top edge ---------- */
  var squeezeCtx = null;
  function buildSqueeze() {
    squeezeCtx = gsap.context(function () {
      $$('[data-fx-squeeze]').forEach(function (el) {
        lines(splitWords(el)).forEach(function (line) {
          var h = line[0].offsetHeight;
          gsap.fromTo(line.map(function (w) { return w.firstChild; }), { scaleY: 0, transformOrigin: '0 0' }, {
            scaleY: 1, ease: 'none',
            scrollTrigger: { trigger: line[0], start: 'top bottom', end: 'top bottom-=' + Math.round(h * 1.6), scrub: true }
          });
        });
      });
    });
  }

  /* ---------- nav: away on scroll down, back on scroll up ---------- */
  function navHide(lenis) {
    var body = document.body, lastY = window.scrollY;
    function sync() {
      var y = window.scrollY, d = y - lastY;
      if (y < 80 || body.classList.contains('intro-lock')) body.classList.remove('nav-hide');
      else if (d > 4) body.classList.add('nav-hide');
      else if (d < -4) body.classList.remove('nav-hide');
      lastY = y;
    }
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('viewchange', function () { body.classList.remove('nav-hide'); lastY = 0; });
  }

  /* ---------- menu: full-screen ultramarine panel, circle wipe from the pill.
     Navigation, not decoration, so it also runs under reduced motion (no wipe).
     View links are routed by main.js (capture listener); in-page anchors by
     its global a[href^="#"] handler — this only opens/closes the panel and
     hands scrolling back to Lenis before those handlers run. ---------- */
  function initMenu(opts) {
    var menu = $('#menu'), openBtn = $('[data-menu-open]'), closeBtn = $('[data-menu-close]');
    if (!menu || !openBtn) return;
    var lenis = opts.lenis, anim = !opts.reduce && !!window.gsap, isOpen = false;
    function at() {
      var r = openBtn.getBoundingClientRect();
      return (r.left + r.width / 2) + 'px ' + (r.top + r.height / 2) + 'px';
    }
    function open() {
      isOpen = true;
      menu.hidden = false;
      openBtn.setAttribute('aria-expanded', 'true');
      if (lenis) lenis.stop();
      document.body.style.overflow = 'hidden';
      if (anim) {
        gsap.killTweensOf(menu);
        gsap.fromTo(menu, { clipPath: 'circle(0% at ' + at() + ')' }, { clipPath: 'circle(150% at ' + at() + ')', duration: 0.9, ease: 'power3.inOut' });
        gsap.fromTo($$('.nv-word', menu), { yPercent: 110 }, { yPercent: 0, duration: 0.9, stagger: 0.06, ease: 'power4.out', delay: 0.25 });
        gsap.fromTo($$('.nv-menu-foot, .nv-no', menu), { opacity: 0 }, { opacity: 1, duration: 0.6, delay: 0.5 });
      } else menu.style.clipPath = 'none';
      if (closeBtn) closeBtn.focus();
    }
    function close(refocus) {
      if (!isOpen) return;
      isOpen = false;
      openBtn.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
      if (lenis) lenis.start();               // scrolling is live again before any link handler runs
      function done() { menu.hidden = true; if (refocus) openBtn.focus(); }
      if (anim) gsap.killTweensOf(menu);
      if (anim) gsap.to(menu, { clipPath: 'circle(0% at ' + at() + ')', duration: 0.6, ease: 'power3.inOut', onComplete: done });
      else done();
    }
    openBtn.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', function () { close(true); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen) close(true); });
    menu.addEventListener('click', function (e) {
      var a = e.target.closest('[data-menu-link]');
      if (!a) return;
      close(false);
      /* "Home" while already home: the router has nothing to swap, so go to the top */
      if (a.getAttribute('href') === '#home' && opts.router && opts.router.current() === 'home') {
        if (lenis) lenis.scrollTo(0, { duration: 1.2 }); else window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  function init(opts) {
    if (!opts) return;
    initMenu(opts);
    if (opts.reduce || !window.gsap || !window.ScrollTrigger) return;
    document.documentElement.classList.add('fx-on');
    gsap.registerPlugin(ScrollTrigger);
    if (opts.lenis && opts.lenis.on) opts.lenis.on('scroll', ScrollTrigger.update);

    buildStack();
    buildLongScroll();
    buildGravity();
    buildGrid();
    buildStagger();
    buildSqueeze();
    navHide(opts.lenis);

    /* main.js swaps [data-th] innerHTML on a language change, which wipes
       the split letters/words: rebuild those two scenes from the new text */
    window.addEventListener('langchange', function () {
      if (gravityCtx) gravityCtx.revert();
      if (squeezeCtx) squeezeCtx.revert();
      buildGravity();
      buildSqueeze();
      ScrollTrigger.refresh();
    });
    /* Home was [hidden] while a sub-page showed: measure again once it's back */
    window.addEventListener('viewchange', function (e) {
      if (e.detail && e.detail.name === 'home') requestAnimationFrame(function () { ScrollTrigger.refresh(); });
    });
    var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    ready.then(function () { ScrollTrigger.refresh(); });
  }

  window.LandingFX = { init: init };
})();
