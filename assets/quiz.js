/* Trip quiz + bonus track for a guide page.
   Players are named on the phone (localStorage) – names never go on the website.
   With several players the questions alternate and each gets a score. */
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
  var KEY = 'quiz-' + Q.id + '-' + N, PKEY = 'quiz-players', SKEY = 'quiz-speak';
  var LETTERS = ['A', 'B', 'C', 'D'];
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var roster = load(PKEY) || ['Player 1', 'Player 2'];      // names known on this phone
  var chosen = {};                                          // index in roster → selected
  var speak = load(SKEY) !== false;
  var st = load(KEY);                                       // {players, scores, i, picked, done}
  var editing = -1;

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

  function confetti(el) {
    if (reduce) return;
    var r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var cols = ['#B2302B', '#1A2E44', '#E2B33C', '#2E8B57', '#4A7BA6'];
    for (var i = 0; i < 28; i++) {
      var p = document.createElement('i');
      p.className = 'qconf';
      p.style.left = cx + 'px'; p.style.top = cy + 'px';
      p.style.background = cols[i % cols.length];
      document.body.appendChild(p);
      var a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 110;
      var dx = Math.cos(a) * d, dy = Math.sin(a) * d - 40;
      var anim = p.animate([
        { transform: 'translate(-50%,-50%) rotate(0deg)', opacity: 1 },
        { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + (dy + 90) + 'px)) rotate(' + (Math.random() * 540 - 270) + 'deg)', opacity: 0 }
      ], { duration: 900 + Math.random() * 600, easing: 'cubic-bezier(.15,.7,.35,1)' });
      anim.onfinish = (function (n) { return function () { n.remove(); }; })(p);
    }
  }

  /* ---------- screens ---------- */
  function startScreen() {
    var chips = roster.map(function (name, i) {
      if (i === editing) return '<span class="qchip edit"><input id="qname" maxlength="16" value="' + esc(name) + '" aria-label="Player name"></span>';
      return '<span class="qchip' + (chosen[i] ? ' on' : '') + '"><button type="button" class="qpick" data-pick="' + i + '">' +
        (chosen[i] ? '✓ ' : '') + esc(name) + '</button><button type="button" class="qren" data-ren="' + i + '" aria-label="Rename ' + esc(name) + '">✎</button></span>';
    }).join('');
    var n = Object.keys(chosen).filter(function (k) { return chosen[k]; }).length;
    root.innerHTML =
      '<p class="qlead">' + N + ' questions about ' + esc(Q.place) + '. The answers are in the audio guides and the bonus track.</p>' +
      '<p class="qlabel">Who’s playing?</p>' +
      '<div class="qchips">' + chips + (roster.length < 4 ? '<button type="button" class="qadd" data-add="1">+ Add player</button>' : '') + '</div>' +
      '<p class="qhint">' + (n > 1 ? 'You’ll take turns' + (N % n === 0 ? ' – ' + (N / n) + ' questions each.' : ', one question each.') : 'Pick one or more. Tap ✎ to put in your names – they stay on this phone.') + '</p>' +
      '<label class="qspeak"><input type="checkbox" id="qspk"' + (speak ? ' checked' : '') + '> Read the questions aloud</label>' +
      '<button type="button" class="btn primary qgo" data-go="1"' + (n ? '' : ' disabled') + '>Start the quiz</button>';
    var inp = document.getElementById('qname');
    if (inp) {
      inp.focus(); inp.select();
      var done = function () { if (editing < 0) return; var v = inp.value.trim(); if (v) { roster[editing] = v; save(PKEY, roster); } editing = -1; startScreen(); };
      inp.addEventListener('blur', done);
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
    }
  }

  function scoresLine() {
    if (st.players.length < 2) return '<span class="qsc" data-p="0">✓ ' + st.scores[0] + '</span>';
    return st.players.map(function (p, i) { return '<span class="qsc" data-p="' + i + '">' + esc(p) + ' <b>' + st.scores[i] + '</b></span>'; }).join('');
  }

  function questionScreen(fresh) {
    var q = qs[st.i], who = st.i % st.players.length, multi = st.players.length > 1;
    var opts = q.options.map(function (o, k) {
      var cls = '';
      if (st.picked !== null) { if (k === q.answer) cls = ' right'; else if (k === st.picked) cls = ' wrong'; else cls = ' dim'; }
      return '<button type="button" class="qopt' + cls + '" data-opt="' + k + '"' + (st.picked !== null ? ' disabled' : '') + '><span class="ql">' + LETTERS[k] + '</span><span>' + esc(o) + '</span></button>';
    }).join('');
    var fb = '';
    if (st.picked !== null) {
      var ok = st.picked === q.answer;
      fb = '<div class="qfb ' + (ok ? 'ok' : 'no') + '"><b>' + (ok ? (multi ? 'Correct, ' + esc(st.players[who]) + '!' : 'Correct!') : 'Not quite – the answer is “' + esc(q.options[q.answer]) + '”.') + '</b> ' + esc(q.why) + '</div>' +
        '<button type="button" class="btn primary qnext" data-next="1">' + (st.i + 1 < N ? 'Next question →' : 'See the result') + '</button>';
    }
    root.innerHTML =
      '<div class="qtop"><span class="qcount">Question ' + (st.i + 1) + ' of ' + N + '</span><span class="qscores">' + scoresLine() + '</span></div>' +
      '<div class="qbar"><i style="width:' + ((st.i + (st.picked !== null ? 1 : 0)) / N * 100) + '%"></i></div>' +
      (multi ? '<p class="qturn">' + esc(st.players[who]) + '’s turn</p>' : '') +
      '<h3 class="qq">' + esc(q.q) + '</h3>' +
      '<button type="button" class="qlisten" data-listen="1">' + SPK + ' Listen</button>' +
      '<div class="qopts">' + opts + '</div>' + fb +
      '<button type="button" class="qreset" data-reset="1">↺ Reset quiz</button>';
    if (fresh && speak && st.picked === null) listen();
  }

  function endScreen() {
    var multi = st.players.length > 1, html;
    if (!multi) {
      var s = st.scores[0], msg = s === N ? 'Perfect – you clearly listened to every story.' : s >= N - 2 ? 'Excellent – nearly a clean sweep.' : s >= N / 2 ? 'Not bad at all.' : 'The audio guides have all the answers – try again later.';
      html = '<p class="qbig">' + s + '<small> of ' + N + '</small></p><p class="qmsg">' + msg + '</p>';
    } else {
      var best = Math.max.apply(null, st.scores), winners = st.players.filter(function (p, i) { return st.scores[i] === best; });
      html = '<p class="qwin">' + (winners.length > 1 ? 'It’s a draw!' : '🏆 ' + esc(winners[0]) + ' wins!') + '</p><ol class="qboard">' +
        st.players.map(function (p, i) { return { p: p, s: st.scores[i] }; }).sort(function (a, b) { return b.s - a.s; })
          .map(function (r) { return '<li' + (r.s === best ? ' class="top"' : '') + '><span>' + esc(r.p) + '</span><b>' + r.s + '</b></li>'; }).join('') + '</ol>';
    }
    root.innerHTML = '<div class="qend">' + html + '</div>' +
      '<div class="row2"><button type="button" class="btn primary" data-again="1">Play again</button><button type="button" class="btn" data-change="1">Change players</button></div>';
    if (!reduce && (!multi ? st.scores[0] >= N - 2 : true)) setTimeout(function () { confetti(root.querySelector('.qend')); ding(); }, 150);
  }

  function render(fresh) {
    if (!st) startScreen();
    else if (st.done) endScreen();
    else questionScreen(fresh);
  }

  function listen() {
    if (!audio) return;
    audio.src = Q.base + qs[st.i].file;
    audio.play().catch(function () {});
  }

  function answer(k) {
    if (!st || st.picked !== null) return;
    var q = qs[st.i], who = st.i % st.players.length;
    st.picked = k;
    if (audio) audio.pause();
    var ok = k === q.answer;
    if (ok) st.scores[who]++;
    save(KEY, st);
    questionScreen(false);
    var btn = root.querySelector('.qopt[data-opt="' + (ok ? k : q.answer) + '"]');
    if (ok) {
      btn.classList.add('pop'); confetti(btn); ding();
      var sc = root.querySelector('.qsc[data-p="' + who + '"]'); if (sc) sc.classList.add('bump');
    } else {
      var w = root.querySelector('.qopt[data-opt="' + k + '"]'); if (w) w.classList.add('shake');
      btn.classList.add('reveal'); bonk();
    }
    var nx = root.querySelector('.qnext'); if (nx) nx.classList.add('show');
  }

  root.addEventListener('click', function (e) {
    var t = e.target.closest('button,[data-pick]');
    if (!t) return;
    if (t.dataset.pick !== undefined) { var i = +t.dataset.pick; chosen[i] = !chosen[i]; startScreen(); }
    else if (t.dataset.ren !== undefined) { editing = +t.dataset.ren; startScreen(); }
    else if (t.dataset.add) { roster.push('Player ' + (roster.length + 1)); save(PKEY, roster); editing = roster.length - 1; chosen[editing] = true; startScreen(); }
    else if (t.dataset.go) {
      var ps = roster.filter(function (p, i) { return chosen[i]; });
      if (!ps.length) return;
      var cb = document.getElementById('qspk'); speak = !cb || cb.checked; save(SKEY, speak);
      st = { players: ps, scores: ps.map(function () { return 0; }), i: 0, picked: null, done: false };
      save(KEY, st); render(true); root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    else if (t.dataset.opt !== undefined) answer(+t.dataset.opt);
    else if (t.dataset.listen) listen();
    else if (t.dataset.next) {
      if (st.i + 1 < N) { st.i++; st.picked = null; } else st.done = true;
      save(KEY, st); render(true); root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    else if (t.dataset.again) { st = { players: st.players, scores: st.players.map(function () { return 0; }), i: 0, picked: null, done: false }; save(KEY, st); render(true); }
    else if (t.dataset.change) { st = null; save(KEY, null); chosen = {}; render(false); }
    else if (t.dataset.reset) {
      if (t.dataset.armed) {                                   // second tap: back to the start, same players picked
        if (audio) audio.pause();
        st = null; save(KEY, null); render(false);
        root.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {                                                 // first tap: ask for a second one
        t.dataset.armed = '1'; t.classList.add('armed'); t.textContent = 'Tap again to reset the scores';
        setTimeout(function () { if (t.isConnected) { delete t.dataset.armed; t.classList.remove('armed'); t.textContent = '↺ Reset quiz'; } }, 3000);
      }
    }
  });
  root.addEventListener('change', function (e) { if (e.target.id === 'qspk') { speak = e.target.checked; save(SKEY, speak); } });

  if (st && st.players) roster.forEach(function (p, i) { if (st.players.indexOf(p) >= 0) chosen[i] = true; });
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
