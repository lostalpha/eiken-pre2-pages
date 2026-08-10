/* 英検準2級 過去問トレーニング */
(function () {
  "use strict";

  // ---------- 定数 ----------
  var STORE_PREFIX = "eikenPre2.";

  // 1問あたりの制限時間(秒)。実試験の時間配分(筆記80分・リスニング約25分)からの目安
  var TIME_LIMITS = {
    w1: 40,   // 短文語句補充 15問 ≒10分
    w2: 60,   // 会話文補充 5問 ≒5分
    w3: 150,  // 長文語句補充 2問 ≒5分
    w4: 180,  // 長文内容一致 7問 ≒20分
    w5: 900,  // Eメール 15分
    w6: 1200, // 意見論述 20分
    l1: 60,   // リスニングは音声終了後にカウント開始
    l2: 60,
    l3: 60
  };

  var SECTION_ICONS = {
    w1: "📝", w2: "💬", w3: "📄", w4: "📖", w5: "✉️", w6: "🖊️",
    l1: "🎧", l2: "🎧", l3: "🎧"
  };

  var EMOJIS = ["🐱", "🐶", "🐰", "🦊", "🐼", "🐧", "🦁", "🐸", "🦄", "🐢", "🐙", "⭐"];

  var TIMER_MODES = [
    { id: "force", label: "強制" },
    { id: "soft", label: "任意" },
    { id: "off", label: "なし" }
  ];
  var TIMER_HELP = {
    force: "強制：時間切れになると自動的に不正解になり、解説が表示されます。",
    soft: "任意：残り時間は表示されますが、時間切れでもそのまま解答できます。",
    off: "なし：タイマーを表示しません。"
  };

  // ---------- データ索引 ----------
  // データは data/exams.js（ローカル版）または unlock.js の復号（公開版）で
  // window.EIKEN_DATA に入る。索引構築と初回描画は buildIndexes() で行う。
  var EXAMS = [];
  var QINDEX = {};   // qid -> {q, section, exam}
  var PINDEX = {};   // passage id -> passage

  function buildIndexes() {
    EXAMS = window.EIKEN_DATA || [];
    EXAMS.forEach(function (ex) {
      ex.sections.forEach(function (sec) {
        (sec.passages || []).forEach(function (p) { PINDEX[p.id] = p; });
        sec.questions.forEach(function (q) {
          QINDEX[q.id] = { q: q, section: sec, exam: ex.exam };
        });
      });
    });
  }

  function examId(ex) { return ex.exam.id || (ex.exam.year + "-" + ex.exam.session); }
  function examLabel(ex) { return ex.exam.label || (ex.exam.year + "年度 第" + ex.exam.session + "回"); }

  // ---------- ストレージ ----------
  function load(key, fallback) {
    try {
      var v = localStorage.getItem(STORE_PREFIX + key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  }
  function save(key, value) {
    localStorage.setItem(STORE_PREFIX + key, JSON.stringify(value));
  }

  function getUsers() { return load("users", []); }
  function setUsers(users) { save("users", users); }
  function getRecords(userId) { return load("records." + userId, []); }
  function addRecord(userId, rec) {
    var recs = getRecords(userId);
    recs.push(rec);
    if (recs.length > 300) recs = recs.slice(recs.length - 300);
    save("records." + userId, recs);
  }
  function getSettings(userId) { return load("settings." + userId, { timerMode: "soft" }); }
  function setSettings(userId, s) { save("settings." + userId, s); }

  // ---------- バックアップ ----------
  function exportBackup() {
    var users = getUsers();
    if (!users.length) { alert("まだユーザーがいないので、ほぞんするきろくがありません。"); return; }
    var payload = {
      app: "eikenPre2", kind: "backup", version: 1,
      exportedAt: new Date().toISOString(),
      users: users, records: {}, settings: {}
    };
    users.forEach(function (u) {
      payload.records[u.id] = getRecords(u.id);
      payload.settings[u.id] = getSettings(u.id);
    });
    var d = new Date();
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    var name = "eiken-kiroku-" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + ".json";
    var blob = new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function importBackup() {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = function () {
      var f = input.files && input.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var data;
        try { data = JSON.parse(reader.result); } catch (e) { data = null; }
        if (!data || data.app !== "eikenPre2" || !Array.isArray(data.users)) {
          alert("このファイルはバックアップではないみたい。よみこめませんでした。");
          return;
        }
        var summary = mergeBackup(data);
        alert("よみこみました！\n" + summary);
        render();
      };
      reader.readAsText(f);
    };
    input.click();
  }

  // バックアップを現在のデータに合流させる。既存の記録は消さず、無いものだけ足す
  function mergeBackup(data) {
    var users = getUsers();
    var byId = {};
    users.forEach(function (u) { byId[u.id] = true; });
    var addedUsers = 0, addedRecs = 0;
    data.users.forEach(function (u) {
      if (!u || !u.id || !u.name) return;
      if (!byId[u.id]) {
        users.push({ id: u.id, name: String(u.name).slice(0, 10), emoji: u.emoji || EMOJIS[0] });
        byId[u.id] = true;
        addedUsers++;
      }
      var recs = getRecords(u.id);
      var seen = {};
      recs.forEach(function (r) { seen[JSON.stringify(r)] = true; });
      var incoming = (data.records && data.records[u.id]) || [];
      if (Array.isArray(incoming)) {
        incoming.forEach(function (r) {
          if (!r || typeof r !== "object") return;
          var k = JSON.stringify(r);
          if (!seen[k]) { recs.push(r); seen[k] = true; addedRecs++; }
        });
      }
      recs.sort(function (a, b) { return (a.date || 0) - (b.date || 0); });
      if (recs.length > 300) recs = recs.slice(recs.length - 300);
      save("records." + u.id, recs);
      // 設定はこの端末に無いユーザーのぶんだけ取り込む
      if (localStorage.getItem(STORE_PREFIX + "settings." + u.id) === null &&
          data.settings && data.settings[u.id]) {
        setSettings(u.id, data.settings[u.id]);
      }
    });
    setUsers(users);
    return "ユーザー " + addedUsers + "人、きろく " + addedRecs + "件をついかしました。";
  }

  // ---------- 状態 ----------
  var state = {
    screen: "users",
    userId: null,
    examIdx: 0,
    session: null,
    playing: false
  };

  function currentUser() {
    var users = getUsers();
    for (var i = 0; i < users.length; i++) if (users[i].id === state.userId) return users[i];
    return null;
  }

  // ---------- ユーティリティ ----------
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function el(id) { return document.getElementById(id); }
  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }
  function fmtDate(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + "/" + d.getDate() + " " +
      d.getHours() + ":" + (d.getMinutes() < 10 ? "0" : "") + d.getMinutes();
  }
  // "( 19 )" 形式の空所番号を抽出
  function blankNumbers(text) {
    var out = [];
    var re = /\(\s*(\d+)\s*\)/g, m;
    while ((m = re.exec(text)) !== null) {
      if (out.indexOf(m[1]) === -1) out.push(m[1]);
    }
    return out;
  }

  // エスケープ済みテキスト中の対象空所 "( n )" をハイライト
  function highlightBlank(escapedText, num) {
    if (!num) return escapedText;
    var re = new RegExp("\\(\\s*" + num + "\\s*\\)", "g");
    return escapedText.replace(re, '<span class="blank-target">( ' + num + " )</span>");
  }

  function fmtLimit(sec) {
    if (sec < 60) return sec + "秒";
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + "分" + (s ? s + "秒" : "");
  }
  function pctBadgeClass(pct) {
    return pct >= 80 ? "good" : pct >= 60 ? "mid" : "bad";
  }
  function isListening(sectionId) { return sectionId.charAt(0) === "l"; }
  function baseSectionId(sectionId) { return sectionId; } // w1..l3

  // ---------- 音声読み上げ ----------
  var ttsOk = "speechSynthesis" in window;
  var ttsQueue = [];

  function pickVoice() {
    if (!ttsOk) return null;
    var voices = window.speechSynthesis.getVoices();
    var best = null;
    for (var i = 0; i < voices.length; i++) {
      var v = voices[i];
      if (/^en(-|_)/.test(v.lang)) {
        if (/Samantha|Google US English|Karen|Daniel/.test(v.name)) return v;
        if (!best) best = v;
      }
    }
    return best;
  }

  function speakScript(text, onDone) {
    if (!ttsOk) { if (onDone) onDone(); return; }
    stopSpeaking();
    var voice = pickVoice();
    var lines = text.split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
    var utts = [];
    lines.forEach(function (line) {
      var pitch = 1.0;
      if (line.charAt(0) === "☆") pitch = 1.25;      // 女性話者
      else if (line.charAt(0) === "★") pitch = 0.85; // 男性話者
      var clean = line.replace(/^[☆★]\s*:?\s*/, "");
      if (!clean) return;
      var u = new SpeechSynthesisUtterance(clean);
      u.lang = "en-US";
      if (voice) u.voice = voice;
      u.rate = 0.92;
      u.pitch = pitch;
      utts.push(u);
    });
    if (!utts.length) { if (onDone) onDone(); return; }
    ttsQueue = utts;
    utts.forEach(function (u, i) {
      if (i === utts.length - 1) {
        u.onend = function () { state.playing = false; if (onDone) onDone(); };
        u.onerror = function () { state.playing = false; if (onDone) onDone(); };
      }
      window.speechSynthesis.speak(u);
    });
    state.playing = true;
  }

  function stopSpeaking() {
    if (ttsOk) window.speechSynthesis.cancel();
    ttsQueue = [];
    state.playing = false;
  }

  if (ttsOk) window.speechSynthesis.getVoices(); // 音声リストの先読み

  // ---------- タイマー ----------
  var timerHandle = null;

  function startQuestionTimer() {
    stopQuestionTimer();
    var s = state.session;
    if (!s) return;
    var entry = s.entries[s.idx];
    if (entry.done) return;
    entry.qStartedAt = Date.now();
    if (s.timerMode === "off" || !entry.limit) return;
    if (entry.waitAudio) return; // リスニングは音声終了後に開始
    timerHandle = setInterval(tickTimer, 250);
    tickTimer();
  }

  function stopQuestionTimer() {
    if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
  }

  function tickTimer() {
    var s = state.session;
    if (!s) { stopQuestionTimer(); return; }
    var entry = s.entries[s.idx];
    if (entry.done) { stopQuestionTimer(); return; }
    var elapsed = (Date.now() - entry.qStartedAt) / 1000;
    var remain = entry.limit - elapsed;
    var node = el("timer");
    if (node) {
      if (remain >= 0) {
        node.textContent = "⏱ " + fmtTime(remain);
        node.className = "timer" + (remain <= 10 ? " low" : "");
      } else {
        node.textContent = "⏱ +" + fmtTime(-remain);
        node.className = "timer over";
      }
    }
    if (remain <= 0 && s.timerMode === "force") {
      stopQuestionTimer();
      onTimeout();
    }
  }

  // ---------- セッション構築 ----------
  function buildSession(examIdStr, sectionId, questionRefs, label) {
    // questionRefs: [{q, sectionId, instruction}]
    var settings = getSettings(state.userId);
    return {
      label: label,
      examId: examIdStr,
      sectionId: sectionId,
      timerMode: settings.timerMode || "soft",
      idx: 0,
      startedAt: Date.now(),
      entries: questionRefs.map(function (ref) {
        var lid = baseSectionId(ref.sectionId);
        return {
          q: ref.q,
          sectionId: ref.sectionId,
          instruction: ref.instruction || "",
          limit: TIME_LIMITS[lid] || 0,
          waitAudio: isListening(ref.sectionId), // 音声再生後にタイマー開始
          audioDone: false,
          done: false,
          picked: null,
          selfGrade: null,
          ok: null,
          timedOut: false,
          timeSec: 0,
          qStartedAt: null,
          showPassage: true
        };
      })
    };
  }

  function startSection(exIdx, sectionId) {
    var ex = EXAMS[exIdx];
    var sec = null;
    for (var i = 0; i < ex.sections.length; i++) if (ex.sections[i].id === sectionId) sec = ex.sections[i];
    if (!sec) return;
    var refs = sec.questions.map(function (q) {
      return { q: q, sectionId: sec.id, instruction: sec.instruction };
    });
    state.session = buildSession(examId(ex), sectionId, refs, examLabel(ex) + " " + sec.title);
    state.screen = "quiz";
    render();
    startQuestionTimer();
  }

  // 全回ミックス: 全部の回から実試験と同じ問題数をランダム出題（未出題を優先）
  function startMixSection(sectionId) {
    var pool = [];
    var perExamCount = 0;
    EXAMS.forEach(function (ex) {
      ex.sections.forEach(function (sec) {
        if (sec.id !== sectionId) return;
        perExamCount = Math.max(perExamCount, sec.questions.length);
        sec.questions.forEach(function (q) {
          pool.push({ q: q, sectionId: sec.id, instruction: sec.instruction });
        });
      });
    });
    if (!pool.length) return;

    // これまでに解いた回数を数える
    var seen = {};
    getRecords(state.userId).forEach(function (rec) {
      rec.details.forEach(function (d) { seen[d.qid] = (seen[d.qid] || 0) + 1; });
    });

    // シャッフルしてから出題回数の少ない順に安定ソート → 未出題を優先しつつランダム
    shuffle(pool);
    pool.sort(function (a, b) { return (seen[a.q.id] || 0) - (seen[b.q.id] || 0); });
    var refs = pool.slice(0, perExamCount);
    shuffle(refs); // 出題順もばらす

    var title = "";
    for (var i = 0; i < EXAMS[0].sections.length; i++) {
      if (EXAMS[0].sections[i].id === sectionId) title = EXAMS[0].sections[i].title;
    }
    state.session = buildSession("mix", sectionId, refs, "全回ミックス " + title);
    state.screen = "quiz";
    render();
    startQuestionTimer();
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function startReview(qids) {
    var refs = [];
    qids.forEach(function (qid) {
      var hit = QINDEX[qid];
      if (hit) refs.push({ q: hit.q, sectionId: hit.section.id, instruction: hit.section.instruction });
    });
    if (!refs.length) return;
    state.session = buildSession("review", "review", refs, "まちがえた問題のやり直し");
    state.screen = "quiz";
    render();
    startQuestionTimer();
  }

  // ---------- 解答処理 ----------
  function currentEntry() { return state.session.entries[state.session.idx]; }

  function finishEntry(entry, ok, picked, timedOut) {
    entry.done = true;
    entry.ok = ok;
    entry.picked = picked;
    entry.timedOut = !!timedOut;
    entry.timeSec = entry.qStartedAt ? Math.round((Date.now() - entry.qStartedAt) / 1000) : 0;
    stopQuestionTimer();
    stopSpeaking();
  }

  function onChoice(label) {
    var entry = currentEntry();
    if (entry.done) return;
    finishEntry(entry, label === entry.q.answer, label, false);
    render();
  }

  function onTimeout() {
    var entry = currentEntry();
    if (entry.done) return;
    var ta = el("writing-input");
    if (ta) entry.writingText = ta.value;
    finishEntry(entry, false, null, true);
    render();
  }

  function onWritingReveal() {
    var entry = currentEntry();
    if (entry.done) return;
    var ta = el("writing-input");
    entry.writingText = ta ? ta.value : "";
    finishEntry(entry, null, null, false); // 自己採点待ち
    render();
  }

  function onSelfGrade(g) {
    var entry = currentEntry();
    entry.selfGrade = g;
    entry.ok = g >= 1; // ◎○は正解あつかい
    render();
  }

  function nextQuestion() {
    var s = state.session;
    stopSpeaking();
    if (s.idx + 1 < s.entries.length) {
      s.idx++;
      render();
      startQuestionTimer();
    } else {
      finishSession();
    }
  }

  function finishSession() {
    var s = state.session;
    stopQuestionTimer();
    stopSpeaking();
    var details = s.entries.map(function (e) {
      return {
        qid: e.q.id,
        ok: !!e.ok,
        timedOut: e.timedOut,
        timeSec: e.timeSec,
        selfGrade: e.selfGrade
      };
    });
    var correct = details.filter(function (d) { return d.ok; }).length;
    var rec = {
      date: Date.now(),
      examId: s.examId,
      sectionId: s.sectionId,
      label: s.label,
      timerMode: s.timerMode,
      correct: correct,
      total: details.length,
      timeSec: Math.round((Date.now() - s.startedAt) / 1000),
      details: details
    };
    addRecord(state.userId, rec);
    state.lastResult = rec;
    state.screen = "result";
    render();
  }

  function quitSession() {
    if (!confirm("とちゅうでやめますか？（きろくは保存されません）")) return;
    stopQuestionTimer();
    stopSpeaking();
    state.session = null;
    state.screen = "home";
    render();
  }

  // ---------- 集計 ----------
  function lastScoreFor(userId, exId, sectionId) {
    var recs = getRecords(userId);
    for (var i = recs.length - 1; i >= 0; i--) {
      if (recs[i].examId === exId && recs[i].sectionId === sectionId) return recs[i];
    }
    return null;
  }

  function sectionAggregate(userId) {
    // sectionId(w1..l3)ごとの正答率(全履歴)
    var agg = {};
    getRecords(userId).forEach(function (rec) {
      rec.details.forEach(function (d) {
        var hit = QINDEX[d.qid];
        if (!hit) return;
        var key = hit.section.id;
        if (!agg[key]) agg[key] = { ok: 0, total: 0, title: hit.section.title };
        agg[key].total++;
        if (d.ok) agg[key].ok++;
      });
    });
    return agg;
  }

  function weakQids(userId) {
    // 各問題の最新結果が不正解のものを集める
    var latest = {};
    getRecords(userId).forEach(function (rec) {
      rec.details.forEach(function (d) { latest[d.qid] = d.ok; });
    });
    var out = [];
    Object.keys(latest).forEach(function (qid) {
      if (!latest[qid] && QINDEX[qid]) out.push(qid);
    });
    return out;
  }

  // ---------- 描画 ----------
  function render() {
    var app = el("app");
    switch (state.screen) {
      case "users": app.innerHTML = viewUsers(); break;
      case "addUser": app.innerHTML = viewAddUser(); break;
      case "home": app.innerHTML = viewHome(); break;
      case "quiz": app.innerHTML = viewQuiz(); break;
      case "result": app.innerHTML = viewResult(); break;
      case "records": app.innerHTML = viewRecords(); break;
    }
    window.scrollTo(0, 0);
  }

  // --- ユーザー選択 ---
  function viewUsers() {
    var users = getUsers();
    var html = '<div class="app-title">英検準2級<br>過去問トレーニング</div>' +
      '<div class="app-sub">だれが練習する？</div><div class="user-grid">';
    users.forEach(function (u) {
      var recs = getRecords(u.id);
      html += '<button class="user-card" data-action="pick-user" data-id="' + esc(u.id) + '">' +
        '<span class="avatar">' + esc(u.emoji) + '</span>' +
        '<span class="name">' + esc(u.name) + '</span>' +
        '<div class="stat">練習 ' + recs.length + '回</div></button>';
    });
    html += '<button class="user-card add" data-action="add-user">' +
      '<span class="avatar">➕</span><span class="name">ついか</span></button>';
    html += "</div>";
    html += '<div class="user-manage">';
    if (users.length) {
      html += '<button data-action="manage-users">ユーザーをけす</button>' +
        '<button data-action="export-backup">きろくをほぞん</button>';
    }
    html += '<button data-action="import-backup">きろくをよみこむ</button></div>';
    return html;
  }

  function viewAddUser() {
    var html = topbar("ユーザーついか", "users");
    html += '<div class="card"><div class="form-row"><label>なまえ</label>' +
      '<input type="text" id="new-name" maxlength="10" placeholder="なまえ"></div>' +
      '<div class="form-row"><label>マーク</label><div class="emoji-picker" id="emoji-picker">';
    EMOJIS.forEach(function (e, i) {
      html += '<button data-action="pick-emoji" data-emoji="' + e + '"' +
        (i === 0 ? ' class="selected"' : "") + ">" + e + "</button>";
    });
    html += '</div></div>' +
      '<button class="btn primary block" data-action="save-user">とうろくする</button></div>';
    return html;
  }

  // --- ホーム ---
  function viewHome() {
    var user = currentUser();
    if (!user) { state.screen = "users"; return viewUsers(); }
    var settings = getSettings(state.userId);
    var mode = settings.timerMode || "soft";

    var html = '<div class="topbar">' +
      '<button class="back-btn" data-action="to-users">←交代</button>' +
      '<div class="title"></div>' +
      '<div class="user-chip"><span class="avatar">' + esc(user.emoji) + "</span>" + esc(user.name) + "</div></div>";

    // タイマーモード
    html += '<div class="card"><h2>⏱ タイマー</h2><div class="seg">';
    TIMER_MODES.forEach(function (m) {
      html += '<button data-action="set-timer" data-mode="' + m.id + '"' +
        (mode === m.id ? ' class="selected"' : "") + ">" + m.label + "</button>";
    });
    html += '</div><div class="seg-help">' + esc(TIMER_HELP[mode]) + "</div></div>";

    // 回選択タブ（先頭は全回ミックス）
    var isMix = state.examIdx === -1;
    html += '<div class="exam-tabs">';
    html += '<button data-action="pick-exam" data-idx="-1"' +
      (isMix ? ' class="selected"' : "") + ">🎲 全回ミックス</button>";
    EXAMS.forEach(function (ex, i) {
      html += '<button data-action="pick-exam" data-idx="' + i + '"' +
        (i === state.examIdx ? ' class="selected"' : "") + ">" + esc(examLabel(ex)) + "</button>";
    });
    html += "</div>";
    if (isMix) {
      html += '<div class="mix-note">ぜんぶの回からランダムに出題（まだ解いていない問題を優先）</div>';
    }

    // セクション一覧
    var baseEx = isMix ? EXAMS[0] : EXAMS[state.examIdx];
    var exId = isMix ? "mix" : examId(baseEx);
    html += '<div class="section-list">';
    baseEx.sections.forEach(function (sec) {
      var last = lastScoreFor(state.userId, exId, sec.id);
      var badge;
      if (last) {
        var pct = Math.round(100 * last.correct / last.total);
        badge = '<span class="score-badge ' + pctBadgeClass(pct) + '">' + pct + "%</span>";
      } else {
        badge = '<span class="score-badge none">未</span>';
      }
      var limit = TIME_LIMITS[sec.id];
      var meta;
      if (isMix) {
        var poolTotal = 0;
        EXAMS.forEach(function (ex2) {
          ex2.sections.forEach(function (s2) { if (s2.id === sec.id) poolTotal += s2.questions.length; });
        });
        meta = "全" + poolTotal + "問から" + sec.questions.length + "問";
      } else {
        meta = sec.questions.length + "問";
      }
      if (limit && mode !== "off") meta += "・1問 " + fmtLimit(limit);
      html += '<button class="section-item" data-action="start-section" data-sec="' + esc(sec.id) + '">' +
        '<span class="icon">' + (SECTION_ICONS[sec.id] || "📘") + "</span>" +
        '<span class="body"><span class="name">' + esc(sec.title) + '</span><br>' +
        '<span class="meta">' + esc(meta) + "</span></span>" + badge + "</button>";
    });
    html += "</div>";

    var weak = weakQids(state.userId);
    html += '<div class="home-links">' +
      '<button class="btn ghost" data-action="to-records">📊 せいせき</button>' +
      '<button class="btn ghost" data-action="start-review"' + (weak.length ? "" : " disabled") + ">🔁 まちがい直し (" + weak.length + ")</button></div>";
    return html;
  }

  // --- 出題 ---
  function viewQuiz() {
    var s = state.session;
    var entry = s.entries[s.idx];
    var q = entry.q;
    var listening = isListening(entry.sectionId);
    var isWriting = q.type === "free_text";

    var html = '<div class="quiz-head">' +
      '<button class="quiz-quit" data-action="quit">✕ やめる</button>' +
      '<div class="progress">' + (s.idx + 1) + " / " + s.entries.length + "</div>" +
      (s.timerMode !== "off" && entry.limit ? '<div class="timer" id="timer">⏱ ' + fmtTime(entry.limit) + "</div>" : "") +
      "</div>" +
      '<div class="progress-bar"><div style="width:' + Math.round(100 * s.idx / s.entries.length) + '%"></div></div>';

    // この問題の空所番号（問題番号と一致する空所が本文にあるか）
    var targetBlank = null;
    var promptBlanks = blankNumbers(q.prompt || "");
    var passage = (q.passage_id && PINDEX[q.passage_id]) ? PINDEX[q.passage_id] : null;
    if (promptBlanks.indexOf(String(q.number)) !== -1 ||
        (passage && blankNumbers(passage.body).indexOf(String(q.number)) !== -1)) {
      targetBlank = String(q.number);
    }

    // 長文パッセージ
    if (passage) {
      var p = passage;
      html += '<div class="passage-box">' +
        (p.title ? '<div class="p-title">' + esc(p.title) + "</div>" : "") +
        (entry.showPassage ? '<div class="p-body">' + highlightBlank(esc(p.body), targetBlank) + "</div>" : "") +
        '<button class="passage-toggle" data-action="toggle-passage">' +
        (entry.showPassage ? "本文をとじる ▲" : "本文をひらく ▼") + "</button></div>";
    }

    // 問題文
    html += '<div class="question-box">';
    if (entry.instruction) html += '<div class="q-instruction">' + esc(entry.instruction) + "</div>";
    // 空所が複数ある問題は、どの空所に答えるかを明示
    if (targetBlank && (promptBlanks.length > 1 || (passage && blankNumbers(passage.body).length > 1))) {
      html += '<div class="blank-chip">（ ' + targetBlank + " ）に入るものをえらぼう</div>";
    }
    if (listening && !entry.done) {
      html += '<div class="listen-panel">' +
        '<div class="listen-note">' + (ttsOk ? "▶ をおして、音声をきいてからこたえよう（もういちど聞ける）" : "このブラウザは音声に対応していません。スクリプトを読んでこたえよう。") + "</div>";
      if (ttsOk) {
        html += '<button class="play-btn' + (state.playing ? " playing" : "") + '" data-action="play-audio">' +
          (state.playing ? "⏸ ていし" : entry.audioDone ? "▶ もういちど聞く" : "▶ 音声をきく") + "</button>";
      } else {
        html += '<div class="q-prompt" style="text-align:left">' + esc(q.prompt) + "</div>";
      }
      html += "</div>";
    } else if (!listening) {
      html += '<div class="q-prompt">' + highlightBlank(esc(q.prompt), targetBlank) + "</div>";
    } else {
      html += '<div class="q-prompt" style="color:var(--sub);font-size:13px">（スクリプトは下の解説にあります）</div>';
    }
    html += "</div>";

    if (isWriting) {
      html += viewWriting(entry);
    } else {
      // 選択肢
      html += '<div class="choices">';
      (q.choices || []).forEach(function (c) {
        var cls = "choice";
        if (entry.done) {
          if (c.label === q.answer) cls += " correct";
          else if (c.label === entry.picked) cls += " wrong";
        }
        html += '<button class="' + cls + '" data-action="choose" data-label="' + esc(c.label) + '"' +
          (entry.done ? " disabled" : "") + '><span class="label">' + esc(c.label) + "</span><span>" + esc(c.text) + "</span></button>";
      });
      html += "</div>";
      if (entry.done) html += viewFeedback(entry, listening);
    }

    return html;
  }

  function viewWriting(entry) {
    var q = entry.q;
    var html = "";
    if (!entry.done) {
      html += '<div class="card"><div class="form-row"><label>じぶんの答えを書いてみよう（書かずに頭の中で考えてもOK）</label>' +
        '<textarea class="writing-area" id="writing-input" placeholder="Write your answer here..."></textarea></div>' +
        '<button class="btn primary block" data-action="writing-reveal">模範解答を見る</button></div>';
    } else {
      if (entry.writingText) {
        html += '<div class="card"><h2>じぶんの答え</h2><p style="white-space:pre-wrap;font-size:14px">' + esc(entry.writingText) + "</p></div>";
      }
      html += '<div class="feedback' + (entry.timedOut ? " wrong" : "") + '">';
      if (entry.timedOut) html += '<div class="verdict">⏱ 時間切れ</div>';
      html += "<h4>模範解答</h4><p>" + esc(q.model_answer || "") + "</p>";
      if (q.rubric) html += "<h4>ポイント</h4><p>" + esc(q.rubric) + "</p>";
      if (q.translation) html += "<h4>和訳</h4><p>" + esc(q.translation) + "</p>";
      if (q.explanation) html += "<h4>解説</h4><p>" + esc(q.explanation) + "</p>";
      html += "</div>";
      if (entry.selfGrade === null) {
        html += '<div class="card"><h2>自己採点しよう</h2><div class="self-grade">' +
          '<button class="g2" data-action="self-grade" data-g="2">◎ 書けた</button>' +
          '<button class="g1" data-action="self-grade" data-g="1">○ だいたい</button>' +
          '<button class="g0" data-action="self-grade" data-g="0">△ むずかしい</button></div></div>';
      } else {
        html += nextBar();
      }
    }
    return html;
  }

  function viewFeedback(entry, listening) {
    var q = entry.q;
    var ok = entry.ok;
    var html = '<div class="feedback' + (ok ? "" : " wrong") + '">' +
      '<div class="verdict">' + (entry.timedOut ? "⏱ 時間切れ…" : ok ? "⭕ せいかい！" : "❌ ざんねん…") +
      (!ok ? '　正解は <b>' + esc(q.answer) + "</b>" : "") + "</div>";
    if (listening) {
      html += "<h4>スクリプト</h4><div class=\"script\">" + esc(q.prompt) + "</div>";
    }
    if (q.translation) html += "<h4>和訳</h4><p>" + esc(q.translation) + "</p>";
    if (q.explanation) html += "<h4>解説</h4><p>" + esc(q.explanation) + "</p>";
    // 誤答選択肢ごとの解説（データにあれば表示）
    if (q.choice_explanations) {
      html += "<h4>ほかの選択肢はなぜちがう？</h4><div class=\"choice-notes\">";
      (q.choices || []).forEach(function (c) {
        var note = q.choice_explanations[c.label];
        if (!note) return;
        html += '<div class="choice-note"><span class="cn-label">' + esc(c.label) + "</span>" +
          "<span>" + esc(note) + "</span></div>";
      });
      html += "</div>";
    }
    html += "</div>" + nextBar();
    return html;
  }

  function nextBar() {
    var s = state.session;
    var lastOne = s.idx + 1 >= s.entries.length;
    return '<div class="next-bar"><button class="btn primary block" data-action="next">' +
      (lastOne ? "けっかを見る 🏁" : "つぎの問題へ →") + "</button></div>";
  }

  // --- 結果 ---
  function viewResult() {
    var rec = state.lastResult;
    var pct = Math.round(100 * rec.correct / rec.total);
    var msg = pct >= 90 ? "すばらしい！🎉" : pct >= 70 ? "よくできました！👏" : pct >= 50 ? "あとすこし！💪" : "つぎはがんばろう！🔥";
    var html = topbar("けっか", "home");
    html += '<div class="card result-hero">' +
      '<div class="big">' + rec.correct + '<small> / ' + rec.total + "問</small></div>" +
      '<div class="msg">' + esc(rec.label) + "</div>" +
      '<div class="msg">' + msg + "</div>" +
      '<div class="result-stats">' +
      '<div class="stat"><div class="v">' + pct + '%</div><div class="k">正答率</div></div>' +
      '<div class="stat"><div class="v">' + fmtTime(rec.timeSec) + '</div><div class="k">かかった時間</div></div>' +
      '<div class="stat"><div class="v">' + rec.details.filter(function (d) { return d.timedOut; }).length + '</div><div class="k">時間切れ</div></div>' +
      "</div></div>";

    html += '<div class="card"><h2>問題ごとのけっか</h2><div class="review-list">';
    rec.details.forEach(function (d, i) {
      var hit = QINDEX[d.qid];
      var text = hit ? (hit.q.prompt || "").replace(/\s+/g, " ").slice(0, 40) : d.qid;
      html += '<div class="review-item"><span class="mark ' + (d.ok ? "ok\">⭕" : "ng\">❌") + "</span>" +
        "<span>" + (i + 1) + ".</span><span class=\"txt\">" + esc(text) + "</span></div>";
    });
    html += "</div></div>";

    var wrongs = rec.details.filter(function (d) { return !d.ok; }).map(function (d) { return d.qid; });
    if (wrongs.length) {
      html += '<button class="btn primary block" data-action="retry-wrongs" data-qids="' + esc(wrongs.join(",")) + '">❌の問題だけやり直す (' + wrongs.length + "問)</button>";
    }
    html += '<button class="btn ghost block" data-action="to-home">ホームにもどる</button>';
    return html;
  }

  // --- 成績 ---
  function viewRecords() {
    var user = currentUser();
    var recs = getRecords(state.userId);
    var html = topbar(esc(user.emoji) + " " + esc(user.name) + " のせいせき", "home");

    if (!recs.length) return html + '<div class="card"><div class="empty">まだきろくがありません。<br>練習してみよう！</div></div>';

    // セクション別正答率
    var agg = sectionAggregate(state.userId);
    html += '<div class="card"><h2>セクション別の正答率（これまで全部）</h2><div class="record-summary">';
    ["w1", "w2", "w3", "w4", "w5", "w6", "l1", "l2", "l3"].forEach(function (key) {
      var a = agg[key];
      if (!a) return;
      var pct = Math.round(100 * a.ok / a.total);
      html += '<div class="record-row"><span class="rname">' + (SECTION_ICONS[key] || "") + " " + esc(shortTitle(a.title)) + "</span>" +
        '<span class="bar"><div style="width:' + pct + '%;background:' + barColor(pct) + '"></div></span>' +
        '<span class="pct">' + pct + "%<small style=\"color:var(--sub);font-weight:400\"> (" + a.total + ")</small></span></div>";
    });
    html += "</div></div>";

    // 履歴
    html += '<div class="card"><h2>これまでのきろく</h2><div class="history-list">';
    recs.slice().reverse().slice(0, 30).forEach(function (rec) {
      var pct = Math.round(100 * rec.correct / rec.total);
      html += '<div class="history-item"><span class="date">' + fmtDate(rec.date) + "</span>" +
        '<span class="desc">' + esc(rec.label) + "</span>" +
        '<span class="score score-badge ' + pctBadgeClass(pct) + '">' + rec.correct + "/" + rec.total + "</span></div>";
    });
    html += "</div></div>";
    return html;
  }

  function shortTitle(t) {
    return t.replace("リスニング ", "").replace("（英作文）", "").replace("（会話の応答文選択）", "")
      .replace("（会話の内容一致選択）", "").replace("（文の内容一致選択）", "");
  }
  function barColor(pct) {
    return pct >= 80 ? "var(--good)" : pct >= 60 ? "var(--warn)" : "var(--bad)";
  }

  function topbar(title, backScreen) {
    return '<div class="topbar"><button class="back-btn" data-action="nav" data-to="' + backScreen + '">← もどる</button>' +
      '<div class="title">' + title + "</div></div>";
  }

  // ---------- イベント ----------
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest("[data-action]");
    if (!t) return;
    var action = t.getAttribute("data-action");

    switch (action) {
      case "pick-user":
        state.userId = t.getAttribute("data-id");
        state.screen = "home";
        render();
        break;
      case "add-user":
        state.newEmoji = EMOJIS[0];
        state.screen = "addUser";
        render();
        break;
      case "pick-emoji":
        state.newEmoji = t.getAttribute("data-emoji");
        document.querySelectorAll("#emoji-picker button").forEach(function (b) {
          b.classList.toggle("selected", b === t);
        });
        break;
      case "save-user": {
        var name = (el("new-name").value || "").trim();
        if (!name) { alert("なまえを入れてね"); return; }
        var users = getUsers();
        users.push({ id: "u" + Date.now(), name: name, emoji: state.newEmoji || EMOJIS[0] });
        setUsers(users);
        state.screen = "users";
        render();
        break;
      }
      case "manage-users": {
        var users2 = getUsers();
        var names = users2.map(function (u, i) { return (i + 1) + ": " + u.name; }).join("\n");
        var input = prompt("けすユーザーの番号を入れてください:\n" + names);
        if (!input) return;
        var idx = parseInt(input, 10) - 1;
        if (idx >= 0 && idx < users2.length) {
          if (confirm(users2[idx].name + " をけしますか？（きろくもきえます）")) {
            var removed = users2.splice(idx, 1)[0];
            setUsers(users2);
            localStorage.removeItem(STORE_PREFIX + "records." + removed.id);
            localStorage.removeItem(STORE_PREFIX + "settings." + removed.id);
            render();
          }
        }
        break;
      }
      case "export-backup": exportBackup(); break;
      case "import-backup": importBackup(); break;
      case "to-users": state.screen = "users"; render(); break;
      case "to-home": state.screen = "home"; render(); break;
      case "to-records": state.screen = "records"; render(); break;
      case "nav": state.screen = t.getAttribute("data-to"); render(); break;
      case "set-timer": {
        var s0 = getSettings(state.userId);
        s0.timerMode = t.getAttribute("data-mode");
        setSettings(state.userId, s0);
        render();
        break;
      }
      case "pick-exam":
        state.examIdx = parseInt(t.getAttribute("data-idx"), 10);
        render();
        break;
      case "start-section":
        if (state.examIdx === -1) startMixSection(t.getAttribute("data-sec"));
        else startSection(state.examIdx, t.getAttribute("data-sec"));
        break;
      case "start-review":
        startReview(weakQids(state.userId));
        break;
      case "retry-wrongs":
        startReview(t.getAttribute("data-qids").split(","));
        break;
      case "quit": quitSession(); break;
      case "toggle-passage": {
        var e1 = currentEntry();
        e1.showPassage = !e1.showPassage;
        render();
        break;
      }
      case "play-audio": {
        var e2 = currentEntry();
        if (state.playing) {
          stopSpeaking();
          render();
        } else {
          render(); // ボタン表示更新用に先に描画
          speakScript(e2.q.prompt, function () {
            e2.audioDone = true;
            e2.waitAudio = false;
            var s2 = state.session;
            if (s2 && s2.entries[s2.idx] === e2 && !e2.done) {
              startQuestionTimer(); // 音声終了後にタイマー開始
              render();
            }
          });
          state.playing = true;
          render();
        }
        break;
      }
      case "choose": onChoice(t.getAttribute("data-label")); break;
      case "writing-reveal": onWritingReveal(); break;
      case "self-grade": onSelfGrade(parseInt(t.getAttribute("data-g"), 10)); break;
      case "next": nextQuestion(); break;
    }
  });

  // ---------- 起動 ----------
  function boot() {
    buildIndexes();
    render();
  }

  if (window.EIKEN_DATA) {
    boot(); // ローカル版: data/exams.js が先に読み込み済み
  } else {
    window.addEventListener("eiken:data-ready", boot); // 公開版: 復号後に起動
  }
})();
