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
  // 混み合ってトランザクションが通らないときは、少し待って引き直す（端末だけで引くことはしない）
  function retry(fn, tries) {
    var i = 0;
    function go() {
      return fn().catch(function (e) {
        if (++i >= tries) throw e;
        var wait = 400 * Math.pow(2, i - 1) + Math.random() * 600;
        return new Promise(function (ok) { setTimeout(ok, wait); }).then(go);
      });
    }
    return go();
  }
  function join(code, name, key, blocked) {
    if (!init()) return Promise.reject(new Error("offline"));
    var ref = gameRef(code);
    return retry(function () { return db.runTransaction(function (tx) {
      return tx.get(ref).then(function (snap) {
        var seats = (snap.exists && snap.data().seats) || {};
        // まず 1〜16 から引き、埋まっていたら 17〜20 から引く（今までの 16 枚はそのまま）
        var rnd = function () { var b = new Uint32Array(1); crypto.getRandomValues(b); return b[0] / 4294967296; };
        var r = window.BingoCore.pickSeat(seats, name, key, rnd, 16, blocked);
        if (r.full) r = window.BingoCore.pickSeat(seats, name, key, rnd, 20, blocked);
        if (r.full) return r;
        if (r.reused) { r.name = seats[r.no].name; return r; }
        var next = {}; Object.keys(seats).forEach(function (k) { next[k] = seats[k]; });
        next[String(r.no)] = { name: name, key: key, at: Date.now() };
        tx.set(ref, { seats: next, updatedAt: Date.now() });
        r.name = name;
        return r;
      });
    }); }, 6);
  }

  // カードを開いた人の席を確かめる。記録が無ければこの人の席として記録する
  //   戻り値 {state: "mine"|"other", seat}
  function claim(code, no, name, key, devKey) {
    if (!init()) return Promise.reject(new Error("offline"));
    var ref = gameRef(code);
    return retry(function () { return db.runTransaction(function (tx) {
      return tx.get(ref).then(function (snap) {
        var seats = (snap.exists && snap.data().seats) || {}, s = seats[String(no)];
        var own = window.BingoCore.seatOwner(s, devKey, name);
        if (own === "mine") return { state: "mine", seat: s };
        if (own === "other") return { state: "other", seat: s };
        var next = {}; Object.keys(seats).forEach(function (k) { next[k] = seats[k]; });
        next[String(no)] = { name: name, key: key, at: Date.now() };
        tx.set(ref, { seats: next, updatedAt: Date.now() });
        return { state: "mine", seat: next[String(no)], claimed: true };
      });
    }); }, 4);
  }
  // 幹事：番号を変える・当てる。fromNo があればその席を空けて、鍵ごと新しい番号へ移す
  function assign(code, to, name, fromNo) {
    if (!init()) return Promise.reject(new Error("offline"));
    var ref = gameRef(code), nn = window.BingoCore.normName;
    return db.runTransaction(function (tx) {
      return tx.get(ref).then(function (snap) {
        var seats = (snap.exists && snap.data().seats) || {}, cur = seats[String(to)];
        if (cur && nn(cur.name) !== nn(name)) throw new Error("No." + to + " は " + cur.name + "さんが使っています");
        var old = fromNo ? seats[String(fromNo)] : null, next = {};
        Object.keys(seats).forEach(function (k) { if (!fromNo || k !== String(fromNo)) next[k] = seats[k]; });
        next[String(to)] = { name: name, key: (old && old.key) || (cur && cur.key) || "kanji", at: Date.now() };
        tx.set(ref, { seats: next, updatedAt: Date.now() });
      });
    });
  }
  function listCards(code) {
    if (!init()) return Promise.resolve({});
    return gameRef(code).collection("cards").get().then(function (qs) { var o = {}; qs.forEach(function (d) { o[d.id] = d.data(); }); return o; });
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

  return { init: init, join: join, claim: claim, assign: assign, listCards: listCards, release: release, watchSeats: watchSeats, watchCards: watchCards, loadCard: loadCard, saveCard: saveCard };
})();
