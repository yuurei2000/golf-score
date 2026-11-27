// AIゴルフコーチ — この端末の保存（localStorage）。使えない環境でも落ちないようにする。
(function (root) {
  "use strict";
  var P = "tc_";
  function get(k, def) {
    try { var v = root.localStorage.getItem(P + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
  }
  function set(k, v) {
    try { root.localStorage.setItem(P + k, JSON.stringify(v)); return true; } catch (e) { return false; }
  }
  function del(k) { try { root.localStorage.removeItem(P + k); } catch (e) { /* 何もしない */ } }
  root.CoachStore = {
    settings: function () { return get("settings", { apiKey: "", model: "claude-opus-5-5", effort: "medium", showUsage: false }); },
    saveSettings: function (s) { return set("settings", s); },
    history: function () { return get("history", []); },      // API へ送る会話（assistant は content の配列のまま）
    saveHistory: function (h) { return set("history", h); },
    log: function () { return get("log", []); },              // 画面に出す記録 {role, text, mode, at}
    saveLog: function (l) { return set("log", l); },
    clearChat: function () { del("history"); del("log"); },
    clearAll: function () { del("history"); del("log"); del("settings"); }
  };
})(typeof window !== "undefined" ? window : globalThis);
