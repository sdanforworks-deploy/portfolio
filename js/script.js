/* ==========================================================================
   Dan Sungvornveshapan — Portfolio
   Pinned desk sequence: hero desk stays on screen while three drawers
   slide open — one at a time — as the page scrolls, then tuck back
   closed (drawers 1 & 2) before the next one opens. Drawer 3 opens and
   stays open, and the page continues on to the footer.
   + tab bar (click-to-jump + scroll sync) + project carousel
   ========================================================================== */

(function () {
  'use strict';

  const reduceMotionPref = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  /* ---------------------------------------------------------------- */
  /* 0. View routing — Home / Projects / Experience                    */
  /* All three "pages" live in this one HTML file (one Artifact, one   */
  /* URL) but are meant to feel like genuinely separate screens, not   */
  /* sections of the scrolling desk. The header's nav buttons swap     */
  /* which top-level <main> is visible via hash-based routing, resets  */
  /* scroll to the top on every switch, and updates the document       */
  /* title — the closest a single file can get to real separate pages. */
  /* ---------------------------------------------------------------- */

  const VIEW_HOME = 'home';
  const HOME_TITLE = document.title;
  // v18.16: built dynamically from every `<main id="view-*">` in the page,
  // rather than a hand-maintained object — that hardcoded list was fine
  // for 3 views (home/projects/experience) but became a real liability
  // once 7 per-project case-study views were added (id="view-project-X"
  // for each of the 7 portfolio projects): a manual list means a new page
  // silently 404s into the Home view instead of showing, with no error,
  // unless someone remembers to add it here too. Each view's document
  // title comes from that same <main>'s own `data-page-title` attribute
  // (falling back to the site's real <title> for Home, which has none —
  // it doesn't need one since it's never anything but itself).
  const VIEWS = {};
  const VIEW_TITLES = {};
  document.querySelectorAll('main[id^="view-"]').forEach((el) => {
    const key = el.id.slice('view-'.length);
    VIEWS[key] = el;
    VIEW_TITLES[key] = el.dataset.pageTitle || HOME_TITLE;
  });
  let activeView = VIEW_HOME;
  // Set by the pinned-sequence module below once it exists, so switching
  // back to Home can force a fresh measure() — while Home is hidden its
  // elements report 0 offsetHeight, which would otherwise leave stale,
  // zeroed-out drawer/spacer geometry from any measurement that happened
  // to run while Home was off-screen (e.g. a deep link straight to
  // #projects on first load).
  let remeasureHome = null;
  // Set by the CMCC-Chance iframe-embed module (section further down) once
  // it exists, so switching into that view re-measures and re-applies the
  // iframe's height — needed because the iframe starts at 0 height while
  // `hidden` and its content's real scrollHeight is only knowable once it's
  // actually laid out on screen.
  let resizeCmccFrame = null;
  // Same idea as `resizeCmccFrame` above, for the Thrive case study's own
  // srcdoc-iframe embed (section further down).
  let resizeThriveFrame = null;
  // Same idea again, for the A Journey case study's srcdoc-iframe embed
  // (now including the same parent-level sticky sub-nav as CMCC/Thrive, v20.3).
  let resizeAJourneyFrame = null;
  // Same idea again, for the FriendLi case study's srcdoc-iframe embed
  // (plain height-sync only — no parent-level sticky sub-nav, since that
  // hasn't been requested for this case study yet).
  let resizeFriendliFrame = null;
  // v22: the five exhibition case studies (Work-01..05, converted from
  // Claude Design ".dc.html" exports) all use the identical embed pattern,
  // so instead of five more near-duplicate `resize*Frame` globals + hooks
  // they register a resizer here keyed by their `view-project-*` name;
  // showView() below calls whichever one matches the destination view.
  const embedFrameResizers = {};

  function hashToView(hash) {
    const key = (hash || '').replace(/^#/, '');
    return VIEWS[key] ? key : VIEW_HOME;
  }

  function setActiveNav(view) {
    document.querySelectorAll('[data-view-link]').forEach((a) => {
      const isCurrent = a.dataset.viewLink === view;
      a.classList.toggle('is-current', isCurrent);
      if (isCurrent) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  function showView(view, opts) {
    opts = opts || {};
    if (!VIEWS[view]) view = VIEW_HOME;
    if (view === activeView && !opts.force) return;
    Object.keys(VIEWS).forEach((key) => {
      if (VIEWS[key]) VIEWS[key].hidden = key !== view;
    });
    activeView = view;
    document.title = VIEW_TITLES[view] || HOME_TITLE;
    setActiveNav(view);
    // `behavior: 'instant'` overrides the site-wide `scroll-behavior:
    // smooth` CSS (see css/style.css) — a view switch should land at the
    // top immediately, not glide there, since the destination view's
    // content has nothing to do with wherever the scroll position was on
    // the view being left.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (view === VIEW_HOME && typeof remeasureHome === 'function') {
      remeasureHome();
    }
    if (view === 'project-cmcc-chance' && typeof resizeCmccFrame === 'function') {
      resizeCmccFrame();
    }
    if (view === 'project-thrive' && typeof resizeThriveFrame === 'function') {
      resizeThriveFrame();
    }
    if (view === 'project-a-journey' && typeof resizeAJourneyFrame === 'function') {
      resizeAJourneyFrame();
    }
    if (view === 'project-friendli' && typeof resizeFriendliFrame === 'function') {
      resizeFriendliFrame();
    }
    if (typeof embedFrameResizers[view] === 'function') {
      embedFrameResizers[view]();
    }
  }

  // Delegated on `document` (rather than binding to each `[data-view-link]`
  // element individually at load time) so it also covers elements that
  // don't exist yet at this point in the script — notably the project
  // carousel's `.project-cta` links, built later by section 2 below, and
  // any other view-link ever generated by JS in the future. `closest()`
  // lets the data attribute sit on an inner element or its target still
  // register correctly if the click lands on a child (e.g. the chevron
  // svg inside a button).
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-view-link]');
    if (!link) return;
    e.preventDefault();
    const target = link.dataset.viewLink;
    showView(target);
    const hash = target === VIEW_HOME ? '#' : '#' + target;
    if (window.location.hash !== hash) {
      history.pushState(null, '', hash);
    }
  });

  window.addEventListener('hashchange', () => showView(hashToView(window.location.hash)));
  window.addEventListener('popstate', () => showView(hashToView(window.location.hash)));

  showView(hashToView(window.location.hash), { force: true });

  /* ---------------------------------------------------------------- */
  /* 1. Pinned drawer sequence                                         */
  /* ---------------------------------------------------------------- */

  const deskSequence = document.getElementById('deskSequence');
  const tailSpacer = document.getElementById('tailSpacer');
  const stageFixed = document.getElementById('stageFixed');
  const deskIntro = document.getElementById('deskIntro');
  const deskCard = document.querySelector('.desk-card');
  const deskObjects = document.querySelector('.desk-objects');
  const drawerZone = document.querySelector('.drawer-zone');
  const tabsNav = document.getElementById('drawerTabs');
  const tabButtons = Array.from(tabsNav.querySelectorAll('.tab-btn'));
  const indicator = tabsNav.querySelector('.tab-indicator');

  const spacerEls = [1, 2, 3].map((n) => deskSequence.querySelector(`[data-spacer="${n}"]`));
  const panelEls = [1, 2, 3].map((n) => document.querySelector(`[data-drawer-panel="${n}"]`));

  const OPEN_RATIO = 0.85; // × viewport height, time to slide a drawer fully open
  const CLOSE_RATIO = 0.85; // × viewport height, time to slide it back shut
  const MIN_HOLD_RATIO = 0.35; // × viewport height, minimum "stay open & readable" time
  const DESK_LIFT_RATIO = 0.22; // × viewport height, time the desk+drawer group takes to lift up together — only used after drawer 1 has fully opened. Kept short on purpose: the drawer already reads as "fully open" the moment its own open ramp finishes (its translate and the zone's height both settle then), so a long lift ramp just left the desk lingering, half-cleared, competing for space with content that already looks settled.
  const HEADING_DWELL_RATIO = 0.3; // × viewport height, scroll room at the very start of each drawer's "hold" phase during which the inner content does NOT fake-scroll yet — so the drawer's own title (e.g. "Drawer 02 — Process & Skills") stays put and readable for a beat before content starts sliding up underneath it.

  const drawerData = panelEls.map((panel, i) => ({
    panel,
    viewport: panel.querySelector('.drawer-viewport'),
    content: panel.querySelector('.drawer-content'),
    hasClose: i < panelEls.length - 1,
    overflow: 0,
    openRamp: 0,
    liftRamp: 0,
    headingDwell: 0,
    hold: 0,
    closeRamp: 0,
    start: 0,
    total: 0,
  }));

  let sequenceHeight = 0;
  let pinStart = 0;
  let pinEnd = 0;
  let headerH = 0;
  let currentActiveIndex = 0;
  let deskFullHeight = 0;
  let deskSlideDistance = 0;
  let zoneRestHeight = 0;
  let zoneOpenHeight = 0;

  function moveIndicatorTo(index) {
    // Pixel-exact geometry read straight off the real button box, rather
    // than a CSS % + translateX approximation — the grid's `gap` between
    // columns made that approximation drift further off with each column,
    // so the indicator landed short of button 3's actual position and its
    // white label text sat off-center inside the blue box. Reading
    // offsetLeft/offsetWidth directly keeps it correct at any width,
    // gap, or breakpoint (including the mobile tab-short variant).
    const btn = tabButtons[index];
    if (!btn) return;
    indicator.style.width = `${btn.offsetWidth}px`;
    indicator.style.transform = `translateX(${btn.offsetLeft - indicator.offsetLeft}px)`;
  }

  function setActiveTab(index) {
    if (index === currentActiveIndex && tabButtons[index].getAttribute('aria-current') === 'true') return;
    tabButtons.forEach((btn, i) => {
      btn.setAttribute('aria-current', i === index ? 'true' : 'false');
    });
    moveIndicatorTo(index);
    currentActiveIndex = index;
  }

  function jumpToDrawer(index) {
    const d = drawerData[index];
    if (!d) return;

    if (reduceMotionPref) {
      const headerH = document.querySelector('.site-header').offsetHeight;
      const top = d.panel.getBoundingClientRect().top + window.scrollY - headerH - 16;
      window.scrollTo({ top, behavior: 'auto' });
      setActiveTab(index);
      return;
    }

    const target = pinStart + d.start + d.openRamp + d.liftRamp + 12;
    window.scrollTo({ top: target, behavior: 'smooth' });
  }

  tabButtons.forEach((btn, i) => {
    btn.addEventListener('click', () => jumpToDrawer(i));
  });

  document.querySelectorAll('[data-drawer-link]').forEach((link) => {
    link.addEventListener('click', () => {
      const idx = parseInt(link.dataset.drawerLink, 10) - 1;
      jumpToDrawer(idx);
    });
  });

  moveIndicatorTo(0);

  if (reduceMotionPref) {
    // Static stacked fallback (see CSS): no pinning, no scroll math — just
    // keep the tab indicator in sync as the reader passes each drawer.
    const spy = new IntersectionObserver(
      (entries) => {
        let best = null;
        entries.forEach((entry) => {
          if (entry.isIntersecting && (!best || entry.intersectionRatio > best.intersectionRatio)) {
            best = entry;
          }
        });
        if (best) {
          const idx = panelEls.indexOf(best.target);
          if (idx !== -1) setActiveTab(idx);
        }
      },
      { threshold: [0.25, 0.5, 0.75], rootMargin: '-30% 0px -30% 0px' }
    );
    panelEls.forEach((panel) => spy.observe(panel));
  } else {
    initPinnedSequence();
  }

  function initPinnedSequence() {
    let ticking = false;

    function measure() {
      const vh = window.innerHeight;
      headerH = document.querySelector('.site-header').offsetHeight;
      const vhEff = vh - headerH;

      // The desk card keeps its natural (CSS clamp) size always — it never
      // resizes/squishes. Instead it slides upward (transform) as drawer 1
      // opens, all the way clear of .stage-fixed's own overflow:hidden top
      // edge (no fade — it's a clean geometric exit, not an opacity cross-
      // fade), while the drawer beneath it rises by the same amount (via an
      // increasingly negative margin-top) so the drawer content follows
      // right behind it with no gap. The section tabs live outside the
      // desk card now, so nothing needs to stay peeking for navigation.
      deskFullHeight = deskCard.offsetHeight;
      deskSlideDistance = deskFullHeight + 24;

      const openRamp = vh * OPEN_RATIO;
      const closeRamp = vh * CLOSE_RATIO;
      const minHold = vh * MIN_HOLD_RATIO;
      const liftRamp = vh * DESK_LIFT_RATIO;
      const headingDwell = vh * HEADING_DWELL_RATIO;

      // zoneOpenHeight (how tall the drawer "cabinet" gets when open) has to
      // be known BEFORE we can correctly measure each drawer's own overflow
      // below — it only depends on drawer 1's own content, not on the
      // zone's current (possibly still 0) height, so it's safe to compute
      // first. zoneRestHeight (0) is how tall the zone is when every drawer
      // is fully tucked away — the desk and the (invisible) drawer sit
      // flush against each other with no gap. Taller drawers (2, 3) get
      // their extra height via their own internal "hold and scroll"
      // mechanic (d.overflow) rather than growing the zone further.
      const lipEl = panelEls[0] && panelEls[0].querySelector('.drawer-lip');
      const lipHeight = lipEl ? lipEl.offsetHeight : 0;
      const drawer1ContentHeight = drawerData[0].content.scrollHeight;
      zoneRestHeight = 0;
      zoneOpenHeight = drawer1ContentHeight + lipHeight + 40;

      // Temporarily set the zone to its real open height so every
      // .drawer-viewport (flex:1 inside a panel that's `inset:0` of the
      // zone) reports its TRUE clientHeight below — not the ~0 it would
      // read while the zone still sits at its resting height:0. Measuring
      // against a collapsed zone was the actual cause of a "dead space"
      // bug: it made every drawer's content look like it overflowed by
      // its *entire* height (scrollHeight minus ~0), so the hold phase
      // slid the real content up and off far more than needed, leaving a
      // large empty gap below it before the drawer even needed to scroll
      // at all. This inline height gets overwritten again on the very
      // next scroll/resize tick by updateIntro(), so nothing needs to
      // reset it back afterward.
      drawerZone.style.height = zoneOpenHeight + 'px';

      drawerData.forEach((d, i) => {
        const overflow = Math.max(0, d.content.scrollHeight - d.viewport.clientHeight);
        d.overflow = overflow;
        d.openRamp = openRamp;
        // Only drawer 1 has a lift phase — the desk (and the drawer cabinet
        // riding along with it) is only ever repositioned once, right after
        // drawer 1 finishes pulling all the way open. Drawers 2 and 3 open
        // and close with the desk already permanently out of the way.
        d.liftRamp = i === 0 ? liftRamp : 0;
        // headingDwell is scroll room BEFORE the inner content is allowed to
        // fake-scroll — it's folded into d.hold (not added on top of it), so
        // the title has a guaranteed still, readable window at the start of
        // "hold" before updateDrawers() lets the content move underneath it.
        d.headingDwell = headingDwell;
        const scrollNeeded = Math.max(minHold, overflow > 0 ? overflow + minHold * 0.5 : minHold);
        d.hold = headingDwell + scrollNeeded;
        // The last drawer has no close ramp — it opens and stays open, so
        // there's nothing to add here; the tail-spacer below gives it room
        // to release once its hold is done.
        d.closeRamp = d.hasClose ? closeRamp : 0;
        d.total = d.openRamp + d.liftRamp + d.hold + d.closeRamp;
      });

      let acc = 0;
      drawerData.forEach((d) => {
        d.start = acc;
        acc += d.total;
      });
      sequenceHeight = acc;

      spacerEls.forEach((el, i) => {
        el.style.height = drawerData[i].total + 'px';
      });

      // The stage sits below the sticky header at all times, whether it is
      // pinned (position:fixed, top:headerHeight) or resting in normal flow
      // (position:absolute, top relative to <main>, which itself starts
      // right where the header ends). pinStart is always 0 (pinning begins
      // immediately) and pinEnd is exactly when the sequence's own scroll
      // distance is used up — by then every drawer, including drawer 3's
      // hold, has already fully played out. The tail-spacer (sized to
      // exactly one effective viewport) then gives the stage room to
      // release and scroll away before the footer appears.
      tailSpacer.style.height = vhEff + 'px';
      pinStart = 0;
      pinEnd = sequenceHeight;
    }

    function positionStage(scrollY) {
      const pinnable = pinEnd > pinStart;
      if (pinnable && scrollY < pinEnd) {
        stageFixed.style.position = 'fixed';
        stageFixed.style.top = headerH + 'px';
      } else {
        stageFixed.style.position = 'absolute';
        stageFixed.style.top = Math.max(0, pinEnd) + 'px';
      }
    }

    function updateDrawers(pinScroll) {
      let activeIndex = 0;

      drawerData.forEach((d, i) => {
        const local = clamp(pinScroll - d.start, 0, d.total);
        const openP = d.openRamp > 0 ? clamp(local / d.openRamp, 0, 1) : 1;
        // holdLocalRaw/closeLocalRaw are offset past the lift ramp too (zero
        // for drawers 2 & 3, so this doesn't change their timing) — the
        // drawer sits fully open and waits while the desk+drawer group lifts
        // into place before "hold" (readable, scrollable-in-place) begins.
        const holdLocalRaw = local - d.openRamp - d.liftRamp;
        const closeLocalRaw = local - d.openRamp - d.liftRamp - d.hold;
        const closeP = d.hasClose && d.closeRamp > 0 ? clamp(closeLocalRaw / d.closeRamp, 0, 1) : 0;
        // The first d.headingDwell px of "hold" are a still, readable pause —
        // the title sits in place before the inner content is allowed to
        // fake-scroll underneath it. scrollP only starts advancing once
        // holdLocalRaw is past that dwell window.
        const scrollDuration = Math.max(1, d.hold - d.headingDwell);
        const scrollLocalRaw = holdLocalRaw - d.headingDwell;
        const scrollP = clamp(scrollLocalRaw / scrollDuration, 0, 1);

        // Closed = -106% (pulled up into the cabinet, hidden behind the
        // desk card above). Open = 0% (resting in view below the desk).
        let translate;
        if (openP < 1) {
          translate = -106 + openP * 106;
        } else if (d.hasClose && closeP > 0) {
          translate = -closeP * 106;
        } else {
          translate = 0;
        }

        d.panel.style.transform = `translateY(${translate}%)`;
        // 1 = fully open, 0 = fully closed (tucked away) — used to size
        // the drawer zone to whichever panel is currently showing, so it
        // doesn't sit stretched-open-tall during the gap after one drawer
        // has closed and before the next has started opening.
        d.visibility = clamp(1 + translate / 106, 0, 1);

        const isVisible = translate > -60;
        d.panel.classList.toggle('is-active', isVisible);
        // a11y v32 (audit #12): a tucked-away drawer used to be
        // aria-hidden + pointer-events:none while its ~20 carousel/contact
        // controls stayed in the tab order — focus could land on things a
        // screen reader reported as absent. `inert` removes the whole
        // subtree from the tab order AND the accessibility tree in one
        // step, and also blocks pointer events, so it replaces both lines.
        d.panel.toggleAttribute('inert', !isVisible);

        const innerY = -(scrollP * d.overflow);
        d.content.style.transform = `translateY(${innerY}px)`;

        if (pinScroll >= d.start && pinScroll < d.start + d.total) {
          activeIndex = i;
        }
      });

      if (pinScroll >= sequenceHeight) activeIndex = drawerData.length - 1;
      setActiveTab(activeIndex);
    }

    function updateIntro(pinScroll) {
      const drawer1 = drawerData[0];

      // Sequential, not simultaneous: the desk stays completely still while
      // drawer 1 pulls out from underneath it (0 → drawer1.openRamp — see
      // updateDrawers). Only once the drawer has reached its fully-open,
      // bottom-most position does the desk (and the drawer riding right
      // along with it) lift upward as one unit, over its own dedicated
      // ramp (drawer1.liftRamp) — never overlapping the open motion, so the
      // two objects never look like they're moving independently of one
      // another mid-scroll.
      const liftLocal = clamp(pinScroll - drawer1.openRamp, 0, drawer1.liftRamp);
      const collapseP = drawer1.liftRamp > 0 ? clamp(liftLocal / drawer1.liftRamp, 0, 1) : (liftLocal > 0 ? 1 : 0);
      const eased = collapseP * collapseP * (3 - 2 * collapseP); // smoothstep
      const slideAmount = eased * deskSlideDistance;

      // Both the desk card AND the drawer zone move by the *exact same*
      // pixel amount, as a single rigid group. This is the fix for the
      // recurring "gap between desk and drawer" bug: a transform on
      // .desk-card alone never moves .drawer-zone's flex-flow position (a
      // CSS transform is purely visual, it doesn't reflow siblings) — so
      // any time the desk slid away on its own, the drawer's box stayed
      // exactly where it was and a growing empty gap opened up between
      // them mid-scroll. Moving them together keeps their constant
      // margin-top overlap visually true at every point of the animation,
      // not just at rest — and since .stage-fixed clips a fixed-height
      // viewport, lifting the whole group up is also what reveals more of
      // the (now fully open) drawer's own content within that viewport.
      deskCard.style.transform = `translateY(${-slideAmount}px)`;
      drawerZone.style.transform = `translateY(${-slideAmount}px)`;
      deskIntro.style.pointerEvents = collapseP > 0.05 ? 'none' : 'auto';

      // The zone's height tracks whichever drawer is currently most open
      // (0 when every drawer is tucked away, 1 when one is fully open) —
      // not just "has drawer 1 started opening" — so it sits flush at
      // zoneRestHeight (no visible gap under the desk) whenever nothing
      // is open, and grows only as far as a drawer actually is.
      const maxVisibility = Math.max(...drawerData.map((d) => d.visibility || 0));
      drawerZone.style.height = (zoneRestHeight + maxVisibility * (zoneOpenHeight - zoneRestHeight)) + 'px';
    }

    function onScroll() {
      const scrollY = window.scrollY;
      const pinScroll = clamp(scrollY - pinStart, 0, sequenceHeight);
      positionStage(scrollY);
      updateDrawers(pinScroll);
      updateIntro(pinScroll);
    }

    function requestTick() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        onScroll();
        ticking = false;
      });
    }

    let resizeTimer = null;
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        measure();
        onScroll();
        // Column widths (and the mobile tab-full/tab-short swap) change
        // across breakpoints, so re-read the active button's real geometry
        // too — setActiveTab() alone would no-op here since the index
        // hasn't changed.
        moveIndicatorTo(currentActiveIndex);
      }, 120);
    }

    measure();
    onScroll();
    // Expose a re-measure hook for the view router (section 0) to call
    // whenever Home becomes visible again after being hidden — see the
    // comment on `remeasureHome` above for why this is needed.
    remeasureHome = () => {
      measure();
      onScroll();
      moveIndicatorTo(currentActiveIndex);
    };

    window.addEventListener('scroll', requestTick, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('load', () => {
      measure();
      onScroll();
      moveIndicatorTo(currentActiveIndex);
    });
    // Google Fonts swapping in can reflow drawer content heights (and tab
    // label widths) slightly — re-measure once shortly after load to keep
    // spacer heights and the tab indicator's geometry accurate.
    setTimeout(() => {
      measure();
      onScroll();
      moveIndicatorTo(currentActiveIndex);
    }, 600);
  }

  /* ---------------------------------------------------------------- */
  /* 1b. Draggable desk objects                                        */
  /* Each of the 5 desk-object images can be picked up and set down     */
  /* anywhere else on the desk, but never outside `.desk-card`' own     */
  /* box — that's the "desk frame" the objects aren't allowed to leave. */
  /* v18.14: widened from `.desk-objects` (a narrow zone on one side of */
  /* the card) to the full `.desk-card` — per user feedback, objects    */
  /* should be draggable across the ENTIRE desk surface, including over */
  /* the intro text/CTA column, not just the original object tray.      */
  /* Uses the Pointer Events API (one code path for mouse/touch/pen)    */
  /* with pointer capture, so a drag keeps tracking correctly even if   */
  /* the pointer moves faster than the object during a fast swipe.      */
  /* ---------------------------------------------------------------- */

  (function initDraggableDeskObjects() {
    const container = document.querySelector('.desk-card');
    if (!container) return;
    const objects = Array.from(container.querySelectorAll('.obj'));
    if (!objects.length) return;

    objects.forEach((obj) => {
      let dragging = false;
      let startPointerX = 0;
      let startPointerY = 0;
      let startLeft = 0;
      let startTop = 0;

      // Converts whatever CSS positioned this object at (top/left
      // percentages from its stylesheet rule) into an explicit pixel
      // left/top pinned to the container, the first time it's ever
      // dragged — from then on the object is positioned purely by inline
      // style, independent of its original CSS rule.
      //
      // `container.clientLeft`/`clientTop` (the container's own border
      // width) is subtracted so this lines up with the padding box —
      // the same box CSS percentage `top`/`left` resolve against — not
      // the outer border-box edge `getBoundingClientRect()` returns.
      // `.desk-objects` (the old container) had a zero-width border so
      // this never mattered there; `.desk-card` has a visible border,
      // so skipping this would introduce a few px of drift the first
      // time each object is picked up.
      function pixelizePosition() {
        const containerRect = container.getBoundingClientRect();
        const objRect = obj.getBoundingClientRect();
        const left = objRect.left - containerRect.left - container.clientLeft;
        const top = objRect.top - containerRect.top - container.clientTop;
        obj.style.left = left + 'px';
        obj.style.top = top + 'px';
        obj.style.right = 'auto';
        obj.style.bottom = 'auto';
        return { left, top };
      }

      function onPointerDown(e) {
        // Only the primary button/touch/pen contact starts a drag.
        if (e.button !== undefined && e.button !== 0) return;
        dragging = true;
        obj.classList.add('is-dragging');
        obj.setPointerCapture(e.pointerId);
        const pos = pixelizePosition();
        startLeft = pos.left;
        startTop = pos.top;
        startPointerX = e.clientX;
        startPointerY = e.clientY;
        e.preventDefault();
      }

      function onPointerMove(e) {
        if (!dragging) return;
        // clientWidth/clientHeight are read fresh on every move (not
        // cached at drag-start), so the clamp always reflects the
        // container's *current* box even if a resize/reflow happens
        // mid-drag (e.g. rotating a phone while dragging).
        const maxLeft = Math.max(0, container.clientWidth - obj.offsetWidth);
        const maxTop = Math.max(0, container.clientHeight - obj.offsetHeight);
        let newLeft = startLeft + (e.clientX - startPointerX);
        let newTop = startTop + (e.clientY - startPointerY);
        newLeft = clamp(newLeft, 0, maxLeft);
        newTop = clamp(newTop, 0, maxTop);
        obj.style.left = newLeft + 'px';
        obj.style.top = newTop + 'px';
      }

      function onPointerUp(e) {
        if (!dragging) return;
        dragging = false;
        obj.classList.remove('is-dragging');
        if (obj.hasPointerCapture(e.pointerId)) {
          obj.releasePointerCapture(e.pointerId);
        }
      }

      obj.addEventListener('pointerdown', onPointerDown);
      obj.addEventListener('pointermove', onPointerMove);
      obj.addEventListener('pointerup', onPointerUp);
      obj.addEventListener('pointercancel', onPointerUp);
    });
  })();

  /* ---------------------------------------------------------------- */
  /* 2. Project carousel (Drawer 01) — circular / infinite              */
  /* ---------------------------------------------------------------- */

  // Data for all 15 works — title / org / cover / slug. Each card's CTA is an
  // internal `data-view-link` to that project's own case-study view
  // (`view-project-<slug>`, see index.html) rather than an external link.
  // Works 9–13 (the exhibition projects) were converted from Claude Design
  // ".dc.html" exports in v22; the rest since v18.16. The hero carousel
  // renders only the curated `HERO_SLUGS` subset below; the full set is the
  // hand-written grid in #view-projects.
  const projects = [
    {
      title: 'CMCC-Chance',
      org: 'Capital Market Case Competition in Investment Banking',
      image: 'assets/projects/cmcc-chance.webp',
      slug: 'cmcc-chance',
    },
    {
      title: 'A Journey',
      org: 'The Adventure to Find Yourself',
      image: 'assets/projects/a-journey.webp',
      slug: 'a-journey',
    },
    {
      title: 'Chac Chac',
      org: 'Chulalongkorn Faculty of Fine and Applied Arts',
      image: 'assets/projects/chac-chac.jpg',
      slug: 'chac-chac',
    },
    {
      title: 'Storade',
      org: 'Reading Marketplace',
      image: 'assets/projects/storade.jpg',
      slug: 'storade',
    },
    {
      title: 'FriendLi',
      org: 'Rethinking Chulalongkorn Central Library',
      image: 'assets/projects/friendli.webp',
      slug: 'friendli',
    },
    {
      title: 'SOS',
      org: 'Safety of School',
      image: 'assets/projects/sos.jpg',
      slug: 'sos',
    },
    {
      title: "Le'rum",
      org: 'Logo Design For Clothing Brands',
      image: 'assets/projects/lerum.jpg',
      slug: 'lerum',
    },
    {
      title: 'UPLATFORM',
      org: 'Real-time IoT Platform for Education & Research',
      image: 'assets/projects/uplatform.jpg',
      slug: 'uplatform',
    },    {
      title: 'Thrive',
      org: 'Grow Together, Heal Together',
      image: 'assets/projects/thrive.jpg',
      slug: 'thrive',
    },
    {
      title: 'Jeju Olive Flounder',
      org: '2025 Bangkok Jeju Olive Flounder Pop-up',
      image: 'assets/projects/jeju-olive-flounder.jpg',
      slug: 'jeju-olive-flounder',
    },
    {
      title: 'K-Food Night',
      org: 'K-Food Night 2026 · THAIFEX – Anuga Asia',
      image: 'assets/projects/k-food-night.jpg',
      slug: 'k-food-night',
    },
    {
      title: 'Jeju K-Seafood Pop-up',
      org: '2026 Jeju K-Seafood Pop-up Store',
      image: 'assets/projects/jeju-kseafood-popup.jpg',
      slug: 'jeju-kseafood-popup',
    },
    {
      title: 'TRAFS K-Seafood',
      org: 'TRAFS 2026 K-Seafood Booth',
      image: 'assets/projects/trafs-kseafood.jpg',
      slug: 'trafs-kseafood',
    },
    {
      title: 'WHX Korea',
      org: 'Thailand Wellness & Healthcare Expo 2026 Korea Booth',
      image: 'assets/projects/whx-korea.jpg',
      slug: 'whx-korea',
    },
    {
      title: 'Leitz MU',
      org: 'Leica Exhibition & Experience Design',
      image: 'assets/projects/leitz-mu.jpg',
      slug: 'leitz-mu',
    },
  ];

  // The hero-section carousel shows a curated subset of the works above, in
  // this exact order. The full 14-card set still lives in #view-projects'
  // hand-written grid (index.html) — this only trims/reorders the hero gallery.
  // To change what the hero shows, edit this slug list.
  const HERO_SLUGS = [
    'cmcc-chance',
    'jeju-kseafood-popup',
    'uplatform',
    'trafs-kseafood',
    'friendli',
    'a-journey',
    'thrive',
  ];
  const heroProjects = HERO_SLUGS
    .map((slug) => projects.find((p) => p.slug === slug))
    .filter(Boolean);

  const track = document.getElementById('carouselTrack');
  const dotsWrap = document.getElementById('projectDots');
  const prevBtn = document.querySelector('.stage-prev');
  const nextBtn = document.querySelector('.stage-next');
  const stageEl = document.querySelector('.project-stage');
  const count = heroProjects.length;
  const reduceMotion = reduceMotionPref;

  // a11y v32 (audit #20): a polite live region so operating the carousel
  // announces which project is now in front. Created here rather than in
  // markup so it always exists even if the HTML is edited.
  let carouselStatus = document.getElementById('carouselStatus');
  if (!carouselStatus && stageEl) {
    carouselStatus = document.createElement('div');
    carouselStatus.id = 'carouselStatus';
    carouselStatus.className = 'sr-only';
    carouselStatus.setAttribute('aria-live', 'polite');
    carouselStatus.setAttribute('aria-atomic', 'true');
    stageEl.appendChild(carouselStatus);
  }

  // Circular index helper — always wraps, never runs out at either end.
  const wrap = (i) => ((i % count) + count) % count;

  // Shortest signed distance from `current` to `i` around the loop —
  // e.g. with 6 items, index 5 is distance -1 from index 0, not +5.
  function circularOffset(i, current) {
    let raw = i - current;
    if (raw > count / 2) raw -= count;
    if (raw < -count / 2) raw += count;
    return raw;
  }

  let current = 0;

  // Preload every cover so wrapping around the loop never shows a blank frame.
  heroProjects.forEach((p) => { const im = new Image(); im.src = p.image; });

  // Build every card once — positions/transforms are updated in place,
  // never rebuilt, so the 3D transition stays smooth and uninterrupted.
  const cardEls = heroProjects.map((p, index) => {
    const card = document.createElement('div');
    card.className = 'carousel-card';
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', `${p.title}, project ${index + 1} of ${count}`);
    card.innerHTML = `
      <img src="${p.image}" alt="${p.title} — project cover" loading="${index === 0 ? 'eager' : 'lazy'}" />
      <div class="carousel-card-scrim"></div>
      <div class="carousel-card-info">
        <h3 class="carousel-card-title">${p.title}</h3>
        <div class="carousel-card-foot">
          <p class="carousel-card-org">${p.org || ''}</p>
          <a class="project-cta" href="#project-${p.slug}" data-view-link="project-${p.slug}" aria-label="View ${p.title} case study">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </a>
        </div>
      </div>`;
    card.addEventListener('click', (e) => {
      if (index === current) return;
      e.preventDefault();
      goTo(index);
    });
    track.appendChild(card);
    return card;
  });

  function renderDots() {
    if (!dotsWrap.childElementCount) {
      // a11y v32 (audit #21): expose the dot row as a single labelled group
      // so the seven buttons read as one control, not seven unrelated ones.
      dotsWrap.setAttribute('role', 'group');
      dotsWrap.setAttribute('aria-label', 'Choose a project');
      heroProjects.forEach((p, i) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.setAttribute('aria-label', (p && p.title ? p.title : 'Project ' + (i + 1)) + ' — project ' + (i + 1) + ' of ' + heroProjects.length);
        dot.addEventListener('click', () => goTo(i));
        dotsWrap.appendChild(dot);
      });
    }
    Array.from(dotsWrap.children).forEach((dot, i) => {
      const on = i === current;
      dot.classList.toggle('is-active', on);
      // aria-current marks the position in the set for assistive tech (#21)
      if (on) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
  }

  // Coverflow geometry: 0 = front-center, ±1/±2 recede to the sides,
  // anything further is tucked out of sight behind the stack.
  function layout() {
    cardEls.forEach((card, i) => {
      const offset = circularOffset(i, current);
      const abs = Math.abs(offset);
      const dir = Math.sign(offset);
      let x, scale, rotate, opacity, z;

      if (abs === 0) { x = 0; scale = 1; rotate = 0; opacity = 1; z = 3; }
      else if (abs === 1) { x = 62; scale = 0.8; rotate = 34; opacity = 0.9; z = 2; }
      else if (abs === 2) { x = 104; scale = 0.62; rotate = 42; opacity = 0.55; z = 1; }
      else { x = 130; scale = 0.5; rotate = 46; opacity = 0; z = 0; }

      const transform = reduceMotion
        ? `translate(-50%, -50%) translateX(${dir * x}%)`
        : `translate(-50%, -50%) translateX(${dir * x}%) scale(${scale}) rotateY(${-dir * rotate}deg)`;

      card.style.transform = transform;
      card.style.opacity = opacity;
      card.style.zIndex = z;
      card.style.pointerEvents = abs > 2 ? 'none' : 'auto';
      card.classList.toggle('is-active', abs === 0);
      const isFront = abs === 0;
      card.setAttribute('aria-hidden', isFront ? 'false' : 'true');
      // a11y v32 (audit #9 / #12): only the front card is reachable by
      // keyboard — its CTA is a full 40px target. The recessed side cards
      // are aria-hidden, so their CTA link must leave the tab order too
      // (it also scales below the 24px minimum on those cards).
      const cta = card.querySelector('.project-cta');
      if (cta) {
        if (isFront) cta.removeAttribute('tabindex');
        else cta.setAttribute('tabindex', '-1');
      }
    });
    renderDots();
  }

  function goTo(index) {
    current = wrap(index);
    layout();
    // a11y v32 (audit #20): announce the new slide to screen readers. Only
    // fires on user action (prev/next/dot/swipe/keyboard/card) — the initial
    // layout() call does not run through goTo, so nothing speaks on load.
    if (carouselStatus) {
      const p = heroProjects[current];
      carouselStatus.textContent = 'Project ' + (current + 1) + ' of ' + count + (p && p.title ? ': ' + p.title : '');
    }
  }

  prevBtn.addEventListener('click', () => goTo(current - 1));
  nextBtn.addEventListener('click', () => goTo(current + 1));

  // Buttons never disable — the carousel loops in both directions.
  prevBtn.disabled = false;
  nextBtn.disabled = false;

  // Keyboard support when the stage (or a control inside it) has focus.
  stageEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(current - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(current + 1); }
  });

  // Touch / pointer swipe.
  let dragStartX = null;
  track.addEventListener('pointerdown', (e) => { dragStartX = e.clientX; });
  track.addEventListener('pointerup', (e) => {
    if (dragStartX === null) return;
    const dx = e.clientX - dragStartX;
    dragStartX = null;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) goTo(current + 1); else goTo(current - 1);
  });

  layout();

  /* ---------------------------------------------------------------- */
  /* 3. Resume link placeholder notice                                 */
  /* ---------------------------------------------------------------- */

  // Two instances now (Drawer 03 on Home, and the Experience view's own
  // "Get in Touch" section) since both live in this one file — bind all.
  document.querySelectorAll('[data-resume-link]').forEach((resumeLink) => {
    resumeLink.addEventListener('click', (e) => {
      if (resumeLink.getAttribute('href') === '#') {
        e.preventDefault();
        // TODO: replace with a real hosted PDF, e.g. href="/resume-dan.pdf"
        console.info('Add your resume PDF link in index.html (data-resume-link).');
      }
    });
  });

  /* ---------------------------------------------------------------- */
  /* 4. CMCC-Chance case study — embedded as the user's own hand-built  */
  /*    HTML page, verbatim, inside a same-origin srcdoc iframe         */
  /* ---------------------------------------------------------------- */

  // The full page is authored as raw markup inside a <template> (not an
  // escaped `srcdoc="..."` attribute) so no HTML-entity escaping is ever
  // needed. At runtime we hand that raw markup to the iframe's `.srcdoc`
  // property, which forces a fresh top-level parse — browsers happily
  // reconstruct a full document from it even though the in-template
  // parsing quirk already stripped the nested <html>/<head>/<body> tags
  // (their *contents* survive, which is all `.srcdoc` needs).
  (function setupCmccFrame() {
    const frame = document.getElementById('cmccFrame');
    const tpl = document.getElementById('cmccFrameContent');
    if (!frame || !tpl) return;

    let loaded = false;

    function applyHeight() {
      try {
        const doc = frame.contentDocument;
        if (!doc || !doc.documentElement) return;
        // Give the iframe a stable, externally-anchored height (the outer
        // window's own viewport height) before measuring, so any `vh`-based
        // CSS inside the embedded page (e.g. a `min-height: 92vh` hero)
        // resolves against a fixed reference rather than the iframe's own
        // last-applied height. Skipping this would let a vh-sized element
        // and this measure-then-resize cycle reinforce each other into
        // runaway growth across the repeated settle-timer rechecks below —
        // found via FriendLi's export, whose hero uses `min-height:92vh`.
        // Remember where the visitor is before we touch the frame height.
        const anchorY = window.scrollY || window.pageYOffset || 0;
        frame.style.height = Math.max(window.innerHeight, 600) + 'px';
        const h = Math.max(
          doc.documentElement.scrollHeight,
          doc.body ? doc.body.scrollHeight : 0
        );
        if (h > 0) frame.style.height = h + 'px';
        // Collapsing the frame above momentarily shrinks the whole page, so
        // the browser clamps the outer scroll offset toward 0. Everything in
        // this function is synchronous (no paint in between), so restoring the
        // captured offset here means the visitor never sees the jump. Without
        // it, a post-load settle-timer recheck — or a mobile URL-bar
        // show/hide firing `resize` while someone reads mid-page — snapped
        // the page back to the top.
        if ((window.scrollY || window.pageYOffset || 0) !== anchorY) {
          // Reading a layout property forces the outer document to reflow
          // against the height we just restored, so its scroll range is
          // current — otherwise scrollTo() clamps against the stale
          // (collapsed) range and lands short.
          void document.documentElement.scrollHeight;
          // `behavior: 'instant'` overrides the global
          // `html { scroll-behavior: smooth }` — otherwise the restore
          // animates and the visitor watches the page fly back up.
          window.scrollTo({ top: anchorY, left: 0, behavior: 'instant' });
        }
      } catch (e) {
        // Should never happen (same-origin srcdoc), but never let a
        // measurement failure break the rest of the page.
      }
    }

    frame.addEventListener('load', () => {
      applyHeight();
      // Fonts/images inside the iframe can still be settling right after
      // `load` fires, which can leave the measured height short by a few
      // dozen px — re-check a few times over the next second to catch up
      // without polling forever.
      [50, 150, 350, 700, 1200].forEach((ms) => setTimeout(applyHeight, ms));
    });

    resizeCmccFrame = function () {
      if (!loaded) {
        loaded = true;
        frame.srcdoc = tpl.innerHTML;
      } else {
        applyHeight();
      }
    };

    // If the CMCC view is already the active one on initial load (e.g. a
    // deep link straight to #project-cmcc-chance), showView() above ran
    // before this IIFE assigned `resizeCmccFrame`, so kick it off once
    // here too.
    if (!frame.hidden && frame.closest('main') && !frame.closest('main').hidden) {
      resizeCmccFrame();
    }

    window.addEventListener('resize', () => {
      if (loaded) applyHeight();
    });

    // The parent-level sticky sub-nav (`.case-embed-topbar`, see the big
    // comment in style.css for why this can't just be the embedded page's
    // own `position:sticky` topbar) — clicking a link here reads the
    // target element straight out of the iframe's `contentDocument`
    // (same-origin, so this is a plain synchronous DOM read, no
    // postMessage needed) and scrolls the outer page to it, offset by
    // both sticky bars' heights so the target lands clear of them.
    const stickyNav = document.getElementById('cmccStickyNav');
    if (stickyNav) {
      stickyNav.addEventListener('click', (e) => {
        const a = e.target.closest('a[data-cmcc-jump]');
        if (!a) return;
        e.preventDefault();
        let doc;
        try {
          doc = frame.contentDocument;
        } catch (err) {
          return;
        }
        if (!doc) return;
        const target = doc.getElementById(a.dataset.cmccJump);
        if (!target) return;
        const frameRect = frame.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        // Use the two sticky bars' own (scroll-position-independent)
        // heights rather than their current getBoundingClientRect(), so
        // this lands correctly whether or not `.case-embed-topbar` has
        // already transitioned into its "stuck" state at click time.
        const siteHeader = document.querySelector('.site-header');
        const stickyOffset = (siteHeader ? siteHeader.offsetHeight : 0) + stickyNav.offsetHeight;
        const currentScroll = window.scrollY || window.pageYOffset || 0;
        const absoluteTop = currentScroll + frameRect.top + targetRect.top - stickyOffset - 16;
        window.scrollTo({ top: Math.max(0, absoluteTop), behavior: 'smooth' });
      });
    }

    // "< All Projects" only makes sense while you're still near the top
    // of the case study — once the sticky bar has actually stuck to the
    // viewport (scrolled deep into the content), swap it out: hide the
    // back-link and let the "CMCC-Chance" brand act as a back-to-top
    // button instead. A zero-height sentinel placed where the bar
    // naturally sits (see index.html/style.css) plus an
    // IntersectionObserver is the standard, scroll-listener-free way to
    // detect "has this sticky element actually stuck yet" — it fires
    // only on the sentinel crossing the line, not on every scroll tick.
    const sentinel = document.getElementById('cmccStickySentinel');
    if (sentinel && stickyNav) {
      let stickyObserver = null;
      function setupStickyObserver() {
        if (stickyObserver) stickyObserver.disconnect();
        const siteHeader = document.querySelector('.site-header');
        const headerH = siteHeader ? siteHeader.offsetHeight : 0;
        stickyObserver = new IntersectionObserver(
          ([entry]) => {
            stickyNav.classList.toggle('is-stuck', !entry.isIntersecting);
          },
          { rootMargin: `-${headerH}px 0px 0px 0px`, threshold: 0 }
        );
        stickyObserver.observe(sentinel);
      }
      setupStickyObserver();
      // `--header-h` changes at the mobile breakpoint, which shifts
      // exactly where "stuck" kicks in — re-arm the observer with the
      // current header height whenever the viewport is resized.
      window.addEventListener('resize', setupStickyObserver);
    }

    const brandBtn = document.getElementById('cmccBrandBtn');
    if (brandBtn) {
      brandBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  })();

  /* ---------------------------------------------------------------- */
  /* 5. Thrive case study — same srcdoc-iframe embed pattern as CMCC-   */
  /*    Chance above, now including the same parent-level sticky sub-  */
  /*    nav treatment (added in a follow-up round, same reasoning as    */
  /*    CMCC's v18.33/34: a non-internally-scrolling iframe can't       */
  /*    support the embedded page's own `position:sticky` topbar).      */
  /* ---------------------------------------------------------------- */
  (function setupThriveFrame() {
    const frame = document.getElementById('thriveFrame');
    const tpl = document.getElementById('thriveFrameContent');
    if (!frame || !tpl) return;

    let loaded = false;

    function applyHeight() {
      try {
        const doc = frame.contentDocument;
        if (!doc || !doc.documentElement) return;
        // Give the iframe a stable, externally-anchored height (the outer
        // window's own viewport height) before measuring, so any `vh`-based
        // CSS inside the embedded page (e.g. a `min-height: 92vh` hero)
        // resolves against a fixed reference rather than the iframe's own
        // last-applied height. Skipping this would let a vh-sized element
        // and this measure-then-resize cycle reinforce each other into
        // runaway growth across the repeated settle-timer rechecks below —
        // found via FriendLi's export, whose hero uses `min-height:92vh`.
        // Remember where the visitor is before we touch the frame height.
        const anchorY = window.scrollY || window.pageYOffset || 0;
        frame.style.height = Math.max(window.innerHeight, 600) + 'px';
        const h = Math.max(
          doc.documentElement.scrollHeight,
          doc.body ? doc.body.scrollHeight : 0
        );
        if (h > 0) frame.style.height = h + 'px';
        // Collapsing the frame above momentarily shrinks the whole page, so
        // the browser clamps the outer scroll offset toward 0. Everything in
        // this function is synchronous (no paint in between), so restoring the
        // captured offset here means the visitor never sees the jump. Without
        // it, a post-load settle-timer recheck — or a mobile URL-bar
        // show/hide firing `resize` while someone reads mid-page — snapped
        // the page back to the top.
        if ((window.scrollY || window.pageYOffset || 0) !== anchorY) {
          // Reading a layout property forces the outer document to reflow
          // against the height we just restored, so its scroll range is
          // current — otherwise scrollTo() clamps against the stale
          // (collapsed) range and lands short.
          void document.documentElement.scrollHeight;
          // `behavior: 'instant'` overrides the global
          // `html { scroll-behavior: smooth }` — otherwise the restore
          // animates and the visitor watches the page fly back up.
          window.scrollTo({ top: anchorY, left: 0, behavior: 'instant' });
        }
      } catch (e) {
        // Should never happen (same-origin srcdoc), but never let a
        // measurement failure break the rest of the page.
      }
    }

    frame.addEventListener('load', () => {
      applyHeight();
      // Thrive's own hero image and fonts can still be settling right
      // after `load` fires — re-check a few times over the next few
      // seconds to catch up without polling forever (the bundler's own
      // asset-unpacking + React mount also happens post-load).
      [50, 150, 350, 700, 1200, 2000, 3200].forEach((ms) => setTimeout(applyHeight, ms));
    });

    resizeThriveFrame = function () {
      if (!loaded) {
        loaded = true;
        frame.srcdoc = tpl.innerHTML;
      } else {
        applyHeight();
      }
    };

    // Same deep-link-on-cold-load case as CMCC's frame above.
    if (!frame.hidden && frame.closest('main') && !frame.closest('main').hidden) {
      resizeThriveFrame();
    }

    window.addEventListener('resize', () => {
      if (loaded) applyHeight();
    });

    // Parent-level sticky sub-nav click handling — reads target section
    // positions straight out of the iframe's `contentDocument` (same-origin,
    // synchronous), same approach as CMCC's `cmccStickyNav` above.
    const stickyNav = document.getElementById('thriveStickyNav');
    if (stickyNav) {
      stickyNav.addEventListener('click', (e) => {
        const a = e.target.closest('a[data-thrive-jump]');
        if (!a) return;
        e.preventDefault();
        let doc;
        try {
          doc = frame.contentDocument;
        } catch (err) {
          return;
        }
        if (!doc) return;
        const target = doc.getElementById(a.dataset.thriveJump);
        if (!target) return;
        const frameRect = frame.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const siteHeader = document.querySelector('.site-header');
        const stickyOffset = (siteHeader ? siteHeader.offsetHeight : 0) + stickyNav.offsetHeight;
        const currentScroll = window.scrollY || window.pageYOffset || 0;
        const absoluteTop = currentScroll + frameRect.top + targetRect.top - stickyOffset - 16;
        window.scrollTo({ top: Math.max(0, absoluteTop), behavior: 'smooth' });
      });
    }

    // "< All Projects" hides once the sticky bar has actually stuck to the
    // viewport, same sentinel + IntersectionObserver pattern as CMCC's.
    const sentinel = document.getElementById('thriveStickySentinel');
    if (sentinel && stickyNav) {
      let stickyObserver = null;
      function setupStickyObserver() {
        if (stickyObserver) stickyObserver.disconnect();
        const siteHeader = document.querySelector('.site-header');
        const headerH = siteHeader ? siteHeader.offsetHeight : 0;
        stickyObserver = new IntersectionObserver(
          ([entry]) => {
            stickyNav.classList.toggle('is-stuck', !entry.isIntersecting);
          },
          { rootMargin: `-${headerH}px 0px 0px 0px`, threshold: 0 }
        );
        stickyObserver.observe(sentinel);
      }
      setupStickyObserver();
      window.addEventListener('resize', setupStickyObserver);
    }

    const brandBtn = document.getElementById('thriveBrandBtn');
    if (brandBtn) {
      brandBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  })();

  /* ---------------------------------------------------------------- */
  /* 6. A Journey case study — same srcdoc-iframe embed pattern as     */
  /*    CMCC-Chance/Thrive above, now including the same parent-level  */
  /*    sticky sub-nav treatment (added in a follow-up round, same     */
  /*    reasoning as CMCC's v18.33/34 and Thrive's v19.1: a non-        */
  /*    internally-scrolling iframe can't support the embedded page's  */
  /*    own `position:sticky` topbar).                                 */
  /* ---------------------------------------------------------------- */
  (function setupAJourneyFrame() {
    const frame = document.getElementById('aJourneyFrame');
    const tpl = document.getElementById('aJourneyFrameContent');
    if (!frame || !tpl) return;

    let loaded = false;

    function applyHeight() {
      try {
        const doc = frame.contentDocument;
        if (!doc || !doc.documentElement) return;
        // Give the iframe a stable, externally-anchored height (the outer
        // window's own viewport height) before measuring, so any `vh`-based
        // CSS inside the embedded page (e.g. a `min-height: 92vh` hero)
        // resolves against a fixed reference rather than the iframe's own
        // last-applied height. Skipping this would let a vh-sized element
        // and this measure-then-resize cycle reinforce each other into
        // runaway growth across the repeated settle-timer rechecks below —
        // found via FriendLi's export, whose hero uses `min-height:92vh`.
        // Remember where the visitor is before we touch the frame height.
        const anchorY = window.scrollY || window.pageYOffset || 0;
        frame.style.height = Math.max(window.innerHeight, 600) + 'px';
        const h = Math.max(
          doc.documentElement.scrollHeight,
          doc.body ? doc.body.scrollHeight : 0
        );
        if (h > 0) frame.style.height = h + 'px';
        // Collapsing the frame above momentarily shrinks the whole page, so
        // the browser clamps the outer scroll offset toward 0. Everything in
        // this function is synchronous (no paint in between), so restoring the
        // captured offset here means the visitor never sees the jump. Without
        // it, a post-load settle-timer recheck — or a mobile URL-bar
        // show/hide firing `resize` while someone reads mid-page — snapped
        // the page back to the top.
        if ((window.scrollY || window.pageYOffset || 0) !== anchorY) {
          // Reading a layout property forces the outer document to reflow
          // against the height we just restored, so its scroll range is
          // current — otherwise scrollTo() clamps against the stale
          // (collapsed) range and lands short.
          void document.documentElement.scrollHeight;
          // `behavior: 'instant'` overrides the global
          // `html { scroll-behavior: smooth }` — otherwise the restore
          // animates and the visitor watches the page fly back up.
          window.scrollTo({ top: anchorY, left: 0, behavior: 'instant' });
        }
      } catch (e) {
        // Should never happen (same-origin srcdoc), but never let a
        // measurement failure break the rest of the page.
      }
    }

    frame.addEventListener('load', () => {
      applyHeight();
      // Same settle-and-recheck window as Thrive's frame — this bundler
      // export also does its own asset-unpacking + component mount just
      // after `load` fires.
      [50, 150, 350, 700, 1200, 2000, 3200].forEach((ms) => setTimeout(applyHeight, ms));
    });

    resizeAJourneyFrame = function () {
      if (!loaded) {
        loaded = true;
        frame.srcdoc = tpl.innerHTML;
      } else {
        applyHeight();
      }
    };

    // Same deep-link-on-cold-load case as CMCC's/Thrive's frames above.
    if (!frame.hidden && frame.closest('main') && !frame.closest('main').hidden) {
      resizeAJourneyFrame();
    }

    window.addEventListener('resize', () => {
      if (loaded) applyHeight();
    });

    // Parent-level sticky sub-nav click handling — reads target section
    // positions straight out of the iframe's `contentDocument` (same-origin,
    // synchronous), same approach as CMCC's/Thrive's sticky nav above.
    const stickyNav = document.getElementById('aJourneyStickyNav');
    if (stickyNav) {
      stickyNav.addEventListener('click', (e) => {
        const a = e.target.closest('a[data-ajourney-jump]');
        if (!a) return;
        e.preventDefault();
        let doc;
        try {
          doc = frame.contentDocument;
        } catch (err) {
          return;
        }
        if (!doc) return;
        const target = doc.getElementById(a.dataset.ajourneyJump);
        if (!target) return;
        const frameRect = frame.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const siteHeader = document.querySelector('.site-header');
        const stickyOffset = (siteHeader ? siteHeader.offsetHeight : 0) + stickyNav.offsetHeight;
        const currentScroll = window.scrollY || window.pageYOffset || 0;
        const absoluteTop = currentScroll + frameRect.top + targetRect.top - stickyOffset - 16;
        window.scrollTo({ top: Math.max(0, absoluteTop), behavior: 'smooth' });
      });
    }

    // "< All Projects" hides once the sticky bar has actually stuck to the
    // viewport, same sentinel + IntersectionObserver pattern as CMCC's/Thrive's.
    const sentinel = document.getElementById('aJourneyStickySentinel');
    if (sentinel && stickyNav) {
      let stickyObserver = null;
      function setupStickyObserver() {
        if (stickyObserver) stickyObserver.disconnect();
        const siteHeader = document.querySelector('.site-header');
        const headerH = siteHeader ? siteHeader.offsetHeight : 0;
        stickyObserver = new IntersectionObserver(
          ([entry]) => {
            stickyNav.classList.toggle('is-stuck', !entry.isIntersecting);
          },
          { rootMargin: `-${headerH}px 0px 0px 0px`, threshold: 0 }
        );
        stickyObserver.observe(sentinel);
      }
      setupStickyObserver();
      window.addEventListener('resize', setupStickyObserver);
    }

    const brandBtn = document.getElementById('aJourneyBrandBtn');
    if (brandBtn) {
      brandBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  })();

  /* ---------------------------------------------------------------- */
  /* 7. FriendLi case study — same srcdoc-iframe embed pattern as      */
  /*    CMCC-Chance/Thrive/A Journey above, now including the same     */
  /*    parent-level sticky sub-nav treatment (same reasoning as       */
  /*    CMCC's v18.33/34, Thrive's v19.1, A Journey's v20.3: a non-    */
  /*    internally-scrolling iframe can't support the embedded page's  */
  /*    own `position:sticky` topbar).                                 */
  /* ---------------------------------------------------------------- */
  (function setupFriendliFrame() {
    const frame = document.getElementById('friendliFrame');
    const tpl = document.getElementById('friendliFrameContent');
    if (!frame || !tpl) return;

    let loaded = false;

    function applyHeight() {
      try {
        const doc = frame.contentDocument;
        if (!doc || !doc.documentElement) return;
        // Give the iframe a stable, externally-anchored height (the outer
        // window's own viewport height) before measuring, so any `vh`-based
        // CSS inside the embedded page (e.g. a `min-height: 92vh` hero)
        // resolves against a fixed reference rather than the iframe's own
        // last-applied height. Skipping this would let a vh-sized element
        // and this measure-then-resize cycle reinforce each other into
        // runaway growth across the repeated settle-timer rechecks below —
        // found via FriendLi's export, whose hero uses `min-height:92vh`.
        // Remember where the visitor is before we touch the frame height.
        const anchorY = window.scrollY || window.pageYOffset || 0;
        frame.style.height = Math.max(window.innerHeight, 600) + 'px';
        const h = Math.max(
          doc.documentElement.scrollHeight,
          doc.body ? doc.body.scrollHeight : 0
        );
        if (h > 0) frame.style.height = h + 'px';
        // Collapsing the frame above momentarily shrinks the whole page, so
        // the browser clamps the outer scroll offset toward 0. Everything in
        // this function is synchronous (no paint in between), so restoring the
        // captured offset here means the visitor never sees the jump. Without
        // it, a post-load settle-timer recheck — or a mobile URL-bar
        // show/hide firing `resize` while someone reads mid-page — snapped
        // the page back to the top.
        if ((window.scrollY || window.pageYOffset || 0) !== anchorY) {
          // Reading a layout property forces the outer document to reflow
          // against the height we just restored, so its scroll range is
          // current — otherwise scrollTo() clamps against the stale
          // (collapsed) range and lands short.
          void document.documentElement.scrollHeight;
          // `behavior: 'instant'` overrides the global
          // `html { scroll-behavior: smooth }` — otherwise the restore
          // animates and the visitor watches the page fly back up.
          window.scrollTo({ top: anchorY, left: 0, behavior: 'instant' });
        }
      } catch (e) {
        // Should never happen (same-origin srcdoc), but never let a
        // measurement failure break the rest of the page.
      }
    }

    frame.addEventListener('load', () => {
      applyHeight();
      // Same settle-and-recheck window as the other bundler-export
      // embeds — this one also does its own asset-unpacking + component
      // mount just after `load` fires.
      [50, 150, 350, 700, 1200, 2000, 3200].forEach((ms) => setTimeout(applyHeight, ms));
    });

    resizeFriendliFrame = function () {
      if (!loaded) {
        loaded = true;
        frame.srcdoc = tpl.innerHTML;
      } else {
        applyHeight();
      }
    };

    // Same deep-link-on-cold-load case as the other frames above.
    if (!frame.hidden && frame.closest('main') && !frame.closest('main').hidden) {
      resizeFriendliFrame();
    }

    window.addEventListener('resize', () => {
      if (loaded) applyHeight();
    });

    // Parent-level sticky sub-nav click handling — reads target section
    // positions straight out of the iframe's `contentDocument` (same-origin,
    // synchronous), same approach as the other sticky navs above.
    const stickyNav = document.getElementById('friendliStickyNav');
    if (stickyNav) {
      stickyNav.addEventListener('click', (e) => {
        const a = e.target.closest('a[data-friendli-jump]');
        if (!a) return;
        e.preventDefault();
        let doc;
        try {
          doc = frame.contentDocument;
        } catch (err) {
          return;
        }
        if (!doc) return;
        const target = doc.getElementById(a.dataset.friendliJump);
        if (!target) return;
        const frameRect = frame.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const siteHeader = document.querySelector('.site-header');
        const stickyOffset = (siteHeader ? siteHeader.offsetHeight : 0) + stickyNav.offsetHeight;
        const currentScroll = window.scrollY || window.pageYOffset || 0;
        const absoluteTop = currentScroll + frameRect.top + targetRect.top - stickyOffset - 16;
        window.scrollTo({ top: Math.max(0, absoluteTop), behavior: 'smooth' });
      });
    }

    // "< All Projects" hides once the sticky bar has actually stuck to the
    // viewport, same sentinel + IntersectionObserver pattern as the others.
    const sentinel = document.getElementById('friendliStickySentinel');
    if (sentinel && stickyNav) {
      let stickyObserver = null;
      function setupStickyObserver() {
        if (stickyObserver) stickyObserver.disconnect();
        const siteHeader = document.querySelector('.site-header');
        const headerH = siteHeader ? siteHeader.offsetHeight : 0;
        stickyObserver = new IntersectionObserver(
          ([entry]) => {
            stickyNav.classList.toggle('is-stuck', !entry.isIntersecting);
          },
          { rootMargin: `-${headerH}px 0px 0px 0px`, threshold: 0 }
        );
        stickyObserver.observe(sentinel);
      }
      setupStickyObserver();
      window.addEventListener('resize', setupStickyObserver);
    }

    const brandBtn = document.getElementById('friendliBrandBtn');
    if (brandBtn) {
      brandBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  })();

  /* ---------------------------------------------------------------- */
  /* 8. Exhibition case studies (Work-01..05)                          */
  /* Jeju Olive Flounder / K-Food Night / Jeju K-Seafood Pop-up /      */
  /* TRAFS K-Seafood / WHX Korea. Each is a cleaned-to-static          */
  /* conversion of a Claude Design ".dc.html" export (React            */
  /* `support.js` runtime removed, `{{ }}` props + `<sc-if>`/`<x-dc>`  */
  /* wrappers resolved at conversion time), embedded with the exact    */
  /* same srcdoc-iframe + parent-level sticky sub-nav pattern as        */
  /* sections 4–7 above. They're byte-for-byte structurally identical, */
  /* so this is one factory called five times rather than five more    */
  /* ~100-line copy-pasted IIFEs. `applyHeight()` keeps the v21        */
  /* vh-feedback-loop guard (pin to the outer viewport height before   */
  /* measuring) even though each source's `min-height:94vh` hero was   */
  /* already converted to a fixed px value during the .dc.html clean.  */
  /* ---------------------------------------------------------------- */
  function setupEmbedCaseStudy(prefix, viewName, jumpAttr) {
    const frame = document.getElementById(prefix + 'Frame');
    const tpl = document.getElementById(prefix + 'FrameContent');
    if (!frame || !tpl) return;

    let loaded = false;

    function applyHeight() {
      try {
        const doc = frame.contentDocument;
        if (!doc || !doc.documentElement) return;
        // Remember where the visitor is before we touch the frame height.
        const anchorY = window.scrollY || window.pageYOffset || 0;
        frame.style.height = Math.max(window.innerHeight, 600) + 'px';
        const h = Math.max(
          doc.documentElement.scrollHeight,
          doc.body ? doc.body.scrollHeight : 0
        );
        if (h > 0) frame.style.height = h + 'px';
        // Collapsing the frame above momentarily shrinks the whole page, so
        // the browser clamps the outer scroll offset toward 0. Everything in
        // this function is synchronous (no paint in between), so restoring the
        // captured offset here means the visitor never sees the jump. Without
        // it, a post-load settle-timer recheck — or a mobile URL-bar
        // show/hide firing `resize` while someone reads mid-page — snapped
        // the page back to the top.
        if ((window.scrollY || window.pageYOffset || 0) !== anchorY) {
          // Reading a layout property forces the outer document to reflow
          // against the height we just restored, so its scroll range is
          // current — otherwise scrollTo() clamps against the stale
          // (collapsed) range and lands short.
          void document.documentElement.scrollHeight;
          // `behavior: 'instant'` overrides the global
          // `html { scroll-behavior: smooth }` — otherwise the restore
          // animates and the visitor watches the page fly back up.
          window.scrollTo({ top: anchorY, left: 0, behavior: 'instant' });
        }
      } catch (e) {
        /* same-origin srcdoc — should never throw; never break the page if it does */
      }
    }

    frame.addEventListener('load', () => {
      applyHeight();
      [50, 150, 350, 700, 1200, 2000].forEach((ms) => setTimeout(applyHeight, ms));
    });

    const resizer = function () {
      if (!loaded) {
        loaded = true;
        frame.srcdoc = tpl.innerHTML;
      } else {
        applyHeight();
      }
    };
    embedFrameResizers[viewName] = resizer;

    // Deep-link straight to this view on cold load: showView() ran before
    // this factory registered `resizer`, so kick it off once here too.
    if (!frame.hidden && frame.closest('main') && !frame.closest('main').hidden) {
      resizer();
    }

    window.addEventListener('resize', () => {
      if (loaded) applyHeight();
    });

    const stickyNav = document.getElementById(prefix + 'StickyNav');
    if (stickyNav) {
      stickyNav.addEventListener('click', (e) => {
        const a = e.target.closest('a[' + jumpAttr + ']');
        if (!a) return;
        e.preventDefault();
        let doc;
        try {
          doc = frame.contentDocument;
        } catch (err) {
          return;
        }
        if (!doc) return;
        const target = doc.getElementById(a.getAttribute(jumpAttr));
        if (!target) return;
        const frameRect = frame.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const siteHeader = document.querySelector('.site-header');
        const stickyOffset = (siteHeader ? siteHeader.offsetHeight : 0) + stickyNav.offsetHeight;
        const currentScroll = window.scrollY || window.pageYOffset || 0;
        const absoluteTop = currentScroll + frameRect.top + targetRect.top - stickyOffset - 16;
        window.scrollTo({ top: Math.max(0, absoluteTop), behavior: 'smooth' });
      });
    }

    const sentinel = document.getElementById(prefix + 'StickySentinel');
    if (sentinel && stickyNav) {
      let stickyObserver = null;
      function setupStickyObserver() {
        if (stickyObserver) stickyObserver.disconnect();
        const siteHeader = document.querySelector('.site-header');
        const headerH = siteHeader ? siteHeader.offsetHeight : 0;
        stickyObserver = new IntersectionObserver(
          ([entry]) => {
            stickyNav.classList.toggle('is-stuck', !entry.isIntersecting);
          },
          { rootMargin: `-${headerH}px 0px 0px 0px`, threshold: 0 }
        );
        stickyObserver.observe(sentinel);
      }
      setupStickyObserver();
      window.addEventListener('resize', setupStickyObserver);
    }

    const brandBtn = document.getElementById(prefix + 'BrandBtn');
    if (brandBtn) {
      brandBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }

  [
    ['jejuFlounder', 'project-jeju-olive-flounder', 'data-jeju-flounder-jump'],
    ['kFoodNight', 'project-k-food-night', 'data-kfood-jump'],
    ['jejuPopup', 'project-jeju-kseafood-popup', 'data-jeju-popup-jump'],
    ['trafs', 'project-trafs-kseafood', 'data-trafs-jump'],
    ['whxKorea', 'project-whx-korea', 'data-whx-jump'],
    ['lerum', 'project-lerum', 'data-lerum-jump'],
    ['storade', 'project-storade', 'data-storade-jump'],
    ['chacChac', 'project-chac-chac', 'data-chac-chac-jump'],
    ['sos', 'project-sos', 'data-sos-jump'],
    ['uplatform', 'project-uplatform', 'data-uplatform-jump'],
    ['leitzMu', 'project-leitz-mu', 'data-leitz-mu-jump'],
  ].forEach((args) => setupEmbedCaseStudy.apply(null, args));

  /* ---------------------------------------------------------------- */
  /* 9. Case-study sticky sub-nav — mobile collapse                     */
  /* On phones the 8 section jump-links can't share the bar with the   */
  /* back-link + brand without the brand text overlapping the first    */
  /* link. Collapse them behind a "Sections" toggle that drops down a  */
  /* full-width menu (style.css @media <=760px does the show/hide;     */
  /* this just injects the button and flips a `.nav-open` class). One  */
  /* generic pass over every `.case-embed-topbar` — the 4 hand-written */
  /* embeds, the 5 factory ones, and any future — no per-embed wiring. */
  /* ---------------------------------------------------------------- */
  (function setupStickyNavCollapse() {
    const bars = document.querySelectorAll('.case-embed-topbar');
    if (!bars.length) return;
    const CHEVRON =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    bars.forEach((bar) => {
      const inner = bar.querySelector('.case-embed-topbar-inner');
      const nav = bar.querySelector('.case-embed-topbar-nav');
      if (!inner || !nav || inner.querySelector('.case-embed-topbar-toggle')) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'case-embed-topbar-toggle';
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Case study sections');
      btn.innerHTML = 'Sections ' + CHEVRON;
      inner.insertBefore(btn, nav);

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = bar.classList.toggle('nav-open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });

      // Tapping a section link closes the menu. The actual jump-scroll is
      // done by this embed's own sticky-nav click listener, which sees the
      // same (non-prevented) click as it bubbles up to `.case-embed-topbar`.
      nav.addEventListener('click', (e) => {
        if (e.target.closest('a')) {
          bar.classList.remove('nav-open');
          btn.setAttribute('aria-expanded', 'false');
        }
      });
    });

    // Tap anywhere outside an open menu closes it.
    document.addEventListener('click', (e) => {
      document.querySelectorAll('.case-embed-topbar.nav-open').forEach((bar) => {
        if (bar.contains(e.target)) return;
        bar.classList.remove('nav-open');
        const b = bar.querySelector('.case-embed-topbar-toggle');
        if (b) b.setAttribute('aria-expanded', 'false');
      });
    });
  })();

  /* ---------------------------------------------------------------- */
  /* 10. All-Projects category jump nav                                */
  /* The pill buttons under the intro scroll to their `.projects-group` */
  /* section. Plain scrollIntoView — no hash change, so the view       */
  /* router is never triggered; the header offset is handled by        */
  /* `scroll-margin-top` on `.projects-group` in style.css.            */
  /* ---------------------------------------------------------------- */
  (function setupProjectsCatNav() {
    const nav = document.querySelector('.projects-catnav');
    if (!nav) return;
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-projects-jump]');
      if (!btn) return;
      const target = document.getElementById(btn.getAttribute('data-projects-jump'));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  })();

  /* ---------------------------------------------------------------- */
  /* 11. Skip link (a11y v32 — audit #14, SC 2.4.1 Bypass Blocks)      */
  /* Moves focus past the persistent header (and, on Home, past the    */
  /* drawer controls) to whichever <main> view is currently shown.     */
  /* ---------------------------------------------------------------- */
  (function setupSkipLink() {
    const skip = document.querySelector('.skip-link');
    if (!skip) return;
    skip.addEventListener('click', (e) => {
      e.preventDefault();
      const main =
        document.querySelector('main[id^="view-"]:not([hidden])') ||
        document.querySelector('main');
      if (!main) return;
      if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
      main.focus();
      main.scrollIntoView({ block: 'start' });
    });
  })();

  /* ---------------------------------------------------------------- */
  /* 12. Case-study closing bar — "Back to top" (v32)                  */
  /* Every case-study view ends with an identical <div class="case-    */
  /* outro">; its button scrolls the page back to the top.            */
  /* ---------------------------------------------------------------- */
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-case-top]')) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

})();
