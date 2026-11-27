// ゴルフビンゴ：Firestore への記録（参加の抽選・各自の印・幹事の参加状況）
// Firestore につながらないときは null を返し、画面はこの端末だけで動く
//   bingo/{コード}              { seats: { "番号": {name, key, at} }, updatedAt }
//   bingo/{コード}/cards/{番号}  { name, marks: { "位置": {hole, at} }, bingo, reach, count, updatedAt }
window.BingoSync = (function () {
  "use strict";
  var db = null, tried = false;

  function init() {
    if (tried) return db;
    tried = true;
    try {
      if (!window.firebase || !window.firebaseConfig) return null;
      if (!firebase.apps.length) firebase.initializeApp(window.firebaseConfig);
      db = firebase.firestore();
    } catch (e) { console.error(e); db = null; }
    return db;
  }
  function gameRef(code) { return db.collection("bingo").doc(code); }

  // 参加：空いている番号をトランザクションでランダムに引く（2 人が同時に押しても重ならない）
  function join(code, name, key) {
    if (!init()) return Promise.reject(new Error("offline"));
    var ref = gameRef(code);
    return db.runTransaction(function (tx) {
      return tx.get(ref).then(function (snap) {
        var seats = (snap.exists && snap.data().seats) || {};
        var r = window.BingoCore.pickSeat(seats, name, key, function () {
          var b = new Uint32Array(1); crypto.getRandomValues(b); return b[0] / 4294967296;
        });
        if (r.full) return r;
        if (r.reused) { r.name = seats[r.no].name; return r; }
        var next = {}; Object.keys(seats).forEach(function (k) { next[k] = seats[k]; });
        next[String(r.no)] = { name: name, key: key, at: Date.now() };
        tx.set(ref, { seats: next, updatedAt: Date.now() });
        r.name = name;
        return r;
      });
    });
  }

  // 幹事：番号を空ける（間違えて参加した人など）
  function release(code, no) {
    if (!init()) return Promise.reject(new Error("offline"));
    var ref = gameRef(code);
    return db.runTransaction(function (tx) {
      return tx.get(ref).then(function (snap) {
        var seats = (snap.exists && snap.data().seats) || {}, next = {};
        Object.keys(seats).forEach(function (k) { if (k !== String(no)) next[k] = seats[k]; });
        tx.set(ref, { seats: next, updatedAt: Date.now() });
      });
    });
  }

  function watchSeats(code, cb) {
    if (!init()) return function () {};
    return gameRef(code).onSnapshot(function (d) { cb((d.exists && d.data().seats) || {}); }, function (e) { console.error(e); cb(null, e); });
  }
  function watchCards(code, cb) {
    if (!init()) return function () {};
    return gameRef(code).collection("cards").onSnapshot(function (qs) {
      var o = {}; qs.forEach(function (d) { o[d.id] = d.data(); }); cb(o);
    }, function (e) { console.error(e); cb(null, e); });
  }
  function loadCard(code, no) {
    if (!init()) return Promise.resolve(null);
    return gameRef(code).collection("cards").doc(String(no)).get().then(function (d) { return d.exists ? d.data() : null; });
  }
  function saveCard(code, no, data) {
    if (!init()) return Promise.resolve(false);
    return gameRef(code).collection("cards").doc(String(no)).set(data).then(function () { return true; });
  }

  return { init: init, join: join, release: release, watchSeats: watchSeats, watchCards: watchCards, loadCard: loadCard, saveCard: saveCard };
})();
