/* ============================================================
   store.js — データ層（フェーズ1：この端末の LocalStorage）
   フェーズ2で Firebase Auth + Firestore 版（users/{uid}/sessions/…）を同じインターフェースで差し替える。
   ------------------------------------------------------------
     getSettings() / saveSettings(obj)
     listSessions() / getSession(id) / saveSession(session) / deleteSession(id)
     getRunning() / saveRunning(state) / clearRunning()      … 進行中セッション（中断・復帰用）
     exportAll() / importAll(json)
   ============================================================ */
const Store = (() => {
  const K_SET = "gx_settings", K_SESS = "gx_sessions", K_RUN = "gx_running";
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (_) { return d; } };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const uid = (n = 10) => { const c = "abcdefghjkmnpqrstuvwxyz23456789"; const b = new Uint8Array(n); crypto.getRandomValues(b); return Array.from(b, x => c[x % c.length]).join(""); };
  const DEFAULT_SETTINGS = { hand: "右", unit: "yd", sound: true, vibrate: true, places: ["TrackMan室内レンジ"], place: "TrackMan室内レンジ",
    clubs: [["DR", 210], ["3W", 190], ["5W", 175], ["4U", 165], ["5I", 160], ["6I", 150], ["7I", 140], ["8I", 130], ["9I", 120], ["PW", 105], ["AW", 90], ["SW", 75]],
    targets: { mid: [110, 116, 126, 135], short: [30, 50, 70, 90] }, blocks: {} };
  return {
    name: "local", uid,
    getSettings() { return Object.assign(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), load(K_SET, {})); },
    saveSettings(s) { save(K_SET, s); },
    listSessions() { return Object.values(load(K_SESS, {})).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0)); },
    getSession(id) { return load(K_SESS, {})[id] || null; },
    saveSession(s) { const all = load(K_SESS, {}); s.updatedAt = Date.now(); all[s.id] = s; save(K_SESS, all); return s; },
    deleteSession(id) { const all = load(K_SESS, {}); delete all[id]; save(K_SESS, all); },
    getRunning() { return load(K_RUN, null); },
    saveRunning(st) { save(K_RUN, st); },
    clearRunning() { localStorage.removeItem(K_RUN); },
    exportAll() { return JSON.stringify({ app: "GolfExec", version: 1, exportedAt: new Date().toISOString(), settings: load(K_SET, {}), sessions: load(K_SESS, {}) }, null, 1); },
    importAll(json) {
      const d = JSON.parse(json); if (!d || d.app !== "GolfExec") throw new Error("GolfExec のバックアップではありません");
      const all = load(K_SESS, {}); Object.assign(all, d.sessions || {}); save(K_SESS, all);
      if (d.settings) save(K_SET, Object.assign(load(K_SET, {}), d.settings));
      return Object.keys(d.sessions || {}).length;
    }
  };
})();
