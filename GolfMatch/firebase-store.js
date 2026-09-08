/* ============================================================
   firebase-store.js — Firestore 版データ層（フェーズ2）
   store.js と同じインターフェース。firebase-config.js が読み込まれていれば自動で選択される。
   ------------------------------------------------------------
   Firestore 構造
     courses/{courseId}                 コースマスタ
     games/{gameId}                     ゲーム公開情報（players / groups / course / 設定）※トークンは含めない
     games/{gameId}/private/tokens      { adminToken, scorers:{ "1":token, "2":token } }  ※誰も読めない（ルールで検証にのみ使用）
     games/{gameId}/scores/{groupNo}    { tok, scores:{ playerId:{ holeNo:gross } }, updatedAt }  ※組ごとに分離（同時入力でも競合しない）
   ・オフライン：Firestore の永続キャッシュを有効化。圏外でも登録は端末に保留され、回復後に自動送信される
   ・この端末で作成/開いたゲームの一覧は LocalStorage(gm_index) に保持（作成した端末だけがトークンを持つ）
   ============================================================ */
window.FirebaseStore = function (cfg) {
  firebase.initializeApp(cfg);
  const db = firebase.firestore();
  try { db.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (_) {}

  const K_INDEX = "gm_index", K_MYCOURSES = "gm_mycourses";   // この端末で登録・使用したコースID
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (_) { return d; } };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const uid = (n = 8) => { const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const b = new Uint8Array(n); crypto.getRandomValues(b); return Array.from(b, x => c[x % c.length]).join(""); };
  const token = () => { const b = new Uint8Array(16); crypto.getRandomValues(b); return Array.from(b, x => x.toString(16).padStart(2, "0")).join(""); };
  let cred = { kind: "viewer", token: null, groupNo: null };   // 現在のURLから得た権限（書き込み時にトークンを添える）

  function myCourseAdd(id) { if (!id) return; const m = load(K_MYCOURSES, {}); m[id] = Date.now(); save(K_MYCOURSES, m); }
  function indexPut(e) { const idx = load(K_INDEX, {}); idx[e.gameId] = Object.assign(idx[e.gameId] || {}, e); save(K_INDEX, idx); }
  function assemble(g, scoreDocs) {
    g.scores = {};
    scoreDocs.forEach(d => {
      const sc = (d.data() || {}).scores || {};
      Object.keys(sc).forEach(pid => { g.scores[pid] = Object.assign(g.scores[pid] || {}, sc[pid]); });
    });
    const idx = load(K_INDEX, {})[g.gameId];   // 自分が作成したゲームならトークンを付与（共有画面の表示用）
    if (idx) {
      if (idx.adminToken) g.adminToken = idx.adminToken;
      if (idx.scorerTokens) g.groups.forEach(gr => { gr.scorerToken = idx.scorerTokens[String(gr.groupNo)]; });
    }
    return g;
  }
  const gameRef = id => db.collection("games").doc(id);

  return {
    name: "firebase",
    setCredential(c) { cred = Object.assign({ kind: "viewer", token: null, groupNo: null }, c || {}); },

    // all=true でサーバー上の全コース、省略時はこの端末で登録・使用したコースだけ
    async listCourses(all) {
      const s = await db.collection("courses").get();
      const mine = load(K_MYCOURSES, {});
      return s.docs.map(d => d.data()).filter(c => all || mine[c.courseId]).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },
    async countCourses() { const s = await db.collection("courses").get(); return s.size; },
    async saveCourse(c) { if (!c.courseId) c.courseId = uid(10); c.updatedAt = Date.now(); await db.collection("courses").doc(c.courseId).set(c); myCourseAdd(c.courseId); return c; },
    markCourseUsed(id) { myCourseAdd(id); },
    async deleteCourse(id) { await db.collection("courses").doc(id).delete(); },

    async createGame(game) {
      game.gameId = uid(8);
      const adminToken = token(), scorers = {};
      game.groups.forEach(gr => { scorers[String(gr.groupNo)] = token(); });
      game.createdAt = Date.now(); game.status = "playing";
      const pub = JSON.parse(JSON.stringify(game));
      delete pub.scores; delete pub.adminToken;
      pub.groups = pub.groups.map(gr => ({ groupNo: gr.groupNo, scorerPlayerId: gr.scorerPlayerId }));
      const b = db.batch();
      b.set(gameRef(game.gameId), pub);
      b.set(gameRef(game.gameId).collection("private").doc("tokens"), { adminToken, scorers });
      await b.commit();
      myCourseAdd(game.course && game.course.courseId);
      indexPut({ gameId: game.gameId, playDate: game.playDate, courseName: game.course.name, playerNames: game.players.map(p => p.name),
        handicapEnabled: game.handicapEnabled, status: "playing", adminToken, scorerTokens: scorers, createdAt: game.createdAt });
      game.adminToken = adminToken; game.groups.forEach(gr => { gr.scorerToken = scorers[String(gr.groupNo)]; }); game.scores = {};
      return game;
    },
    async getGame(id) {
      const d = await gameRef(id).get(); if (!d.exists) return null;
      const sc = await gameRef(id).collection("scores").get();
      const g = assemble(d.data(), sc.docs);
      myCourseAdd(g.course && g.course.courseId);
      const stDoc = await gameRef(id).collection("state").doc("main").get();
      if (stDoc.exists) { g.status = stDoc.data().status || g.status; g.finishedAt = stDoc.data().finishedAt || null; }
      indexPut({ gameId: id, playDate: g.playDate, courseName: g.course.name, playerNames: g.players.map(p => p.name),
        handicapEnabled: g.handicapEnabled, status: g.status, createdAt: g.createdAt || Date.now() });
      return g;
    },
    async listGames() {
      return Object.values(load(K_INDEX, {})).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map(e => ({
        gameId: e.gameId, playDate: e.playDate, course: { name: e.courseName }, players: (e.playerNames || []).map(n => ({ name: n })),
        handicapEnabled: e.handicapEnabled, status: e.status, adminToken: e.adminToken || null }));
    },
    async updateGame() { throw new Error("ゲーム設定の変更はフェーズ2では未対応です"); },
    async setStatus(gameId, status) {   // 管理者のみ（ルールで adminToken を検証）
      if (!cred.token) throw new Error("管理者用URLで開いてください");
      await gameRef(gameId).collection("state").doc("main").set({ tok: cred.token, status, finishedAt: status === "finished" ? Date.now() : null, updatedAt: Date.now() }, { merge: true });
      const idx = load(K_INDEX, {}); if (idx[gameId]) { idx[gameId].status = status; save(K_INDEX, idx); }
    },
    async deleteGame(id) { const idx = load(K_INDEX, {}); delete idx[id]; save(K_INDEX, idx); },   // この端末の一覧から外すだけ

    async setScores(gameId, items) {
      if (!cred.token) throw new Error("入力権限がありません。担当者用URLまたは管理者用URLで開いてください");
      const byGroup = {};
      items.forEach(it => {
        const g = String(it.groupNo);
        if (!byGroup[g]) byGroup[g] = {};
        if (!byGroup[g][it.playerId]) byGroup[g][it.playerId] = {};
        byGroup[g][it.playerId][String(it.holeNo)] = it.gross;
      });
      const b = db.batch();
      Object.keys(byGroup).forEach(g => b.set(gameRef(gameId).collection("scores").doc(g),
        { tok: cred.token, scores: byGroup[g], updatedAt: Date.now() }, { merge: true }));
      // オフライン時は commit が保留され（画面には「未同期」表示）、通信回復後に自動送信される
      const p = b.commit();
      await Promise.race([p, new Promise(r => setTimeout(r, 1500))]);
      p.catch(e => { console.error(e); if (typeof window.onStoreError === "function") window.onStoreError(e); });
    },
    async deleteScore(gameId, playerId, holeNo, groupNo) {
      if (!cred.token) throw new Error("入力権限がありません");
      await gameRef(gameId).collection("scores").doc(String(groupNo)).set(
        { tok: cred.token, scores: { [playerId]: { [String(holeNo)]: firebase.firestore.FieldValue.delete() } }, updatedAt: Date.now() }, { merge: true });
    },
    subscribeGame(gameId, cb) {
      let gameDoc = null, scoreDocs = [], pending = false, stateDoc = null;
      const emit = () => {
        if (!gameDoc) return;
        const g = assemble(JSON.parse(JSON.stringify(gameDoc)), scoreDocs);
        if (stateDoc) { g.status = stateDoc.status || g.status; g.finishedAt = stateDoc.finishedAt || null; }
        g.__pending = pending; cb(g);
      };
      const u3 = gameRef(gameId).collection("state").doc("main").onSnapshot(d => { stateDoc = d.exists ? d.data() : null; emit(); }, e => console.error(e));
      const u1 = gameRef(gameId).onSnapshot(d => { gameDoc = d.exists ? d.data() : null; if (!gameDoc) { cb(null); return; } emit(); }, e => console.error(e));
      const u2 = gameRef(gameId).collection("scores").onSnapshot({ includeMetadataChanges: true },
        s => { scoreDocs = s.docs; pending = s.metadata.hasPendingWrites; emit(); }, e => console.error(e));
      return () => { u1(); u2(); u3(); };
    }
  };
};
