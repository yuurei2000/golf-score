/* ============================================================
   practice-core.js — TrackMan 45分練習記録 判定・集計ロジック（純関数）
   DOM・Storage に依存しない。test.html で単体テスト可能。
   ------------------------------------------------------------
   shot  : { n, club, target, score(2|1|0), carry?, total?, side?, path?, ftp?, speed?, miss?, at }
   block : { id, idx, startedAt, endedAt, plannedSec, actualSec, shots[], memo, sum }
   session: { id, date, startedAt, endedAt, place, status, blocks[], condition, fatigue, good, next, totals }
   ============================================================ */
const PracticeCore = (() => {

  /* ---- 既定の練習メニュー（仕様§3）。時間・球数・合格基準は設定で上書き可 ---- */
  const DEFAULT_TARGETS = { mid: [110, 116, 126, 135], short: [30, 50, 70, 90] };
  const DEFAULT_BLOCKS = [
    { id: "rh", name: "右片手打ち", min: 3, balls: 5, club: "PW / 9I / 8I", dist: "30〜50yd",
      method: "振り幅は腰から腰。左手は胸または右肩に添える",
      point: "右肘を軽く曲げたまま右脇付近で支え、手先でボールをすくわない",
      ok2: "ボールの先のマットにヘッドが触れ、20yd以上前進", ok1: "前進したが打点がずれた", ok0: "手前を大ダフリ・チョロ・右手だけでフェースを強く返す",
      crit: { minSuccess: 3, minAlive: 4, maxFatal: 1 } },
    { id: "lh", name: "左片手打ち", min: 3, balls: 5, club: "PW / 9I / 8I", dist: "20〜40yd",
      method: "振り幅は腰から腰。右手は胸または左肩に添える",
      point: "左肘を後ろに引かず、みぞおちと左肘を一緒に左へ運ぶ",
      ok2: "バランスを崩さず20yd以上前進", ok1: "前進したがバランスが崩れた", ok0: "左肩が急に上がる・首が詰まる・フェースを急激に返す",
      crit: { minSuccess: 3, minAlive: 4, maxFatal: 1 } },
    { id: "sh", name: "スプリットハンド", min: 4, balls: 8, club: "8I / 7I", dist: "80yd以上",
      method: "両手を5〜8cm離して握り、50〜80%のハーフスイングを6球。続けて通常グリップで同じ感覚で2球",
      point: "右手が左手を追い越さず、胸の回転でクラブを運ぶ",
      ok2: "80yd以上前進し、極端な左曲がりがない", ok1: "前進したが曲がりが大きい", ok0: "右手でクラブを返す・左肘が後ろに抜ける・フィニッシュで首が詰まる",
      crit: { minSuccess: 5, minAlive: 7, maxFatal: 1 } },
    { id: "i7", name: "7I大ミス撲滅", min: 8, balls: 10, club: "7I", dist: "100yd以上",
      method: "TrackMan：Shot Analysis。10球すべて毎回アドレスを解いて打つ",
      point: "チョロ・大曲がりをなくして安全に前進",
      ok2: "100yd以上前進 かつ 左右15yd以内", ok1: "100yd以上前進したが左右15yd超", ok0: "キャリー50yd未満・左右30yd以上・OB／林の奥相当",
      tm: ["carry", "side", "path", "ftp"], crit: { minSuccess: 7, minAlive: 8, maxFatal: 1 } },
    { id: "mid", name: "110〜135yd精度", min: 12, balls: 16, club: "距離に合う番手", dist: "110 / 116 / 126 / 135yd",
      method: "TrackMan：Performance Center・Test Center・Target Practice。各距離2球ずつ→残り8球はランダム",
      point: "スコア85に直結する距離の安定。Totalではなく Carry で評価",
      ok2: "目標から半径15yd以内", ok1: "グリーン周辺（15yd超だが寄せられる）", ok0: "致命的ミス（大きく外す・チョロ）",
      tm: ["carry", "side"], targets: "mid", crit: { minSuccess: 10, minAlive: 13, maxFatal: 1 } },
    { id: "short", name: "30〜90yd距離感", min: 6, balls: 8, club: "ウェッジ", dist: "30 / 50 / 70 / 90yd",
      method: "TrackMan：Performance Center・Target Practice。同じ距離を連続させずランダム",
      point: "確実なグリーンオン",
      ok2: "目標から15yd以内", ok1: "グリーン相当範囲", ok0: "グリーン外・ダフリ・トップ",
      tm: ["carry", "side"], targets: "short", crit: { minSuccess: 6, minAlive: 8, maxFatal: 0 } },
    { id: "dr", name: "ドライバーOB対策", min: 7, balls: 8, club: "DR", dist: "170yd以上",
      method: "TrackMan：Shot Analysis。フェアウェイ幅はセンターから左右20yd（合計40yd）",
      point: "飛距離より、170yd以上かつ次打可能な場所へ運ぶ",
      ok2: "170yd以上 かつ 次打可能（190ydのラフも成功）", ok1: "次打可能だが170yd未満", ok0: "OB想定（210ydのOBは失敗）・チョロ",
      tm: ["carry", "total", "side", "ftp", "speed"], crit: { minSuccess: 6, minAlive: 7, maxFatal: 1 } },
    { id: "test", name: "本番4球テスト", min: 2, balls: 4, club: "DR → 7I → 126yd → 50yd", dist: "—",
      method: "打ち直し禁止。1球ごとに 2点／1点／0点",
      point: "実戦評価。6点以上かつ0点なしで合格（最大8点）",
      ok2: "狙った範囲に入った", ok1: "ミスだが次が普通に打てる", ok0: "OB・池・チョロ・林の奥相当",
      tm: ["carry", "side"], targets: "test", crit: { kind: "test", minPoints: 6, maxFatal: 0 } }
  ];
  const TEST_SHOTS = ["DR：左右20yd以内", "7I：安全に100yd以上前進", "126yd：グリーン周辺", "50yd：グリーンオン"];
  const MISS_KINDS = ["左", "右", "ショート", "ダフリ", "トップ", "その他"];

  /* ---- 設定を既定にマージ（時間・球数・合格基準・目標距離を上書き） ---- */
  function buildMenu(settings) {
    const s = settings || {};
    const ov = s.blocks || {};
    return DEFAULT_BLOCKS.map(b => {
      const o = ov[b.id] || {};
      return Object.assign({}, b, { min: o.min ?? b.min, balls: o.balls ?? b.balls, crit: Object.assign({}, b.crit, o.crit || {}) });
    });
  }
  function totalMinutes(menu) { return menu.reduce((a, b) => a + b.min, 0); }

  /* ---- 各ブロックの目標距離列（球ごと）。mid：各距離2球→残りランダム、short：各2球をランダム順（同距離連続なし） ---- */
  function targetsFor(block, settings, rng) {
    const r = rng || Math.random;
    const tg = Object.assign({}, DEFAULT_TARGETS, (settings && settings.targets) || {});
    const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    if (block.targets === "test") return TEST_SHOTS.slice();
    if (block.targets === "mid") {
      const base = []; tg.mid.forEach(d => { base.push(d, d); });
      const rest = []; for (let i = base.length; i < block.balls; i++) rest.push(tg.mid[Math.floor(r() * tg.mid.length)]);
      return base.concat(rest).slice(0, block.balls).map(d => `${d}yd`);
    }
    if (block.targets === "short") {
      let arr = []; tg.short.forEach(d => { arr.push(d, d); });
      for (let t = 0; t < 50; t++) { shuffle(arr); if (arr.every((v, i) => i === 0 || v !== arr[i - 1])) break; }
      while (arr.length < block.balls) arr.push(tg.short[Math.floor(r() * tg.short.length)]);
      return arr.slice(0, block.balls).map(d => `${d}yd`);
    }
    return Array.from({ length: block.balls }, () => block.dist);
  }

  /* ---- ショット集計（§8）：評価2＝成功、1＝許容、0＝致命的 ---- */
  function summarize(shots) {
    const sh = shots || [];
    const s = sh.filter(x => x.score === 2).length, ok = sh.filter(x => x.score === 1).length, fatal = sh.filter(x => x.score === 0).length;
    const balls = sh.length, points = s * 2 + ok, max = balls * 2;
    const num = k => sh.map(x => x[k]).filter(v => v != null && v !== "" && !isNaN(Number(v))).map(Number);
    const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10 : null;
    const sides = num("side");
    return { balls, s, ok, fatal, points, max,
      rate: balls ? Math.round(points / max * 100) : 0,
      alive: balls ? Math.round((s + ok) / balls * 100) : 0,
      fatalRate: balls ? Math.round(fatal / balls * 100) : 0,
      avgCarry: avg(num("carry")), avgFtp: avg(num("ftp")), avgSpeed: avg(num("speed")),
      maxSide: sides.length ? Math.max(...sides.map(Math.abs)) : null,
      miss: MISS_KINDS.reduce((m, k) => { m[k] = sh.filter(x => x.miss === k).length; return m; }, {}) };
  }

  /* ---- ブロック合否 ---- */
  function judgeBlock(block, sum) {
    const c = block.crit || {};
    if (!sum.balls) return false;
    if (c.kind === "test") return sum.points >= (c.minPoints ?? 6) && sum.fatal <= (c.maxFatal ?? 0);
    return sum.s >= (c.minSuccess ?? 0) && (sum.s + sum.ok) >= (c.minAlive ?? 0) && sum.fatal <= (c.maxFatal ?? 99);
  }
  /* ---- 本番4球テスト（§3・§8）：6点以上かつ0点なし ---- */
  function judgeTest(shots) {
    const sum = summarize(shots);
    return { points: sum.points, max: sum.max, pass: sum.balls >= 4 && sum.points >= 6 && sum.fatal === 0, fatal: sum.fatal };
  }

  /* ---- セッション集計（§5.4）：総合達成率＝獲得点数÷最大点数 ---- */
  function summarizeSession(session, menu) {
    const blocks = session.blocks || [];
    let points = 0, max = 0, balls = 0, fatal = 0, passed = 0;
    const perBlock = blocks.map(b => {
      const def = (menu || DEFAULT_BLOCKS).find(m => m.id === b.id) || {};
      const sum = summarize(b.shots); const pass = judgeBlock(def, sum);
      points += sum.points; max += sum.max; balls += sum.balls; fatal += sum.fatal; if (pass) passed++;
      return { id: b.id, name: def.name || b.id, sum, pass };
    });
    const tb = blocks.find(b => b.id === "test");
    const test = tb ? judgeTest(tb.shots) : null;
    const dur = (session.endedAt && session.startedAt) ? Math.round((session.endedAt - session.startedAt - (session.pausedMs || 0)) / 60000) : null;
    return { balls, points, max, rate: max ? Math.round(points / max * 100) : 0, fatal, passed, blocks: perBlock.length, perBlock, test, durationMin: dur };
  }

  /* ---- タイマー（§11）：時刻差分から復元。state={startedAt, pausedAt|null, pausedMs} ---- */
  function elapsedMs(t, now) {
    if (!t || t.startedAt == null) return 0;
    const end = t.pausedAt || now;
    return Math.max(0, end - t.startedAt - (t.pausedMs || 0));
  }
  function pause(t, now) { if (!t.pausedAt) t.pausedAt = now; return t; }
  function resume(t, now) { if (t.pausedAt) { t.pausedMs = (t.pausedMs || 0) + (now - t.pausedAt); t.pausedAt = null; } return t; }
  function fmt(ms) { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }

  /* ---- 履歴分析（§5.5）：期間内のセッションからブロック別達成率・各種率・推移 ---- */
  function analyze(sessions, menu, days, now) {
    const m = menu || DEFAULT_BLOCKS;
    const since = days ? (now || Date.now()) - days * 86400000 : 0;
    const list = (sessions || []).filter(s => s.status !== "running" && (s.startedAt || 0) >= since).sort((a, b) => a.startedAt - b.startedAt);
    const byBlock = {};
    m.forEach(b => { byBlock[b.id] = { name: b.name, sessions: 0, passed: 0, balls: 0, s: 0, ok: 0, fatal: 0, carry: [], side: [], ftp: [] }; });
    const trend = [];
    list.forEach(s => {
      const ss = summarizeSession(s, m);
      trend.push({ date: s.date, rate: ss.rate, test: ss.test ? ss.test.points : null, fatal: ss.fatal, balls: ss.balls });
      (s.blocks || []).forEach(b => {
        const a = byBlock[b.id]; if (!a) return;
        const sum = summarize(b.shots); if (!sum.balls) return;
        a.sessions++; if (judgeBlock(m.find(x => x.id === b.id), sum)) a.passed++;
        a.balls += sum.balls; a.s += sum.s; a.ok += sum.ok; a.fatal += sum.fatal;
        (b.shots || []).forEach(sh => { if (sh.carry != null && sh.carry !== "") a.carry.push(Number(sh.carry)); if (sh.side != null && sh.side !== "") a.side.push(Number(sh.side)); if (sh.ftp != null && sh.ftp !== "") a.ftp.push(Number(sh.ftp)); });
      });
    });
    const pct = (a, b) => b ? Math.round(a / b * 100) : null;
    const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10 : null;
    const blocks = Object.keys(byBlock).map(id => { const a = byBlock[id]; return { id, name: a.name, sessions: a.sessions, passRate: pct(a.passed, a.sessions), successRate: pct(a.s, a.balls), aliveRate: pct(a.s + a.ok, a.balls), fatalRate: pct(a.fatal, a.balls), avgCarry: avg(a.carry), avgSide: avg(a.side), avgFtp: avg(a.ftp), balls: a.balls }; });
    const g = id => blocks.find(b => b.id === id) || {};
    return { sessions: list.length, trend, blocks,
      i7FatalRate: g("i7").fatalRate, midInCircleRate: g("mid").successRate, drAliveRate: g("dr").aliveRate, drObRate: g("dr").fatalRate, shortGreenRate: g("short").aliveRate,
      avgRate: list.length ? Math.round(trend.reduce((a, t) => a + t.rate, 0) / list.length) : null };
  }
  /* ---- 連続練習日数（今日または昨日から遡る） ---- */
  function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
  function streak(sessions, todayStr) {
    const days = new Set((sessions || []).filter(s => s.status !== "running").map(s => s.date));
    const d = new Date(todayStr + "T00:00:00"); let n = 0;
    if (!days.has(todayStr)) d.setDate(d.getDate() - 1);
    while (days.has(ymd(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  /* ---- 今週の重点課題（直近30日で達成率が最も低いブロック） ---- */
  function focusOf(an) {
    const c = (an.blocks || []).filter(b => b.sessions > 0).sort((a, b) => (a.passRate ?? 101) - (b.passRate ?? 101));
    return c.length ? c[0] : null;
  }
  /* ---- CSV（§9） ---- */
  function toCSV(sessions, menu) {
    const m = menu || DEFAULT_BLOCKS;
    const head = ["日付", "セッションID", "ブロック", "球番号", "クラブ", "目標", "評価", "Carry", "Total", "Side", "ClubPath", "FaceToPath", "ClubSpeed", "ミス分類", "入力時刻"];
    const rows = [head];
    (sessions || []).forEach(s => (s.blocks || []).forEach(b => { const def = m.find(x => x.id === b.id) || {}; (b.shots || []).forEach(sh => rows.push([s.date, s.id, def.name || b.id, sh.n, sh.club || "", sh.target || "", sh.score, sh.carry ?? "", sh.total ?? "", sh.side ?? "", sh.path ?? "", sh.ftp ?? "", sh.speed ?? "", sh.miss || "", sh.at ? new Date(sh.at).toISOString() : ""])); }));
    const esc = v => { v = String(v ?? ""); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return rows.map(r => r.map(esc).join(",")).join("\r\n");
  }

  return { DEFAULT_BLOCKS, DEFAULT_TARGETS, TEST_SHOTS, MISS_KINDS, buildMenu, totalMinutes, targetsFor,
    summarize, judgeBlock, judgeTest, summarizeSession, elapsedMs, pause, resume, fmt, analyze, streak, focusOf, toCSV };
})();
if (typeof module !== "undefined") module.exports = PracticeCore;
