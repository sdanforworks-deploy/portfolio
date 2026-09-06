/* ==========================================================================
   NEXSTUDIO-STYLE — interactions
   loader (000->100) -> intro clip plays -> hero text animates in on clip end
   -> the rest of the page scrolls up over the (now fixed) clip.
   Lenis smooth scroll · custom cursor · IntersectionObserver reveals · parallax
   ========================================================================== */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var body   = document.body;

  /* ====================================================================
     1. LOADING SCREEN  —  000 -> 100
     ==================================================================== */
  var loader   = document.getElementById('loader');
  var countEl  = document.getElementById('loaderCount');
  var barEl    = document.getElementById('loaderBar');
  var LOAD_MS  = 1500;

  function pad(n) { return ('000' + n).slice(-3); }

  function runLoader(done) {
    if (reduce || !loader) { if (loader) loader.style.display = 'none'; done(); return; }
    var start = performance.now();
    var ended = false;
    function finish() {
      if (ended) return;
      ended = true;
      countEl.textContent = '100';
      if (barEl) barEl.style.transform = 'scaleX(1)';
      setTimeout(done, 200);          // short beat on "100", then the fold
    }
    // rAF drives the smooth count while the tab is foregrounded; the value is
    // wall-clock based (performance.now - start) so it stays truthful
    (function tick() {
      if (ended) return;
      var t = Math.min(1, (performance.now() - start) / LOAD_MS);
      var e = 1 - Math.pow(1 - t, 1.8);
      countEl.textContent = pad(Math.round(e * 100));
      if (barEl) barEl.style.transform = 'scaleX(' + e.toFixed(4) + ')';
      if (t < 1) requestAnimationFrame(tick);
      else finish();
    })();
    // hard cap on wall-clock: rAF is paused on a backgrounded tab, but this
    // still fires — so the loader never stretches far past its budget (was +600)
    setTimeout(finish, LOAD_MS + 150);
  }

  /* ====================================================================
     1b. LAUNCH TRANSITION  (~1.7s, tightened)
        100 -> the divider folds into a receding-perspective V and "You've
        Entered My Orbit" rises at the apex; the clip starts playing BEHIND
        the loader; the paper ground drops out so the clip shows through;
        the V + title lift off; then revealHome() hands over — the hero text
        animates in while the last ~1.5s of the (3x) clip plays behind it.
        Pure CSS transitions for the visuals; setTimeout only flips phases.
     ==================================================================== */
  function runLaunch(done) {
    try { performance.mark('launch-start'); } catch (e) {}
    var revealed = false;
    function revealHome() {
      if (revealed) return;
      revealed = true;
      body.classList.remove('intro-lock');
      body.classList.add('intro-done');   // fires the hero .line-in transitions
      try { performance.mark('hero-in'); } catch (e) {}   // perf probe: time from nav start to a usable Home
      if (!reduce) unlockScroll();
      window.scrollTo(0, 0);
      done();                             // = boot
    }

    if (reduce || !loader) { playClip(); revealHome(); return; }

    loader.classList.add('launch');                                     // 0: V folds + "You've Entered My Orbit" rises (~0.8s)
    setTimeout(playClip, 500);                                          // clip starts playing behind the (still opaque) loader
    setTimeout(function () { loader.classList.add('liftoff'); }, 760);  // catch the rise while it still has velocity (no micro-pause at the apex)
    setTimeout(function () { loader.classList.add('clip-in'); }, 1320); // paper ground dissolves only AFTER the V's 0.62s glide (from 760) has cleared frame
    setTimeout(function () { loader.classList.add('gone'); }, 1560);
    setTimeout(revealHome, 1660);                                       // hero text animates in; clip still playing behind
    setTimeout(function () { if (loader) loader.style.display = 'none'; }, 2200);
    setTimeout(revealHome, 2600);                                       // safety
  }

  /* ====================================================================
     2. INTRO CLIP
     ==================================================================== */
  var intro   = document.getElementById('intro');
  var vid     = document.getElementById('introVideo');
  var skipBtn = document.getElementById('introSkip');
  var clipSettled = false;
  var INTRO_RATE = 3;   // play the clip at 3x — it runs behind the hero, not as a gate

  // Hard scroll lock for the loader + intro: overflow:hidden alone doesn't stop
  // a wheel gesture from being buffered, so also swallow the events. NO gesture
  // skips the intro any more — only the button / Esc — so entering the site
  // always lands on the top of the hero.
  function blockScroll(e) { e.preventDefault(); }
  function lockScroll() {
    window.addEventListener('wheel', blockScroll, { passive: false });
    window.addEventListener('touchmove', blockScroll, { passive: false });
    window.addEventListener('keydown', blockScrollKeys, { passive: false });
  }
  function unlockScroll() {
    window.removeEventListener('wheel', blockScroll, { passive: false });
    window.removeEventListener('touchmove', blockScroll, { passive: false });
    window.removeEventListener('keydown', blockScrollKeys, { passive: false });
  }
  function blockScrollKeys(e) {
    if (['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' ','Spacebar'].indexOf(e.key) !== -1) e.preventDefault();
  }

  // freeze the clip on its last frame — it stays as the hero's fixed backdrop.
  // Called on the video's own 'ended', or early via Skip / Esc. Does NOT gate
  // the page: revealHome() (in runLaunch) has already handed control over.
  function settleClip() {
    if (clipSettled) return;
    clipSettled = true;
    try { performance.mark('clip-settled'); } catch (e) {}
    if (vid) {
      try {
        if (!vid.ended && isFinite(vid.duration)) vid.currentTime = Math.max(0, vid.duration - 0.05);
        vid.pause();
        vid.playbackRate = 1;
      } catch (e) {}
    }
    if (intro) { intro.classList.remove('playing'); intro.classList.add('settled'); }
    window.removeEventListener('keydown', onEscSettle);
  }
  function onEscSettle(e) { if (e.key === 'Escape') settleClip(); }

  // start the clip playing BEHIND the loader/hero (no callback — it's ambient)
  function playClip() {
    if (reduce || !intro || !vid) { settleClip(); return; }
    intro.classList.add('playing');
    if (skipBtn) skipBtn.addEventListener('click', settleClip);
    vid.addEventListener('ended', settleClip);
    window.addEventListener('keydown', onEscSettle);

    try { vid.playbackRate = INTRO_RATE; } catch (e) {}
    var p = vid.play();
    if (p) {
      p.then(function () { try { vid.playbackRate = INTRO_RATE; } catch (e) {} })
       .catch(function () { settleClip(); });          // autoplay blocked → just show the last frame
    }
    // safety: 8s clip / 3x ≈ 2.7s of play — generous buffer, never leave it running
    setTimeout(settleClip, 12000);
  }

  /* ====================================================================
     3. LENIS SMOOTH SCROLL
     ==================================================================== */
  var lenis = null;
  var router = null;

  function initLenis() {
    if (reduce || typeof Lenis === 'undefined') return;
    lenis = new Lenis({
      duration: 1.15,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
      smoothWheel: true,
      wheelMultiplier: 0.95,
      touchMultiplier: 1.6
    });
    function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    if (a.hasAttribute('data-view-link')) return;   // the router (below) owns these
    var id = a.getAttribute('href');
    if (id.length < 2) return;
    var target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    // which view owns the target? (#scroll = home; #view-projects / #view-experience = sub)
    var tView = target.closest('.view');
    var targetIsHome = !tView || tView.id === 'scroll';
    // if the target lives in a view that isn't up, switch to it first
    if (router && targetIsHome && router.current() !== 'home') {
      router.show('home');
      setTimeout(function () {
        if (lenis) lenis.scrollTo(target, { offset: 0, duration: 1.2 });
        else target.scrollIntoView();
      }, 80);
      return;
    }
    // target is in the currently-shown view (home section, or a projects/xp
    // section clicked from that view's own dot column) → just scroll to it
    if (lenis) lenis.scrollTo(target, { offset: 0, duration: 1.4 });
    else target.scrollIntoView({ behavior: 'smooth' });
  });

  /* ====================================================================
     4. SPACESHIP CURSOR  —  turns toward travel direction, thruster trail,
        cross-fading states (default / pointer / grab / grabbing)
     ==================================================================== */
  var cursor = document.getElementById('cursor');
  var ship   = document.getElementById('cursorShip');
  var trailC = document.getElementById('cursorTrail');
  var fine   = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (cursor && ship && fine && !reduce) {
    var STATE_SRC = {
      'default':  'assets/cursor/cursor.svg',
      'pointer':  'assets/cursor/pointer.svg',
      'grab':     'assets/cursor/grab.svg',
      'grabbing': 'assets/cursor/grabbing.svg'
    };
    var NOSE_DEG = 90;               // the rocket art points straight up (nose at -90deg)
    var POINTER_SEL = 'a, button, [role="button"], [data-cursor], summary, label, input, textarea, select,' +
                      '.work-tab, .projects-catnav button, .section-dot, .cf-prev, .cf-next, [data-view-link]';

    var labelEl = document.createElement('span');
    labelEl.className = 'cursor-label';
    cursor.appendChild(labelEl);

    var layers = ship.querySelectorAll('.cursor-layer');
    var front = 0;                    // index of the visible layer
    var state = 'default';
    function setState(next) {
      if (next === state) return;
      state = next;
      var incoming = layers[front ^ 1];
      incoming.src = STATE_SRC[next];
      layers[front].classList.remove('is-front');
      incoming.classList.add('is-front');
      front ^= 1;
    }

    // pointer position + smoothed render position + travel direction
    var tx = window.innerWidth / 2, ty = window.innerHeight / 2;
    var mx = tx, my = ty, px = tx, py = ty;
    var ang = -Math.PI * 0.75, targAng = ang;   // radians
    var down = false, overCf = false, overPt = false;

    window.addEventListener('mousemove', function (e) {
      tx = e.clientX; ty = e.clientY;
      var el = e.target;
      overCf = !!(el.closest && el.closest('.cf') && !el.closest('.cf-prev, .cf-next'));
      overPt = !!(el.closest && el.closest(POINTER_SEL));
      resolveState();
      var lab = el.closest && el.closest('[data-cursor]');
      var txt = lab && lab.getAttribute('data-cursor');
      if (txt) { labelEl.textContent = txt; cursor.classList.add('has-label'); }
      else cursor.classList.remove('has-label');
    }, { passive: true });

    window.addEventListener('mousedown', function () { down = true; resolveState(); });
    window.addEventListener('mouseup',   function () { down = false; resolveState(); });
    document.addEventListener('mouseleave', function () { cursor.style.opacity = '0'; trailC.style.opacity = '0'; });
    document.addEventListener('mouseenter', function () { cursor.style.opacity = '1'; trailC.style.opacity = '1'; });

    function resolveState() {
      if (down && overCf) return setState('grabbing');
      if (overPt) return setState('pointer');
      if (overCf) return setState('grab');
      setState('default');
    }

    /* ---- thruster trail (canvas) ---- */
    var ctx = trailC.getContext('2d'), dpr = Math.min(window.devicePixelRatio || 1, 2);
    function sizeCanvas() {
      trailC.width = window.innerWidth * dpr;
      trailC.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    sizeCanvas();
    window.addEventListener('resize', sizeCanvas);
    var parts = [];
    var NOZZLE = 27;   // px from the nose down the body to the thruster
    // Each particle only carries `back` (px behind the nozzle) in the SHIP'S
    // frame and is redrawn from the ship's CURRENT position + axis every frame —
    // NO sideways component at all, so the exhaust is a column dead-centre
    // behind the nose whatever the mouse did to get there.
    function emit() {
      parts.push({
        back: Math.random() * 4,
        grow: 2.6 + Math.random() * 2.3,
        life: 1, decay: 0.05 + Math.random() * 0.035,
        r: 3.7 + Math.random() * 3.0
      });
      if (parts.length > 110) parts.shift();
    }

    (function loop() {
      // follow with a heavy lag — the ship drifts well behind the pointer
      px = mx; py = my;
      mx += (tx - mx) * 0.17;
      my += (ty - my) * 0.17;
      var dx = mx - px, dy = my - py, sp = Math.sqrt(dx * dx + dy * dy);

      // slowly bank toward the direction of travel; hold heading when idle
      if (sp > 0.2) targAng = Math.atan2(dy, dx);
      var d = ((targAng - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI;   // shortest turn
      ang += d * (Math.abs(d) > 0.9 ? 0.26 : 0.14);
      var offAxis = Math.abs(((targAng - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);

      cursor.style.transform = 'translate(' + mx.toFixed(2) + 'px,' + my.toFixed(2) + 'px)';
      ship.style.transform = 'rotate(' + (ang * 180 / Math.PI + NOSE_DEG).toFixed(1) + 'deg)';

      // fire when roughly aligned — the plume is drawn on the current axis so it
      // can't spray sideways, but easing it off during a hard bank reads as the
      // ship throttling down to turn
      if (sp > 0.6 && offAxis < 0.7) {
        var n = Math.min(3, 1 + (sp * 0.22) | 0);
        for (var i = 0; i < n; i++) emit();
      }

      // unit axis straight astern of the CURRENT nose
      var bx = Math.cos(ang + Math.PI), by = Math.sin(ang + Math.PI);

      ctx.clearRect(0, 0, trailC.width, trailC.height);
      ctx.globalCompositeOperation = 'lighter';
      for (var j = parts.length - 1; j >= 0; j--) {
        var p = parts[j];
        p.back += p.grow; p.grow *= 0.95;
        p.life -= p.decay;
        if (p.life <= 0) { parts.splice(j, 1); continue; }
        var dist = NOZZLE + p.back;
        var pxp = mx + bx * dist;   // dead-centre on the ship axis
        var pyp = my + by * dist;
        var rad = p.r * (0.35 + p.life * 0.9);
        var g = ctx.createRadialGradient(pxp, pyp, 0, pxp, pyp, rad);
        var a = p.life;
        g.addColorStop(0,   'rgba(244,233,214,' + (a * 0.62).toFixed(3) + ')');   /* soft warm white */
        g.addColorStop(0.45,'rgba(210,158,112,' + (a * 0.34).toFixed(3) + ')');   /* muted amber */
        g.addColorStop(1,   'rgba(176,124,84,0)');                                /* faded ember */
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(pxp, pyp, rad, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      requestAnimationFrame(loop);
    })();
  } else {
    if (cursor) cursor.style.display = 'none';
    if (trailC) trailC.style.display = 'none';
  }

  /* ====================================================================
     5. SCROLL-TRIGGERED REVEALS
     ==================================================================== */
  function initReveals() {
    // sub-page lists get their reveal markup here so the HTML stays clean —
    // each item fades + rises as its group scrolls in, staggered within the group
    function autoReveal(selector, step, extra) {
      var groups = [];
      [].forEach.call(document.querySelectorAll(selector), function (el) {
        var p = el.parentNode, rec = null;
        for (var k = 0; k < groups.length; k++) if (groups[k].p === p) { rec = groups[k]; break; }
        if (!rec) { rec = { p: p, n: 0 }; groups.push(rec); }
        el.classList.add('reveal');
        if (extra) el.classList.add(extra);
        if (step) el.style.transitionDelay = (rec.n * step).toFixed(3) + 's';
        rec.n++;
      });
    }
    autoReveal('.projects-grid > .project-card-full', 0.05);   // Projects: card grid
    autoReveal('.xp-timeline > li', 0.06);                     // Experience: career timeline
    autoReveal('.xp-contact > a', 0.06);                       // Experience: contact rows
    autoReveal('.xp-block > .xp-label', 0, 'reveal-sm');       // Experience: section labels
    autoReveal('.xp-edu-row', 0);                              // Experience: education row
    autoReveal('.xp-sub-group', 0.06);                         // Experience: skills sub-groups
    autoReveal('.xp-hero-text > :not(.page-back)', 0.07);      // Experience: first-section text column cascade
    autoReveal('.xp-hero-text > .page-title', 0, 'reveal-lg'); // …with the title carrying a touch more travel

    var items = [].slice.call(document.querySelectorAll('.reveal'));
    var words = [].slice.call(document.querySelectorAll('.about-lede .reveal-word'));
    words.forEach(function (w, i) { w.style.transitionDelay = (i * 0.028).toFixed(3) + 's'; });

    if (reduce || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ====================================================================
     5b. SECTION DOTS  —  keep the active dot in sync with the scroll.
     The dots are plain <a href="#id"> links; the global a[href^="#"]
     handler above already does the smooth-scroll (and view swap if you
     click one from a sub-page), so this only tracks which section owns
     the viewport centre.
     ==================================================================== */
  function initSectionDots() {
    // one dot column per view; each only scroll-spies while its view is up
    var COLUMNS = [
      { id: 'sectionDots',  live: function () { return !body.classList.contains('view-sub'); } },
      { id: 'projectsDots', live: function () { return body.classList.contains('view-projects'); } },
      { id: 'xpDots',       live: function () { return body.classList.contains('view-experience'); } }
    ];

    COLUMNS.forEach(function (col) {
      var wrap = document.getElementById(col.id);
      if (!wrap) return;
      var entries = [].slice.call(wrap.querySelectorAll('.section-dot'))
        .map(function (d) {
          var id = d.getAttribute('href').slice(1);
          return { dot: d, id: id, sec: document.getElementById(id) };
        })
        .filter(function (e) { return e.sec; });
      if (!entries.length) return;

      var currentId = null;
      function sync() {
        if (!col.live()) return;
        // the current section = the last one whose top has scrolled above a
        // line at ~1/3 viewport height (robust for very tall or very short
        // sections — a short section like Education still gets its turn)
        var line = window.innerHeight * 0.33;
        var best = entries[0].id;
        entries.forEach(function (e) {
          if (e.sec.getBoundingClientRect().top - line <= 0) best = e.id;
        });
        // at the bottom of the page the last section can't reach the line — force it
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
          best = entries[entries.length - 1].id;
        }
        if (best === currentId) return;
        currentId = best;
        entries.forEach(function (e) {
          var on = e.id === best;
          e.dot.classList.toggle('is-active', on);
          if (on) e.dot.setAttribute('aria-current', 'true');
          else e.dot.removeAttribute('aria-current');
        });
      }

      sync();
      if (lenis && lenis.on) lenis.on('scroll', sync);
      window.addEventListener('scroll', sync, { passive: true });
      window.addEventListener('resize', sync);   // router.show() fires resize on every view swap → re-syncs the newly-shown column
    });
  }

  /* ====================================================================
     6. PARALLAX on the work preview shots
     ==================================================================== */
  var shots = [].slice.call(document.querySelectorAll('.browser-shot'));
  function parallax() {
    if (reduce) return;
    var vh = window.innerHeight;
    for (var i = 0; i < shots.length; i++) {
      var r = shots[i].getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) continue;
      var p = (r.top + r.height / 2 - vh / 2) / vh;
      shots[i].style.transform = 'scale(1.06) translateY(' + (p * -22).toFixed(2) + 'px)';
    }
  }

  /* ====================================================================
     7. SCROLL-GATED letter reveal for the hero name
        "Dan Sungvornveshapan" starts at 20 %. Scrolling down doesn't move
        the page yet — it fills the name letter by letter to 100 %; only then
        does normal scrolling resume. Scrolling back to the top reverses it.
     ==================================================================== */
  function initNameGate() {
    var nameEl = document.querySelector('.hero-name');
    if (!nameEl || reduce) return;
    var chars = [].slice.call(nameEl.querySelectorAll('.ch'));
    if (!chars.length) return;

    var N = chars.length;
    var progress = 0;                       // 0..1
    var armed = true;
    var FILL_PX = Math.max(760, N * 60);    // wheel px to fill the whole name

    function apply() {
      for (var i = 0; i < N; i++) {
        var local = (progress * N) - i;     // >=1 lit, <=0 not yet
        chars[i].style.opacity = (0.1 + 0.9 * Math.max(0, Math.min(1, local))).toFixed(3);
      }
    }
    apply();

    function atTop() {
      return (window.pageYOffset || document.documentElement.scrollTop || 0) <= 1;
    }
    function drive(delta, ev) {
      if (!armed) return;
      if (router && router.current && router.current() !== 'home') return;  // gate is a home-view thing
      if (delta > 0 && progress >= 1) { armed = false; if (lenis) lenis.start(); return; }
      if (delta < 0 && progress <= 0) { if (lenis) lenis.start(); return; }
      if (ev && ev.cancelable) ev.preventDefault();
      if (lenis) lenis.stop();
      progress = Math.max(0, Math.min(1, progress + delta / FILL_PX));
      apply();
      if (progress >= 1) { armed = false; if (lenis) lenis.start(); }
    }

    window.addEventListener('wheel', function (e) { drive(e.deltaY, e); }, { passive: false });

    var ty = 0;
    window.addEventListener('touchstart', function (e) {
      if (e.touches.length) ty = e.touches[0].clientY;
    }, { passive: true });
    window.addEventListener('touchmove', function (e) {
      if (!armed || !e.touches.length) return;
      var y = e.touches[0].clientY;
      drive(ty - y, e);
      ty = y;
    }, { passive: false });

    function maybeRearm() {
      if (!armed && progress > 0 && atTop()) armed = true;
    }
    window.addEventListener('scroll', maybeRearm, { passive: true });
    if (lenis && lenis.on) lenis.on('scroll', maybeRearm);
  }

  /* ====================================================================
     8. SELECTED WORK — category tabs + coverflow carousel
        Vanilla port of a React/shadcn coverflow: one fractional index
        (`pos`) is the source of truth; paint() folds each card's distance
        into the shorter way round the ring (that IS the loop — no cloned
        nodes) and writes translateX / translateZ / rotateY / opacity
        straight to the DOM. Pointer drag throws; settle() is an
        exponential ease-out toward the nearest whole card.
     ==================================================================== */
  function initWork() {
    var section = document.getElementById('work');
    if (!section) return;
    var tabs = [].slice.call(section.querySelectorAll('.work-tab'));
    var cats = [].slice.call(section.querySelectorAll('.work-cat'));
    var flows = {};

    function kern(s) { return s.replace(/D(?=[A-Za-z])/g, '<span class="kd">D</span>'); }

    function createCoverflow(root) {
      var frame   = root.querySelector('.cf');
      var cards   = [].slice.call(root.querySelectorAll('.cf-card'));
      var caption = root.querySelector('.cf-caption');
      var dotsWrap= root.querySelector('.cf-dots');
      var prevBtn = root.querySelector('.cf-prev');
      var nextBtn = root.querySelector('.cf-next');
      var count   = cards.length;

      var ROTATE = 40, DEPTH = 0.55, FALLOFF = 0.56, FADE = 0.12, GAP = 0.06;
      var loop = count > 2;

      var pos = 0, target = 0, width = 0, raf = null, selected = -1, drag = null;

      function indexAt(p) { return ((Math.round(p) % count) + count) % count; }

      function paint() {
        if (!width) return;
        var pitch = width * (1 + GAP);
        for (var i = 0; i < count; i++) {
          var card = cards[i];
          var offset = i - pos;
          if (loop) {
            offset = ((offset % count) + count) % count;
            if (offset > count / 2) offset -= count;
          }
          var dist = Math.abs(offset);
          var ramp = Math.pow(dist, FALLOFF);
          var dir  = offset < 0 ? -1 : (offset > 0 ? 1 : 0);
          var tilt = Math.min(ROTATE * ramp, 82) * dir;
          card.style.transform =
            'translateX(calc(-50% + ' + (offset * pitch).toFixed(2) + 'px)) ' +
            'translateZ(' + (-DEPTH * width * ramp).toFixed(2) + 'px) ' +
            'rotateY(' + (-tilt).toFixed(2) + 'deg)';
          var edge = loop ? Math.min(1, Math.max(0, count / 2 - dist)) : 1;
          card.style.opacity = String(Math.max(0, 1 - FADE * dist) * edge);
          card.style.zIndex = String(100 - Math.round(dist));
          card.classList.toggle('is-active', dist < 0.5);
        }
        var idx = indexAt(pos);
        if (idx !== selected) { selected = idx; renderCaption(idx); syncDots(idx); }
      }

      function renderCaption(idx) {
        if (!caption) return;
        var card = cards[idx];
        var no = ('0' + (idx + 1)).slice(-2);
        var scope = (card.getAttribute('data-scope') || '').split('·')
          .map(function (s) { return s.trim(); }).filter(Boolean)
          .map(function (s) { return '<span>' + kern(s) + '</span>'; }).join('');
        // project link -> the real case-study page (slug derived from the cover filename)
        var img = card.querySelector('img');
        var slug = img ? (img.getAttribute('src') || '').split('/').pop().replace(/\.[a-z0-9]+$/i, '') : '';
        var link = slug
          ? '<a class="cf-link" href="case-' + slug + '.html" data-cursor>View project <span aria-hidden="true">&#8594;</span></a>'
          : '';
        var org = card.getAttribute('data-org');
        caption.innerHTML =
          '<span class="cf-no">' + no + '</span>' +
          '<h3 class="cf-title">' + kern(card.getAttribute('data-title') || '') + '</h3>' +
          (org ? '<p class="cf-org">' + org + '</p>' : '') +
          '<p class="cf-desc">' + (card.getAttribute('data-desc') || '') + '</p>' +
          (scope ? '<p class="cf-scope">' + scope + '</p>' : '') +
          link;
      }

      function syncDots(idx) {
        if (!dotsWrap) return;
        var dd = dotsWrap.children;
        for (var i = 0; i < dd.length; i++) dd[i].classList.toggle('is-on', i === idx);
      }

      function settle(to) {
        if (raf !== null) cancelAnimationFrame(raf);
        target = to;
        if (reduce) { pos = to; paint(); raf = null; return; }
        (function step() {
          var rem = target - pos;
          if (Math.abs(rem) < 0.0004) { pos = target; paint(); raf = null; return; }
          pos += rem * 0.16;                 // exponential ease-out
          paint();
          raf = requestAnimationFrame(step);
        })();
      }

      function clampPos(p) { return loop ? p : Math.max(0, Math.min(count - 1, p)); }
      function nudge(by) { settle(clampPos(Math.round(target) + by)); }
      function goTo(i) {
        var to = loop ? i + Math.round((target - i) / count) * count : i;
        settle(clampPos(to));
      }
      function measure() {
        if (cards[0]) width = cards[0].offsetWidth;
        paint();
      }

      if (count > 1) {
        frame.addEventListener('pointerdown', function (e) {
          if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
          try { frame.setPointerCapture(e.pointerId); } catch (err) {}
          target = pos;
          drag = { id: e.pointerId, x: e.clientX, pos: pos, v: 0, t: performance.now() };
        });
        frame.addEventListener('pointermove', function (e) {
          if (!drag || drag.id !== e.pointerId) return;
          var pitch = width * (1 + GAP);
          if (!pitch) return;
          var now = performance.now();
          var prev = pos;
          pos = clampPos(drag.pos - (e.clientX - drag.x) / pitch);
          drag.v = ((pos - prev) / Math.max(now - drag.t, 1)) * 1000;   // cards/sec
          drag.t = now;
          paint();
        });
        var release = function (e) {
          if (!drag || drag.id !== e.pointerId) return;
          var v = drag.v; drag = null;
          var carried = Math.max(-2, Math.min(2, v * 0.18));            // flick, capped at 2
          settle(clampPos(Math.round(pos + carried)));
        };
        frame.addEventListener('pointerup', release);
        frame.addEventListener('pointercancel', function (e) {
          if (!drag || drag.id !== e.pointerId) return;
          drag = null;
          settle(clampPos(Math.round(pos)));
        });
        frame.addEventListener('keydown', function (e) {
          if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-1); }
          else if (e.key === 'ArrowRight') { e.preventDefault(); nudge(1); }
        });
        if (prevBtn) prevBtn.addEventListener('click', function () { nudge(-1); });
        if (nextBtn) nextBtn.addEventListener('click', function () { nudge(1); });
        if (dotsWrap) {
          for (var d = 0; d < count; d++) {
            (function (di) {
              var b = document.createElement('button');
              b.type = 'button';
              b.className = 'cf-dot';
              b.setAttribute('aria-label', 'Go to project ' + (di + 1));
              b.addEventListener('click', function () { goTo(di); });
              dotsWrap.appendChild(b);
            })(d);
          }
        }
      } else {
        var nav = root.querySelector('.cf-nav');
        if (nav) nav.style.display = 'none';
        if (frame) frame.style.cursor = 'default';
      }

      return { measure: measure };
    }

    cats.forEach(function (cat) {
      flows[cat.getAttribute('data-cat')] = createCoverflow(cat);
    });

    function activate(name) {
      tabs.forEach(function (t) {
        var on = t.getAttribute('data-cat') === name;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      cats.forEach(function (c) {
        c.classList.toggle('is-active', c.getAttribute('data-cat') === name);
      });
      var f = flows[name];
      if (f) requestAnimationFrame(f.measure);   // now visible -> real card width
    }

    tabs.forEach(function (t) {
      t.addEventListener('click', function () { activate(t.getAttribute('data-cat')); });
    });

    function measureAll() {
      Object.keys(flows).forEach(function (k) { flows[k].measure(); });
    }
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) { if (en.isIntersecting) { measureAll(); io.unobserve(en.target); } });
      }, { threshold: 0.05 });
      io.observe(section);
    }
    window.addEventListener('resize', measureAll);

    activate('uxui');
  }

  /* ====================================================================
     9. VIEW ROUTER  —  home / projects / experience
        Toggles [hidden] on the top-level view containers; only one shows.
        #scroll (home) keeps the loader/intro/scroll flow; the sub-pages
        are plain documents on --paper. Hash-driven so links + back/fwd work.
        Case studies are real pages (case-<slug>.html, each the first site's
        own bespoke design, extracted verbatim) — plain <a> navigation, not
        part of this router.
     ==================================================================== */
  function initRouter() {
    var VIEWS = {
      home:       document.getElementById('scroll'),
      projects:   document.getElementById('view-projects'),
      experience: document.getElementById('view-experience')
    };
    var homeTitle = document.title;
    function titleFor(name) {
      var el = VIEWS[name];
      return (el && el.getAttribute('data-page-title')) || homeTitle;
    }
    var current = 'home';

    function show(name, opts) {
      if (!VIEWS[name]) name = 'home';
      if (name === current && !(opts && opts.force)) return;
      current = name;
      Object.keys(VIEWS).forEach(function (k) {
        if (VIEWS[k]) VIEWS[k].hidden = (k !== name);
      });
      body.classList.toggle('view-sub', name !== 'home');
      body.classList.toggle('view-projects', name === 'projects');
      body.classList.toggle('view-experience', name === 'experience');
      if (name !== 'home') body.classList.remove('intro-lock');
      document.title = titleFor(name);
      if (lenis) { try { lenis.start(); lenis.scrollTo(0, { immediate: true }); lenis.resize(); } catch (e) {} }
      window.scrollTo(0, 0);
      // any view swap: the carousel (home) and the portrait canvas (experience)
      // both need a fresh measure once their container is actually visible
      window.dispatchEvent(new Event('resize'));
      // the IntersectionObserver in initReveals() was wired while this view was
      // [hidden] and doesn't reliably fire on unhide — reveal whatever is above
      // the fold here; it still handles the rest of the page as you scroll
      if (VIEWS[name]) {
        setTimeout(function () {
          var vh = window.innerHeight;
          [].forEach.call(VIEWS[name].querySelectorAll('.reveal'), function (el) {
            if (el.classList.contains('in')) return;
            var r = el.getBoundingClientRect();
            // anything touching the first screenful — the observer takes the rest on scroll
            if (r.top < vh + 120 && r.bottom > -40) el.classList.add('in');
          });
        }, 40);
      }
    }

    function routeFromHash() {
      var h = (location.hash || '').replace(/^#/, '');
      if (h === 'projects' || h === 'experience') show(h);
      else if (h === '' || h === 'home') show('home');
      else if (current !== 'home') show('home');
    }

    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('[data-view-link]');
      if (!a) return;
      var name = a.getAttribute('data-view-link');
      e.preventDefault();
      show(name);
      var want = name === 'home' ? '#home' : '#' + name;
      if (location.hash !== want) location.hash = want;
    }, true);

    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-projects-jump]');
      if (!b) return;
      var t = document.getElementById(b.getAttribute('data-projects-jump'));
      if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    window.addEventListener('hashchange', routeFromHash);
    return { show: show, routeFromHash: routeFromHash, current: function () { return current; } };
  }

  /* nav gets a frosted backdrop once the hero has scrolled away (mobile only in
     CSS) — keeps its text off the body copy underneath */
  function initNavScroll() {
    if (!document.querySelector('.nav')) return;
    var on = false;
    function sync() {
      var past = window.scrollY > window.innerHeight * 0.85;
      if (past !== on) { on = past; body.classList.toggle('nav-scrolled', on); }
    }
    if (lenis && lenis.on) lenis.on('scroll', sync);
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    sync();
  }

  /* ====================================================================
     BOOT  (called once the intro clip is done)
     ==================================================================== */
  function boot() {
    initLenis();
    if (lenis && lenis.scrollTo) lenis.scrollTo(0, { immediate: true, force: true });
    router = initRouter();
    initReveals();
    initSectionDots();
    initNavScroll();
    initNameGate();
    initWork();
    if (!reduce) {
      if (lenis && lenis.on) lenis.on('scroll', parallax);
      else window.addEventListener('scroll', parallax, { passive: true });
      parallax();
      window.addEventListener('resize', parallax);
    }
    router.routeFromHash();   // honour a deep link once everything is wired
  }

  function start() {
    try { performance.mark('seq-start'); } catch (e) {}
    // deep link straight to a sub-page — skip the loader / space intro, but
    // still land the intro clip on its last frame (settled) so that navigating
    // back to Home has its space backdrop. Hiding #intro here (display:none)
    // left Home with a blank paper hero after a deep-link or a refresh on a
    // sub-page.
    if (/^#(projects|experience)$/.test(location.hash || '')) {
      if (loader) loader.style.display = 'none';
      body.classList.remove('intro-lock');
      body.classList.add('intro-done');
      if (intro && vid) {
        intro.classList.add('settled');
        var landLast = function () {
          try {
            if (isFinite(vid.duration) && vid.duration > 0) {
              vid.currentTime = Math.max(0, vid.duration - 0.05);
            }
          } catch (e) {}
        };
        if (vid.readyState >= 1) landLast();
        else vid.addEventListener('loadedmetadata', landLast, { once: true });
        try { vid.pause(); } catch (e) {}
        clipSettled = true;   // don't let a later playClip/settleClip fight this
      }
      boot();
      return;
    }
    if (!reduce) lockScroll();          // no scrolling during the loader + launch
    // loader -> launch (which starts the clip behind it and, when it hands
    // over, reveals the hero while the clip finishes playing ambiently)
    runLoader(function () { runLaunch(boot); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
