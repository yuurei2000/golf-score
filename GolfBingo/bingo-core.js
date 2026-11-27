// ゴルフビンゴ：画面に依存しない関数（カードの作成・ビンゴの判定・点検）
(function (root) {
  "use strict";

  // マスの出来事（スコア 100 前後の人向け）。やさしい／ミス（失敗もマスになる）／ふつう／むずかしい の 4 段
  // 1 枚に 8・7・6・3 個ずつ入れる（真ん中は FREE）
  var ITEMS = {
    easy: [
      "2パット以内", "ボギー", "ボギー2回", "ダボ以内", "パー3でボギー以内",
      "パー4でダボ以内", "パー5でダボ以内", "パー3でボギーオン", "パー4でボギーオン", "パー5でボギーオン",
      "フェアウェイキープ", "ティーショットが真っすぐ", "ドライバーでナイスショット", "ウッドでナイスショット", "UTでナイスショット",
      "アイアンでナイスショット", "「ナイスショット」と言われる", "同伴者より飛ぶ", "バンカーを2打以内で脱出", "林から1打で出す",
      "ラフからフェアウェイへ出す", "花道から寄せる", "グリーン外からパターで寄せる", "ウェッジでナイスアプローチ", "10歩以上を2パット",
      "1m以内のパットを入れる", "上りのパットを入れる", "1番ホールでダボ以内", "9番ホールでダボ以内", "最終ホールでダボ以内",
      "OBなしで3ホール", "3パットなしで3ホール", "ボールをなくさず3ホール", "打ち下ろしでナイスショット", "PWでグリーンに乗せる",
      "7番アイアンでナイスショット", "傾斜地から前に運ぶ", "ドッグレッグでフェアウェイ"
    ],
    miss: [
      "OB", "池ポチャ", "3パット", "4パット", "バンカーに入る",
      "バンカーで2回以上打つ", "空振り", "チョロ", "シャンク", "ダフリ",
      "トップ", "テンプラ", "右の林へ", "左の林へ", "木に当たる",
      "カート道に当たる", "隣のホールへ打ち込む", "「ファー！」と叫ぶ", "ロストボール", "暫定球を打つ",
      "グリーンをオーバー", "往復ビンタ", "1mのパットを外す", "パターでグリーンから出る", "トリプルボギー以上",
      "ダブルパー", "OBを2回", "ボールを探す", "林の中から打つ", "カップに蹴られる"
    ],
    mid: [
      "パー", "パー3でワンオン", "1パット", "寄せワン", "パーパットを打つ",
      "3m以上のパットを入れる", "フェアウェイキープ2連続", "ボギー以内で2ホール連続", "ダボなしで3ホール連続", "OBなしでハーフ",
      "池ポチャなしでハーフ", "1番ホールでボギー以内", "9番ホールでボギー以内", "最終ホールでボギー以内", "ワンピン以内に寄せる",
      "ハーフで目標スコア達成", "ハーフ55以内", "前半より後半が良い", "ロングパットをOKに寄せる", "バンカーから1回で乗せる",
      "同伴者全員に勝つホール", "ショートで同伴者一番ピンそば", "アプローチがカップに当たる", "UTでグリーンに乗せる", "ウッドでグリーンに乗せる",
      "同伴者内ドラコン", "前半と後半の差3打以内", "ハーフでバンカーに入らない"
    ],
    hard: [
      "バーディー", "チップイン", "ニアピン賞", "ドラコン賞", "パー2回",
      "パーオン", "サンドセーブ", "5m以上のパットを入れる", "OBなしで18ホール", "3パットなしでハーフ",
      "ハーフ自己ベスト", "ハーフ50切り", "トリ以上なしでハーフ", "パー2ホール連続", "ボギー以内で4ホール連続",
      "ハーフで1パット3回"
    ]
  };
  var TIERS = ["easy", "miss", "mid", "hard"];
  var PER_CARD = { easy: 8, miss: 7, mid: 6, hard: 3 };
  var SIZE = 5, CENTER = 12, FREE = "FREE";
  var SET_CANDIDATES = 120;  // 1 枚ごとに試す「24 個の選び方」の数。前の札と重なる数がいちばん少ない物を選ぶ
  var LAYOUT_RESTARTS = 12, LAYOUT_STEPS = 800; // 並べ方の入れ替えの回数

  // 5×5 の縦・横・斜めの 12 本（マスの位置 0〜24）
  var LINES = (function () {
    var L = [], r, c;
    for (r = 0; r < SIZE; r++) { var row = []; for (c = 0; c < SIZE; c++) row.push(r * SIZE + c); L.push(row); }
    for (c = 0; c < SIZE; c++) { var col = []; for (r = 0; r < SIZE; r++) col.push(r * SIZE + c); L.push(col); }
    var d1 = [], d2 = [];
    for (r = 0; r < SIZE; r++) { d1.push(r * SIZE + r); d2.push(r * SIZE + (SIZE - 1 - r)); }
    L.push(d1, d2);
    return L;
  })();

  // 文字列から決まる乱数（同じゲームコードなら、どの端末でも同じ 16 枚になる）
  function hashSeed(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }
  function rng(seedStr) {
    var a = hashSeed(String(seedStr));
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rnd) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function tierOf(text) {
    for (var i = 0; i < TIERS.length; i++) if (ITEMS[TIERS[i]].indexOf(text) >= 0) return TIERS[i];
    return "free";
  }

  // 置き方の条件：どの列も、むずかしいは 1 個まで・やさしいが 1 個以上・ミスは 3 個まで（どの列もそろう見込みがあり、ミスだけでそろわない）
  function fairLayout(cells) {
    for (var i = 0; i < LINES.length; i++) {
      var hard = 0, easy = 0, miss = 0;
      LINES[i].forEach(function (p) { var t = tierOf(cells[p]); if (t === "hard") hard++; else if (t === "easy") easy++; else if (t === "miss") miss++; });
      if (hard > 1 || easy < 1 || miss > 3) return false;
    }
    return true;
  }

  // 2 枚の似かた：同じ位置の同じ項目・3 個以上同じ項目がある列の組の数・同じ項目の数
  // 速くするため、札ごとに「項目 → 入っている列（12 ビット）」を先に作っておく
  function info(cells) {
    var mask = {};
    LINES.forEach(function (line, li) {
      line.forEach(function (p) { var x = cells[p]; if (x !== FREE) mask[x] = (mask[x] || 0) | (1 << li); });
    });
    return { cells: cells, mask: mask };
  }
  function compareInfo(A, B) {
    var a = A.cells, b = B.cells, samePos = 0, shared = 0, lineSim = 0, li, k;
    for (var i = 0; i < a.length; i++) {
      if (a[i] === FREE) continue;
      if (a[i] === b[i]) samePos++;
      if (B.mask[a[i]]) shared++;
    }
    for (li = 0; li < LINES.length; li++) {
      var cnt = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      LINES[li].forEach(function (p) {
        var m = a[p] === FREE ? 0 : (B.mask[a[p]] || 0);
        for (var bit = 0; m; bit++, m >>>= 1) if (m & 1) cnt[bit]++;
      });
      for (k = 0; k < LINES.length; k++) if (cnt[k] >= 3) lineSim++;
    }
    return { samePos: samePos, shared: shared, lineSim: lineSim };
  }
  function compare(a, b) { return compareInfo(info(a), info(b)); }

  // 置き方の点：前の札と「同じ位置の同じ出来事」と「3 個以上同じ出来事の列の組」の数（少ないほど良い）
  function layoutScore(cells, infos) {
    var ci = info(cells), s = [0, 0];
    infos.forEach(function (c) { var r = compareInfo(ci, c); s[0] += r.samePos; s[1] += r.lineSim; });
    return s;
  }
  function lt(a, b) { return a[0] !== b[0] ? a[0] < b[0] : a[1] < b[1]; }

  // 選んだ 24 個を並べる：ばらばらに置いてから、2 マスの入れ替えで点を下げる。0 になれば終わり
  function layout(picked, rnd, infos) {
    var spots = []; for (var p = 0; p < SIZE * SIZE; p++) if (p !== CENTER) spots.push(p);
    var best = null, bestS = null;
    for (var restart = 0; restart < LAYOUT_RESTARTS; restart++) {
      var cells = null;
      for (var tries = 0; tries < 300 && !cells; tries++) {
        var c = new Array(SIZE * SIZE); c[CENTER] = FREE;
        shuffle(spots, rnd).forEach(function (pos, k) { c[pos] = picked[k]; });
        if (fairLayout(c)) cells = c;
      }
      if (!cells) continue;
      var sc = layoutScore(cells, infos);
      for (var it = 0; it < LAYOUT_STEPS && (sc[0] || sc[1]); it++) {
        var a = spots[Math.floor(rnd() * spots.length)], b = spots[Math.floor(rnd() * spots.length)];
        if (a === b) continue;
        var tmp = cells[a]; cells[a] = cells[b]; cells[b] = tmp;
        var ns = fairLayout(cells) ? layoutScore(cells, infos) : null;
        if (ns && !lt(sc, ns)) sc = ns;               // 悪くならなければ受け入れる
        else { tmp = cells[a]; cells[a] = cells[b]; cells[b] = tmp; }
      }
      if (!best || lt(sc, bestS)) { best = cells.slice(); bestS = sc; }
      if (!bestS[0] && !bestS[1]) break;
    }
    return best;
  }

  // 24 個の選び方：段ごとに、これまでの札で使われた回数が少ない物から（同じ回数なら乱数で）
  function pickSet(rnd, usage) {
    var picked = [];
    TIERS.forEach(function (t) {
      var list = ITEMS[t].map(function (x) { return { x: x, k: (usage[x] || 0) + rnd() * 1.5 }; });
      list.sort(function (a, b) { return a.k - b.k; });
      picked = picked.concat(list.slice(0, PER_CARD[t]).map(function (o) { return o.x; }));
    });
    return picked;
  }
  function setScore(picked, sets) {
    var mx = 0, sum = 0;
    sets.forEach(function (s) {
      var n = 0; picked.forEach(function (x) { if (s[x]) n++; });
      mx = Math.max(mx, n); sum += n;
    });
    return [mx, sum];
  }

  // ゲームコードから n 枚。同じコードなら、どの端末でも同じ札になる
  var cache = {};
  function generateCards(code, n) {
    n = n || 16;
    var key = code + "/" + n;
    if (cache[key]) return cache[key];
    var rnd = rng("golf-bingo:" + code), cards = [], infos = [], sets = [], usage = {};
    for (var i = 0; i < n; i++) {
      var best = null, bestS = null;
      for (var t = 0; t < SET_CANDIDATES; t++) {
        var cand = pickSet(rnd, usage), sc = setScore(cand, sets);
        if (!best || lt(sc, bestS)) { best = cand; bestS = sc; }
      }
      var cells = layout(best, rnd, infos), set = {};
      best.forEach(function (x) { set[x] = true; usage[x] = (usage[x] || 0) + 1; });
      cards.push(cells); infos.push(info(cells)); sets.push(set);
    }
    cache[key] = cards;
    return cards;
  }

  // 全員分の違いの点検（画面に出す）
  function diversity(cards) {
    var maxShared = 0, samePosPairs = 0, lineSimPairs = 0, sum = 0, pairs = 0, dup = 0, seen = {};
    var infos = cards.map(info);
    for (var i = 0; i < cards.length; i++) {
      var k = cards[i].join("|"); if (seen[k]) dup++; seen[k] = true;
      for (var j = i + 1; j < cards.length; j++) {
        var r = compareInfo(infos[i], infos[j]);
        maxShared = Math.max(maxShared, r.shared); sum += r.shared; pairs++;
        if (r.samePos > 0) samePosPairs++;
        if (r.lineSim > 0) lineSimPairs++;
      }
    }
    return { cards: cards.length, pairs: pairs, maxShared: maxShared, avgShared: pairs ? sum / pairs : 0,
             samePosPairs: samePosPairs, lineSimPairs: lineSimPairs, duplicates: dup };
  }

  // 印の付いた位置（真ん中は最初から開いている）から、ビンゴの列とリーチの列
  function evaluate(marked) {
    var open = function (p) { return p === CENTER || !!marked[p]; };
    var bingo = [], reach = [], count = 0;
    for (var p = 0; p < SIZE * SIZE; p++) if (p !== CENTER && marked[p]) count++;
    LINES.forEach(function (line, idx) {
      var n = line.filter(open).length;
      if (n === SIZE) bingo.push(idx); else if (n === SIZE - 1) reach.push(idx);
    });
    return { bingo: bingo, reach: reach, marks: count };
  }

  // 並べる順：ビンゴの本数 → リーチの数 → 開いたマスの数（多いほど上）
  function rank(rows) {
    return rows.slice().sort(function (a, b) {
      return (b.bingo - a.bingo) || (b.reach - a.reach) || (b.marks - a.marks) || (a.no - b.no);
    });
  }

  // ---- 速報とミス大賞 ----
  // 開いたマスのうち「ミス」の数
  function missCount(cells, marks) {
    var n = 0;
    for (var p in (marks || {})) if (marks[p] && cells[p] && tierOf(cells[p]) === "miss") n++;
    return n;
  }
  // 前と今の各自の記録（番号 → {name, bingo, reach}）を比べて、速報にする出来事を出す
  //   ビンゴの本数が増えた → bingo（count は今の本数）／ビンゴは同じでリーチが増えた → reach
  function newsEvents(prev, next) {
    var out = [];
    Object.keys(next || {}).forEach(function (no) {
      var a = (prev && prev[no]) || { bingo: 0, reach: 0 }, b = next[no] || {};
      var nb = b.bingo || 0, nr = b.reach || 0, pb = a.bingo || 0, pr = a.reach || 0;
      if (nb > pb) out.push({ no: +no, name: b.name || "", type: "bingo", count: nb });
      else if (nb === pb && nr > pr) out.push({ no: +no, name: b.name || "", type: "reach", count: nr });
    });
    out.sort(function (x, y) { return x.no - y.no; });
    return out;
  }
  // ミス大賞：ミスをいちばん多く開けた人（同じ数なら全員）。1 つも無ければ空
  function missAward(rows) {
    var max = 0;
    rows.forEach(function (r) { max = Math.max(max, r.miss || 0); });
    if (!max) return { max: 0, winners: [] };
    return { max: max, winners: rows.filter(function (r) { return (r.miss || 0) === max; }).sort(function (a, b) { return a.no - b.no; }) };
  }

  // ---- 参加（ログイン）で空いている番号をランダムに引く ----
  function normName(s) {
    s = String(s || "");
    try { s = s.normalize("NFKC"); } catch (e) {}
    return s.replace(/\s+/g, "").toLowerCase();
  }
  // seats：{ "番号": {name, key} }。同じ端末（key）か同じ名前なら前の番号を返す。空きが無ければ full
  function pickSeat(seats, name, key, rand, n) {
    n = n || 16; rand = rand || Math.random; seats = seats || {};
    var no, nm = normName(name);
    for (no in seats) if (seats[no] && key && seats[no].key === key) return { no: +no, reused: true };
    for (no in seats) if (seats[no] && nm && normName(seats[no].name) === nm) return { no: +no, reused: true };
    var free = [];
    for (var i = 1; i <= n; i++) if (!seats[i] && !seats[String(i)]) free.push(i);
    if (!free.length) return { full: true };
    return { no: free[Math.floor(rand() * free.length)], reused: false };
  }

  // ゲームコード：読み違えやすい字（0/O・1/I など）を除いた 5 文字
  var CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  function newCode(rand) {
    rand = rand || Math.random;
    var s = ""; for (var i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)];
    return s;
  }
  function normCode(s) {
    s = String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    return s.length >= 3 && s.length <= 12 ? s : "";
  }

  // 参加者ごとの色（16 色を色相で分ける）
  function playerHue(no) { return Math.round(((no - 1) * 360 / 16 + 200) % 360); }

  root.BingoCore = {
    ITEMS: ITEMS, TIERS: TIERS, PER_CARD: PER_CARD, SIZE: SIZE, CENTER: CENTER, FREE: FREE, LINES: LINES,
    rng: rng, shuffle: shuffle, tierOf: tierOf, fairLayout: fairLayout, compare: compare,
    generateCards: generateCards, diversity: diversity, evaluate: evaluate, rank: rank,
    newCode: newCode, normCode: normCode, playerHue: playerHue, pickSeat: pickSeat, normName: normName,
    missCount: missCount, newsEvents: newsEvents, missAward: missAward
  };
})(typeof window !== "undefined" ? window : this);
