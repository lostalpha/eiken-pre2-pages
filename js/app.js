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
    l1: "🎧", l2: "🎧", l3: "🎧", sp: "🎤"
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

  // 保存されていた出題範囲（"mix" または examId）を examIdx に反映する
  function restoreExamSel(userId) {
    var sel = getSettings(userId).examSel;
    state.examIdx = -1; // 既定は全回ミックス
    if (sel && sel !== "mix") {
      for (var i = 0; i < EXAMS.length; i++) {
        if (examId(EXAMS[i]) === sel) { state.examIdx = i; break; }
      }
    }
  }

  // 全回ミックスの土台にする回（筆記・リスニングのセクションが最も多い回）
  function mixBaseExam() {
    var best = EXAMS[0], bestN = -1;
    EXAMS.forEach(function (ex) {
      var n = ex.sections.filter(function (s) { return s.kind !== "speaking"; }).length;
      if (n > bestN) { best = ex; bestN = n; }
    });
    return best;
  }

  function examId(ex) { return ex.exam.id || (ex.exam.year + "-" + ex.exam.session); }
  function examLabel(ex) { return ex.exam.label || (ex.exam.year + "年度 第" + ex.exam.session + "回"); }

  // 問題の出典情報。label があるものはオリジナル教材（ドリル）、無いものは過去問
  function sourceInfo(qid) {
    var hit = QINDEX[qid];
    if (!hit) return null;
    var ex = hit.exam;
    var original = !!ex.label;
    return {
      original: original,
      short: original ? ex.label + "（オリジナル）" : ex.year + "年度 第" + ex.session + "回 過去問",
      full: ex.source || ""
    };
  }

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
    examIdx: -1, // -1 = 全回ミックス（既定）
    examPickerOpen: false,
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
    stopRealAudio();
    state.playing = false;
  }

  if (ttsOk) window.speechSynthesis.getVoices(); // 音声リストの先読み

  // ---------- 実音声プレーヤー（過去問の実際の試験音源） ----------
  // q.audio に "audio/<examId>/<sec>-<no>.m4a" が入っている問題は実音声を再生する。
  // ローカル版は data/ 直下のファイルをそのまま、公開版は .enc を復号
  // （unlock.js が window.EIKEN_AUDIO_DECRYPT を提供）して objectURL で再生する。
  var audioEl = new Audio();
  audioEl.preload = "auto";
  var audioUrlCache = {}; // q.audio -> Promise<objectURL or path>

  function resolveAudioUrl(rel) {
    if (!audioUrlCache[rel]) {
      audioUrlCache[rel] = window.EIKEN_AUDIO_DECRYPT
        ? window.EIKEN_AUDIO_DECRYPT("data/" + rel + ".enc")
        : Promise.resolve("data/" + rel);
      audioUrlCache[rel].catch(function () { delete audioUrlCache[rel]; });
    }
    return audioUrlCache[rel];
  }

  function prefetchAudio(entry) {
    // 復号は時間がかかるので、問題表示の時点で裏で進めておく
    if (entry && entry.q.audio) resolveAudioUrl(entry.q.audio).catch(function () {});
  }

  function stopRealAudio() {
    audioEl.onended = null;
    audioEl.onerror = null;
    if (!audioEl.paused) audioEl.pause();
    audioEl.removeAttribute("src");
  }

  function playRealAudio(entry, onDone) {
    stopSpeaking();
    state.playing = true;
    var token = {};
    state.playToken = token;
    resolveAudioUrl(entry.q.audio)
      .then(function (url) {
        if (state.playToken !== token || !state.playing) return; // 再生前に停止された
        audioEl.src = url;
        audioEl.currentTime = 0;
        audioEl.onended = function () { state.playing = false; if (onDone) onDone(); };
        audioEl.onerror = function () {
          state.playing = false;
          speakScript(entry.q.prompt, onDone); // 再生失敗時は読み上げで代用
        };
        var p = audioEl.play();
        if (p && p.catch) {
          p.catch(function () {
            if (state.playToken !== token) return;
            state.playing = false;
            speakScript(entry.q.prompt, onDone);
          });
        }
      })
      .catch(function () {
        if (state.playToken !== token) return;
        state.playing = false;
        speakScript(entry.q.prompt, onDone); // 取得・復号失敗時は読み上げで代用
      });
  }

  // 実音声かTTSかを吸収して1問ぶん再生する
  function playQuestion(entry, onDone) {
    if (entry.q.audio) playRealAudio(entry, onDone);
    else speakScript(entry.q.prompt, onDone);
  }

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
    if (sec.kind === "speaking") {
      state.sp = { exIdx: exIdx };
      state.screen = "spSelect";
      render();
      return;
    }
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
    mixBaseExam().sections.forEach(function (sec2) {
      if (sec2.id === sectionId) title = sec2.title;
    });
    state.session = buildSession("mix", sectionId, refs, "全回ミックス " + title);
    state.screen = "quiz";
    render();
    startQuestionTimer();
  }

  // 長文の内容一致（w4）ミックス: 大問（パッセージ）を丸ごと1つ、設問は本文の順番どおりに出題
  function startMixPassageSection(sectionId) {
    var groups = [];
    EXAMS.forEach(function (ex) {
      ex.sections.forEach(function (sec) {
        if (sec.id !== sectionId) return;
        var byPassage = {};
        var order = [];
        sec.questions.forEach(function (q) {
          var key = q.passage_id || (examId(ex) + "-" + q.id);
          if (!byPassage[key]) { byPassage[key] = []; order.push(key); }
          byPassage[key].push({ q: q, sectionId: sec.id, instruction: sec.instruction });
        });
        order.forEach(function (k) { groups.push(byPassage[k]); });
      });
    });
    if (!groups.length) return;

    // これまでの出題回数が少ない大問を優先（同回数はランダム）
    var seen = {};
    getRecords(state.userId).forEach(function (rec) {
      rec.details.forEach(function (d) { seen[d.qid] = (seen[d.qid] || 0) + 1; });
    });
    shuffle(groups);
    groups.sort(function (a, b) {
      var avg = function (g) {
        return g.reduce(function (s, r) { return s + (seen[r.q.id] || 0); }, 0) / g.length;
      };
      return avg(a) - avg(b);
    });

    var refs = groups[0];
    var title = "";
    mixBaseExam().sections.forEach(function (sec2) {
      if (sec2.id === sectionId) title = sec2.title;
    });
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

  // ---------- AI添削（Gemini） ----------
  function aiConf() {
    var c = window.EIKEN_CONFIG;
    return (c && c.geminiKey) ? c : null;
  }

  function buildAiPrompt(entry) {
    var q = entry.q;
    var isEmail = entry.sectionId === "w5";
    var kind = isEmail ? "Eメール返信問題（語数の目安: 40〜50語）" : "意見論述問題（語数の目安: 50〜60語）";
    return [
      "あなたは英検準2級ライティングの採点官です。日本の中学生が書いた答案を、やさしい日本語で添削してください。",
      "",
      "【問題の種類】" + kind,
      "【問題の指示】" + (entry.instruction || ""),
      "【問題文】",
      q.prompt || "",
      "",
      "【採点のポイント】" + (q.rubric || ""),
      "【模範解答の例】" + (q.model_answer || ""),
      "",
      "【生徒の答案】",
      entry.writingText || "",
      "",
      "次の形式で、中学生にわかるやさしい日本語で添削してください。むずかしい漢字や文法用語はさけてください。",
      "",
      "## ひょうか（各4点満点）",
      "- 内容: ?/4 — ひとことで理由",
      "- 構成: ?/4 — ひとことで理由",
      "- 語い: ?/4 — ひとことで理由",
      "- 文法: ?/4 — ひとことで理由",
      "",
      "## よかったところ",
      "（具体的に2つほど。がんばりをほめてください）",
      "",
      "## なおすとよいところ",
      "（まちがいは「もとの文 → なおした文」の形で示し、理由をひとことそえる。語数が目安から大きく外れていたら教える）",
      "",
      "## お手本（あなたの答えを活かした修正版）",
      "（生徒の書いた内容や意見をなるべく活かして、自然な英文に直した全文）",
      "",
      "答案がほとんど書かれていない場合は、採点のかわりに、この問題の答えの組み立て方をやさしく教えてください。"
    ].join("\n");
  }

  function onAiReview() {
    var entry = currentEntry();
    var conf = aiConf();
    if (!entry || !conf || (entry.ai && entry.ai.state === "loading")) return;
    entry.ai = { state: "loading" };
    render();
    var model = conf.geminiModel || "gemini-flash-latest";
    fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model +
          ":generateContent?key=" + encodeURIComponent(conf.geminiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: buildAiPrompt(entry) }] }] })
    }).then(function (res) {
      if (!res.ok) {
        var msg = res.status === 429
          ? "きょうのAIの無料わくを使い切ったみたい。また明日ためしてね。"
          : "AIにつながりませんでした（" + res.status + "）。少し待ってから、もういちど試してね。";
        var e = new Error(msg);
        e.friendly = true;
        throw e;
      }
      return res.json();
    }).then(function (data) {
      var cand = data && data.candidates && data.candidates[0];
      var parts = cand && cand.content && cand.content.parts;
      var text = (parts || []).map(function (p) { return p.text || ""; }).join("");
      if (!text) {
        var e = new Error("AIからうまく返事がもらえませんでした。もういちど試してね。");
        e.friendly = true;
        throw e;
      }
      entry.ai = { state: "done", text: text };
    }).catch(function (err) {
      entry.ai = {
        state: "error",
        error: (err && err.friendly) ? err.message :
          "つうしんエラーです。ネットにつながっているかたしかめて、もういちど試してね。"
      };
    }).then(function () {
      var s = state.session;
      if (s && s.entries[s.idx] === entry) render();
    });
  }

  // AIの返事（Markdown風テキスト）を安全なHTMLにする簡易レンダラ
  function renderAiText(text) {
    var lines = String(text || "").split(/\r?\n/);
    var html = "";
    var inList = false;
    lines.forEach(function (line) {
      var t = line.trim();
      var isItem = /^[-*・]\s/.test(t);
      if (inList && !isItem) { html += "</ul>"; inList = false; }
      if (!t) return;
      var body = esc(isItem ? t.replace(/^[-*・]\s+/, "") : t.replace(/^#+\s*/, ""))
        .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
      if (/^#+\s/.test(t)) {
        html += "<h4>" + body + "</h4>";
      } else if (isItem) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += "<li>" + body + "</li>";
      } else {
        html += "<p>" + body + "</p>";
      }
    });
    if (inList) html += "</ul>";
    return html;
  }

  function viewAiSection(entry) {
    if (!aiConf()) return "";
    if (!entry.writingText || entry.writingText.trim().length < 5) return "";
    var html = '<div class="card ai-box"><h2>🤖 AIせんせいの添削</h2>';
    var st = entry.ai && entry.ai.state;
    if (!st) {
      html += '<p class="ai-note">書いた答えをAIがチェックして、よいところ・なおすところを教えてくれるよ。</p>' +
        '<button class="btn primary block" data-action="ai-review">添削してもらう</button>';
    } else if (st === "loading") {
      html += '<p class="ai-note">AIせんせいが読んでいます… ちょっと待ってね ⏳</p>';
    } else if (st === "error") {
      html += '<p class="ai-note ai-error">' + esc(entry.ai.error || "") + "</p>" +
        '<button class="btn primary block" data-action="ai-review">もういちど試す</button>';
    } else {
      html += '<div class="ai-result">' + renderAiText(entry.ai.text) + "</div>";
    }
    html += "</div>";
    return html;
  }

  function onSelfGrade(g) {
    var entry = currentEntry();
    entry.selfGrade = g;
    entry.ok = g >= 1; // ◎○は正解あつかい
    render();
  }

  // ---------- 二次試験・面接（スピーキング） ----------
  // state.sp = { exIdx, card, step, qIdx, recs, grades, ai, recording, silentRemain, silentTimer }
  // step: intro → dir1(説明再生中) → silent(黙読20秒) → aloud(音読録音) → q(質問) → turn(カード裏返し) → review
  var micOk = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  var spMedia = { rec: null, stream: null };

  // 音声(.m4a)が取得できないときに読み上げで代用する定型文
  var SP_FALLBACK = {
    dir1: "Let's begin the test. Here is your card. First, please read the passage silently for twenty seconds.",
    dir2: "All right. Now, please read the passage aloud.",
    turn: "Now, please turn over the card and put it down."
  };

  function spSection() {
    var ex = EXAMS[state.sp.exIdx];
    for (var i = 0; i < ex.sections.length; i++) {
      if (ex.sections[i].kind === "speaking") return ex.sections[i];
    }
    return null;
  }

  function spPlay(rel, fallbackText, onDone) {
    stopSpeaking();
    state.playing = true;
    var token = {};
    state.playToken = token;
    var fail = function () {
      if (state.playToken !== token) return;
      state.playing = false;
      if (fallbackText) speakScript(fallbackText, onDone);
      else if (onDone) onDone();
    };
    resolveAudioUrl(rel)
      .then(function (url) {
        if (state.playToken !== token || !state.playing) return;
        audioEl.src = url;
        audioEl.currentTime = 0;
        audioEl.onended = function () { state.playing = false; if (onDone) onDone(); };
        audioEl.onerror = fail;
        var p = audioEl.play();
        if (p && p.catch) p.catch(fail);
      })
      .catch(fail);
  }

  function spPlayBlobUrl(url) {
    stopSpeaking();
    state.playing = true;
    state.playToken = {};
    audioEl.src = url;
    audioEl.currentTime = 0;
    audioEl.onended = function () { state.playing = false; };
    audioEl.onerror = function () { state.playing = false; };
    var p = audioEl.play();
    if (p && p.catch) p.catch(function () { state.playing = false; });
  }

  function spStartCard(cardId) {
    var sec = spSection();
    var card = null;
    (sec.cards || []).forEach(function (c) { if (c.id === cardId) card = c; });
    if (!card) return;
    state.sp.card = card;
    state.sp.step = "intro";
    state.sp.qIdx = 0;
    state.sp.recs = {};
    state.sp.grades = {};
    state.sp.showText = {};
    state.sp.ai = null;
    state.sp.recording = null;
    state.screen = "spFlow";
    render();
  }

  function spCleanup() {
    if (state.sp && state.sp.silentTimer) { clearInterval(state.sp.silentTimer); state.sp.silentTimer = null; }
    if (spMedia.rec && spMedia.rec.state !== "inactive") { try { spMedia.rec.stop(); } catch (e) {} }
    if (spMedia.stream) { spMedia.stream.getTracks().forEach(function (t) { t.stop(); }); spMedia.stream = null; }
    spMedia.rec = null;
    stopSpeaking();
    if (state.sp && state.sp.recs) {
      Object.keys(state.sp.recs).forEach(function (k) {
        if (state.sp.recs[k].url) URL.revokeObjectURL(state.sp.recs[k].url);
      });
    }
  }

  function spQuit() {
    if (!confirm("とちゅうでやめますか？（録音ときろくは消えます）")) return;
    spCleanup();
    state.sp = null;
    state.screen = "home";
    render();
  }

  function spBegin() {
    state.sp.step = "dir1";
    render();
    spPlay(state.sp.card.audio.dir1, SP_FALLBACK.dir1, function () {
      if (state.screen === "spFlow" && state.sp.step === "dir1") spStartSilent();
    });
  }

  function spStartSilent() {
    state.sp.step = "silent";
    state.sp.silentRemain = 20;
    render();
    state.sp.silentTimer = setInterval(function () {
      state.sp.silentRemain--;
      var node = el("sp-count");
      if (node) node.textContent = state.sp.silentRemain;
      if (state.sp.silentRemain <= 0) spEndSilent();
    }, 1000);
  }

  function spEndSilent() {
    if (state.sp.silentTimer) { clearInterval(state.sp.silentTimer); state.sp.silentTimer = null; }
    state.sp.step = "aloud";
    render();
    spPlay(state.sp.card.audio.dir2, SP_FALLBACK.dir2, null);
  }

  function spRecKey() {
    var sp = state.sp;
    return sp.step === "aloud" ? "read" : "q" + (sp.qIdx + 1);
  }

  function spStartRec() {
    if (!micOk) { alert("このブラウザではマイク録音が使えないみたい。"); return; }
    stopSpeaking();
    var key = spRecKey();
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      spMedia.stream = stream;
      var mime = "";
      ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].some(function (m) {
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) { mime = m; return true; }
        return false;
      });
      var rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      var chunks = [];
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = function () {
        if (spMedia.stream) { spMedia.stream.getTracks().forEach(function (t) { t.stop(); }); spMedia.stream = null; }
        spMedia.rec = null;
        var sp = state.sp;
        if (!sp) return;
        var blob = new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" });
        if (sp.recs[key] && sp.recs[key].url) URL.revokeObjectURL(sp.recs[key].url);
        sp.recs[key] = { blob: blob, url: URL.createObjectURL(blob), mime: blob.type || "audio/webm" };
        sp.recording = null;
        sp.ai = null; // 録音し直したら前のAIアドバイスは古くなる
        if (state.screen === "spFlow") render();
      };
      spMedia.rec = rec;
      state.sp.recording = key;
      rec.start();
      render();
    }).catch(function () {
      alert("マイクが使えませんでした。ブラウザのマイク許可をたしかめてね。");
    });
  }

  function spStopRec() {
    if (spMedia.rec && spMedia.rec.state !== "inactive") spMedia.rec.stop();
  }

  function spNext() {
    var sp = state.sp;
    stopSpeaking();
    if (sp.step === "aloud") {
      sp.step = "q";
      sp.qIdx = 0;
    } else if (sp.step === "q") {
      var qs = sp.card.questions;
      // No.3のあとはカードを裏返す
      if (sp.qIdx === 2) {
        sp.step = "turn";
      } else if (sp.qIdx + 1 < qs.length) {
        sp.qIdx++;
      } else {
        sp.step = "review";
      }
    } else if (sp.step === "turn") {
      sp.step = "q";
      sp.qIdx = 3;
    }
    render();
    if (sp.step === "turn") spPlay(sp.card.audio.turn, SP_FALLBACK.turn, null);
    if (sp.step === "q") {
      var q = sp.card.questions[sp.qIdx];
      if (q && q.audio) spPlay(q.audio, q.text, null);
    }
  }

  // ふりかえり画面の項目リスト
  function spItems() {
    var card = state.sp.card;
    var items = [{
      key: "read", label: "音読", question: "パッセージの音読",
      model: card.passage
    }];
    card.questions.forEach(function (q, i) {
      items.push({
        key: "q" + (i + 1), label: "No." + q.no, question: q.text,
        model: q.model_answer ||
          ("Yes.の場合: " + q.model_answers.yes + " / No.の場合: " + q.model_answers.no)
      });
    });
    return items;
  }

  function spAiPrompt(withRec) {
    var card = state.sp.card;
    var lines = [
      "あなたは英検準2級の面接官の先生です。日本の中学生の二次試験（面接）の練習の録音を聞いて、やさしい日本語でアドバイスしてください。むずかしい漢字や文法用語はさけてください。",
      "",
      "【問題カード】" + card.title,
      "【パッセージ】",
      card.passage,
      "",
      "このメッセージに添付した音声は、順番につぎの録音です。"
    ];
    withRec.forEach(function (it, i) {
      lines.push("音声" + (i + 1) + ": " + it.label + " ／ 課題: " + it.question);
      lines.push("　模範解答の例: " + it.model);
    });
    lines = lines.concat([
      "",
      "つぎの形式で書いてください。",
      "## それぞれのふりかえり",
      "- 音読: 発音・スピード・つまらずに読めたか をほめつつ、直すところをひとこと",
      "- No.1〜No.5: まず聞き取った答えを「英語で」書き、良かった点、直すとよい点（文法・発音）、もっと良い答え方の例（英語＋日本語訳）",
      "## 点数よそう",
      "- 音読 ?/5点、No.1〜No.5 各?/5点（英検の基準っぽく、甘すぎず辛すぎず）",
      "## 全体のアドバイス",
      "- がんばりをほめて、次に練習するとよいことを2つまで",
      "",
      "録音がうまく聞き取れないときは、正直に「聞き取れなかった」と書いて、その問題の答え方のコツを教えてください。"
    ]);
    return lines.join("\n");
  }

  function spAiReview() {
    var sp = state.sp;
    var conf = aiConf();
    if (!conf || (sp.ai && sp.ai.state === "loading")) return;
    var withRec = spItems().filter(function (it) { return sp.recs[it.key]; });
    if (!withRec.length) return;
    sp.ai = { state: "loading" };
    render();
    Promise.all(withRec.map(function (it) {
      return new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onload = function () { resolve(String(fr.result).split(",")[1]); };
        fr.onerror = function () { reject(new Error("read error")); };
        fr.readAsDataURL(sp.recs[it.key].blob);
      });
    })).then(function (b64s) {
      var parts = [{ text: spAiPrompt(withRec) }];
      withRec.forEach(function (it, i) {
        parts.push({ inline_data: { mime_type: (sp.recs[it.key].mime || "audio/webm").split(";")[0], data: b64s[i] } });
      });
      var model = conf.geminiModel || "gemini-flash-latest";
      return fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model +
            ":generateContent?key=" + encodeURIComponent(conf.geminiKey), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: parts }] })
      });
    }).then(function (res) {
      if (!res.ok) {
        var msg = res.status === 429
          ? "きょうのAIの無料わくを使い切ったみたい。また明日ためしてね。"
          : "AIにつながりませんでした（" + res.status + "）。少し待ってから、もういちど試してね。";
        var e = new Error(msg);
        e.friendly = true;
        throw e;
      }
      return res.json();
    }).then(function (data) {
      var cand = data && data.candidates && data.candidates[0];
      var text = ((cand && cand.content && cand.content.parts) || [])
        .map(function (p) { return p.text || ""; }).join("");
      if (!text) {
        var e = new Error("AIからうまく返事がもらえませんでした。もういちど試してね。");
        e.friendly = true;
        throw e;
      }
      sp.ai = { state: "done", text: text };
    }).catch(function (err) {
      sp.ai = {
        state: "error",
        error: (err && err.friendly) ? err.message :
          "つうしんエラーです。ネットにつながっているかたしかめて、もういちど試してね。"
      };
    }).then(function () {
      if (state.screen === "spFlow" && state.sp === sp) render();
    });
  }

  function spFinish() {
    var sp = state.sp;
    var details = spItems().map(function (it) {
      var g = sp.grades[it.key];
      return {
        qid: sp.card.id + "-" + it.key,
        ok: g != null ? g >= 1 : !!sp.recs[it.key],
        timedOut: false, timeSec: 0,
        selfGrade: g != null ? g : null
      };
    });
    var correct = details.filter(function (d) { return d.ok; }).length;
    addRecord(state.userId, {
      date: Date.now(),
      examId: sp.examId || examId(EXAMS[state.sp.exIdx]),
      sectionId: "sp",
      label: examLabel(EXAMS[state.sp.exIdx]) + " 面接 " + sp.card.label,
      timerMode: "off",
      correct: correct,
      total: details.length,
      timeSec: 0,
      details: details
    });
    spCleanup();
    state.sp = null;
    state.screen = "home";
    render();
  }

  // --- 面接: カード選択画面（exIdx=-1 なら全回のカードを一覧） ---
  function viewSpSelect() {
    var all = state.sp.exIdx === -1;
    var entries = []; // {exIdx, sec}
    if (all) {
      EXAMS.forEach(function (ex, i) {
        ex.sections.forEach(function (s) {
          if (s.kind === "speaking") entries.push({ exIdx: i, sec: s });
        });
      });
    } else {
      entries.push({ exIdx: state.sp.exIdx, sec: spSection() });
    }
    if (!entries.length) return topbar("🎤 めんせつ練習", "home");

    var heading = all ? "二次試験・面接（スピーキング）"
      : examLabel(EXAMS[state.sp.exIdx]) + " " + entries[0].sec.title;
    var html = topbar("🎤 めんせつ練習", "home");
    html += '<div class="card"><h2>' + esc(heading) + "</h2>" +
      '<p class="note">' + esc(entries[0].sec.instruction) + "</p>" +
      (micOk ? "" : '<p class="note" style="color:var(--bad);margin-top:8px">⚠️ このブラウザは録音に対応していないみたい。音声を聞いて声に出す練習はできるよ。</p>') +
      "</div>";

    // サンプル音声（どれかの回に入っていれば表示）
    var sampleSec = null;
    entries.forEach(function (e) { if (!sampleSec && e.sec.sample_audio) sampleSec = e.sec; });
    if (sampleSec) {
      html += '<div class="card"><h2>👂 面接のながれをまるごと聞く</h2>' +
        '<p class="note">本番の面接がどう進むか、入室からあいさつ・質問まで通しで聞けるよ（べつのカードの例）。</p>' +
        '<button class="btn ghost block" data-action="sp-sample" data-rel="' + esc(sampleSec.sample_audio) + '">' +
        (state.playing ? "⏸ とめる" : "▶ サンプルをきく") + "</button>" +
        '<button class="passage-toggle" data-action="sp-sample-script">' +
        (state.sp.showSample ? "ながれをとじる ▲" : "ながれを見る ▼") + "</button>" +
        (state.sp.showSample ? '<div class="sp-script">' + esc(sampleSec.sample_script || "") + "</div>" : "") +
        "</div>";
    }

    // これまでに練習したカードの回数（きろくから）
    var cardTries = {};
    getRecords(state.userId).forEach(function (rec) {
      if (rec.sectionId !== "sp" || !rec.details.length) return;
      var cid = rec.details[0].qid.replace(/-(read|q\d)$/, "");
      cardTries[cid] = (cardTries[cid] || 0) + 1;
    });

    html += '<div class="section-list">';
    entries.forEach(function (e) {
      (e.sec.cards || []).forEach(function (c) {
        var name = all
          ? examLabel(EXAMS[e.exIdx]) + " " + c.label.replace("問題カード", "") + "：" + c.title
          : c.label + "：" + c.title;
        var tries = cardTries[c.id]
          ? '<span class="score-badge good">' + cardTries[c.id] + "回</span>"
          : '<span class="score-badge none">未</span>';
        html += '<button class="section-item" data-action="sp-card" data-card="' + esc(c.id) +
          '" data-ex="' + e.exIdx + '">' +
          '<span class="icon">🗒️</span>' +
          '<span class="body"><span class="name">' + esc(name) + '</span><br>' +
          '<span class="meta">音読 ＋ 質問5つ（約7分）</span></span>' + tries + "</button>";
      });
    });
    html += "</div>";
    return html;
  }

  // --- 面接: 練習フロー ---
  function spStepLabel() {
    var sp = state.sp;
    switch (sp.step) {
      case "intro": return "じゅんび";
      case "dir1": return "説明";
      case "silent": return "黙読 20秒";
      case "aloud": return "音読";
      case "turn": return "カードをうらがえす";
      case "q": return "No." + sp.card.questions[sp.qIdx].no + " / 5";
      case "review": return "ふりかえり";
    }
    return "";
  }

  // カードの絵: インラインSVG → 画像ファイル(暗号化対応) → 準備中 の順で表示
  function spPicture(card, which) {
    var svg = card[which];
    if (svg) return '<div class="sp-picture">' + svg + "</div>";
    var rel = card[which + "_img"];
    if (rel) {
      return '<div class="sp-picture"><img class="sp-img" alt="問題カードの絵" data-img-rel="' + esc(rel) + '"></div>';
    }
    return '<div class="sp-picture sp-pic-pending">🖼️ この回の絵はじゅんび中だよ。<br>テキスト（過去問の本）の問題カードの絵を見ながら答えてね。</div>';
  }

  // data-img-rel の画像を非同期で読み込む（公開版は復号してobjectURLにする）
  function hydrateImages() {
    var imgs = document.querySelectorAll("img[data-img-rel]");
    Array.prototype.forEach.call(imgs, function (img) {
      var rel = img.getAttribute("data-img-rel");
      img.removeAttribute("data-img-rel");
      resolveAudioUrl(rel)
        .then(function (url) { img.src = url; })
        .catch(function () { img.style.display = "none"; });
    });
  }

  function spCardBox(which) {
    // which: "passage" | "pictureA" | "pictureB" | "all"
    var card = state.sp.card;
    var html = '<div class="sp-card">';
    if (which === "passage" || which === "all") {
      html += '<div class="sp-card-title">' + esc(card.title) + "</div>" +
        '<div class="sp-passage">' + esc(card.passage) + "</div>";
    }
    if (which === "pictureA" || which === "all") {
      html += '<div class="sp-pic-label">Picture A</div>' + spPicture(card, "pictureA");
    }
    if (which === "pictureB" || which === "all") {
      html += '<div class="sp-pic-label">Picture B</div>' + spPicture(card, "pictureB");
    }
    html += "</div>";
    return html;
  }

  function spRecControls() {
    var sp = state.sp;
    var key = spRecKey();
    var rec = sp.recs[key];
    var html = '<div class="sp-rec">';
    if (sp.recording === key) {
      html += '<div class="sp-rec-live">🔴 録音中… 話しおわったら止めてね</div>' +
        '<button class="btn danger block" data-action="sp-rec-stop">⏹ 録音をとめる</button>';
    } else {
      html += '<button class="btn primary block" data-action="sp-rec-start">' +
        (rec ? "🎙️ とりなおす" : "🎙️ 録音スタート") + "</button>";
      if (rec) {
        html += '<div class="sp-rec-row">' +
          '<button class="btn ghost" data-action="sp-rec-play" data-key="' + key + '">▶ 自分の声をきく</button>' +
          '<button class="btn primary" data-action="sp-next">つぎへ →</button></div>';
      }
    }
    html += "</div>";
    return html;
  }

  function viewSpFlow() {
    var sp = state.sp;
    var card = sp.card;
    var html = '<div class="quiz-head">' +
      '<button class="quiz-quit" data-action="sp-quit">✕ やめる</button>' +
      '<div class="progress">' + spStepLabel() + "</div></div>";

    if (sp.step === "intro") {
      html += '<div class="card"><h2>🎤 ' + esc(card.label) + "：" + esc(card.title) + "</h2>" +
        '<p class="note">本番とおなじながれで練習するよ：</p>' +
        '<ol class="sp-steps"><li>面接官の説明をきく</li><li>パッセージを20秒で黙読</li>' +
        "<li>声に出して読む（録音）</li><li>質問5つに答える（録音）</li><li>ふりかえり＆AIのアドバイス</li></ol>" +
        '<p class="note">しずかな場所で、マイクの許可をきかれたら「許可」をおしてね。</p>' +
        '<button class="btn primary block" data-action="sp-begin">はじめる</button></div>';
      return html;
    }
    if (sp.step === "dir1") {
      html += spCardBox("all");
      html += '<div class="card"><p class="sp-note-strong">🎧 面接官の説明をきいてね…</p>' +
        '<button class="btn ghost block" data-action="sp-skip-silent">説明をとばして黙読へ</button></div>';
      return html;
    }
    if (sp.step === "silent") {
      html += '<div class="sp-countdown">のこり <span id="sp-count">' + sp.silentRemain + "</span> 秒</div>" +
        '<p class="sp-note-strong" style="text-align:center">パッセージを声に出さずに読もう</p>';
      html += spCardBox("all");
      html += '<button class="btn ghost block" data-action="sp-skip-silent2">もう読めた（音読へすすむ）</button>';
      return html;
    }
    if (sp.step === "aloud") {
      html += '<div class="card"><p class="sp-note-strong">📖 パッセージを声に出して読んで、録音しよう</p>' +
        '<p class="note">タイトルから読んでね。あわてなくてだいじょうぶ。</p></div>';
      html += spCardBox("passage");
      html += spRecControls();
      if (sp.recs.read) {
        html += '<button class="btn ghost block" data-action="sp-play" data-rel="' + esc(card.audio.model) + '">👂 お手本の音読をきく</button>';
      }
      return html;
    }
    if (sp.step === "turn") {
      html += '<div class="card" style="text-align:center"><div style="font-size:40px">🙈</div>' +
        '<p class="sp-note-strong">ここでカードをうらがえすよ。<br>のこりの質問は、カードを見ないで自分の考えで答えてね。</p>' +
        '<button class="btn primary block" data-action="sp-next">わかった、つぎへ →</button></div>';
      return html;
    }
    if (sp.step === "q") {
      var q = card.questions[sp.qIdx];
      html += '<div class="card">' +
        '<p class="sp-note-strong">🎧 No.' + q.no + ' の質問をきいて、声で答えよう</p>' +
        '<div class="sp-rec-row">' +
        '<button class="btn ghost" data-action="sp-play" data-rel="' + esc(q.audio) + '" data-fallback="' + esc(q.text) + '">▶ 質問をきく</button>' +
        (q.follow_audio ? '<button class="btn ghost" data-action="sp-play" data-rel="' + esc(q.follow_audio) + '">▶ Noのときの質問</button>' : "") +
        "</div>" +
        (q.tip ? '<p class="sp-tip">💡 ' + esc(q.tip) + "</p>" : "") +
        '<button class="passage-toggle" data-action="sp-text-toggle">' +
        (sp.showText[q.id] ? "質問の文をとじる ▲" : "質問の文を見る ▼") + "</button>" +
        (sp.showText[q.id] ? '<div class="sp-qtext">' + esc(q.text) +
          (q.translation ? '<div class="sp-qtrans">' + esc(q.translation) + "</div>" : "") + "</div>" : "") +
        "</div>";
      if (q.uses === "passage") html += spCardBox("passage");
      else if (q.uses === "pictureA") html += spCardBox("pictureA");
      else if (q.uses === "pictureB") html += spCardBox("pictureB");
      html += spRecControls();
      return html;
    }
    // review
    html += '<div class="card result-hero"><div class="msg">おつかれさま！ 🎉</div>' +
      '<p class="note">自分の声をきいて、もはん解答とくらべてみよう。じぶんで◎○△をつけてね。</p></div>';
    var conf = aiConf();
    if (conf) {
      html += '<div class="card ai-box"><h2>🤖 AIせんせいに聞いてもらう</h2>';
      var st = sp.ai && sp.ai.state;
      if (!st) {
        html += '<p class="ai-note">録音した声をAIせんせいが聞いて、発音や答え方のアドバイスをくれるよ。</p>' +
          '<button class="btn primary block" data-action="sp-ai">アドバイスをもらう</button>';
      } else if (st === "loading") {
        html += '<p class="ai-note">AIせんせいが聞いています… ちょっと待ってね ⏳</p>';
      } else if (st === "error") {
        html += '<p class="ai-note ai-error">' + esc(sp.ai.error || "") + "</p>" +
          '<button class="btn primary block" data-action="sp-ai">もういちど試す</button>';
      } else {
        html += '<div class="ai-result">' + renderAiText(sp.ai.text) + "</div>";
      }
      html += "</div>";
    }
    spItems().forEach(function (it) {
      var rec = sp.recs[it.key];
      var g = sp.grades[it.key];
      html += '<div class="card sp-review-item"><h2>' + esc(it.label) + "</h2>" +
        '<p class="sp-qtext">' + esc(it.question) + "</p>" +
        '<p class="sp-model"><b>もはん解答:</b> ' + esc(it.model) + "</p>" +
        '<div class="sp-rec-row">' +
        (rec ? '<button class="btn ghost" data-action="sp-rec-play" data-key="' + it.key + '">▶ 自分の声</button>'
             : '<span class="note">（録音なし）</span>') +
        "</div>" +
        '<div class="self-grade sp-grade">' +
        [["2", "◎ できた"], ["1", "○ だいたい"], ["0", "△ むずかしい"]].map(function (pair) {
          var sel = g != null && String(g) === pair[0] ? " selected" : "";
          return '<button class="g' + pair[0] + sel + '" data-action="sp-grade" data-key="' + it.key +
            '" data-g="' + pair[0] + '">' + pair[1] + "</button>";
        }).join("") +
        "</div></div>";
    });
    html += '<button class="btn primary block" data-action="sp-finish">きろくしておわる 🏁</button>';
    return html;
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
  // セクションごとのマスター率:
  // 分母 = そのセクションの収録問題の総数（全回＋ドリル）
  // 分子 = これまでに2回以上正解できた問題の数
  function masteryOkCounts(userId) {
    var okCount = {}; // qid -> 正解できた回数
    getRecords(userId).forEach(function (rec) {
      rec.details.forEach(function (d) {
        if (d.ok) okCount[d.qid] = (okCount[d.qid] || 0) + 1;
      });
    });
    return okCount;
  }

  // 面接カード1枚ぶんの項目qidリスト（音読＋質問）
  function spCardQids(card) {
    var qids = [card.id + "-read"];
    card.questions.forEach(function (q, i) { qids.push(card.id + "-q" + (i + 1)); });
    return qids;
  }

  // 達成度バッジ: 2回正解できた問題の割合
  function masteryBadge(qids, okCount) {
    var mastered = 0;
    qids.forEach(function (qid) { if ((okCount[qid] || 0) >= 2) mastered++; });
    var pct = qids.length ? Math.round(100 * mastered / qids.length) : 0;
    var cls = pct >= 80 ? "good" : pct > 0 ? "mid" : "none";
    return '<span class="score-badge ' + cls + '">達成度：' + pct + "%</span>";
  }

  function masteryAggregate(userId) {
    var okCount = masteryOkCounts(userId);
    var agg = {}; // key -> {mastered, total, title}
    function add(key, title, qid) {
      if (!agg[key]) agg[key] = { mastered: 0, total: 0, title: title };
      agg[key].total++;
      if ((okCount[qid] || 0) >= 2) agg[key].mastered++;
    }
    EXAMS.forEach(function (ex) {
      ex.sections.forEach(function (sec) {
        if (sec.kind === "speaking") {
          (sec.cards || []).forEach(function (c) {
            add("sp", "面接（スピーキング）", c.id + "-read");
            c.questions.forEach(function (q, i) {
              add("sp", "面接（スピーキング）", c.id + "-q" + (i + 1));
            });
          });
        } else {
          sec.questions.forEach(function (q) { add(sec.id, sec.title, q.id); });
        }
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
      case "quiz":
        app.innerHTML = viewQuiz();
        // いま出ている問題と次の問題の音声を先読み（公開版は復号に時間がかかるため）
        if (state.session) {
          prefetchAudio(state.session.entries[state.session.idx]);
          prefetchAudio(state.session.entries[state.session.idx + 1]);
        }
        break;
      case "result": app.innerHTML = viewResult(); break;
      case "records": app.innerHTML = viewRecords(); break;
      case "spSelect": app.innerHTML = viewSpSelect(); break;
      case "spFlow":
        app.innerHTML = viewSpFlow();
        hydrateImages();
        break;
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

    // 出題範囲（既定は全回ミックス。回の切りかえは折りたたみの中）
    var isMix = state.examIdx === -1;
    html += '<div class="exam-select">' +
      '<span class="exam-current">' +
      (isMix ? "🎲 全回ミックス" : "📚 " + esc(examLabel(EXAMS[state.examIdx]))) + "</span>" +
      '<button class="exam-change" data-action="toggle-exam-picker">' +
      (state.examPickerOpen ? "とじる ▲" : "回をえらぶ ▼") + "</button></div>";
    if (isMix && !state.examPickerOpen) {
      html += '<div class="mix-note">ぜんぶの回からランダムに出題（まだ解いていない問題を優先）</div>';
    }
    if (state.examPickerOpen) {
      html += '<div class="exam-tabs">';
      html += '<button data-action="pick-exam" data-idx="-1"' +
        (isMix ? ' class="selected"' : "") + ">🎲 全回ミックス（おすすめ）</button>";
      EXAMS.forEach(function (ex, i) {
        html += '<button data-action="pick-exam" data-idx="' + i + '"' +
          (i === state.examIdx ? ' class="selected"' : "") + ">" + esc(examLabel(ex)) + "</button>";
      });
      html += "</div>";
    }

    // セクション一覧（バッジは達成度 = 2回正解できた問題の割合）
    var baseEx = isMix ? mixBaseExam() : EXAMS[state.examIdx];
    var okc = masteryOkCounts(state.userId);
    html += '<div class="section-list">';
    baseEx.sections.forEach(function (sec) {
      if (isMix && sec.kind === "speaking") return; // ミックスの面接は下でまとめて出す
      var qids = [];
      if (sec.kind === "speaking") {
        (sec.cards || []).forEach(function (c) { qids = qids.concat(spCardQids(c)); });
      } else if (isMix) {
        EXAMS.forEach(function (ex2) {
          ex2.sections.forEach(function (s2) {
            if (s2.id === sec.id && s2.kind !== "speaking") {
              s2.questions.forEach(function (q) { qids.push(q.id); });
            }
          });
        });
      } else {
        sec.questions.forEach(function (q) { qids.push(q.id); });
      }
      var badge = masteryBadge(qids, okc);
      var limit = TIME_LIMITS[sec.id];
      var meta;
      if (sec.kind === "speaking") {
        meta = "カード" + (sec.cards || []).length + "まい・マイクで録音";
      } else if (isMix && sec.id === "w4") {
        var passSet = {};
        EXAMS.forEach(function (ex2) {
          ex2.sections.forEach(function (s2) {
            if (s2.id !== "w4") return;
            s2.questions.forEach(function (q) { if (q.passage_id) passSet[q.passage_id] = true; });
          });
        });
        meta = "全" + Object.keys(passSet).length + "大問から1つ・設問は順番どおり";
      } else if (isMix) {
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
    // ミックス表示でも面接には入れるようにする（全回のカードから選ぶ）
    if (isMix) {
      var spCards = 0;
      EXAMS.forEach(function (ex2) {
        ex2.sections.forEach(function (s2) {
          if (s2.kind === "speaking") spCards += (s2.cards || []).length;
        });
      });
      if (spCards) {
        var spQids = [];
        EXAMS.forEach(function (ex3) {
          ex3.sections.forEach(function (s3) {
            if (s3.kind === "speaking") {
              (s3.cards || []).forEach(function (c) { spQids = spQids.concat(spCardQids(c)); });
            }
          });
        });
        var spBadge = masteryBadge(spQids, okc);
        html += '<button class="section-item" data-action="start-section" data-sec="sp">' +
          '<span class="icon">🎤</span>' +
          '<span class="body"><span class="name">二次試験・面接（スピーキング）</span><br>' +
          '<span class="meta">全回のカード' + spCards + 'まいからえらぶ・マイクで録音</span></span>' + spBadge + "</button>";
      }
    }
    html += "</div>";

    // 全体の進捗ミニ表示
    var aggH = masteryAggregate(state.userId);
    var hm = 0, ht = 0;
    Object.keys(aggH).forEach(function (k) { hm += aggH[k].mastered; ht += aggH[k].total; });
    var hPct = ht ? Math.round(100 * hm / ht) : 0;
    html += '<div class="home-progress" data-action="to-records" role="button">' +
      '<span class="hp-label">ぜんたいの進捗</span>' +
      '<span class="mastery-bar"><div style="width:' + hPct + '%"></div></span>' +
      '<span class="hp-pct">' + hPct + "%</span></div>";

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
    var src = sourceInfo(q.id);
    if (src) html += '<div class="q-source">' + (src.original ? "✏️" : "📚") + " " + esc(src.short) + "</div>";
    if (entry.instruction) html += '<div class="q-instruction">' + esc(entry.instruction) + "</div>";
    // 空所が複数ある問題は、どの空所に答えるかを明示
    if (targetBlank && (promptBlanks.length > 1 || (passage && blankNumbers(passage.body).length > 1))) {
      html += '<div class="blank-chip">（ ' + targetBlank + " ）に入るものをえらぼう</div>";
    }
    if (listening && !entry.done) {
      var canPlay = !!q.audio || ttsOk;
      html += '<div class="listen-panel">' +
        '<div class="listen-note">' + (canPlay ? "▶ をおして、音声をきいてからこたえよう（もういちど聞ける）" : "このブラウザは音声に対応していません。スクリプトを読んでこたえよう。") + "</div>";
      if (canPlay) {
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
      // 第1部は実試験では選択肢が問題冊子に印刷されない（放送のみ）ので、
      // 解答するまでは番号だけを見せ、解答後にテキストを表示する
      var hideChoiceText = entry.sectionId === "l1" && !entry.done;
      html += '<div class="choices">';
      (q.choices || []).forEach(function (c) {
        var cls = "choice";
        if (hideChoiceText) cls += " no-text";
        if (entry.done) {
          if (c.label === q.answer) cls += " correct";
          else if (c.label === entry.picked) cls += " wrong";
        }
        html += '<button class="' + cls + '" data-action="choose" data-label="' + esc(c.label) + '"' +
          (entry.done ? " disabled" : "") + '><span class="label">' + esc(c.label) + "</span>" +
          (hideChoiceText ? "" : "<span>" + esc(c.text) + "</span>") + "</button>";
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
      var src = sourceInfo(q.id);
      if (src && src.full) html += '<div class="q-source-full">出典: ' + esc(src.full) + "</div>";
      html += "</div>";
      html += viewAiSection(entry);
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
    var src = sourceInfo(q.id);
    if (src && src.full) html += '<div class="q-source-full">出典: ' + esc(src.full) + "</div>";
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
      var src = sourceInfo(d.qid);
      html += '<div class="review-item"><span class="mark ' + (d.ok ? "ok\">⭕" : "ng\">❌") + "</span>" +
        "<span>" + (i + 1) + ".</span><span class=\"txt\">" + esc(text) + "</span>" +
        (src ? '<span class="rv-src">' + esc(src.short) + "</span>" : "") + "</div>";
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

    // 全体の進捗（全収録問題のマスター率）
    var agg = masteryAggregate(state.userId);
    var sumM = 0, sumT = 0;
    Object.keys(agg).forEach(function (k) { sumM += agg[k].mastered; sumT += agg[k].total; });
    var allPct = sumT ? Math.round(100 * sumM / sumT) : 0;
    html += '<div class="card mastery-hero">' +
      '<h2>ぜんたいの進捗</h2>' +
      '<div class="mastery-big">' + allPct + '<small>%</small></div>' +
      '<div class="mastery-bar"><div style="width:' + allPct + '%"></div></div>' +
      '<div class="mastery-sub">' + sumM + " / " + sumT + '問をマスター（2回正解）</div></div>';

    // セクション別マスター率（収録問題のうち、2回正解できた問題の割合）
    html += '<div class="card"><h2>セクション別のマスター率</h2>' +
      '<p class="note" style="margin-bottom:10px">収録されている全問題のうち、<b>2回正解できた問題</b>のわりあいだよ。</p>' +
      '<div class="record-summary">';
    ["w1", "w2", "w3", "w4", "w5", "w6", "l1", "l2", "l3", "sp"].forEach(function (key) {
      var a = agg[key];
      if (!a) return;
      var pct = Math.round(100 * a.mastered / a.total);
      html += '<div class="record-row"><span class="rname">' + (SECTION_ICONS[key] || "") + " " + esc(shortTitle(a.title)) + "</span>" +
        '<span class="bar"><div style="width:' + pct + '%;background:' + barColor(pct) + '"></div></span>' +
        '<span class="pct">' + pct + "%<small style=\"color:var(--sub);font-weight:400\"> " + a.mastered + "/" + a.total + "問</small></span></div>";
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
        restoreExamSel(state.userId);
        state.examPickerOpen = false;
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
      case "pick-exam": {
        state.examIdx = parseInt(t.getAttribute("data-idx"), 10);
        state.examPickerOpen = false;
        var st1 = getSettings(state.userId);
        st1.examSel = state.examIdx === -1 ? "mix" : examId(EXAMS[state.examIdx]);
        setSettings(state.userId, st1);
        render();
        break;
      }
      case "toggle-exam-picker":
        state.examPickerOpen = !state.examPickerOpen;
        render();
        break;
      case "start-section": {
        var secId0 = t.getAttribute("data-sec");
        if (state.examIdx === -1 && secId0 === "sp") {
          state.sp = { exIdx: -1 }; // 全回のカードから選ぶ
          state.screen = "spSelect";
          render();
        } else if (state.examIdx === -1 && secId0 === "w4") {
          startMixPassageSection(secId0); // 長文は大問丸ごと
        } else if (state.examIdx === -1) {
          startMixSection(secId0);
        } else {
          startSection(state.examIdx, secId0);
        }
        break;
      }
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
          playQuestion(e2, function () {
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
      case "ai-review": onAiReview(); break;
      case "self-grade": onSelfGrade(parseInt(t.getAttribute("data-g"), 10)); break;
      case "next": nextQuestion(); break;

      // --- 面接（スピーキング） ---
      case "sp-sample":
        if (state.playing) { stopSpeaking(); render(); }
        else { spPlay(t.getAttribute("data-rel"), null, function () { render(); }); render(); }
        break;
      case "sp-sample-script":
        state.sp.showSample = !state.sp.showSample;
        render();
        break;
      case "sp-card":
        state.sp.exIdx = parseInt(t.getAttribute("data-ex"), 10);
        spStartCard(t.getAttribute("data-card"));
        break;
      case "sp-begin": spBegin(); break;
      case "sp-skip-silent":
        stopSpeaking();
        spStartSilent();
        break;
      case "sp-skip-silent2": spEndSilent(); break;
      case "sp-play":
        spPlay(t.getAttribute("data-rel"), t.getAttribute("data-fallback") || null, null);
        break;
      case "sp-rec-start": spStartRec(); break;
      case "sp-rec-stop": spStopRec(); break;
      case "sp-rec-play": {
        var spr = state.sp.recs[t.getAttribute("data-key")];
        if (spr) spPlayBlobUrl(spr.url);
        break;
      }
      case "sp-next": spNext(); break;
      case "sp-text-toggle": {
        var spq = state.sp.card.questions[state.sp.qIdx];
        state.sp.showText[spq.id] = !state.sp.showText[spq.id];
        render();
        break;
      }
      case "sp-grade":
        state.sp.grades[t.getAttribute("data-key")] = parseInt(t.getAttribute("data-g"), 10);
        render();
        break;
      case "sp-ai": spAiReview(); break;
      case "sp-finish": spFinish(); break;
      case "sp-quit": spQuit(); break;
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
