/* Geofenced audio walk for a guide page.
   - Tap "Start audio walk" once (unlocks audio, asks for location, keeps the screen awake).
   - When you're within RADIUS of the next unplayed stop, it plays (lowest number first).
   - Sketchy GPS: very vague fixes never auto-play; the floating button always offers the
     next stop with its distance, and every stop has its own play button.
   Location stays on the phone. */
(function () {
  var W = window.WALK;
  if (!W) return;
  var R = W.radius || 100;
  var VAGUE = 250;                       // metres of GPS uncertainty above which we don't auto-play
  var stops = W.stops;
  var $ = function (s) { return document.querySelector(s); };
  var audio = $('#waudio'), fl = $('#wfloat'), stEl = $('#wstatus'), startBtn = $('#wstart');
  var KEY = 'walk-played-' + W.id;
  var played = new Set();
  try { played = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) {}
  var started = false, current = null, userPaused = false, pos = null, acc = null, lastFix = 0,
      gpsMsg = '', wake = null, watchId = null, map = null, me = null, meAcc = null, pins = {};

  var ICON = {
    play: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>',
    pause: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" fill="currentColor"/></svg>',
    done: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="2"/></svg>'
  };

  function save() { try { localStorage.setItem(KEY, JSON.stringify(Array.from(played))); } catch (e) {} }
  function byN(n) { for (var i = 0; i < stops.length; i++) if (stops[i].n === n) return stops[i]; return null; }
  function dist(a, b, c, d) {
    var k = Math.PI / 180, x = (d - b) * k * Math.cos((a + c) / 2 * k), y = (c - a) * k;
    return Math.sqrt(x * x + y * y) * 6371000;
  }
  function fmtD(m) { return m < 1000 ? (Math.round(m / 10) * 10) + ' m' : (m / 1000).toFixed(1) + ' km'; }
  function fmtT(s) { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
  function isPlaying() { return current !== null && !audio.paused && !audio.ended; }
  function nextStop() { for (var i = 0; i < stops.length; i++) if (!played.has(stops[i].n)) return stops[i]; return null; }
  function dTo(s) { return pos ? dist(pos[0], pos[1], s.lat, s.lon) : null; }
  function inRange() {                   // lowest-numbered unplayed stop within the radius
    if (!pos || acc > VAGUE) return null;
    for (var i = 0; i < stops.length; i++) {
      var s = stops[i];
      if (!played.has(s.n) && dTo(s) <= R) return s;
    }
    return null;
  }

  function play(n, auto) {
    var s = byN(n);
    if (!s) return;
    if (current === n && audio.src && !audio.ended) {          // toggle the one already loaded
      if (audio.paused) { userPaused = false; audio.play().catch(function () {}); }
      else { userPaused = true; audio.pause(); }
      render();
      return;
    }
    current = n;
    userPaused = false;
    audio.src = W.base + s.file;
    var p = audio.play();
    played.add(n); save();
    if (p && p.catch) p.catch(function () {                    // blocked autoplay → wait for a tap
      if (auto) { played.delete(n); save(); current = null; }
      render();
    });
    if ('mediaSession' in navigator && window.MediaMetadata) {
      try { navigator.mediaSession.metadata = new MediaMetadata({ title: n + ' · ' + s.title, artist: W.label, album: 'Audio walk' }); } catch (e) {}
    }
    render();
  }

  function check() {
    if (!started || isPlaying() || userPaused) return;
    var c = inRange();
    if (c) play(c.n, true);
  }

  function onFix(p) {
    pos = [p.coords.latitude, p.coords.longitude];
    acc = p.coords.accuracy || 9999;
    lastFix = Date.now();
    gpsMsg = acc > VAGUE ? 'GPS is vague right now (±' + fmtD(acc) + ') – tap a stop to play it.' : '';
    drawMe();
    check();
    render();
  }
  function onErr(e) {
    gpsMsg = e && e.code === 1
      ? 'Location is off for this page – just tap a stop to play it.'
      : 'Looking for GPS… you can still tap any stop.';
    render();
  }

  function keepAwake() {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') {
        navigator.wakeLock.request('screen').then(function (w) { wake = w; }).catch(function () {});
      }
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () { if (started && document.visibilityState === 'visible') { keepAwake(); check(); } });

  function start() {
    if (started) { stopWalk(); return; }
    started = true;
    try { audio.src = W.base + 'silence.mp3'; var u = audio.play(); if (u && u.then) u.then(function () { if (current === null) audio.pause(); }).catch(function () {}); } catch (e) {}
    keepAwake();
    if ('geolocation' in navigator) {
      gpsMsg = 'Looking for GPS…';
      watchId = navigator.geolocation.watchPosition(onFix, onErr, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
    } else gpsMsg = 'This browser can’t share location – tap the stops to play them.';
    stops.forEach(function (s) { try { fetch(W.base + s.file, { cache: 'force-cache' }).catch(function () {}); } catch (e) {} });
    render();
  }
  function stopWalk() {
    started = false;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    if (wake) { try { wake.release(); } catch (e) {} wake = null; }
    render();
  }

  audio.addEventListener('ended', function () {
    current = null; userPaused = false; render();
    setTimeout(check, 2500);                                     // e.g. stop 3 → 4 at the castle
  });
  ['play', 'pause', 'timeupdate'].forEach(function (ev) { audio.addEventListener(ev, render); });

  /* ---------- map ---------- */
  function initMap() {
    if (!window.L || !document.getElementById('wmap')) { var m = document.getElementById('wmap'); if (m) m.style.display = 'none'; return; }
    map = L.map('wmap', { scrollWheelZoom: false, zoomControl: true, attributionControl: true, zoomSnap: 0.25 });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    if (W.ferry) L.polyline(W.ferry, { color: '#4A7BA6', weight: 3, dashArray: '6 6', opacity: .9 }).addTo(map);
    if (W.trail) L.polyline(W.trail, { color: '#1A2E44', weight: 4, opacity: .85, dashArray: '1 7', lineCap: 'round' }).addTo(map);
    var pts = [];
    (W.extras || []).forEach(function (x) {
      L.marker([x.lat, x.lon], { icon: L.divIcon({ className: '', html: '<span class="wdot"></span><span class="wtag ' + (x.side || 'right') + '">' + x.label + '</span>', iconSize: [0, 0], iconAnchor: [0, 0] }), keyboard: false })
        .bindPopup('<b>' + x.title + '</b>').addTo(map);
      pts.push([x.lat, x.lon]);
    });
    stops.forEach(function (s) {
      L.circle([s.lat, s.lon], { radius: R, color: '#B2302B', weight: 1, opacity: .35, fillOpacity: .06, interactive: false }).addTo(map);
      var mk = L.marker([s.lat, s.lon], {
        icon: L.divIcon({ className: '', html: '<span class="wpin">' + s.n + '</span>', iconSize: [30, 30], iconAnchor: [15 - (s.nudge ? s.nudge[0] : 0), 15 - (s.nudge ? s.nudge[1] : 0)] }),
        title: s.n + ' · ' + s.title, zIndexOffset: 1000
      }).bindPopup('<b>' + s.n + ' · ' + s.title + '</b><br>' + s.where + '<br><button class="wpop" data-play="' + s.n + '">▶ Play</button>');
      mk.addTo(map);
      pins[s.n] = mk;
      pts.push([s.lat, s.lon]);
    });
    map.fitBounds(pts, { paddingTopLeft: [62, 30], paddingBottomRight: [62, 30] });
  }
  function drawMe() {
    if (!map || !pos) return;
    if (!me) {
      meAcc = L.circle(pos, { radius: acc, color: '#2F6FB0', weight: 1, fillOpacity: .12, interactive: false }).addTo(map);
      me = L.circleMarker(pos, { radius: 7, color: '#fff', weight: 2, fillColor: '#2F6FB0', fillOpacity: 1 }).addTo(map);
    } else { me.setLatLng(pos); meAcc.setLatLng(pos).setRadius(Math.min(acc, 2000)); }
  }

  /* ---------- UI ---------- */
  function render() {
    // list
    stops.forEach(function (s) {
      var li = document.querySelector('.stop[data-n="' + s.n + '"]');
      if (!li) return;
      var playing = current === s.n && !audio.paused && !audio.ended;
      li.classList.toggle('playing', playing);
      li.classList.toggle('done', played.has(s.n) && !playing);
      var ic = li.querySelector('.sicon');
      if (ic) ic.innerHTML = playing ? ICON.pause : ICON.play;
      var sm = li.querySelector('.sdist');
      if (sm) { var d = dTo(s); sm.textContent = d !== null && started ? ' · ' + fmtD(d) + ' away' : ''; }
      var pin = pins[s.n] && pins[s.n].getElement && pins[s.n].getElement();
      if (pin && pin.firstChild) pin.firstChild.classList.toggle('done', played.has(s.n));
    });
    // start button + status
    if (startBtn) startBtn.innerHTML = started ? 'Audio walk is on · tap to stop' : 'Start audio walk';
    startBtn && startBtn.classList.toggle('on', started);
    var nx = nextStop(), msg = '';
    if (started) {
      if (gpsMsg) msg = gpsMsg;
      else if (pos) msg = 'GPS ±' + fmtD(acc) + (nx ? ' · next: ' + nx.n + ' · ' + nx.title + ', ' + fmtD(dTo(nx)) : ' · all stops played');
      if (pos && Date.now() - lastFix > 60000) msg = 'GPS hasn’t updated for a while – tap a stop to play it.';
    } else msg = 'Location is only used on your phone. Keep this page open during the walk – it keeps the screen awake.';
    if (stEl) stEl.textContent = msg;
    // floating button
    if (!fl) return;
    var cls = '', html = '', show = started || current !== null;
    if (current !== null && !audio.ended) {
      var s = byN(current), left = (audio.duration || s.secs) - (audio.currentTime || 0);
      html = (audio.paused ? ICON.play : ICON.pause) + '<span>' + s.n + ' · ' + s.title + '</span><em>' + fmtT(left) + '</em>';
      fl.dataset.n = s.n;
    } else {
      var c = started ? inRange() : null;
      if (c) { cls = 'near'; html = ICON.play + '<span>' + c.n + ' · ' + c.title + '</span>'; fl.dataset.n = c.n; }
      else if (nx) {
        var d = dTo(nx);
        cls = 'ghost'; html = ICON.play + '<span>Next ' + nx.n + ' · ' + nx.title + '</span>' + (d !== null ? '<em>' + fmtD(d) + '</em>' : '');
        fl.dataset.n = nx.n;
      } else { cls = 'ghost'; html = ICON.done + '<span>Walk complete</span>'; fl.dataset.n = ''; }
    }
    fl.className = 'wfloat ' + cls;
    fl.innerHTML = html;
    fl.hidden = !show;
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-play]');
    if (t) { e.preventDefault(); play(+t.getAttribute('data-play'), false); if (map) map.closePopup(); }
  });
  fl && fl.addEventListener('click', function () { var n = +fl.dataset.n; if (n) play(n, false); });
  startBtn && startBtn.addEventListener('click', start);
  var rs = $('#wreset');
  rs && rs.addEventListener('click', function () { played = new Set(); save(); render(); });

  initMap();
  render();
})();
