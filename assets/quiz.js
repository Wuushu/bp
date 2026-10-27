/* Trip quiz + bonus track for a guide page.
   Played together as a team: one shared score, graded at the end by the share of right
   answers (works for any number of questions). Every grade is a positive one. */
(function () {
  var Q = window.QUIZ;
  var root = document.getElementById('qz');
  // only one <audio> plays at a time on the page
  document.addEventListener('play', function (e) {
    var all = document.querySelectorAll('audio');
    for (var i = 0; i < all.length; i++) if (all[i] !== e.target) all[i].pause();
  }, true);
  bonus();
  if (!Q || !root) return;

  var qs = Q.questions, N = qs.length, audio = document.getElementById('qaudio');
  var KEY = 'quiz-' + Q.id + '-' + N + '-team', SKEY = 'quiz-speak';
  var LETTERS = ['A', 'B', 'C', 'D'];
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var place = Q.place || 'this place';

  // grades: lowest share of right answers (0–1) → badge. All positive.
  var GRADES = [
    { min: .9, icon: '🧭', title: 'Seasoned Travellers', msg: 'It’s clear you paid attention to every story. ' + place + ' has no secrets from you – well done!' },
    { min: .75, icon: '🏰', title: 'History Buffs', msg: 'You soaked up the stories. The kings, the crown and the castle would be proud of you.' },
    { min: .5, icon: '🗺️', title: 'Curious Explorers', msg: 'You picked up plenty along the way – a proper day of discovery. Nicely done!' },
    { min: .25, icon: '🥾', title: 'Happy Wanderers', msg: 'You were busy enjoying the views – and that’s exactly what a day like this is for.' },
    { min: 0, icon: '🎒', title: 'Fresh-Eyed Adventurers', msg: 'Every answer you heard today is a new story to tell. You know more than when you arrived!' }
  ];
  function gradeFor(share) { for (var i = 0; i < GRADES.length; i++) if (share >= GRADES[i].min - 1e-9) return GRADES[i]; return GRADES[GRADES.length - 1]; }

  function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var speak = load(SKEY) !== false;
  var st = load(KEY);                                       // {score, i, picked, done, t}
  var resumed = false;
  if (st && (!st.t || Date.now() - st.t > 6 * 3600e3 || typeof st.score !== 'number')) { st = null; save(KEY, null); }   // stale → fresh
  else if (st && !st.done) resumed = true;
  function saveSt() { if (st) st.t = Date.now(); save(KEY, st); }
  function fresh() { return { score: 0, i: 0, picked: null, done: false }; }
  function resumeNote() { return resumed ? '<p class="qresume">Picking up where you left off · <button type="button" class="linkbtn" data-restart="1">Start over</button></p>' : ''; }

  var SPK = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  /* ---------- sounds (tiny, synthesised) ---------- */
  var ctx = null;
  function tone(freqs, type, dur, vol) {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      var t0 = ctx.currentTime;
      freqs.forEach(function (f, i) {
        var o = ctx.createOscillator(), g = ctx.createGain(), t = t0 + i * dur * .8;
        o.type = type; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.6);
        o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + dur * 1.7);
      });
    } catch (e) {}
  }
  function ding() { tone([659, 880, 1319], 'sine', .11, .18); }
  function bonk() { tone([196, 147], 'triangle', .16, .16); }
  function fanfare(top) { tone(top ? [523, 659, 784, 1047, 1319] : [523, 659, 784, 1047], 'sine', .14, .2); }

  function confetti(el, n) {
    if (reduce || !el) return;
    var r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var cols = ['#B2302B', '#1A2E44', '#E2B33C', '#2E8B57', '#4A7BA6'];
    for (var i = 0; i < (n || 28); i++) {
      var p = document.createElement('i');
      p.className = 'qconf';
      p.style.left = cx + 'px'; p.style.top = cy + 'px';
      p.style.background = cols[i % cols.length];
      document.body.appendChild(p);
      var a = Math.random() * Math.PI * 2, d = 60 + Math.random() * (n > 30 ? 170 : 110);
      var dx = Math.cos(a) * d, dy = Math.sin(a) * d - 40;
      var anim = p.animate([
        { transform: 'translate(-50%,-50%) rotate(0deg)', opacity: 1 },
        { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + (dy + 90) + 'px)) rotate(' + (Math.random() * 540 - 270) + 'deg)', opacity: 0 }
      ], { duration: 900 + Math.random() * 700, easing: 'cubic-bezier(.15,.7,.35,1)' });
      anim.onfinish = (function (x) { return function () { x.remove(); }; })(p);
    }
  }

  /* ---------- screens ---------- */
  function startScreen() {
    root.innerHTML =
      '<p class="qlead">' + N + ' questions about ' + esc(place) + ', played together. Read each question out, agree on an answer – and see which travellers you are at the end.</p>' +
      '<p class="qhint">The answers are in the audio guides and the bonus track.</p>' +
      '<label class="qspeak"><input type="checkbox" id="qspk"' + (speak ? ' checked' : '') + '> Read the questions aloud</label>' +
      '<button type="button" class="btn primary qgo" data-go="1">Start the quiz</button>';
  }

  function questionScreen(fresh) {
    var q = qs[st.i];
    var opts = q.options.map(function (o, k) {
      var cls = '';
      if (st.picked !== null) { if (k === q.answer) cls = ' right'; else if (k === st.picked) cls = ' wrong'; else cls = ' dim'; }
      return '<button type="button" class="qopt' + cls + '" data-opt="' + k + '"' + (st.picked !== null ? ' disabled' : '') + '><span class="ql">' + LETTERS[k] + '</span><span>' + esc(o) + '</span></button>';
    }).join('');
    var fb = '';
    if (st.picked !== null) {
      var ok = st.picked === q.answer;
      fb = '<div class="qfb ' + (ok ? 'ok' : 'no') + '"><b>' + (ok ? 'Correct!' : 'Not quite – the answer is “' + esc(q.options[q.answer]) + '”.') + '</b> ' + esc(q.why) + '</div>' +
        '<button type="button" class="btn primary qnext" data-next="1">' + (st.i + 1 < N ? 'Next question →' : 'See how you did →') + '</button>';
    }
    root.innerHTML = resumeNote() +
      '<div class="qtop"><span class="qcount">Question ' + (st.i + 1) + ' of ' + N + '</span><span class="qscores"><span class="qsc" data-p="0">✓ <b>' + st.score + '</b> right</span></span></div>' +
      '<div class="qbar"><i style="width:' + ((st.i + (st.picked !== null ? 1 : 0)) / N * 100) + '%"></i></div>' +
      '<h3 class="qq">' + esc(q.q) + '</h3>' +
      '<button type="button" class="qlisten" data-listen="1">' + SPK + ' Listen</button>' +
      '<div class="qopts">' + opts + '</div>' + fb +
      '<button type="button" class="qreset" data-reset="1">↺ Reset quiz</button>';
    if (fresh && speak && st.picked === null) listen();
  }

  function endScreen(animate) {
    var share = N ? st.score / N : 0, pct = Math.round(share * 100), g = gradeFor(share), top = g === GRADES[0];
    var C = 2 * Math.PI * 52;
    var ladder = GRADES.slice().reverse().map(function (x) {
      return '<li class="' + (x === g ? 'on' : '') + '"><span>' + x.icon + '</span><small>' + (x.min ? Math.round(x.min * 100) + '%+' : 'Any') + '</small></li>';
    }).join('');
    root.innerHTML =
      '<div class="qres' + (animate && !reduce ? '' : ' done') + '">' +
      '<div class="qring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="qr-bg" cx="60" cy="60" r="52"/>' +
      '<circle class="qr-fg" cx="60" cy="60" r="52" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (animate && !reduce ? C : C * (1 - share)).toFixed(1) + '"/></svg>' +
      '<div class="qpct"><b>' + (animate && !reduce ? 0 : pct) + '%</b><small>' + st.score + ' of ' + N + ' right</small></div>' +
      '<span class="qmedal" aria-hidden="true">' + g.icon + '</span></div>' +
      '<p class="qkick">You are…</p>' +
      '<p class="qgrade">' + g.title + '</p>' +
      '<p class="qgmsg">' + esc(g.msg) + '</p>' +
      '<ol class="qladder" aria-label="All grades">' + ladder + '</ol>' +
      '</div>' +
      '<button type="button" class="btn primary qagain" data-restart="1">Play again</button>';
    if (!animate) return;
    var res = root.querySelector('.qres');
    if (reduce) { fanfare(top); return; }
    var ring = root.querySelector('.qr-fg'), num = root.querySelector('.qpct b');
    requestAnimationFrame(function () { requestAnimationFrame(function () { ring.style.strokeDashoffset = (C * (1 - share)).toFixed(1); }); });
    var t0 = performance.now(), D = 1300;
    (function tick(now) {
      var k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3);
      num.textContent = Math.round(pct * e) + '%';
      if (k < 1) requestAnimationFrame(tick);
      else {
        res.classList.add('done');
        fanfare(top);
        setTimeout(function () { confetti(root.querySelector('.qmedal'), top ? 60 : 36); }, 180);
      }
    })(t0);
  }

  function render(fresh) {
    if (!st) startScreen();
    else if (st.done) endScreen(fresh);
    else questionScreen(fresh);
  }

  function listen() {
    if (!audio) return;
    audio.src = Q.base + qs[st.i].file;
    audio.play().catch(function () {});
  }

  function answer(k) {
    if (!st || st.picked !== null) return;
    var q = qs[st.i];
    st.picked = k;
    if (audio) audio.pause();
    var ok = k === q.answer;
    if (ok) st.score++;
    saveSt();
    questionScreen(false);
    var btn = root.querySelector('.qopt[data-opt="' + (ok ? k : q.answer) + '"]');
    if (ok) {
      btn.classList.add('pop'); confetti(btn); ding();
      var sc = root.querySelector('.qsc'); if (sc) sc.classList.add('bump');
    } else {
      var w = root.querySelector('.qopt[data-opt="' + k + '"]'); if (w) w.classList.add('shake');
      btn.classList.add('reveal'); bonk();
    }
    var nx = root.querySelector('.qnext'); if (nx) nx.classList.add('show');
  }

  root.addEventListener('click', function (e) {
    var t = e.target.closest('button');
    if (!t) return;
    if (!t.dataset.restart) resumed = false;
    if (t.dataset.go) {
      var cb = document.getElementById('qspk'); speak = !cb || cb.checked; save(SKEY, speak);
      st = fresh(); saveSt(); render(true); root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    else if (t.dataset.opt !== undefined) answer(+t.dataset.opt);
    else if (t.dataset.listen) listen();
    else if (t.dataset.next) {
      if (st.i + 1 < N) { st.i++; st.picked = null; } else st.done = true;
      saveSt(); render(true); root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    else if (t.dataset.restart) { if (audio) audio.pause(); resumed = false; st = fresh(); saveSt(); render(true); root.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else if (t.dataset.reset) {
      if (t.dataset.armed) {                                   // second tap: back to the start screen
        if (audio) audio.pause();
        st = null; save(KEY, null); render(false);
        root.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {                                                 // first tap: ask for a second one
        t.dataset.armed = '1'; t.classList.add('armed'); t.textContent = 'Tap again to reset the quiz';
        setTimeout(function () { if (t.isConnected) { delete t.dataset.armed; t.classList.remove('armed'); t.textContent = '↺ Reset quiz'; } }, 3000);
      }
    }
  });
  root.addEventListener('change', function (e) { if (e.target.id === 'qspk') { speak = e.target.checked; save(SKEY, speak); } });

  render(false);

  /* ---------- bonus track ---------- */
  function bonus() {
    var a = document.getElementById('faudio'), b = document.getElementById('fbtn'), bar = document.querySelector('.fbar i'), tm = document.getElementById('ftime');
    if (!a || !b) return;
    var P = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>',
        S = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" fill="currentColor"/></svg>';
    function f(s) { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
    function up() {
      var on = !a.paused && !a.ended;
      b.innerHTML = on ? S : P;
      b.parentNode.classList.toggle('playing', on);
      if (bar && a.duration) bar.style.width = (a.currentTime / a.duration * 100) + '%';
      if (tm) tm.textContent = a.currentTime > 0 && !a.ended ? f(a.currentTime) + ' / ' + f(a.duration || +tm.dataset.total) : f(+tm.dataset.total);
    }
    b.addEventListener('click', function () { if (a.paused) a.play().catch(function () {}); else a.pause(); });
    ['play', 'pause', 'timeupdate', 'ended'].forEach(function (ev) { a.addEventListener(ev, up); });
    up();
  }
})();
