/* ==========================================================================
   PORTRAIT REVEAL — Front (casual) <-> Back (graduation), organic WebGL mask
   Architecture: pointer -> organic brush -> previous mask texture -> decay +
   propagation + noise distortion -> new mask texture -> final compositing.
   Two ping-pong WebGLRenderTargets drive the mask simulation; a fullscreen
   quad composites uFront/uBack through it every frame. No CSS masking.
   ========================================================================== */
(function () {
  'use strict';

  function init() {
    var container = document.getElementById('xpPortrait');
    if (!container) return;

    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var fallbackImg = container.querySelector('.xp-portrait-fallback');

    function hasWebGL() {
      try {
        var c = document.createElement('canvas');
        return !!(window.WebGLRenderingContext &&
          (c.getContext('webgl') || c.getContext('experimental-webgl')));
      } catch (e) { return false; }
    }

    // reduced motion / no Three.js / no WebGL -> the plain <img class="xp-portrait-fallback">
    // (Front, already in the markup) stays exactly as-is. No error shown.
    if (reduce || typeof THREE === 'undefined' || !hasWebGL()) return;

    var frontSrc = container.getAttribute('data-front');
    var backSrc = container.getAttribute('data-back');

    var SETTINGS = {
      brushSize: 0.17,
      brushStrength: 0.95,
      decay: 0.96,
      noiseScale: 5.0,
      noiseStrength: 0.05,
      velocityInfluence: 0.5,
      edgeLo: 0.16,
      edgeHi: 0.82
    };

    var simRes = window.innerWidth < 700 ? 256 : 512;

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) { return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.domElement.className = 'xp-portrait-canvas';
    container.appendChild(renderer.domElement);

    /* ---------------- mask simulation (ping-pong) ---------------- */
    var rtOpts = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false
    };
    var rtA = new THREE.WebGLRenderTarget(simRes, simRes, rtOpts);
    var rtB = new THREE.WebGLRenderTarget(simRes, simRes, rtOpts);
    var readTarget = rtA, writeTarget = rtB;

    var quadGeo = new THREE.PlaneGeometry(2, 2);
    var ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    var passVert = 'varying vec2 vUv;\nvoid main(){ vUv = uv; gl_Position = vec4(position,1.0); }';

    var NOISE = '' +
      'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }' +
      'float vnoise(vec2 p){' +
      '  vec2 i = floor(p); vec2 f = fract(p);' +
      '  float a = hash(i), b = hash(i + vec2(1.0,0.0)), c = hash(i + vec2(0.0,1.0)), d = hash(i + vec2(1.0,1.0));' +
      '  vec2 u = f * f * (3.0 - 2.0 * f);' +
      '  return mix(a,b,u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;' +
      '}' +
      'float fbm(vec2 p){' +
      '  float value = 0.0, amp = 0.5;' +
      '  for (int i = 0; i < 4; i++) { value += amp * vnoise(p); p *= 2.0; amp *= 0.5; }' +
      '  return value;' +
      '}';

    var simUniforms = {
      uPrevious: { value: null },
      uPointer: { value: new THREE.Vector2(-10, -10) },
      uPointerActive: { value: 0 },
      uVelocity: { value: new THREE.Vector2(0, 0) },
      uTime: { value: 0 },
      uDecay: { value: SETTINGS.decay },
      uBrushRadius: { value: SETTINGS.brushSize },
      uBrushStrength: { value: SETTINGS.brushStrength },
      uNoiseScale: { value: SETTINGS.noiseScale },
      uNoiseStrength: { value: SETTINGS.noiseStrength },
      uVelocityInfluence: { value: SETTINGS.velocityInfluence },
      uAspect: { value: 1 },
      uTexel: { value: new THREE.Vector2(1 / simRes, 1 / simRes) }
    };

    var simMaterial = new THREE.ShaderMaterial({
      uniforms: simUniforms,
      vertexShader: passVert,
      fragmentShader: NOISE +
        'uniform sampler2D uPrevious;' +
        'uniform vec2 uPointer;' +
        'uniform float uPointerActive;' +
        'uniform vec2 uVelocity;' +
        'uniform float uTime;' +
        'uniform float uDecay;' +
        'uniform float uBrushRadius;' +
        'uniform float uBrushStrength;' +
        'uniform float uNoiseScale;' +
        'uniform float uNoiseStrength;' +
        'uniform float uVelocityInfluence;' +
        'uniform float uAspect;' +
        'uniform vec2 uTexel;' +
        'varying vec2 vUv;' +
        'void main(){' +
        '  vec2 uv = vUv;' +
        // propagate: blend toward the 4-neighbour average so the reveal feels
        // slightly fluid, without fully replacing (that would out-live uDecay)
        '  float self = texture2D(uPrevious, uv).r;' +
        '  float blurred = self;' +
        '  blurred += texture2D(uPrevious, uv + vec2(uTexel.x, 0.0)).r;' +
        '  blurred += texture2D(uPrevious, uv - vec2(uTexel.x, 0.0)).r;' +
        '  blurred += texture2D(uPrevious, uv + vec2(0.0, uTexel.y)).r;' +
        '  blurred += texture2D(uPrevious, uv - vec2(0.0, uTexel.y)).r;' +
        '  blurred /= 5.0;' +
        '  float mask = mix(self, blurred, 0.5) * uDecay;' +
        '  if (uPointerActive > 0.5) {' +
        '    vec2 toPoint = uv - uPointer;' +
        '    toPoint.x *= uAspect;' +          // keep the brush circular on a non-square portrait
        '    float speed = length(uVelocity);' +
        '    vec2 dir = speed > 0.0006 ? normalize(uVelocity) : vec2(1.0, 0.0);' +
        '    vec2 perp = vec2(-dir.y, dir.x);' +
        '    float along = dot(toPoint, dir);' +
        '    float across = dot(toPoint, perp);' +
        '    float stretch = 1.0 + uVelocityInfluence * clamp(speed * 55.0, 0.0, 1.4);' +
        '    vec2 warped = vec2(along / stretch, across);' +
        '    float d = length(warped);' +
        '    float n = fbm(uv * uNoiseScale + uTime * 0.15);' +
        '    d += (n - 0.5) * uNoiseStrength * 2.0;' +
        '    float brush = 1.0 - smoothstep(uBrushRadius * 0.35, uBrushRadius, d);' +
        '    mask = max(mask, brush * uBrushStrength);' +
        '  }' +
        '  mask = clamp(mask, 0.0, 1.0);' +
        '  gl_FragColor = vec4(mask, mask, mask, 1.0);' +
        '}'
    });
    var simScene = new THREE.Scene();
    simScene.add(new THREE.Mesh(quadGeo, simMaterial));

    renderer.setRenderTarget(rtA); renderer.clear();
    renderer.setRenderTarget(rtB); renderer.clear();
    renderer.setRenderTarget(null);

    /* ---------------- final compositing ---------------- */
    // Both are cutout PNGs with soft/antialiased edges around the hair; if we
    // sample RGB straight (ignoring alpha, which the compositor never reads)
    // those edge pixels can carry a baked-in light/white matte and show up as
    // a pale fringe wherever the mask reveals near one. Flatten each onto a
    // solid white backdrop FIRST (via a 2D canvas, which alpha-blends
    // correctly), then hand that bitmap to WebGL as an ordinary opaque texture.
    function flattenOntoBackdrop(img, bg) {
      var c = document.createElement('canvas');
      c.width = img.naturalWidth || img.width;
      c.height = img.naturalHeight || img.height;
      var ctx = c.getContext('2d');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return c;
    }
    // match the card's own background (--paper) rather than a hardcoded
    // white, so the portrait sits flush with whatever ground the section
    // is on (and keeps following it if the band ever flips light/dark)
    function sectionBg() {
      return getComputedStyle(container).backgroundColor || '#ffffff';
    }

    function loadFlattened(src, onReady) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        var tex = new THREE.CanvasTexture(flattenOntoBackdrop(img, sectionBg()));
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.encoding = THREE.sRGBEncoding;
        onReady(tex);
      };
      img.src = src;
    }

    // 1x1 white placeholder so the sampler2D uniforms are never null while
    // the real (async-decoded) textures are still loading
    var placeholderTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
    placeholderTex.needsUpdate = true;

    // Front + Back here are a pre-matched pair (same size/position, supplied
    // already aligned) so no offset/scale correction is needed by default —
    // uBackOffset/uBackScale stay at identity but remain live-tunable via
    // window.__portraitCalib(dx, dy, sx, sy) if a future pair needs it.
    var finalUniforms = {
      uFront: { value: placeholderTex },
      uBack: { value: placeholderTex },
      uMask: { value: null },
      uEdgeLo: { value: SETTINGS.edgeLo },
      uEdgeHi: { value: SETTINGS.edgeHi },
      uBackOffset: { value: new THREE.Vector2(0, 0) },
      uBackScale: { value: new THREE.Vector2(1.0, 1.0) },
      uForceBack: { value: 0 },
      // canvas box may now be a very different shape than the 1851:1080
      // source photos (it's a full-bleed banner, not a fixed-ratio card) —
      // uContainerAspect drives a shader-side "cover crop" (see coverUv())
      // so the photo itself is always cropped, never stretched/distorted.
      uContainerAspect: { value: 1 }
    };
    loadFlattened(frontSrc, function (tex) { finalUniforms.uFront.value = tex; });
    loadFlattened(backSrc, function (tex) { finalUniforms.uBack.value = tex; });
    var finalMaterial = new THREE.ShaderMaterial({
      uniforms: finalUniforms,
      vertexShader: passVert,
      fragmentShader:
        'uniform sampler2D uFront;' +
        'uniform sampler2D uBack;' +
        'uniform sampler2D uMask;' +
        'uniform float uEdgeLo;' +
        'uniform float uEdgeHi;' +
        'uniform vec2 uBackOffset;' +
        'uniform vec2 uBackScale;' +
        'uniform float uForceBack;' +
        'uniform float uContainerAspect;' +
        'varying vec2 vUv;' +
        // object-fit:cover equivalent — the source photos are a fixed
        // 1851:1080, but the canvas box (uContainerAspect) may differ, so
        // crop (never stretch) to fill it, anchored to the top so the
        // face stays put and any crop comes off the bottom/sides.
        'const float IMG_ASPECT = 1851.0 / 1080.0;' +
        'vec2 coverUv(vec2 uv){' +
        '  if (uContainerAspect > IMG_ASPECT) {' +
        '    float vis = IMG_ASPECT / uContainerAspect;' +
        '    return vec2(uv.x, uv.y * vis + (1.0 - vis));' +
        '  } else {' +
        '    float vis = uContainerAspect / IMG_ASPECT;' +
        '    return vec2(uv.x * vis + (1.0 - vis) * 0.5, uv.y);' +
        '  }' +
        '}' +
        'void main(){' +
        '  vec2 cuv = coverUv(vUv);' +
        '  vec4 frontColor = texture2D(uFront, cuv);' +
        '  vec2 buv = (cuv - 0.5) / uBackScale + 0.5 + uBackOffset;' +
        '  vec4 backColor = texture2D(uBack, buv);' +
        '  float mask = texture2D(uMask, vUv).r;' +
        '  float m = max(smoothstep(uEdgeLo, uEdgeHi, mask), uForceBack);' +
        '  gl_FragColor = mix(frontColor, backColor, m);' +
        '}'
    });
    var finalScene = new THREE.Scene();
    finalScene.add(new THREE.Mesh(quadGeo, finalMaterial));

    // calibration helper — from devtools: window.__portraitCalib(dx, dy, sx, sy)
    window.__portraitCalib = function (dx, dy, sx, sy) {
      finalUniforms.uBackOffset.value.set(dx, dy);
      finalUniforms.uBackScale.value.set(sx || 1, sy || 1);
    };
    window.__portraitForceBack = function (on) {
      finalUniforms.uForceBack.value = on ? 1 : 0;
    };

    /* ---------------- pointer tracking ---------------- */
    var pointer = { x: -10, y: -10 };
    var velocity = { x: 0, y: 0 };
    var active = false;
    var hasPointer = false;
    var lastMoveTime = performance.now();

    function toUV(clientX, clientY) {
      var rect = renderer.domElement.getBoundingClientRect();
      return {
        x: (clientX - rect.left) / rect.width,
        y: 1.0 - (clientY - rect.top) / rect.height
      };
    }
    function onPointerMove(e) {
      var uv = toUV(e.clientX, e.clientY);
      var now = performance.now();
      var dt = Math.max(now - lastMoveTime, 1);
      if (hasPointer) {
        velocity.x = (uv.x - pointer.x) / dt * 16;
        velocity.y = (uv.y - pointer.y) / dt * 16;
      }
      pointer.x = uv.x; pointer.y = uv.y;
      hasPointer = true;
      active = true;
      lastMoveTime = now;
    }
    function onPointerDown(e) {
      try { container.setPointerCapture(e.pointerId); } catch (err) {}
      onPointerMove(e);
    }
    function onPointerEnd() { active = false; }

    container.addEventListener('pointermove', onPointerMove, { passive: true });
    container.addEventListener('pointerdown', onPointerDown, { passive: true });
    container.addEventListener('pointerup', onPointerEnd, { passive: true });
    container.addEventListener('pointerleave', onPointerEnd, { passive: true });
    container.addEventListener('pointercancel', onPointerEnd, { passive: true });

    /* ---------------- sizing ---------------- */
    function setSize() {
      var w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, true);
      simUniforms.uAspect.value = w / h;
      finalUniforms.uContainerAspect.value = w / h;
    }
    setSize();
    window.addEventListener('resize', setSize);
    if ('ResizeObserver' in window) new ResizeObserver(setSize).observe(container);

    /* ---------------- render loop (paused while off-screen) ---------------- */
    var raf = null;
    var startTime = performance.now();
    function step() {
      raf = requestAnimationFrame(step);
      simUniforms.uTime.value = (performance.now() - startTime) / 1000;
      simUniforms.uPointer.value.set(pointer.x, pointer.y);
      simUniforms.uPointerActive.value = active ? 1 : 0;
      simUniforms.uVelocity.value.set(velocity.x, velocity.y);
      simUniforms.uPrevious.value = readTarget.texture;

      renderer.setRenderTarget(writeTarget);
      renderer.render(simScene, ortho);
      renderer.setRenderTarget(null);

      var tmp = readTarget; readTarget = writeTarget; writeTarget = tmp;

      finalUniforms.uMask.value = readTarget.texture;
      renderer.render(finalScene, ortho);

      velocity.x *= 0.8; velocity.y *= 0.8;   // relax the stretch once the cursor stops
    }
    function start() { if (!raf) step(); }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

    if (fallbackImg) fallbackImg.style.display = 'none';
    start();

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { en.isIntersecting ? start() : stop(); });
      }, { threshold: 0.05 }).observe(container);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
