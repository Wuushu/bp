/* Audio guide spots for a guide page – no autoplay.
   - On load the page asks for location and watches it while open.
   - The top-right button is inactive until you're within RADIUS of a numbered spot; then it
     lights up with that spot's number and title ("Listen to the audio guide for this spot").
     Nothing plays until you tap it (or a map pin / a row in the list).
   - Vague GPS fixes never light it up. Location stays on the phone. */
(function () {
  var W = window.WALK;
  if (!W) return;
  var R = W.radius || 100;
  var VAGUE = 250;                       // metres of uncertainty above which we don't trust a fix
  var stops = W.stops;
  var $ = function (s) { return document.querySelector(s); };
  var audio = $('#waudio'), fl = $('#wfloat');
  var current = null, pos = null, acc = null, gps = 'idle', watchId = null, map = null, me = null, meAcc = null, pins = {};
  var heard = new Set();

  var ICON = {
    play: '<svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>',
    pause: '<svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" fill="currentColor"/></svg>',
    phones: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14v-2a8 8 0 0 1 16 0v2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="3" y="13" width="5" height="8" rx="2" fill="currentColor"/><rect x="16" y="13" width="5" height="8" rx="2" fill="currentColor"/></svg>'
  };

  function byN(n) { for (var i = 0; i < stops.length; i++) if (stops[i].n === n) return stops[i]; return null; }
  function dist(a, b, c, d) {
    var k = Math.PI / 180, x = (d - b) * k * Math.cos((a + c) / 2 * k), y = (c - a) * k;
    return Math.sqrt(x * x + y * y) * 6371000;
  }
  function fmtD(m) { return m < 1000 ? (Math.round(m / 10) * 10) + ' m' : (m / 1000).toFixed(1) + ' km'; }
  function fmtT(s) { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
  function dTo(s) { return pos ? dist(pos[0], pos[1], s.lat, s.lon) : null; }
  function nearest() {
    if (!pos) return null;
    var best = null, bd = 1e12;
    stops.forEach(function (s) { var d = dTo(s); if (d < bd) { bd = d; best = s; } });
    return best && { s: best, d: bd };
  }
  function here() {                       // the spot you're at: nearest one within the radius
    if (!pos || acc > VAGUE) return null;
    var nb = nearest();
    return nb && nb.d <= R ? nb.s : null;
  }

  function play(n) {
    var s = byN(n);
    if (!s) return;
    if (current === n && audio.src && !audio.ended) {          // same spot: pause / resume
      if (audio.paused) audio.play().catch(function () {}); else audio.pause();
      render();
      return;
    }
    current = n;
    audio.src = W.base + s.file;
    audio.play().catch(function () {});
    heard.add(n);
    if ('mediaSession' in navigator && window.MediaMetadata) {
      try { navigator.mediaSession.metadata = new MediaMetadata({ title: n + ' · ' + s.title, artist: W.label, album: 'Audio guide' }); } catch (e) {}
    }
    render();
  }

  /* ---------- location ---------- */
  function startGps() {
    if (watchId !== null || !('geolocation' in navigator)) { if (!('geolocation' in navigator)) { gps = 'none'; render(); } return; }
    gps = 'finding';
    watchId = navigator.geolocation.watchPosition(function (p) {
      pos = [p.coords.latitude, p.coords.longitude];
      acc = p.coords.accuracy || 9999;
      gps = acc > VAGUE ? 'vague' : 'ok';
      drawMe();
      render();
    }, function (e) {
      gps = e && e.code === 1 ? 'denied' : (pos ? gps : 'finding');
      if (e && e.code === 1) { watchId = null; }
      render();
    }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 });
    render();
  }

  audio.addEventListener('ended', function () { current = null; render(); });
  ['play', 'pause', 'timeupdate'].forEach(function (ev) { audio.addEventListener(ev, render); });

  /* ---------- map ---------- */
  function initMap() {
    var el = document.getElementById('wmap');
    if (!el) return;
    if (!window.L) { el.style.display = 'none'; return; }
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
      var nx = s.nudge ? s.nudge[0] : 0, ny = s.nudge ? s.nudge[1] : 0;
      var mk = L.marker([s.lat, s.lon], {
        icon: L.divIcon({ className: '', html: '<span class="wpin">' + s.n + '</span>', iconSize: [30, 30], iconAnchor: [15 - nx, 15 - ny] }),
        title: s.n + ' · ' + s.title, zIndexOffset: 1000
      }).bindPopup('<b>' + s.n + ' · ' + s.title + '</b><br>' + s.where + ' · ' + fmtT(s.secs) + '<br><button class="wpop" type="button" data-play="' + s.n + '">▶ Listen</button>');
      mk.addTo(map);
      pins[s.n] = mk;
      pts.push([s.lat, s.lon]);
    });
    map.fitBounds(pts, { paddingTopLeft: [62, 30], paddingBottomRight: [62, 30] });
  }
  function drawMe() {
    if (!map || !pos) return;
    if (!me) {
      meAcc = L.circle(pos, { radius: Math.min(acc, 2000), color: '#2F6FB0', weight: 1, fillOpacity: .12, interactive: false }).addTo(map);
      me = L.circleMarker(pos, { radius: 7, color: '#fff', weight: 2, fillColor: '#2F6FB0', fillOpacity: 1 }).addTo(map);
    } else { me.setLatLng(pos); meAcc.setLatLng(pos).setRadius(Math.min(acc, 2000)); }
  }

  /* ---------- UI ---------- */
  function pill(icon, title, sub, extra, n) {
    return icon + (n ? '<span class="wn">' + n + '</span>' : '') + '<span class="wt"><b>' + title + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</span>' + (extra ? '<em>' + extra + '</em>' : '');
  }
  function render() {
    var at = here();
    // list rows + pins
    stops.forEach(function (s) {
      var li = document.querySelector('.stop[data-n="' + s.n + '"]');
      var playing = current === s.n && !audio.paused && !audio.ended;
      if (li) {
        li.classList.toggle('playing', playing);
        li.classList.toggle('here', at && at.n === s.n);
        var ic = li.querySelector('.sicon');
        if (ic) ic.innerHTML = playing ? ICON.pause : ICON.play;
        var sm = li.querySelector('.sdist');
        if (sm) { var d = dTo(s); sm.textContent = d !== null ? ' · ' + (d <= R && acc <= VAGUE ? 'you’re here' : fmtD(d) + ' away') : ''; }
      }
      var pin = pins[s.n] && pins[s.n].getElement && pins[s.n].getElement();
      if (pin && pin.firstChild) pin.firstChild.classList.toggle('here', !!(at && at.n === s.n));
    });
    if (!fl) return;
    var cls = 'off', html, act = '';
    var loaded = current !== null && !audio.ended;
    var movedOn = loaded && audio.paused && at && at.n !== current;  // paused one, now at another spot
    if (loaded && !movedOn) {                                    // play/pause control
      var c = byN(current), left = (audio.duration || c.secs) - (audio.currentTime || 0);
      cls = 'on';
      html = pill(audio.paused ? ICON.play : ICON.pause, c.n + ' · ' + c.title, audio.paused ? 'Paused – tap to continue' : 'Playing – tap to pause', fmtT(left), c.n);
      act = 'play:' + c.n;
    } else if (at) {                                             // you're at a spot: light up
      cls = 'near';
      html = pill(ICON.play, at.n + ' · ' + at.title, heard.has(at.n) ? 'Listen again' : 'Listen to the audio guide here', '', at.n);
      act = 'play:' + at.n;
    } else {                                                     // inactive
      var sub;
      if (gps === 'denied') sub = 'Location is off – tap a pin on the map';
      else if (gps === 'none') sub = 'No location – tap a pin on the map';
      else if (gps === 'vague') sub = 'GPS is vague here (±' + fmtD(acc) + ')';
      else if (gps === 'ok') { var nb = nearest(); sub = 'Nearest: ' + nb.s.n + ' · ' + fmtD(nb.d) + ' away'; }
      else if (gps === 'finding') sub = 'Finding where you are…';
      else sub = 'Tap to find spots near you';
      html = pill(ICON.phones, 'Audio guide', sub);
      act = gps === 'idle' ? 'gps' : 'map';
    }
    fl.className = 'wfloat ' + cls;
    fl.innerHTML = html;
    fl.dataset.act = act;
    fl.hidden = false;
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-play]');
    if (t) { e.preventDefault(); play(+t.getAttribute('data-play')); if (map) map.closePopup(); }
  });
  fl && fl.addEventListener('click', function () {
    var a = fl.dataset.act || '';
    if (a.indexOf('play:') === 0) play(+a.slice(5));
    else if (a === 'gps') startGps();
    else { var m = document.getElementById('wmapsec'); if (m) m.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });

  initMap();
  render();
  startGps();                            // opened at a spot → light up as soon as we have a fix
})();
