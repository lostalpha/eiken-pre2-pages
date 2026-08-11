/* 公開版（GitHub Pages）用: あいことばで data/exams.enc を復号してアプリを起動する。
   ローカル版（data/exams.js を読み込む構成）では index.html に含めないこと。 */
(function () {
  "use strict";

  var KEY_STORE = "eikenPre2.dataKey"; // 復号済みの鍵（base64）。次回から入力不要にする

  function b64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bytesToB64(bytes) {
    var bin = "";
    var arr = new Uint8Array(bytes);
    for (var i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
    return btoa(bin);
  }

  function deriveKey(passphrase, salt, iter) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: "PBKDF2", salt: salt, iterations: iter, hash: "SHA-256" },
          base,
          { name: "AES-GCM", length: 256 },
          true,
          ["decrypt"]
        );
      });
  }

  function decryptWith(key, blob) {
    return crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64ToBytes(blob.iv) },
      key,
      b64ToBytes(blob.data)
    ).then(function (plain) {
      return JSON.parse(new TextDecoder().decode(plain));
    });
  }

  /* 暗号化アセット（data/ 以下の .enc = IV12バイト+AES-GCM暗号文）を
     復号して objectURL を返す関数を app.js に提供する。
     Blob の MIME を拡張子から正しく付けること（Safari は <img> に
     audio/mp4 の blob を渡すと表示しない） */
  var ENC_MIME = {
    ".m4a.enc": "audio/mp4",
    ".mp3.enc": "audio/mpeg",
    ".jpg.enc": "image/jpeg",
    ".jpeg.enc": "image/jpeg",
    ".png.enc": "image/png",
    ".webp.enc": "image/webp",
    ".svg.enc": "image/svg+xml"
  };
  function encMime(url) {
    var path = url.split("?")[0].toLowerCase();
    for (var ext in ENC_MIME) {
      if (path.slice(-ext.length) === ext) return ENC_MIME[ext];
    }
    return "application/octet-stream";
  }

  function setupAudioDecrypt(key) {
    window.EIKEN_AUDIO_DECRYPT = function (url) {
      return fetch(url)
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.arrayBuffer();
        })
        .then(function (buf) {
          var bytes = new Uint8Array(buf);
          return crypto.subtle.decrypt(
            { name: "AES-GCM", iv: bytes.subarray(0, 12) }, key, bytes.subarray(12));
        })
        .then(function (plain) {
          return URL.createObjectURL(new Blob([plain], { type: encMime(url) }));
        });
    };
  }

  function launch(data) {
    if (data && !Array.isArray(data)) {
      // 新形式: { exams: [...], config: { geminiKey, ... } }
      window.EIKEN_CONFIG = data.config || null;
      window.EIKEN_DATA = data.exams || [];
    } else {
      window.EIKEN_DATA = data;
    }
    window.dispatchEvent(new Event("eiken:data-ready"));
  }

  function showForm(blob, message) {
    var app = document.getElementById("app");
    app.innerHTML =
      '<div class="app-title">英検準2級<br>過去問トレーニング</div>' +
      '<div class="app-sub">あいことばを入れてね</div>' +
      '<div class="card" style="max-width:380px;margin:0 auto">' +
      '<div class="form-row"><input type="password" id="unlock-pass" placeholder="あいことば" ' +
      'autocomplete="current-password" style="width:100%;padding:12px;font-size:16px;border:1px solid var(--line);border-radius:10px"></div>' +
      (message ? '<p style="color:var(--bad);font-size:13px;margin-bottom:10px">' + message + "</p>" : "") +
      '<button class="btn primary block" id="unlock-btn">はじめる</button></div>';

    var input = document.getElementById("unlock-pass");
    var btn = document.getElementById("unlock-btn");

    function attempt() {
      var pass = input.value;
      if (!pass) { input.focus(); return; }
      btn.disabled = true;
      btn.textContent = "かくにん中…";
      var salt = b64ToBytes(blob.salt);
      deriveKey(pass, salt, blob.iter)
        .then(function (key) {
          return decryptWith(key, blob).then(function (data) {
            // 成功: 鍵を保存して次回から自動で開く
            return crypto.subtle.exportKey("raw", key).then(function (raw) {
              try { localStorage.setItem(KEY_STORE, bytesToB64(raw)); } catch (e) { /* 保存できなくても続行 */ }
              setupAudioDecrypt(key);
              launch(data);
            });
          });
        })
        .catch(function () {
          showForm(blob, "あいことばがちがうみたい。もういちど入れてね。");
        });
    }

    btn.addEventListener("click", attempt);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") attempt(); });
    input.focus();
  }

  function init() {
    if (!(window.crypto && crypto.subtle)) {
      document.getElementById("app").innerHTML =
        '<div class="card"><p>このブラウザでは開けません（暗号化機能に未対応）。https でアクセスしてください。</p></div>';
      return;
    }
    fetch("data/exams.enc?v=461d40dbe3")
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (blob) {
        var savedKey = null;
        try { savedKey = localStorage.getItem(KEY_STORE); } catch (e) { /* ignore */ }
        if (savedKey) {
          // 保存済みの鍵でまず試す（あいことば変更後は失敗するので入力画面へ）
          crypto.subtle.importKey("raw", b64ToBytes(savedKey), { name: "AES-GCM" }, false, ["decrypt"])
            .then(function (key) {
              return decryptWith(key, blob).then(function (data) {
                setupAudioDecrypt(key);
                launch(data);
              });
            })
            .catch(function () {
              try { localStorage.removeItem(KEY_STORE); } catch (e) { /* ignore */ }
              showForm(blob, null);
            });
        } else {
          showForm(blob, null);
        }
      })
      .catch(function (err) {
        document.getElementById("app").innerHTML =
          '<div class="card"><p>データを読み込めませんでした（' + String(err.message || err) + '）。' +
          'ローカルで開く場合は python3 -m http.server などのサーバー経由で開いてください。</p></div>';
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
