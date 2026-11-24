// Project pages (work/*.html): brick-wall gallery, content-aware cropping and the
// click-to-enlarge viewer. Page settings come from the JSON block that scripts/build.js
// writes into each page (<script type="application/json" id="work-data">), which in turn
// comes from the project's project.txt (see projects/README.md).
(function () {
  var dataEl = document.getElementById('work-data');
  var root = document.getElementById('gallery');
  if (!dataEl || !root) return;
  var D = JSON.parse(dataEl.textContent);

  var images = D.images.slice();          // [hero, gallery…], URLs
  var WHOLE = D.whole || {};              // file name -> 1: never cropped
  var ZOOM = D.zoom || {};                // file name -> extra zoom (1.3 = 30% closer)
  var BIG = D.big || { file: null };      // { file, row, col, fill }
  var ROWS = D.rows || null;              // e.g. [4, 4]: fixed tiles per row
  var NO_CUT_ROWS = D.wholeRows || [];    // rows showing only whole tiles

  var fileName = function (src) { return decodeURIComponent(src.split('/').pop().split('?')[0]); };

  // ---- Content-aware zoom and crop ----
  // Find where the artwork actually is (ignoring empty background), then zoom so that
  // area fills the tile, keeping a small margin. The artwork itself is never cut off.
  function smartCrop(img) {
    var tile = img.parentNode;
    var ratio = tile.clientWidth / tile.clientHeight;
    if (!ratio || !isFinite(ratio)) return;
    var margin = tile.classList.contains('work2-tile--big') ? 0 : 0.06;
    if (!img._box) img._box = contentBox(img);
    var W = img.naturalWidth, H = img.naturalHeight, bx = img._box;
    // WHOLE pictures: show all of it, never cropped, on its own background colour
    if (WHOLE[fileName(img.src)]) {
      bx = { x0: 0, y0: 0, x1: W, y1: H, photo: false };
      margin = 0.05;
      tile.style.background = img._box.bg;
    }
    var pad = margin * Math.max(bx.x1 - bx.x0, bx.y1 - bx.y0);
    var cw = bx.x1 - bx.x0 + 2 * pad, ch = bx.y1 - bx.y0 + 2 * pad;
    if (cw / ch < ratio) cw = ch * ratio; else ch = cw / ratio;   // grow the short side to the tile's shape
    var z = ZOOM[fileName(img.src)] || 1;
    cw /= z; ch /= z;
    // photos: never show past the picture's edge (no white bands); zoom in until it fills the tile
    if (bx.photo && (!tile.classList.contains('work2-tile--big') || BIG.fill) && (cw > W || ch > H)) { var f = Math.max(cw / W, ch / H); cw /= f; ch /= f; }
    var cx = (bx.x0 + bx.x1) / 2 - cw / 2, cy = (bx.y0 + bx.y1) / 2 - ch / 2;
    // keep the crop inside the picture where it fits; where it can't, stay centred on the
    // artwork (the tile's white background fills the rest)
    if (cw <= W) cx = Math.min(Math.max(cx, 0), W - cw);
    if (ch <= H) cy = Math.min(Math.max(cy, 0), H - ch);
    img.style.width  = (W / cw * 100) + '%';
    img.style.height = (H / ch * 100) + '%';
    img.style.left   = (-cx / cw * 100) + '%';
    img.style.top    = (-cy / ch * 100) + '%';
    img.classList.add('is-cropped');
  }
  function contentBox(img) {
    var W = img.naturalWidth, H = img.naturalHeight;
    var s = Math.min(1, 400 / Math.max(W, H));          // analyse a small copy: fast
    var w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    var d;
    try { d = ctx.getImageData(0, 0, w, h).data; }
    catch (e) { return { x0: 0, y0: 0, x1: W, y1: H, photo: true, bg: '#fff' }; }  // can't read pixels: treat as a photo
    var br = d[0], bg = d[1], bb = d[2], ba = d[3];      // background = top-left pixel
    function empty(k) {
      if (d[k + 3] < 24) return true;                                   // transparent
      if (d[k] > 238 && d[k + 1] > 238 && d[k + 2] > 238) return true;  // near-white
      return ba > 200 && Math.abs(d[k] - br) + Math.abs(d[k + 1] - bg) + Math.abs(d[k + 2] - bb) < 36;
    }
    var x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (!empty((y * w + x) * 4)) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    // a photo has a coloured background; artwork on white or transparent does not
    var photo = ba > 200 && !(br > 238 && bg > 238 && bb > 238);
    var bgc = 'rgb(' + br + ',' + bg + ',' + bb + ')';
    if (x1 < 0) return { x0: 0, y0: 0, x1: W, y1: H, photo: photo, bg: bgc };
    return { x0: x0 / s, y0: y0 / s, x1: (x1 + 1) / s, y1: (y1 + 1) / s, photo: photo, bg: bgc };
  }

  // ---- Brick-wall layout (all sizes in vw) ----
  var T = 22;                     // tile width
  var G = 1.2;                    // gap
  var TH = T * 415 / 630;         // tile height
  var S = T + G;                  // step from one tile to the next
  var ROW_A = -6;                 // rows 1, 3, 5…: start with a part-tile off the left edge
  var ROW_B = ROW_A + S / 2;      // rows 2, 4…: shifted half a tile
  var MIN_VISIBLE = 6;            // edge slivers narrower than this get a plain tile, no picture
  // tiles beside the big one are squares (row height × row height)

  function rowStart(r) { return r % 2 ? ROW_B : ROW_A; }

  // Build the list of slots, row by row, until every picture has one.
  function layout(count, hasBig) {
    var slots = [], used = 0, big = null;
    // Fixed row counts (e.g. [4, 4]): whole tiles only, each row shifted half a tile from the
    // one above, sized so the whole group fits the window with a gap-wide margin each side
    if (!hasBig && ROWS) {
      var maxN = Math.max.apply(null, ROWS);
      var T2 = (100 - 2 * G - (maxN - 1) * G - G / 2) / (maxN + 0.5), TH2 = T2 * 415 / 630, S2 = T2 + G;
      var slotsR = [], k2 = 0;
      ROWS.forEach(function (nInRow, ri) {
        var x0 = G + (ri % 2 ? S2 / 2 : 0);
        for (var c = 0; c < nInRow && k2 < count; c++, k2++) slotsR.push({ x: x0 + c * S2, y: ri * (TH2 + G), w: T2, h: TH2 });
      });
      // centre the whole group across the window (rows of different lengths leave it lopsided)
      var minX = Math.min.apply(null, slotsR.map(function (s) { return s.x; }));
      var maxX = Math.max.apply(null, slotsR.map(function (s) { return s.x + s.w; }));
      var dx = (100 - (maxX - minX)) / 2 - minX;
      slotsR.forEach(function (s) { s.x += dx; });
      return slotsR;
    }
    // Only a few pictures: a compact, centred group instead of a full-width wall.
    // The big tile, with up to two tiles stacked on its right (and two more on its left).
    if (hasBig && count <= 4) {
      var leftCol = count > 2, groupW = 2 * T + G + G + T + (leftCol ? T + G : 0);
      var gx = (100 - groupW) / 2, slotsC = [];
      var bigX = gx + (leftCol ? T + G : 0);
      slotsC.push({ x: bigX, y: 0, w: 2 * T + G, h: 2 * TH + G, big: true });
      for (var k = 0; k < count; k++) {
        var right = k < 2;
        var yy = (!right && count === 3) ? (TH + G) / 2 : (k % 2) * (TH + G);   // a lone left tile sits level with the big one's middle
        slotsC.push({ x: right ? bigX + 2 * T + 2 * G : gx, y: yy, w: T, h: TH });
      }
      return slotsC;
    }
    if (hasBig) {
      var bx = rowStart(BIG.row) + BIG.col * S;
      big = { x: bx, y: BIG.row * (TH + G), w: 2 * T + G, h: 2 * TH + G, big: true,
              rows: [BIG.row, BIG.row + 1] };
    }
    var curRow = 0;
    function add(x, y, w) {
      var visible = Math.min(x + w, 100) - Math.max(x, 0);
      if (visible <= 0) return;
      if (NO_CUT_ROWS.indexOf(curRow) >= 0 && (x < 0 || x + w > 100)) return;   // this row: whole tiles only
      if (visible < MIN_VISIBLE) { slots.push({ x: x, y: y, w: w, h: TH, filler: true }); return; }  // edge sliver: plain tile, no picture
      if (used >= count) return;
      slots.push({ x: x, y: y, w: w, h: TH }); used++;
    }
    for (var r = 0; used < count && r < 50; r++) {
      curRow = r;
      var y = r * (TH + G), x;
      var blocked = big && big.rows.indexOf(r) >= 0;
      if (big && r === BIG.row) slots.push(big);                 // reading order: big in its first row
      var off = blocked ? ((big.x - rowStart(r)) % S + S) % S : 0;
      if (!blocked || off < 0.01 || S - off < 0.01) {
        // ordinary row, or the row's bricks line up with the big tile: tiles at the brick spacing
        for (x = rowStart(r) - S; x < 100 && used < count; x += S) {
          if (blocked && x + T > big.x - G + 0.01 && x < big.x + big.w) continue;
          add(x, y, T);
        }
      } else {
        // bricks don't line up with the big tile: a square tile hugs each side of it,
        // then ordinary tiles carry on outwards
        var left = [], lx = big.x - G - TH;
        left.push({ x: lx, w: TH });
        for (x = lx - G - T; x + T > 0; x -= S) left.push({ x: x, w: T });
        left.reverse().forEach(function (t) { add(t.x, y, t.w); });
        var rx = big.x + big.w + G;
        add(rx, y, TH);
        for (x = rx + TH + G; x < 100; x += S) add(x, y, T);
      }
    }
    // a last row that runs out of pictures part-way: centre what it has
    var lastY = -1;
    slots.forEach(function (s) { if (!s.big && !s.filler) lastY = Math.max(lastY, s.y); });
    var inBig = big && (Math.abs(lastY - big.y) < 0.01 || Math.abs(lastY - (big.y + TH + G)) < 0.01);
    var last = slots.filter(function (s) { return !s.big && !s.filler && Math.abs(s.y - lastY) < 0.01; });
    if (!inBig && last.length) {
      var rightEdge = Math.max.apply(null, last.map(function (s) { return s.x + s.w; }));
      if (rightEdge < 100 - MIN_VISIBLE) {
        // centre it as nearly as the brick pattern allows (stay on this row's half-tile offset)
        var groupW2 = rightEdge - last[0].x, ideal = (100 - groupW2) / 2;
        var rs = rowStart(Math.round(lastY / (TH + G))), kk = Math.round((ideal - rs) / S);
        var snapped = rs + kk * S;
        // if snapping would push a tile off the screen, centre it exactly instead
        if (snapped < 0 || snapped + groupW2 > 100) snapped = ideal;
        var shift = snapped - last[0].x;
        last.forEach(function (s) { s.x += shift; });
        slots = slots.filter(function (s) { return !(s.filler && Math.abs(s.y - lastY) < 0.01); });
      }
    }
    return slots;
  }

  var rest = images.slice(1);          // the hero is shown at the top, not repeated in the grid
  var bigSrc = BIG.file ? rest.filter(function (s) { return fileName(s) === BIG.file; })[0] : null;
  var normal = rest.filter(function (s) { return s !== bigSrc; });
  var slots = layout(normal.length, !!bigSrc);

  images = [images[0]];                // the viewer follows the order on screen
  var n = 0, bottom = 0;
  slots.forEach(function (sl) {
    if (sl.filler) {                     // edge sliver: keeps the brick pattern running off the edge
      var fEl = document.createElement('div');
      fEl.className = 'work2-tile work2-tile--filler';
      fEl.setAttribute('aria-hidden', 'true');
      fEl.style.left = sl.x + 'vw';  fEl.style.top = sl.y + 'vw';
      fEl.style.width = sl.w + 'vw'; fEl.style.height = sl.h + 'vw';
      root.appendChild(fEl);
      return;
    }
    var src = sl.big ? bigSrc : normal[n++];
    images.push(src);
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'work2-tile' + (sl.big ? ' work2-tile--big' : '');
    b.style.left = sl.x + 'vw';  b.style.top = sl.y + 'vw';
    b.style.width = sl.w + 'vw'; b.style.height = sl.h + 'vw';
    b.dataset.index = images.length - 1;
    var img = new Image();
    img.alt = '';
    img.onload = function () { smartCrop(this); };
    img.src = src;
    b.appendChild(img);
    root.appendChild(b);
    bottom = Math.max(bottom, sl.y + sl.h);
  });
  root.style.height = bottom + 'vw';
  [].forEach.call(document.querySelectorAll('[data-index]'), function (b) {
    b.setAttribute('aria-label', 'Enlarge image ' + (+b.dataset.index + 1) + ' of ' + images.length);
  });
  // re-fit crops when the tile shapes change (e.g. switching to the phone layout)
  var timer;
  window.addEventListener('resize', function () {
    clearTimeout(timer);
    timer = setTimeout(function () {
      [].forEach.call(root.querySelectorAll('img.is-cropped'), smartCrop);
    }, 150);
  });

  // ---- Viewer (click to enlarge) ----
  var lb = document.getElementById('lightbox');
  if (!lb) return;
  var lbImg = lb.querySelector('img');
  var countEl = lb.querySelector('.lightbox__count');
  var current = 0, opener = null;
  function show(i) {
    current = (i + images.length) % images.length;
    lbImg.src = images[current];
    countEl.textContent = (current + 1) + ' / ' + images.length;
  }
  function open(i, from) { opener = from; show(i); lb.classList.add('is-open'); lb.querySelector('.lightbox__close').focus(); }
  function close() { lb.classList.remove('is-open'); if (opener) opener.focus(); }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-index]');
    if (t && !lb.contains(t)) open(+t.dataset.index, t);
  });
  lb.querySelector('.lightbox__close').onclick = close;
  lb.querySelector('.lightbox__prev').onclick = function () { show(current - 1); };
  lb.querySelector('.lightbox__next').onclick = function () { show(current + 1); };
  lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(current - 1);
    if (e.key === 'ArrowRight') show(current + 1);
  });
})();
