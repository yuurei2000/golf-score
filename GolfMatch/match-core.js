/* ============================================================
   match-core.js — 総当たりマッチプレー 計算ロジック（純関数）
   DOM・Firebase・LocalStorage に一切依存しない。test.html で単体テスト可能。
   ------------------------------------------------------------
   入力の形：
     player : { id, name, groupNo, handicap, displayOrder }
     hole   : { no:1..18, par:3..6, hcp:1..18 }
     scores : { [playerId]: { [holeNo]: grossScore } }   ← 未入力ホールはキー自体が無い
   ============================================================ */
const MatchCore = (() => {

  /* ---- ハンデ配分（§8〜10）----
     2人のハンデ差を、Hole HDCP順に1打ずつ配る。18を超える差は全ホールに base 打配ったうえで
     余り分を HDCP 1〜extra のホールへ追加（差36以上でも同式で対応）。 */
  function calculateStrokeAllowance(hcpA, hcpB, holeHcp, handicapEnabled) {
    if (!handicapEnabled) return { a: 0, b: 0 };
    const diff = Math.abs((hcpA || 0) - (hcpB || 0));
    if (diff === 0) return { a: 0, b: 0 };
    const base = Math.floor(diff / 18), extra = diff % 18;
    const strokes = base + (holeHcp <= extra ? 1 : 0);
    return (hcpA > hcpB) ? { a: strokes, b: 0 } : { a: 0, b: strokes };
  }

  /* ---- ネットスコア（§11）---- */
  function calculateNetScore(gross, allowance) { return gross - (allowance || 0); }

  /* ---- 1ホールの勝敗 ---- */
  function calculateHoleResult(netA, netB) {
    return netA < netB ? "A" : netB < netA ? "B" : "AS";
  }

  /* ---- 1マッチの状況（§15・§32）----
     両者が入力済みのホールだけをホール番号順に採点する（組の進行差に対応）。
     |UP| が残りホール数を超えた時点で成立（例：16H終了 3UP → 3&2）。
     戻り値：{ a, b, up(正=Aリード), thru, closed, finished, leader, label, holes[], outcomeA } */
  /* ---- プレー順（INスタートなら 10→18→1→9）---- */
  function playOrder(startSide) {
    const a = Array.from({ length: 18 }, (_, i) => i + 1);
    return startSide === "in" ? a.slice(9).concat(a.slice(0, 9)) : a;
  }

  /* ---- ホールのハンデ順位：プレイヤー別ランダムモードでは各自の順位表（player.hcpRanks[holeNo]）を使う ---- */
  function holeRankFor(player, hole, perPlayer) {
    return (perPlayer && player && player.hcpRanks && player.hcpRanks[hole.no]) ? player.hcpRanks[hole.no] : hole.hcp;
  }
  /* ---- 対戦でのホール別ハンデ ----
     通常：2人のハンデ差を Hole HDCP 順に配る（calculateStrokeAllowance）
     プレイヤー別ランダム：各自のハンデを各自専用のランダム順位で配り、ネット同士で勝負（同じハンデでも付くホールが違う） */
  function matchAllowance(pA, pB, h, handicapEnabled, perPlayer) {
    if (!handicapEnabled) return { a: 0, b: 0 };
    if (perPlayer) return { a: personalAllowance(pA.handicap, holeRankFor(pA, h, true), true),
                            b: personalAllowance(pB.handicap, holeRankFor(pB, h, true), true) };
    return calculateStrokeAllowance(pA.handicap, pB.handicap, h.hcp, true);
  }

  function calculateMatchStatus(pA, pB, holes, scores, handicapEnabled, holeOrder, opts) {
    const perPlayer = !!(opts && opts.perPlayer);
    const sa = (scores && scores[pA.id]) || {}, sb = (scores && scores[pB.id]) || {};
    const order = (holeOrder && holeOrder.length) ? holeOrder : playOrder("out");
    const total = order.length;                     // 18Hマッチなら18、ナッソーの前半/後半なら9
    const byNo = {}; holes.forEach(h => { byNo[h.no] = h; });
    let up = 0, thru = 0, closed = false, closeUp = 0, closeThru = 0;
    const detail = [];
    for (let idx = 0; idx < order.length; idx++) {   // プレー順に採点（残りホール数もプレー順で数える）
      const h = byNo[order[idx]]; if (!h) continue;
      const ga = sa[h.no], gb = sb[h.no];
      if (ga == null || gb == null) continue;      // 片方でも未入力なら対象外
      const al = matchAllowance(pA, pB, h, handicapEnabled, perPlayer);
      const na = calculateNetScore(ga, al.a), nb = calculateNetScore(gb, al.b);
      const r = calculateHoleResult(na, nb);
      if (r === "A") up++; else if (r === "B") up--;
      thru = idx + 1;                              // 消化ホール数（プレー順の位置）
      detail.push({ no: h.no, par: h.par, hcp: h.hcp, grossA: ga, grossB: gb,
        allowA: al.a, allowB: al.b, netA: na, netB: nb, result: r, up });
      if (!closed && Math.abs(up) > total - thru) { closed = true; closeUp = up; closeThru = thru; }
    }
    const upAll = up, thruAll = thru;             // 最終ホールまで採点した通算（成立後も参考表示用に計算）
    if (closed) { up = closeUp; thru = closeThru; } // 勝敗・順位は成立時点の値で確定
    const remaining = total - thru;
    const finished = closed || thru === total;
    const leader = up > 0 ? "A" : up < 0 ? "B" : null;
    let label;
    if (finished) {
      if (up === 0) label = "AS";
      else if (closed && remaining > 0) label = `${Math.abs(up)}&${remaining}`;
      else label = `${Math.abs(up)}UP`;
    } else {
      label = up === 0 ? "AS" : `${Math.abs(up)}UP`;
    }
    const outcomeA = finished ? (up > 0 ? "W" : up < 0 ? "L" : "D") : (up > 0 ? "w" : up < 0 ? "l" : "d"); // 小文字＝暫定
    return { a: pA, b: pB, up, thru, closed, finished, leader, label, holes: detail, outcomeA, upAll, thruAll };
  }

  /* ---- 全プレイヤーの総当たり（§13・§14）---- 組をまたいで C(n,2) を生成 */
  function calculateAllMatches(players, holes, scores, handicapEnabled, holeOrder, opts) {
    const ps = players.slice().sort((x, y) => (x.displayOrder || 0) - (y.displayOrder || 0));
    const out = [];
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++)
        out.push(calculateMatchStatus(ps[i], ps[j], holes, scores, handicapEnabled, holeOrder, opts));
    return out;
  }

  /* ---- ナッソー：前半9H・後半9H・18H合計の3勝負（プレー順の前9／後9で区切る）---- */
  function calculateNassau(pA, pB, holes, scores, handicapEnabled, holeOrder, opts) {
    const order = (holeOrder && holeOrder.length === 18) ? holeOrder : playOrder("out");
    return {
      a: pA, b: pB,
      front: calculateMatchStatus(pA, pB, holes, scores, handicapEnabled, order.slice(0, 9), opts),
      back:  calculateMatchStatus(pA, pB, holes, scores, handicapEnabled, order.slice(9), opts),
      total: calculateMatchStatus(pA, pB, holes, scores, handicapEnabled, order, opts)
    };
  }
  function calculateAllNassau(players, holes, scores, handicapEnabled, holeOrder, opts) {
    const ps = players.slice().sort((x, y) => (x.displayOrder || 0) - (y.displayOrder || 0));
    const out = [];
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++)
        out.push(calculateNassau(ps[i], ps[j], holes, scores, handicapEnabled, holeOrder, opts));
    return out;
  }
  /* ナッソーの3勝負を順位計算用にフラットにする（前半・後半・合計を1勝負ずつ数える） */
  function flattenNassau(pairs) {
    const out = [];
    pairs.forEach(p => { out.push(p.front, p.back, p.total); });
    return out;
  }

  /* ---- スキンズ：各ホール、単独最少ネット（スクラッチならグロス）の人がスキンを獲得。同点は次ホールへ持ち越し。
     全員が入力済みのホールだけ判定（組の進行差に対応）。ネットは個人ハンデ配分（プレイヤー別ランダムなら各自の順位表）。 ---- */
  function calculateSkins(players, holes, scores, handicapEnabled, holeOrder, opts) {
    const perPlayer = !!(opts && opts.perPlayer);
    const order = (holeOrder && holeOrder.length) ? holeOrder : playOrder("out");
    const byNo = {}; holes.forEach(h => { byNo[h.no] = h; });
    const totals = {}; players.forEach(p => { totals[p.id] = 0; });
    const rows = []; let carry = 0, played = 0;
    for (const no of order) {
      const h = byNo[no]; if (!h) continue;
      const nets = players.map(p => {
        const g = (scores[p.id] || {})[no];
        return { p, gross: g, net: g == null ? null : g - personalAllowance(p.handicap, holeRankFor(p, h, perPlayer), handicapEnabled) };
      });
      if (nets.some(n => n.net == null)) { rows.push({ no, par: h.par, pending: true, nets }); continue; }   // 未入力者がいる → 判定保留
      played++;
      const min = Math.min(...nets.map(n => n.net));
      const winners = nets.filter(n => n.net === min);
      if (winners.length === 1) {
        const won = carry + 1; totals[winners[0].p.id] += won;
        rows.push({ no, par: h.par, winner: winners[0].p, skins: won, carryIn: carry, nets });
        carry = 0;
      } else {
        carry++;
        rows.push({ no, par: h.par, winner: null, skins: 0, carryIn: carry - 1, tie: winners.map(w => w.p), nets });
      }
    }
    const ranking = players.slice().sort((x, y) => (totals[y.id] - totals[x.id]) || ((x.displayOrder || 0) - (y.displayOrder || 0)));
    let rank = 0, prev = null;
    const rankRows = ranking.map((p, i) => { if (totals[p.id] !== prev) { rank = i + 1; prev = totals[p.id]; } return { player: p, skins: totals[p.id], rank }; });
    return { rows, totals, carry, played, ranking: rankRows };
  }

  /* ---- 順位（§22・§23）----
     W/D/L は成立済みは確定値、未成立は現在のリード状態で暫定集計。
     順位キー：勝利数 → 引分数 → 全マッチのUP/DOWN合計。未成立が1つでもあれば provisional=true */
  function calculatePlayerStandings(players, matches) {
    const rows = {};
    players.forEach(p => { rows[p.id] = { player: p, w: 0, d: 0, l: 0, upSum: 0, finishedAll: true }; });
    let provisional = false;
    matches.forEach(m => {
      const ra = rows[m.a.id], rb = rows[m.b.id];
      if (!ra || !rb) return;
      if (!m.finished) { provisional = true; ra.finishedAll = rb.finishedAll = false; }
      if (m.up > 0) { ra.w++; rb.l++; } else if (m.up < 0) { rb.w++; ra.l++; } else { ra.d++; rb.d++; }
      ra.upSum += m.up; rb.upSum -= m.up;
    });
    const list = Object.values(rows).sort((x, y) => (y.w - x.w) || (y.d - x.d) || (y.upSum - x.upSum) ||
      ((x.player.displayOrder || 0) - (y.player.displayOrder || 0)));
    let rank = 0, prevKey = null;
    list.forEach((r, i) => {
      const key = `${r.w}/${r.d}/${r.upSum}`;
      if (key !== prevKey) { rank = i + 1; prevKey = key; }   // 同成績は同順位
      r.rank = rank;
    });
    return { rows: list, provisional };
  }

  /* ---- マッチ表示用ラベル（例：「山科 2UP」「AS」「高橋 3&2」）---- */
  function matchLabel(m) {
    if (m.up === 0) return m.finished ? "AS（引分）" : "AS";
    const name = m.up > 0 ? m.a.name : m.b.name;
    return `${name} ${m.label}`;
  }

  /* ---- 個人ハンデのホール配分（スコア表のネット表示・入力画面の目安用）----
     プレイヤーハンデを Hole HDCP 順（ランダム配分の場合はゲーム作成時に割り当てた順位）に1打ずつ配る。
     18ホール分の合計はハンデと一致する。対戦の勝敗はこれではなく2人のハンデ差（calculateStrokeAllowance）で判定。 */
  function personalAllowance(hcp, holeHcp, handicapEnabled) {
    if (!handicapEnabled || !hcp) return 0;
    return Math.floor(hcp / 18) + (holeHcp <= hcp % 18 ? 1 : 0);
  }

  /* ---- ストローク集計（§24）---- gross/net とも Par との差（±）を返す */
  function strokeSummary(player, holes, scores, handicapEnabled, perPlayer) {
    const s = (scores && scores[player.id]) || {};
    const sum = (from, to) => { let t = 0, n = 0; for (let h = from; h <= to; h++) if (s[h] != null) { t += s[h]; n++; } return { total: t, holes: n }; };
    const out = sum(1, 9), inn = sum(10, 18);
    const gross = out.total + inn.total, played = out.holes + inn.holes;
    const playedHoles = holes.filter(h => s[h.no] != null);
    const parPlayed = playedHoles.reduce((a, h) => a + h.par, 0);
    const allow = playedHoles.reduce((a, h) => a + personalAllowance(player.handicap, holeRankFor(player, h, perPlayer), handicapEnabled), 0);
    const net = gross - allow;
    return { out: out.total, in: inn.total, gross, played, parPlayed, allow, net,
      diff: gross - parPlayed, netDiff: net - parPlayed };
  }

  /* ---- コース検証（§26）---- */
  function validateCourse(course) {
    const errs = [];
    if (!course.name || !course.name.trim()) errs.push("ゴルフ場名を入力してください");
    const holes = course.holes || [];
    if (holes.length !== 18) errs.push("18ホール分の情報が必要です");
    holes.forEach(h => { if (!(h.par >= 3 && h.par <= 6)) errs.push(`${h.no}H：Parは3〜6で入力してください`); });
    const hcps = holes.map(h => Number(h.hcp)).filter(v => v >= 1 && v <= 18);
    const set = new Set(hcps);
    if (hcps.length !== 18) errs.push("Hole HDCPは1〜18をすべてのホールに入力してください");
    else if (set.size !== 18) {
      const dup = hcps.filter((v, i) => hcps.indexOf(v) !== i);
      errs.push(`Hole HDCPが重複しています：${[...new Set(dup)].join(", ")}`);
    }
    return errs;
  }

  /* ---- ランダム配分：1〜18の順位をシャッフル（ゲーム作成時に1回だけ確定・§ギャンブル要素）---- */
  function randomHcpOrder(rng) {
    const r = rng || Math.random;
    const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const front = shuffle(Array.from({ length: 9 }, (_, i) => i)), back = shuffle(Array.from({ length: 9 }, (_, i) => i + 9));
    const frontOdd = r() < 0.5;                    // 奇数順位を前半に置くか（1番がどちらの半分かもランダム）
    const ranks = new Array(18);
    let fi = 0, bi = 0;
    for (let rank = 1; rank <= 18; rank++) {       // 順位を前半・後半に交互に割り当て → どのハンデ数でも前後半ほぼ半分ずつ
      const useFront = (rank % 2 === 1) === frontOdd;
      ranks[useFront ? front[fi++] : back[bi++]] = rank;
    }
    return ranks;
  }


  return { calculateStrokeAllowance, calculateNetScore, calculateHoleResult, calculateMatchStatus,
    calculateAllMatches, calculateNassau, calculateAllNassau, flattenNassau, calculateSkins,
    calculatePlayerStandings, matchLabel, strokeSummary, personalAllowance, holeRankFor, matchAllowance,
    randomHcpOrder, playOrder, validateCourse };
})();
if (typeof module !== "undefined") module.exports = MatchCore;
