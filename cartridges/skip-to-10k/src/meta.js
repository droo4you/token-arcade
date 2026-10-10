// Meta game: history headlines, missions and ranks, the rock garden, banter. No DOM.
const META = (() => {
  const GENESIS = Date.UTC(2015, 6, 30);
  const dayOf = iso => { const [y, m, d] = iso.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - GENESIS) / 864e5); };

  // Breaking news as the rock passes each date. Real events, short enough for the bitmap font.
  const NEWS = [
    ['2015-07-30', 'FRONTIER GOES LIVE. THE WORLD COMPUTER BOOTS'],
    ['2015-08-07', 'ETH STARTS TRADING AROUND 3 DOLLARS'],
    ['2016-03-14', 'HOMESTEAD UPGRADE SHIPS'],
    ['2016-06-17', 'THE DAO GETS DRAINED'],
    ['2016-07-20', 'HARD FORK. ETHEREUM CLASSIC IS BORN'],
    ['2017-06-12', 'ICO MANIA. EVERYONE HAS A WHITEPAPER'],
    ['2017-10-16', 'BYZANTIUM UPGRADE'],
    ['2017-12-04', 'CRYPTOKITTIES CLOG THE CHAIN'],
    ['2017-12-26', '100 ETHER ROCKS EXIST. THEY DO NOTHING'],
    ['2018-01-13', 'ETH TOPS 1,400. NEVER GOING DOWN'],
    ['2018-12-15', 'ETH NEAR 80 DOLLARS. IT WENT DOWN'],
    ['2019-02-28', 'CONSTANTINOPLE UPGRADE'],
    ['2020-03-12', 'BLACK THURSDAY'],
    ['2020-06-15', 'YIELD FARMING KICKS OFF DEFI SUMMER'],
    ['2020-12-01', 'THE BEACON CHAIN GOES LIVE'],
    ['2021-03-11', 'A JPEG SELLS FOR 69 MILLION'],
    ['2021-04-23', 'BORED APES MINT'],
    ['2021-08-05', 'LONDON UPGRADE. FEES START BURNING'],
    ['2021-08-23', 'ETHER ROCKS SELL FOR MILLIONS. STILL ROCKS'],
    ['2021-11-10', 'ETH HITS 4,878. SEE YOU AT 10K'],
    ['2022-05-09', 'AN ALGO STABLECOIN UNSTABLES'],
    ['2022-09-15', 'THE MERGE. PROOF OF STAKE. 99.95% LESS ENERGY'],
    ['2022-11-11', 'AN EXCHANGE FALLS OVER'],
    ['2023-04-12', 'SHAPELLA. STAKED ETH CAN WITHDRAW'],
    ['2024-03-13', 'DENCUN BRINGS BLOBS'],
    ['2024-05-23', 'THE SUITS APPROVE SPOT ETH ETFS'],
    ['2024-07-23', 'ETH ETFS START TRADING'],
    ['2024-10-20', 'FARTCOIN. YES REALLY'],
    ['2025-05-07', 'PECTRA UPGRADE'],
    ['2025-08-24', 'NEW ATH 4,953. TEN K WHEN'],
    ['2025-11-20', 'SKRUMPEYS SKRUMP ONTO MONAD'],
    ['2025-12-03', 'FUSAKA UPGRADE'],
    ['2026-10-08', 'YOU ARE HERE. STILL NOT 10K'],
  ].map(([d, t]) => ({ day: dayOf(d), date: d, text: t }));

  // Missions: three are active at a time, in this order. c = per-run counts, r = results.
  const n = (c, k) => c[k] || 0;
  const MISSIONS = [
    ['SKIP 10 TIMES IN ONE RUN', 20, (r) => r.skips >= 10],
    ['REACH THE DAO', 25, (r) => r.days >= 300],
    ['GET A 3X PERFECT STREAK', 25, (r) => r.bestStreak >= 3],
    ['MAX POWER THROW IN THE SKIP ZONE', 30, (r, c) => n(c, 'line') >= 1],
    ['COLLECT 15 GEMS IN ONE RUN', 30, (r) => r.gems >= 15],
    ['REACH DAY 300 WITHOUT BOUNCING', 35, (r, c) => r.days >= 300 && n(c, 't:BOING') === 0],
    ['GET REJECTED AT THE ATH', 40, (r, c) => n(c, 'rejected') >= 1],
    ['REACH ICO MANIA', 40, (r) => r.days >= 640],
    ['HIT A FART CLOUD', 40, (r, c) => n(c, 't:MINI PUMP') >= 1],
    ['RIDE A WHALE BUY', 50, (r, c) => n(c, 't:WHALE BUY') >= 1],
    ['SKIP 30 TIMES IN ONE RUN', 60, (r) => r.skips >= 30],
    ['GET A 6X PERFECT STREAK', 60, (r) => r.bestStreak >= 6],
    ['SURVIVE CRYPTO WINTER', 80, (r) => r.days >= 1780],
    ['TAKE THE HARD FORK', 80, (r, c) => n(c, 'fork') >= 1],
    ['CATCH AN AIRDROP', 80, (r, c) => n(c, 'airdrop') + n(c, 'scam') >= 1],
    ['COLLECT 40 GEMS IN ONE RUN', 100, (r) => r.gems >= 40],
    ['BREAK THE ATH', 150, (r) => r.broke5k],
    ['APE IN ON THE YACHT', 120, (r, c) => n(c, 'yacht') >= 1],
    ['BOUNCE OFF KEVIN', 120, (r, c) => n(c, 'kevin') >= 1],
    ['REACH THE MERGE', 150, (r) => r.days >= 2550],
    ['GO ULTRASOUND', 150, (r, c) => n(c, 'bat') >= 1],
    ['CATCH 3 INFLOWS IN ONE RUN', 200, (r, c) => n(c, 'suit') >= 3],
    ['GET A 10X PERFECT STREAK', 200, (r) => r.bestStreak >= 10],
    ['SKRUMP 3 SKRUMPEYS', 250, (r, c) => n(c, 'skrump') >= 3],
    ['REACH MEME SEASON', 300, (r) => r.days >= 3440],
    ['SKIP 80 TIMES IN ONE RUN', 300, (r) => r.skips >= 80],
    ['REACH TODAY', 400, (r) => r.days >= 4088],
    ['BREAK 10K', 600, (r) => r.broke10k],
    ['REACH FOREVER', 600, (r) => r.days >= 4238],
    ['GET REJECTED 5 TIMES IN ONE RUN', 400, (r, c) => n(c, 'rejected') >= 5],
    ['GET DUMPED ON 3 TIMES IN ONE RUN', 400, (r, c) => n(c, 'dump') >= 3],
    ['COLLECT 150 GEMS IN ONE RUN', 800, (r) => r.gems >= 150],
    ['GET A 25X PERFECT STREAK', 1000, (r) => r.bestStreak >= 25],
    ['REACH DAY 8000', 1200, (r) => r.days >= 8000],
    ['REACH DAY 20000. FOREVER IS LONG', 2000, (r) => r.days >= 20000],
  ].map(([text, reward, check], i) => ({ i, text, reward, check }));

  const RANKS = ['PLANKTON', 'SHRIMP', 'CRAB', 'FISH', 'FROG', 'DOLPHIN', 'SHARK', 'ORCA', 'WHALE', 'DIAMOND HANDS', 'OG', 'ETHER ROCK'];
  const rankOf = done => Math.min(RANKS.length - 1, Math.floor(done / 3));

  // The three active missions for a save: the first three not done yet.
  function active(save) {
    const done = save.missions || [];
    return MISSIONS.filter(m => !done.includes(m.i)).slice(0, 3);
  }
  // Check active missions against a finished run. Returns the newly completed ones.
  function complete(save, r, counts) {
    save.missions = save.missions || [];
    const got = active(save).filter(m => m.check(r, counts));
    for (const m of got) save.missions.push(m.i);
    return got;
  }

  // Rock garden: 100 rocks. Every rock you buy makes the next one cost more. That is how rocks work.
  const rockPrice = owned => Math.round(25 * Math.pow(1.22, Math.max(0, owned - 1)));
  function buyRock(save, rnd = Math.random) {
    const owned = save.rocks;
    if (owned.length >= 100) return null;
    const price = rockPrice(owned.length);
    if (save.gwei < price) return null;
    let k;
    do k = Math.floor(rnd() * 100); while (owned.includes(k));
    save.gwei -= price; owned.push(k);
    return k;
  }
  // gwei multiplier: +5% per rank, +2% per extra rock
  const multiplier = save => 1 + 0.05 * rankOf((save.missions || []).length) + 0.02 * Math.max(0, (save.rocks || []).length - 1);

  // RC and Droober talk like the timeline
  const BANTER = {
    idle: ['GM', 'WEN 10K', 'FEW', 'LFG', 'UP ONLY', 'NFA', 'WAGMI', 'SER', 'HODL', 'WE ARE SO BACK', 'ZOOM OUT', 'THIS IS FINE', 'STAY HUMBLE', 'BULLISH ON ROCKS'],
    rejected: ['SER THAT WAS THE ATH', 'ITS SO OVER', 'REJECTED AGAIN', 'DOUBLE TOP?'],
    breakout: ['WE ARE SO BACK', 'PRICE DISCOVERY', 'SCREENSHOT IT', 'LFG'],
    dump: ['WHO SOLD', 'EXIT LIQUIDITY', 'PAPER HANDS'],
    bounce: ['BOING', 'SPRING LOADED', 'UP WE GO', 'DEAD CAT BOUNCE'],
    perfect: ['CLEAN', 'NICE SKIP', 'SMOOTH'],
    slow: ['ITS SO OVER', 'CHOP CHOP', 'RANGE BOUND'],
    kevin: ['KEVIN!!', 'KEVINNN'],
    airdrop: ['FREE MONEY', 'CLAIM IT'],
    scam: ['NEVER CLICK THE LINK', 'CLASSIC'],
    fell: ['DROOBER NO', 'SWIM FASTER', 'THE DOCK ENDS SER'],
  };

  return { NEWS, MISSIONS, RANKS, rankOf, active, complete, rockPrice, buyRock, multiplier, BANTER, dayOf };
})();
if (typeof module !== 'undefined') module.exports = META;
