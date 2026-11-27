// In-page measurements for the viewport check (scripts/auto/checks/viewport.cjs). This file is a
// single function expression: Node reads it as text and Playwright evaluates it in the page.
// It returns { vw, vh, issues: [{ rule, sig, n, text }], metrics, groups, dump? }.
// Rules (every number is CSS px of the top window):
//   page-scroll      the document scrolls sideways or down (the app is a fixed layout)
//   text-clipped     glyphs cut by an ancestor box with overflow hidden/clip (or an ellipsis)
//   text-off-screen  glyphs partly outside the viewport and not inside a scroller
//   text-covered     glyphs under another painted element that is not a full-screen cover
//   text-small       effective font size under 12 px (font-size x CSS zoom x transform scale)
//   tap-small        a tap target whose hittable extent around its centre is under 44 x 44
//   tap-covered      a tap target whose centre is covered by something else
//   tap-off-screen   a tap target partly outside the viewport
//   overlap          two named HUD pieces (or the hero and a HUD piece) share screen area
//   safe-top/-bottom/-left/-right   text or a tap target inside the simulated safe-area inset
//   img-broken / img-stretched / bg-stretched   art that did not load or is drawn off its aspect
//   debug-ui         a diagnostic panel is on screen
async (o) => {
  const W = innerWidth, H = innerHeight, safe = Object.assign({ top: 0, bottom: 0, left: 0, right: 0 }, o.safe || {});
  const issues = [], metrics = {}, dump = [];
  const r1 = v => Math.round(v * 10) / 10;
  const STATE = /^(on|off|sel|selected|active|show|open|collapsed|cur|is-.*|a1m-show|pressed|disabled|dim|new|ok|bad|warn|danger|poison|qok-hit|qok-crithit|qok-shake|done|hot|lit)$/;
  const one = el => { let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; const cl = [...el.classList].filter(c => !STATE.test(c)).slice(0, 2); if (cl.length) s += '.' + cl.join('.'); return s; };
  const frames = [];   // { doc, win, ox, oy, tag }
  const addDoc = (doc, win, ox, oy, tag) => { frames.push({ doc, win, ox, oy, tag });
    for (const f of doc.querySelectorAll('iframe')) { try { const d = f.contentDocument; if (!d || !d.body) continue; const b = f.getBoundingClientRect(); if (b.width < 2 || !f.checkVisibility()) continue; addDoc(d, f.contentWindow, ox + b.left, oy + b.top, tag + 'frame:'); } catch (e) {} } };
  addDoc(document, window, 0, 0, '');
  const sig = (el, F) => { const parts = [one(el)]; let p = el.parentElement, n = 0; while (p && p !== p.ownerDocument.body && n < 2) { if (p.id || p.classList.length) { parts.push(one(p)); n++; } p = p.parentElement; } return F.tag + parts.join(' < '); };
  const issue = (rule, el, F, n, text) => issues.push({ rule, sig: sig(el, F), n, text: text ? String(text).replace(/\s+/g, ' ').trim().slice(0, 60) : undefined });
  const R = (b, F) => ({ l: b.left + F.ox, t: b.top + F.oy, r: b.right + F.ox, b: b.bottom + F.oy, w: b.width, h: b.height });
  const csCache = new Map(), cs = (el, F) => { let c = csCache.get(el); if (!c) { c = F.win.getComputedStyle(el); csCache.set(el, c); } return c; };
  // cumulative opacity, CSS zoom and transform scale of an element
  const chainCache = new Map();
  const chain = (el, F) => { if (!el || el.nodeType !== 1) return { op: 1, z: 1, sc: 1 }; let c = chainCache.get(el); if (c) return c; const p = chain(el.parentElement, F), s = cs(el, F);
    let sc = 1; const m = /^matrix\(([^)]+)\)/.exec(s.transform || ''); if (m) { const v = m[1].split(',').map(Number); sc = Math.sqrt(v[2] * v[2] + v[3] * v[3]) || 1; }
    c = { op: p.op * (parseFloat(s.opacity) || (s.opacity === '0' ? 0 : 1)), z: p.z * (parseFloat(s.zoom) || 1), sc: p.sc * sc }; chainCache.set(el, c); return c; };
  const shown = (el, F) => { try { if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false; } catch (e) { return false; } return chain(el, F).op > 0.2; };
  const paints = (el, F) => { const s = cs(el, F), t = el.tagName; if (t === 'IMG' || t === 'CANVAS' || t === 'VIDEO') return true; if (s.backgroundImage && s.backgroundImage !== 'none') return true;
    const m = /rgba?\(([^)]+)\)/.exec(s.backgroundColor || ''); if (m) { const v = m[1].split(/[,/ ]+/).map(Number); if ((v.length < 4 ? 1 : v[3]) > 0.55) return true; } return false; };
  const related = (a, b) => a === b || a.contains(b) || b.contains(a);
  const big = b => b.width * b.height >= 0.8 * W * H || (b.width >= 0.98 * W && b.height >= 0.6 * H);

  // ---- page scroll
  const se = document.scrollingElement || document.documentElement;
  if (se.scrollWidth > W + 1) issues.push({ rule: 'page-scroll', sig: 'document-x', n: { scrollWidth: se.scrollWidth, vw: W } });
  if (se.scrollHeight > H + 1) issues.push({ rule: 'page-scroll', sig: 'document-y', n: { scrollHeight: se.scrollHeight, vh: H } });

  // ---- lists that do not fit: a scroller with more content than its box (fine for a long list, a defect for a one-screen form)
  for (const F of frames) for (const el of F.doc.body.querySelectorAll('*')) { const s = cs(el, F); if (!/(auto|scroll)/.test(s.overflowY)) continue; if (el.scrollHeight <= el.clientHeight + 4 || el.clientHeight < 40) continue; if (!shown(el, F)) continue;
    issue('scrolls', el, F, { content: el.scrollHeight, box: el.clientHeight, over: el.scrollHeight - el.clientHeight }); }
  { const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(document.body).backgroundColor || ''), h = /rgba?\(([^)]+)\)/.exec(getComputedStyle(document.documentElement).backgroundColor || ''); const pick = x => x ? x[1].split(/[,/ ]+/).map(Number) : null; const a = pick(m), b = pick(h);
    metrics.pageBg = a && (a.length < 4 || a[3] > 0) ? a.slice(0, 3) : (b && (b.length < 4 || b[3] > 0) ? b.slice(0, 3) : [0, 0, 0]); }

  // ---- tap targets (real pointer-events)
  const taps = [];
  for (const F of frames) {
    const cand = new Set(F.doc.querySelectorAll('button, a[href], input, select, textarea, [data-act], [role="button"], [onclick], [data-fi], [data-np], [data-k]'));
    for (const el of F.doc.body.querySelectorAll('*')) { if (cand.has(el)) continue; const s = cs(el, F); if (s.cursor === 'pointer' && (!el.parentElement || cs(el.parentElement, F).cursor !== 'pointer')) cand.add(el); }
    for (const el of cand) {
      if (!shown(el, F)) continue; const s = cs(el, F); if (s.pointerEvents === 'none' || el.disabled) continue;
      const b = el.getBoundingClientRect(); if (b.width < 1 || b.height < 1) continue; if (big(b)) continue;
      if (/Noop$/.test(el.getAttribute('data-act') || '')) continue;      // card bodies that only swallow a tap
      if (el.tagName === 'DIV' && [...cand].some(c => c !== el && el.contains(c) && shown(c, F)) && !el.getAttribute('data-act')) continue;   // a pointer container around real buttons
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      if (cx + F.ox < 0 || cx + F.ox > W || cy + F.oy < 0 || cy + F.oy > H) continue;   // parked off screen
      const hitAt = (x, y) => { const e = F.doc.elementFromPoint(x, y); return !!e && related(e, el); };
      const rr = R(b, F); let cutBy = null;
      for (let p = el.parentElement; p && p !== F.doc.documentElement; p = p.parentElement) { const ps = cs(p, F); if (ps.overflowX === 'visible' && ps.overflowY === 'visible') continue; const pb = R(p.getBoundingClientRect(), F);
        if (ps.overflowY !== 'visible') { if (pb.t > rr.t + 1 || pb.b < rr.b - 1) cutBy = p; rr.t = Math.max(rr.t, pb.t); rr.b = Math.min(rr.b, pb.b); } if (ps.overflowX !== 'visible') { if (pb.l > rr.l + 1 || pb.r < rr.r - 1) cutBy = p; rr.l = Math.max(rr.l, pb.l); rr.r = Math.min(rr.r, pb.r); } }
      if (rr.b - rr.t < 1 || rr.r - rr.l < 1) continue;   // scrolled out of its list
      if (!hitAt(cx, cy)) { const e = F.doc.elementFromPoint(cx, cy);   // under a full-screen cover, the notepad slate or the edge of the grade wheel: not a defect
        let modal = false, m = e; while (m && !m.contains(el)) { if (big(m.getBoundingClientRect())) modal = true; m = m.parentElement; }
        if (e && !modal && !e.closest('#qok-notepad') && !el.closest('#qok-gwheel')) issue('tap-covered', el, F, { by: sig(e, F), at: [r1(cx + F.ox), r1(cy + F.oy)] }, el.innerText); continue; }
      const ext = (dx, dy) => { let k = 0; while (k < 24 && hitAt(cx + dx * (k + 0.5), cy + dy * (k + 0.5))) k++; return k; };
      const ew = ext(-1, 0) + ext(1, 0), eh = ext(0, -1) + ext(0, 1);   // hittable extent around the centre, capped at 48
      taps.push({ el, F, rr });
      if ((ew < 43.5 || eh < 43.5) && !cutBy) issue('tap-small', el, F, { w: r1(b.width), h: r1(b.height), hitW: ew, hitH: eh }, el.innerText || el.getAttribute('aria-label') || '');
      if (rr.l < -2 || rr.t < -2 || rr.r > W + 2 || rr.b > H + 2) { let sc = false, p = el.parentElement; while (p) { const ps = cs(p, F); if (/(auto|scroll)/.test(ps.overflowX + ps.overflowY) && (p.scrollHeight > p.clientHeight + 1 || p.scrollWidth > p.clientWidth + 1)) { sc = true; break; } p = p.parentElement; }
        if (!sc) issue('tap-off-screen', el, F, { l: r1(rr.l), t: r1(rr.t), r: r1(rr.r), b: r1(rr.b), vw: W, vh: H }, el.innerText); }
      const inTop = safe.top - rr.t, inBot = rr.b - (H - safe.bottom), inL = safe.left - rr.l, inR = rr.r - (W - safe.right);
      if (safe.top && inTop > 2 && rr.b > 0) issue('safe-top', el, F, { into: r1(inTop), inset: safe.top, kind: 'tap' }, el.innerText);
      if (safe.bottom && inBot > 2 && rr.t < H) issue('safe-bottom', el, F, { into: r1(inBot), inset: safe.bottom, kind: 'tap' }, el.innerText);
      if (safe.left && inL > 2) issue('safe-left', el, F, { into: r1(inL), inset: safe.left, kind: 'tap' }, el.innerText);
      if (safe.right && inR > 2) issue('safe-right', el, F, { into: r1(inR), inset: safe.right, kind: 'tap' }, el.innerText);
    }
  }

  // ---- text (pointer-events forced on, so elementFromPoint follows paint order)
  const styles = frames.map(F => { const s = F.doc.createElement('style'); s.textContent = '*{pointer-events:auto !important}'; F.doc.documentElement.appendChild(s); return s; });
  try {
    for (const F of frames) {
      const tw = F.doc.createTreeWalker(F.doc.body, NodeFilter.SHOW_TEXT); let n; const seen = new Map();
      while ((n = tw.nextNode())) {
        if (!/[\p{L}\p{N}]/u.test(n.data)) continue;   // ornaments (stars, sparkles, arrows) are not text
        const el = n.parentElement; if (!el || /^(SCRIPT|STYLE|NOSCRIPT|OPTION|TITLE)$/.test(el.tagName)) continue;
        if (!shown(el, F)) continue;
        const rg = F.doc.createRange(); rg.selectNodeContents(n); const rects = [...rg.getClientRects()].filter(b => b.width > 0.5 && b.height > 0.5); if (!rects.length) continue;
        let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity; for (const q of rects) { l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom); }
        if (r + F.ox < 0 || l + F.ox > W || b + F.oy < 0 || t + F.oy > H) continue;   // wholly off screen (parked)
        const txt = n.data.trim();
        // occlusion at three points of the first line
        const q0 = rects[0], pts = [[q0.left + q0.width / 2, q0.top + q0.height / 2], [q0.left + Math.min(3, q0.width / 4), q0.top + q0.height / 2], [q0.right - Math.min(3, q0.width / 4), q0.top + q0.height / 2]];
        let under = false, cover = null;
        for (const [x, y] of pts) { if (x < 0 || y < 0 || x >= F.win.innerWidth || y >= F.win.innerHeight) continue; const e = F.doc.elementFromPoint(x, y); if (!e || related(e, el)) continue;
          let c = e, painted = null; while (c && !c.contains(el)) { if (shown(c, F) && paints(c, F)) painted = c; c = c.parentElement; }
          if (!painted) { if (/\S/.test(e.textContent || '') && e.children.length === 0) painted = e; else continue; }
          let m = painted, modal = false; while (m && !m.contains(el)) { if (big(m.getBoundingClientRect())) modal = true; m = m.parentElement; }
          if (modal) { under = true; break; } cover = cover || e; }
        // a frame's own content can sit under a cover of the parent document
        if (!under && F.ox + F.oy >= 0 && F !== frames[0]) { const e = document.elementFromPoint((q0.left + q0.width / 2) + F.ox, (q0.top + q0.height / 2) + F.oy); if (e && e.tagName !== 'IFRAME') { let c = e, p = null; while (c && c !== document.body) { if (paints(c, frames[0]) && shown(c, frames[0])) p = c; c = c.parentElement; } if (p) { if (big(p.getBoundingClientRect())) under = true; else cover = cover || e; } } }
        if (under) continue;
        if (cover) issue('text-covered', el, F, { by: sig(cover, cover.ownerDocument === document ? frames[0] : F), at: [r1(q0.left + F.ox), r1(q0.top + F.oy)] }, txt);
        // clipping by ancestors
        let cur = { l, t, r, b }, p = el, clipped = false;
        while (p && p.nodeType === 1 && p !== F.doc.documentElement) { const s = cs(p, F), ox = s.overflowX, oy = s.overflowY;
          if (ox !== 'visible' || oy !== 'visible') { const pb = p.getBoundingClientRect(), bl = parseFloat(s.borderLeftWidth) || 0, bt = parseFloat(s.borderTopWidth) || 0, br = parseFloat(s.borderRightWidth) || 0, bb = parseFloat(s.borderBottomWidth) || 0;
            const box = { l: pb.left + bl, t: pb.top + bt, r: pb.right - br, b: pb.bottom - bb };
            const scX = /(auto|scroll)/.test(ox) && p.scrollWidth > p.clientWidth + 1, scY = /(auto|scroll)/.test(oy) && p.scrollHeight > p.clientHeight + 1;
            const dx = ox !== 'visible' && !scX ? Math.max(box.l - cur.l, cur.r - box.r) : 0, dy = oy !== 'visible' && !scY ? Math.max(box.t - cur.t, cur.b - box.b) : 0;
            if (!clipped && (dx > 1.5 || dy > 2.5) && p.id !== 'qok-gwheel') { clipped = true; issue('text-clipped', el, F, { cutX: r1(Math.max(0, dx)), cutY: r1(Math.max(0, dy)), box: one(p), ellipsis: s.textOverflow === 'ellipsis' || undefined }, txt); }
            if (ox !== 'visible') { cur.l = Math.max(cur.l, box.l); cur.r = Math.min(cur.r, box.r); } if (oy !== 'visible') { cur.t = Math.max(cur.t, box.t); cur.b = Math.min(cur.b, box.b); }
            if (cur.r - cur.l < 1 || cur.b - cur.t < 1) break; }
          p = p.parentElement; }
        if (cur.r - cur.l < 1 || cur.b - cur.t < 1) continue;   // scrolled out of a scroller
        const g = { l: cur.l + F.ox, t: cur.t + F.oy, r: cur.r + F.ox, b: cur.b + F.oy };
        if (!clipped && (g.l < -1.5 || g.t < -1.5 || g.r > W + 1.5 || g.b > H + 1.5)) issue('text-off-screen', el, F, { l: r1(g.l), t: r1(g.t), r: r1(g.r), b: r1(g.b), vw: W, vh: H }, txt);
        const c = chain(el, F), fs = (parseFloat(cs(el, F).fontSize) || 0) * c.z * c.sc;
        if (fs > 0 && fs < 11.95 && !seen.has(el)) { seen.set(el, 1); issue('text-small', el, F, { px: r1(fs), css: cs(el, F).fontSize, zoom: r1(c.z), scale: r1(c.sc) }, txt); }
        if (safe.top && safe.top - g.t > 2 && g.b > 0) issue('safe-top', el, F, { into: r1(safe.top - g.t), inset: safe.top, kind: 'text' }, txt);
        if (safe.bottom && g.b - (H - safe.bottom) > 2 && g.t < H) issue('safe-bottom', el, F, { into: r1(g.b - (H - safe.bottom)), inset: safe.bottom, kind: 'text' }, txt);
        if (safe.left && safe.left - g.l > 2) issue('safe-left', el, F, { into: r1(safe.left - g.l), inset: safe.left, kind: 'text' }, txt);
        if (safe.right && g.r - (W - safe.right) > 2) issue('safe-right', el, F, { into: r1(g.r - (W - safe.right)), inset: safe.right, kind: 'text' }, txt);
        if (o.dump) dump.push({ s: sig(el, F), t: txt.slice(0, 40), r: [r1(g.l), r1(g.t), r1(g.r - g.l), r1(g.b - g.t)], fs: r1(fs) });
      }
    }
  } finally { for (const s of styles) s.remove(); }

  // ---- art: images and stretched backgrounds
  const nat = url => new Promise(res => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res(null); i.src = url; setTimeout(() => res(null), 3000); });
  for (const F of frames) {
    for (const im of F.doc.images) { if (!shown(im, F)) continue; const b = im.getBoundingClientRect(); if (b.width < 2 || b.height < 2) continue;
      if (im.complete && !im.naturalWidth) { issue('img-broken', im, F, { src: (im.getAttribute('src') || '').slice(-50) }); continue; }
      const fit = cs(im, F).objectFit; if (im.naturalWidth && (fit === 'fill' || !fit)) { const k = (b.width / b.height) / (im.naturalWidth / im.naturalHeight); if (Math.abs(k - 1) > 0.04) issue('img-stretched', im, F, { ratio: r1(k * 100) / 100, box: [r1(b.width), r1(b.height)], natural: [im.naturalWidth, im.naturalHeight] }); } }
    for (const el of F.doc.body.querySelectorAll('*')) { const s = cs(el, F); if (!s.backgroundImage || s.backgroundImage.indexOf('url(') < 0) continue; if (!shown(el, F)) continue; const b = el.getBoundingClientRect(); if (b.width < 24 || b.height < 24) continue;
      const m = /url\("?([^")]+)"?\)/.exec(s.backgroundImage), bs = s.backgroundSize.split(',')[0].trim();
      if (big(b)) { const n2 = m ? await nat(m[1]) : null; metrics.backdrop = { el: one(el), size: bs, pos: s.backgroundPosition, rect: [r1(b.left + F.ox), r1(b.top + F.oy), r1(b.width), r1(b.height)], natural: n2, file: m ? m[1].split('/').pop() : null };
        if (n2) { const ka = (b.width / b.height) / (n2[0] / n2[1]); metrics.backdrop.shownShare = r1(Math.min(ka, 1 / ka) * 100); } }
      if (/^\d+(\.\d+)?(%|px) \d+(\.\d+)?(%|px)$/.test(bs) && m) { const n2 = await nat(m[1]); if (n2) { const p = bs.split(' ').map((v, i) => v.endsWith('%') ? parseFloat(v) / 100 * (i ? b.height : b.width) : parseFloat(v)), k = (p[0] / p[1]) / (n2[0] / n2[1]); if (Math.abs(k - 1) > 0.04) issue('bg-stretched', el, F, { ratio: r1(k * 100) / 100, size: bs, natural: n2 }); } } }
  }

  // ---- named pieces: rectangles, overlap, the hero
  const G = {}; const put = (name, el, F) => { if (!el || !shown(el, F)) return; const b = el.getBoundingClientRect(); if (b.width < 2 || b.height < 2) return; G[name] = R(b, F); };
  const NAMED = { hp: '#qok-field-hud .qfhp', compass: '#qfh-compass', minimap: '#qfh-map', floor: '#qfh-floor', quests: '#qfh-quest', dialog: '#qfh-dialog', saved: '#qok-saved-badge', tabs: '#fieldTabs', stick: '#dpad',
    prompt: '#a1mInteract.a1m-show', townPill: '#qok-town-pill48', advance: '#qok-msg-advance', questCard: '#qok-quest-completion', toast: '#qok-town-quest-toast', notepad: '#qok-notepad',
    enemy: '#qok-ui .bmon', enemyCard: '#qok-ui .enemy-card', battleHud: '#qok-ui .hudwrap', keypad: '#qok-ui .kpad', kpDisplay: '#qok-kpdisp', quizQ: '#qok-ui .quiz-q, #qok-ui .qtext, #qok-ui .question', msg: '#qok-ui .msg', col: '#qok-ui .col', menuTabbar: '#qok-ui .tabbar', topbar: '#qok-ui .topbar', pbar: '#qok-ui .pbar' };
  for (const F of frames) for (const k in NAMED) { if (G[k]) continue; try { put(k, F.doc.querySelector(NAMED[k]), F); } catch (e) {} }
  for (const F of frames) { const ks = F.doc.querySelectorAll('#qok-ui .kpad [data-act="kpKey"]'); if (ks.length) { let mw = 1e9, mh = 1e9; for (const k of ks) { const b = k.getBoundingClientRect(); if (b.width) { mw = Math.min(mw, b.width); mh = Math.min(mh, b.height); } } metrics.keypadKey = [r1(mw), r1(mh)]; }
    const qa = F.doc.querySelectorAll('[data-act="quizAns"]'); if (qa.length) { const b = qa[0].getBoundingClientRect(); metrics.quizButton = [r1(b.width), r1(b.height)]; } }
  try { const g = window.__PHASER_GAME__, w = g && g.scene.getScene('WorldMapScene');
    if (g) { const c = g.canvas.getBoundingClientRect(); metrics.canvas = { rect: [r1(c.left), r1(c.top), r1(c.width), r1(c.height)], buffer: [g.canvas.width, g.canvas.height], scenes: g.scene.getScenes(true).map(s => s.scene.key) };
      if (w && g.scene.isActive('WorldMapScene') && w.hero && w.cameras && w.cameras.main) { const cam = w.cameras.main, hb = w.hero.getBounds(), k = c.width / g.canvas.width * (g.canvas.width / g.scale.width);
        const sx = x => c.left + ((x - cam.worldView.x) * cam.zoom + cam.x) * (c.width / g.scale.width), sy = y => c.top + ((y - cam.worldView.y) * cam.zoom + cam.y) * (c.height / g.scale.height);
        const tf = document.querySelector('#act1-hifi-preserved-root iframe'), inTown = !!(tf && tf.checkVisibility() && tf.getBoundingClientRect().width > 2);
        metrics.heroDbg = { vis: w.hero.visible, alpha: w.hero.alpha, inTown, b: [r1(hb.left), r1(hb.top), r1(hb.width), r1(hb.height)] };
        if (!inTown) G.hero = { l: sx(hb.left), t: sy(hb.top), r: sx(hb.right), b: sy(hb.bottom), w: hb.width * cam.zoom, h: hb.height * cam.zoom };
        if (cam.useBounds && cam._bounds && (cam.worldView.width > cam._bounds.width + 2 || cam.worldView.height > cam._bounds.height + 2)) issues.push({ rule: 'map-smaller-than-view', sig: 'camera', n: { view: [r1(cam.worldView.width), r1(cam.worldView.height)], map: [cam._bounds.width, cam._bounds.height] } });
        metrics.camera = { zoom: r1(cam.zoom * 100) / 100, view: [r1(cam.worldView.width), r1(cam.worldView.height)], map: w.currentMapId, bounds: cam._bounds ? [cam._bounds.x, cam._bounds.y, cam._bounds.width, cam._bounds.height] : null, useBounds: !!cam.useBounds }; } } } catch (e) { metrics.cameraErr = String(e).slice(0, 80); }
  const names = Object.keys(G), hit = (a, b) => { const dx = Math.min(a.r, b.r) - Math.max(a.l, b.l), dy = Math.min(a.b, b.b) - Math.max(a.t, b.t); return dx > 3 && dy > 3 ? dx * dy : 0; };
  const FIELD = ['hp', 'compass', 'minimap', 'floor', 'quests', 'dialog', 'saved', 'tabs', 'stick', 'prompt', 'townPill', 'questCard', 'toast', 'hero'];
  const BATTLE = ['enemy', 'enemyCard', 'battleHud', 'keypad', 'msg', 'notepad'];
  const ALLOW = { 'enemy+notepad': 1, 'notepad+enemy': 1, 'battleHud+keypad': 1, 'keypad+battleHud': 1, 'battleHud+msg': 1, 'msg+battleHud': 1, 'enemyCard+notepad': 1 };
  const cover = (set) => { for (let i = 0; i < set.length; i++) for (let j = i + 1; j < set.length; j++) { const a = set[i], b = set[j]; if (!G[a] || !G[b] || ALLOW[a + '+' + b]) continue; const ar = hit(G[a], G[b]); if (ar > 12) issues.push({ rule: 'overlap', sig: a + '+' + b, n: { area: Math.round(ar), a: [G[a].l, G[a].t, G[a].r, G[a].b].map(r1), b: [G[b].l, G[b].t, G[b].r, G[b].b].map(r1) } }); } };
  if (!document.querySelector('#qok-ui.battle')) cover(FIELD.filter(k => !(G.questCard && k !== 'questCard'))); else cover(BATTLE);
  for (const sel of ['#qok-perf-panel', '[data-qok-blackbox-panel]', '[data-act="jumpOpen"]']) { const e = document.querySelector(sel); if (e && shown(e, frames[0])) issue('debug-ui', e, frames[0], {}, e.innerText); }
  const groups = {}; for (const k of names) groups[k] = [r1(G[k].l), r1(G[k].t), r1(G[k].r - G[k].l), r1(G[k].b - G[k].t)];
  metrics.safeRead = window.__QOK_SAFE__ || null;
  return { vw: W, vh: H, dpr: devicePixelRatio, issues, metrics, groups, dump: o.dump ? dump : undefined };
}
