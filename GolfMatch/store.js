/* ============================================================
   store.js — データ層
   フェーズ1：LocalStore（この端末のLocalStorageに保存。同一ブラウザの別タブへは storage イベントで即時反映）
   フェーズ2：FirebaseStore（同じインターフェースで差し替え。firebase-config.js が読み込まれていれば自動選択）
   ------------------------------------------------------------
   インターフェース（すべて Promise を返す）
     listCourses() / saveCourse(course) / deleteCourse(id)
     createGame(game) / getGame(gameId) / updateGame(gameId, patch)
     setScores(gameId, [{playerId, holeNo, gross}])   … 複数まとめて保存（1ホール分の登録）
     deleteScore(gameId, playerId, holeNo)
     subscribeGame(gameId, callback) → unsubscribe関数   … ゲーム全体（players/groups/scores込み）を通知
   ============================================================ */
const Store = (() => {
  const K_COURSES = "gm_courses", K_GAMES = "gm_games", K_ME = "gm_me";

  function uid(n = 8) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const buf = new Uint8Array(n); crypto.getRandomValues(buf);
    return Array.from(buf, b => chars[b % chars.length]).join("");
  }
  function token() {
    const buf = new Uint8Array(16); crypto.getRandomValues(buf);
    return Array.from(buf, b => b.toString(16).padStart(2, "0")).join("");
  }
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (_) { return d; } };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  /* ---------------- LocalStore ---------------- */
  const listeners = {};   // gameId -> Set(callback)
  function notify(gameId) {
    const g = getGameSync(gameId);
    (listeners[gameId] || new Set()).forEach(cb => { try { cb(g); } catch (e) { console.error(e); } });
  }
  window.addEventListener("storage", e => {          // 別タブでの更新を反映（複数端末の擬似動作）
    if (e.key === K_GAMES) Object.keys(listeners).forEach(notify);
  });
  function getGameSync(gameId) { const games = load(K_GAMES, {}); return games[gameId] ? JSON.parse(JSON.stringify(games[gameId])) : null; }
  function putGame(game) { const games = load(K_GAMES, {}); games[game.gameId] = game; save(K_GAMES, games); notify(game.gameId); }

  const LocalStore = {
    name: "local",
    setCredential() {},   // ローカル版は権限をURLだけで判定（トークン照合はUI側）
    async listCourses() { return load(K_COURSES, []); },
    markCourseUsed() {},
    async saveCourse(course) {
      const list = load(K_COURSES, []);
      if (!course.courseId) course.courseId = uid(10);
      course.updatedAt = Date.now();
      const i = list.findIndex(c => c.courseId === course.courseId);
      if (i >= 0) list[i] = course; else list.push(course);
      save(K_COURSES, list); return course;
    },
    async deleteCourse(id) { save(K_COURSES, load(K_COURSES, []).filter(c => c.courseId !== id)); },
    async createGame(game) {
      game.gameId = game.gameId || uid(8);
      game.adminToken = game.adminToken || token();
      game.createdAt = Date.now(); game.status = "playing";
      game.scores = game.scores || {};
      (game.groups || []).forEach(g => { g.scorerToken = g.scorerToken || token(); });
      putGame(game); return game;
    },
    async getGame(gameId) { return getGameSync(gameId); },
    async listGames() { return Object.values(load(K_GAMES, {})).sort((a, b) => b.createdAt - a.createdAt); },
    async updateGame(gameId, patch) { const g = getGameSync(gameId); if (!g) return null; Object.assign(g, patch); putGame(g); return g; },
    async deleteGame(gameId) { const games = load(K_GAMES, {}); delete games[gameId]; save(K_GAMES, games); },
    async setStatus(gameId, status) { const g = getGameSync(gameId); if (!g) return; g.status = status; g.finishedAt = status === "finished" ? Date.now() : null; putGame(g); },
    async setScores(gameId, items) {
      const g = getGameSync(gameId); if (!g) throw new Error("game not found");
      items.forEach(({ playerId, holeNo, gross }) => {
        if (!g.scores[playerId]) g.scores[playerId] = {};
        g.scores[playerId][holeNo] = gross;
      });
      g.scoresUpdatedAt = Date.now();
      putGame(g);
    },
    async deleteScore(gameId, playerId, holeNo) {
      const g = getGameSync(gameId); if (!g) return;
      if (g.scores[playerId]) delete g.scores[playerId][holeNo];
      putGame(g);
    },
    subscribeGame(gameId, cb) {
      if (!listeners[gameId]) listeners[gameId] = new Set();
      listeners[gameId].add(cb);
      setTimeout(() => cb(getGameSync(gameId)), 0);
      return () => listeners[gameId].delete(cb);
    }
  };

  /* ---------------- 身元（あなたは誰？）の記憶 ---------------- */
  const Identity = {
    get(gameId) { return load(K_ME, {})[gameId] || null; },
    set(gameId, playerId) { const m = load(K_ME, {}); m[gameId] = playerId; save(K_ME, m); }
  };

  /* フェーズ2：window.firebaseConfig があれば FirebaseStore を選択（未実装のうちは Local にフォールバック） */
  let active = LocalStore;
  if (window.firebaseConfig && window.FirebaseStore && typeof firebase !== "undefined") {
    try { active = window.FirebaseStore(window.firebaseConfig); }
    catch (e) { console.error("Firebase初期化に失敗したためローカルモードで動作します", e); }
  }
  return Object.assign({ uid, token, Identity, mode: active.name }, active);
})();
