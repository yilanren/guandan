/**
 * 掼蛋牌型引擎 - 牌型识别、大小比较、洗牌发牌
 */

// 花色
const SUITS = ['S', 'H', 'C', 'D'];  // 黑桃 红桃 梅花 方块
const SUIT_NAMES = { S: 'spades', H: 'hearts', C: 'clubs', D: 'diamonds' };

// 点数（从小到大，2最小，大王最大；LEVEL是级牌的临时位置，介于A和王之间）
const RANK_ORDER = ['2','3','4','5','6','7','8','9','10','J','Q','K','A','LEVEL','XS','XB'];
const RANK_VALUE = {};
RANK_ORDER.forEach((r, i) => { RANK_VALUE[r] = i; });
// RANK_VALUE: 2=0, A=12, LEVEL=13, XS=14, XB=15

// 获取牌的实际等价值（级牌提升到LEVEL位置）
function getEffectiveRankValue(rank, level) {
  if (rank === level) return RANK_VALUE['LEVEL']; // 级牌仅次于大小王
  return RANK_VALUE[rank] !== undefined ? RANK_VALUE[rank] : 0;
}

// 判断是否为级牌
function isLevelCard(rank, level) {
  return rank === level;
}

// 获取牌的实际点数（级牌提升到LEVEL位置，介于A和王之间）
function getEffectiveRank(card, level) {
  if (card.rank === 'XS') return 'XS';  // 小王
  if (card.rank === 'XB') return 'XB';  // 大王
  if (card.rank === level) return 'LEVEL';  // 级牌→LEVEL，介于A(12)和XS(14)之间
  return card.rank;
}

// 比较单张牌的大小
function compareCards(a, b, level) {
  const ra = getEffectiveRank(a, level);
  const rb = getEffectiveRank(b, level);
  return RANK_VALUE[ra] - RANK_VALUE[rb];
}

// rank值到图片名的映射
const RANK_TO_IMG = {
  'A': 'ace', '2': '2', '3': '3', '4': '4', '5': '5',
  '6': '6', '7': '7', '8': '8', '9': '9', '10': '10',
  'J': 'jack', 'Q': 'queen', 'K': 'king',
};

// 创建一副牌（54张）
// deckIndex: 牌组序号，用于生成唯一uid
function createDeck(deckIndex = 0) {
  const deck = [];
  const prefix = deckIndex > 0 ? `d${deckIndex}_` : '';
  for (const suit of SUITS) {
    for (const rank of ['A','2','3','4','5','6','7','8','9','10','J','Q','K']) {
      const imgRank = RANK_TO_IMG[rank];
      const id = `${imgRank}_of_${SUIT_NAMES[suit]}`;
      deck.push({ suit, rank, id, uid: `${prefix}${id}` });
    }
  }
  deck.push({ suit: 'Joker', rank: 'XS', id: 'joker1', uid: `${prefix}joker1` });
  deck.push({ suit: 'Joker', rank: 'XB', id: 'joker2', uid: `${prefix}joker2` });
  return deck;
}

// Fisher-Yates 洗牌
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 排序手牌（从大到小）
function sortHand(cards, level) {
  return [...cards].sort((a, b) => compareCards(b, a, level));
}

// 获取牌的图片路径
function getCardImage(card, deckNum = 1) {
  return `cards/deck${deckNum}/${card.id}.png`;
}

function getCardBackImage() {
  return 'cards/back.png';
}

// 红桃级牌 = 逢人配（万能牌）
function isWildCard(card, level) {
  return card.suit === 'H' && card.rank === level;
}

// ---- 牌型识别 ----

const HAND_TYPES = {
  SINGLE: 'single',           // 单张
  PAIR: 'pair',               // 对子
  TRIPLE: 'triple',           // 三同张
  TRIPLE_PAIR: 'triple_pair', // 三带二
  STRAIGHT: 'straight',       // 顺子(5张)
  TRIPLE_STRAIGHT: 'triple_straight', // 三连对(6张)
  PLANE: 'plane',             // 三同连张/钢板(6张)
  FLUSH_STRAIGHT: 'flush_straight',   // 同花顺(5张)
  BOMB_4: 'bomb_4',           // 四张炸弹
  BOMB_5: 'bomb_5',           // 五张炸弹
  BOMB_6: 'bomb_6',           // 六张炸弹
  FOUR_KINGS: 'four_kings',   // 四大天王
};

// 牌型权重（用于比较不同牌型）
// 炸弹大小: 四王 > 8张炸 > 7张炸 > 6张炸 > 同花顺 > 5张炸 > 4张炸
const TYPE_WEIGHT = {
  'single': 0,
  'pair': 1,
  'triple': 2,
  'straight': 3,
  'triple_pair': 4,
  'triple_straight': 5,
  'plane': 6,
  'triple_pair_5': 7,
  'bomb_4': 100,
  'bomb_5': 105,
  'flush_straight': 110,
  'bomb_6': 115,
  'bomb_7': 120,
  'bomb_8': 125,
  'four_kings': 200,
};

// 统计牌面点数
function countRanks(cards, level) {
  const counts = {};
  for (const c of cards) {
    const r = isWildCard(c, level) ? 'WILD' : c.rank;
    counts[r] = (counts[r] || 0) + 1;
  }
  return counts;
}

// 识别牌型
function identifyCardType(cards, level) {
  const n = cards.length;
  if (n < 1 || n > 6) return null;

  // 分离万能牌和普通牌
  const wildCards = cards.filter(c => isWildCard(c, level));
  const normalCards = cards.filter(c => !isWildCard(c, level));
  const wildCount = wildCards.length;

  // 四大天王：2大王 + 2小王
  if (n === 4 && wildCount === 0) {
    const bigKings = cards.filter(c => c.rank === 'XB').length;
    const smallKings = cards.filter(c => c.rank === 'XS').length;
    if (bigKings === 2 && smallKings === 2) {
      return { type: 'four_kings', weight: 200, mainRank: 'XB', mainRankValue: getEffectiveRankValue('XB', level) };
    }
  }

  // 尝试带万能牌的炸弹（万能牌不能代替王牌组成四大天王之外的牌型中包含王的组合）
  // 先用万能牌辅助识别

  const rankCounts = countRanks(normalCards, level);
  const counts = Object.values(rankCounts).sort((a, b) => b - a);

  // 炸弹判断：检查所有牌是否同点数（红桃级牌当白搭但同点数是炸弹！）
  // 计算所有牌的实际点数（红桃级牌也算其原本点数）
  const allSameRank = cards.every(c => c.rank === cards[0].rank);
  const effectiveBombCount = allSameRank ? n : (wildCount === 0 ? n : 0);

  if (effectiveBombCount >= 4) {
    const rk = cards[0].rank;
    if (n === 4) {
      return { type: 'bomb_4', weight: 100, mainRank: rk, mainRankValue: getEffectiveRankValue(rk, level) };
    }
    if (n === 5) {
      return { type: 'bomb_5', weight: 105, mainRank: rk, mainRankValue: getEffectiveRankValue(rk, level) };
    }
    if (n === 6) {
      return { type: 'bomb_6', weight: 115, mainRank: rk, mainRankValue: getEffectiveRankValue(rk, level) };
    }
  }

  // 同花顺（5张同花色连续，可含万能牌填补中间）
  if (n === 5) {
    const flushResult = checkFlushStraight(cards, level);
    if (flushResult) return flushResult;
  }

  // 顺子（5张连续，不限花色）
  if (n === 5) {
    const straightResult = checkStraight(cards, level);
    if (straightResult) return straightResult;
  }

  // 三同连张/钢板：两个连续三同张
  if (n === 6 && wildCount <= 2) {
    const planeResult = checkPlane(cards, level);
    if (planeResult) return planeResult;
  }

  // 三连对：三对连续对子
  if (n === 6 && wildCount <= 2) {
    const triplePairResult = checkTriplePair(cards, level);
    if (triplePairResult) return triplePairResult;
  }

  // 三带二 (5张)
  if (n === 5) {
    const tpResult = checkTriplePair5(cards, level);
    if (tpResult) return tpResult;
  }

  // 三同张 (3张)
  if (n === 3) {
    if (counts.length === 1 && counts[0] === 3) {
      const rk = Object.keys(rankCounts)[0];
      return { type: 'triple', weight: 2, mainRank: rk, mainRankValue: getEffectiveRankValue(rk, level) };
    }
    // 带万能牌
    if (wildCount === 1 && counts.length === 1 && counts[0] === 2) {
      const rk = Object.keys(rankCounts)[0];
      return { type: 'triple', weight: 2, mainRank: rk, mainRankValue: getEffectiveRankValue(rk, level) };
    }
    if (wildCount === 2 && counts.length === 1 && counts[0] === 1) {
      const rk = Object.keys(rankCounts)[0];
      return { type: 'triple', weight: 2, mainRank: rk, mainRankValue: getEffectiveRankValue(rk, level) };
    }
  }

  // 对子 (2张)
  if (n === 2) {
    if (counts.length === 1 && counts[0] === 2) {
      const rk = Object.keys(rankCounts)[0];
      return { type: 'pair', weight: 1, mainRank: rk, mainRankValue: getEffectiveRankValue(rk, level) };
    }
    // 带万能牌
    if (wildCount === 1 && counts.length === 1 && counts[0] === 1) {
      const rk = Object.keys(rankCounts)[0];
      return { type: 'pair', weight: 1, mainRank: rk, mainRankValue: getEffectiveRankValue(rk, level) };
    }
    if (wildCount === 2) {
      return { type: 'pair', weight: 1, mainRank: 'A', mainRankValue: getEffectiveRankValue('A', level) };
    }
  }

  // 单张 (1张)
  if (n === 1) {
    const rk = cards[0].rank;
    return { type: 'single', weight: 0, mainRank: rk, mainRankValue: getEffectiveRankValue(rk, level) };
  }

  return null;
}

// 检查顺子（5张连续，不含王和级牌，允许A2345）
function checkStraight(cards, level) {
  // 顺子不能含万能牌（逢人配不能用于顺子中的普通牌替换）
  const hasWild = cards.some(c => isWildCard(c, level));
  if (hasWild) return null;

  // 不能含王
  const hasJoker = cards.some(c => c.rank === 'XS' || c.rank === 'XB');
  if (hasJoker) return null;

  // 不能含级牌
  const hasLevel = cards.some(c => c.rank === level);
  if (hasLevel) return null;

  const ranks = cards.map(c => RANK_VALUE[c.rank]).sort((a, b) => a - b);

  // 无重复
  const uniqueRanks = new Set(ranks);
  if (uniqueRanks.size !== 5) return null;

  const min = ranks[0], max = ranks[4];

  // 普通顺子：连续5张，范围3到A
  if (max - min === 4 && ranks.every((v, i) => i === 0 || v - ranks[i-1] === 1)) {
    // 范围内不能有2（RANK_VALUE['2']=0）
    if (min >= RANK_VALUE['3'] && max <= RANK_VALUE['A']) {
      return { type: 'straight', weight: 3, mainRank: RANK_ORDER[max], mainRankValue: max };
    }
  }

  // 特殊：A2345 (A=12, 2=0, 3=1, 4=2, 5=3)
  const a2345Set = new Set(cards.map(c => c.rank));
  if (a2345Set.has('A') && a2345Set.has('2') && a2345Set.has('3') &&
      a2345Set.has('4') && a2345Set.has('5')) {
    return { type: 'straight', weight: 3, mainRank: '5', mainRankValue: getEffectiveRankValue('5', level) };
  }

  // 特殊：23456 (2=0, 3=1, 4=2, 5=3, 6=4)
  const b23456Set = new Set(cards.map(c => c.rank));
  if (b23456Set.has('2') && b23456Set.has('3') && b23456Set.has('4') &&
      b23456Set.has('5') && b23456Set.has('6')) {
    return { type: 'straight', weight: 3, mainRank: '6', mainRankValue: getEffectiveRankValue('6', level) };
  }

  return null;
}

// 检查同花顺（5张同花色连续）
function checkFlushStraight(cards, level) {
  const wildCount = cards.filter(c => isWildCard(c, level)).length;
  const normals = cards.filter(c => !isWildCard(c, level));

  // 所有非万能牌必须同花色
  const suits = new Set(normals.map(c => c.suit));
  if (suits.size > 1) return null;
  // 如果有万能牌，万能牌可以算任何花色
  if (suits.size === 0 && wildCount === 5) return null; // 全是万能牌? 不可能

  // 检查连续性（同顺子）
  const ranks = normals.map(c => RANK_VALUE[c.rank]).sort((a, b) => a - b);
  const uniqueRanks = new Set(ranks);
  if (uniqueRanks.size !== normals.length) return null;

  const minAllowed = RANK_VALUE['3'];
  let min = ranks[0], max = ranks[ranks.length - 1];
  const span = max - min;

  if (span <= 4 + wildCount && span >= 4) {
    const needed = span + 1 - ranks.length;
    if (needed <= wildCount && min >= minAllowed) {
      return { type: 'flush_straight', weight: 110, mainRank: RANK_ORDER[max], mainRankValue: max };
    }
  }
  return null;
}

// 检查三同连张/钢板（6张：两个连续三同张）
function checkPlane(cards, level) {
  const wildCount = cards.filter(c => isWildCard(c, level)).length;
  const counts = countRanks(cards.filter(c => !isWildCard(c, level)), level);

  // 找到所有三张及以上的rank
  const triples = Object.entries(counts).filter(([, c]) => c >= 2);
  // 简单情形：两个三同张
  if (wildCount === 0 && triples.length === 2 && triples[0][1] === 3 && triples[1][1] === 3) {
    const r1 = RANK_VALUE[triples[0][0]];
    const r2 = RANK_VALUE[triples[1][0]];
    if (Math.abs(r1 - r2) === 1) {
      const maxRank = RANK_ORDER[Math.max(r1, r2)];
      return { type: 'plane', weight: 6, mainRank: maxRank, mainRankValue: getEffectiveRankValue(maxRank, level) };
    }
  }
  // TODO: 带万能牌的钢板（简化处理，暂不实现复杂组合）
  return null;
}

// 检查三连对（6张：三对连续对子）
function checkTriplePair(cards, level) {
  const wildCount = cards.filter(c => isWildCard(c, level)).length;
  const counts = countRanks(cards.filter(c => !isWildCard(c, level)), level);

  if (wildCount === 0) {
    const pairs = Object.entries(counts).filter(([, c]) => c === 2).map(([r]) => r);
    if (pairs.length === 3) {
      const ranks = pairs.map(r => RANK_VALUE[r]).sort((a, b) => a - b);
      if (ranks[2] - ranks[0] === 2 && ranks[1] - ranks[0] === 1) {
        return { type: 'triple_straight', weight: 4, mainRank: RANK_ORDER[ranks[2]], mainRankValue: ranks[2] };
      }
    }
  }
  return null;
}

// 三带二（5张）—— 完整支持万能牌
function checkTriplePair5(cards, level) {
  const wildCards = cards.filter(c => isWildCard(c, level));
  const normals = cards.filter(c => !isWildCard(c, level));
  const wildCount = wildCards.length;

  // 无万能牌：直接检查 3+2 结构
  if (wildCount === 0) {
    const counts = countRanks(normals, level);
    const values = Object.values(counts).sort((a, b) => b - a);
    if (values.length === 2 && values[0] === 3 && values[1] === 2) {
      const tripleRank = Object.entries(counts).find(([, c]) => c === 3)[0];
      return { type: 'triple_pair', weight: 4, mainRank: tripleRank, mainRankValue: getEffectiveRankValue(tripleRank, level), subtype: 'triple_pair_5' };
    }
    return null;
  }

  // 带万能牌：尝试所有可能的分配
  // 万能牌可当作任意非王牌使用，目标是形成 3+2 结构
  // 即：一个rank有3张，另一个rank有2张（或万能牌自己组成对子）
  const counts = countRanks(normals, level);
  const entries = Object.entries(counts);
  const totalCards = cards.length; // always 5

  // 尝试每种可能的"三同张"rank分配
  for (let t = 0; t < entries.length; t++) {
    const tripleRank = entries[t][0];
    const tripleNeed = Math.max(0, 3 - entries[t][1]);
    if (tripleNeed > wildCount) continue;

    const remainingWilds = wildCount - tripleNeed;

    // 尝试剩余的rank作为"对子"
    for (let p = 0; p < entries.length; p++) {
      if (p === t) continue;
      const pairRank = entries[p][0];
      const pairNeed = Math.max(0, 2 - entries[p][1]);
      if (pairNeed > remainingWilds) continue;
      if (tripleNeed + pairNeed !== wildCount) continue;

      // 检查是否有其他rank的牌未被使用
      const used = new Set([t, p]);
      const unused = entries.filter((_, i) => !used.has(i)).filter(([, c]) => c > 0);
      if (unused.length > 0) continue;

      return {
        type: 'triple_pair', weight: 4,
        mainRank: tripleRank,
        mainRankValue: getEffectiveRankValue(tripleRank, level),
        subtype: 'triple_pair_5'
      };
    }

    // 剩余万能牌自己配成对子（需要至少2张万能牌）
    if (remainingWilds >= 2 && tripleNeed + 2 === wildCount) {
      // 检查是否只有tripleRank有牌
      const others = entries.filter((_, i) => i !== t).filter(([, c]) => c > 0);
      if (others.length === 0) {
        return {
          type: 'triple_pair', weight: 4,
          mainRank: tripleRank,
          mainRankValue: getEffectiveRankValue(tripleRank, level),
          subtype: 'triple_pair_5'
        };
      }
    }
  }

  // 万能牌自己形成三同张 + 一个对子
  if (wildCount >= 3 && entries.filter(([, c]) => c > 0).length <= 1) {
    // 3张万能牌做三同张，剩余万能牌（如果有）+ 普通牌做对子
    const normalEntries = entries.filter(([, c]) => c > 0);
    if (normalEntries.length <= 1) {
      const pairRank = normalEntries.length === 1 ? normalEntries[0][0] : wildCards[0].rank;
      const pairNeed = normalEntries.length === 1 ? Math.max(0, 2 - normalEntries[0][1]) : 2;
      const wildsForTriple = 3;
      if (wildsForTriple + pairNeed === wildCount) {
        return {
          type: 'triple_pair', weight: 4,
          mainRank: normalEntries.length === 1 ? normalEntries[0][0] : 'A',
          mainRankValue: getEffectiveRankValue(normalEntries.length === 1 ? normalEntries[0][0] : 'A', level),
          subtype: 'triple_pair_5'
        };
      }
    }
  }

  return null;
}

// 比较两个同类型牌型的大小
function compareCardTypes(typeA, typeB) {
  // 炸弹之间的比较
  if (typeA.weight >= 100 && typeB.weight >= 100) {
    if (typeA.weight !== typeB.weight) return typeA.weight - typeB.weight;
    return typeA.mainRankValue - typeB.mainRankValue;
  }
  // 普通牌型 vs 炸弹
  if (typeA.weight >= 100 && typeB.weight < 100) return 1;
  if (typeA.weight < 100 && typeB.weight >= 100) return -1;
  // 同类型比较：类型相同则直接比大小
  if (typeA.type !== typeB.type) {
    // 子类型也要相同
    const ta = typeA.subtype || typeA.type;
    const tb = typeB.subtype || typeB.type;
    if (ta !== tb) return null; // 不能互相压
  }
  // 相同牌型比较牌点
  const diff = typeA.mainRankValue - typeB.mainRankValue;
  // 同点数不能压（比如两个都是对3，后出的不能压先出的）
  return diff;
}

// 在手中找到所有可能的出牌组合（优化版：按rank分组避免组合爆炸）
function findAllPlays(hand, level) {
  const plays = [];
  const seen = new Set();

  function addPlay(cards, cardType) {
    const key = cards.map(c => c.uid).sort().join(',');
    if (!seen.has(key)) {
      seen.add(key);
      plays.push({ cards: [...cards], type: cardType });
    }
  }

  // 按rank分组
  const groups = {};
  const wildCards = [];
  for (const c of hand) {
    if (isWildCard(c, level)) { wildCards.push(c); continue; }
    if (!groups[c.rank]) groups[c.rank] = [];
    groups[c.rank].push(c);
  }
  const ranks = Object.keys(groups).sort((a, b) => RANK_VALUE[a] - RANK_VALUE[b]);
  const wildCount = wildCards.length;

  // 1. 单张
  for (const c of hand) {
    addPlay([c], { type: 'single', weight: 0, mainRank: c.rank, mainRankValue: getEffectiveRankValue(c.rank, level) });
  }

  // 2. 对子
  for (const rank of ranks) {
    const g = groups[rank];
    if (g.length >= 2) addPlay([g[0], g[1]], { type: 'pair', weight: 1, mainRank: rank, mainRankValue: getEffectiveRankValue(rank, level) });
    if (g.length >= 1 && wildCount >= 1) addPlay([g[0], wildCards[0]], { type: 'pair', weight: 1, mainRank: rank, mainRankValue: getEffectiveRankValue(rank, level) });
  }
  if (wildCount >= 2) addPlay([wildCards[0], wildCards[1]], { type: 'pair', weight: 1, mainRank: 'A', mainRankValue: getEffectiveRankValue('A', level) });

  // 3. 三同张
  for (const rank of ranks) {
    const g = groups[rank];
    if (g.length >= 3) addPlay([g[0], g[1], g[2]], { type: 'triple', weight: 2, mainRank: rank, mainRankValue: getEffectiveRankValue(rank, level) });
    if (g.length >= 2 && wildCount >= 1) addPlay([g[0], g[1], wildCards[0]], { type: 'triple', weight: 2, mainRank: rank, mainRankValue: getEffectiveRankValue(rank, level) });
  }

  // 4. 炸弹（4-6张）
  for (const rank of ranks) {
    const g = groups[rank];
    if (g.length >= 4) addPlay(g.slice(0, 4), { type: 'bomb_4', weight: 100, mainRank: rank, mainRankValue: getEffectiveRankValue(rank, level) });
    if (g.length >= 5) addPlay(g.slice(0, 5), { type: 'bomb_5', weight: 105, mainRank: rank, mainRankValue: getEffectiveRankValue(rank, level) });
    if (g.length >= 6) addPlay(g.slice(0, 6), { type: 'bomb_6', weight: 115, mainRank: rank, mainRankValue: getEffectiveRankValue(rank, level) });
  }

  // 5. 三带二（5张）
  for (const rank of ranks) {
    const g = groups[rank];
    if (g.length >= 3) {
      for (const r2 of ranks) {
        if (r2 === rank) continue;
        const g2 = groups[r2];
        if (g2.length >= 2) {
          addPlay([g[0], g[1], g[2], g2[0], g2[1]], { type: 'triple_pair', weight: 4, mainRank: rank, mainRankValue: getEffectiveRankValue(rank, level), subtype: 'triple_pair_5' });
        }
      }
    }
  }

  // 6. 顺子（5张连续，不含王和级牌，允许A2345）
  // 过滤掉王和级牌
  const straightRanks = ranks.filter(r => {
    if (r === 'XS' || r === 'XB') return false;
    if (r === level) return false;
    return true;
  });
  for (let i = 0; i <= straightRanks.length - 5; i++) {
    const seq = straightRanks.slice(i, i + 5);
    const vals = seq.map(r => RANK_VALUE[r]);
    // 普通连续：3到A范围
    if (vals[0] >= RANK_VALUE['3'] && vals[4] <= RANK_VALUE['A'] &&
        vals[4] - vals[0] === 4 && vals.every((v, j) => j === 0 || v - vals[j-1] === 1)) {
      addPlay(seq.map(r => groups[r][0]), { type: 'straight', weight: 3, mainRank: seq[4], mainRankValue: vals[4] });
    }
  }
  // A2345特殊处理
  const a2345 = ['A','2','3','4','5'];
  if (a2345.every(r => groups[r] && groups[r].length >= 1)) {
    const straightRanksFiltered = a2345.filter(r => {
      if (r === level) return false;
      return true;
    });
    if (straightRanksFiltered.length === 5) {
      addPlay(a2345.map(r => groups[r][0]), { type: 'straight', weight: 3, mainRank: '5', mainRankValue: getEffectiveRankValue('5', level) });
    }
  }
  // 23456特殊处理
  const b23456 = ['2','3','4','5','6'];
  if (b23456.every(r => groups[r] && groups[r].length >= 1)) {
    const filtered23456 = b23456.filter(r => r !== level);
    if (filtered23456.length === 5) {
      addPlay(b23456.map(r => groups[r][0]), { type: 'straight', weight: 3, mainRank: '6', mainRankValue: getEffectiveRankValue('6', level) });
    }
  }

  // 7. 四大天王
  const bigKings = hand.filter(c => c.rank === 'XB');
  const smallKings = hand.filter(c => c.rank === 'XS');
  if (bigKings.length >= 2 && smallKings.length >= 2) {
    addPlay([bigKings[0], bigKings[1], smallKings[0], smallKings[1]], { type: 'four_kings', weight: 200, mainRank: 'XB', mainRankValue: getEffectiveRankValue('XB', level) });
  }

  // 8. 三连对（6张）
  for (let i = 0; i <= ranks.length - 3; i++) {
    const seq = ranks.slice(i, i + 3);
    const vals = seq.map(r => RANK_VALUE[r]);
    if (vals[2] - vals[0] === 2 && seq.every(r => groups[r].length >= 2)) {
      addPlay(seq.flatMap(r => groups[r].slice(0, 2)), { type: 'triple_straight', weight: 4, mainRank: seq[2], mainRankValue: vals[2] });
    }
  }

  // 9. 钢板（6张）
  for (let i = 0; i <= ranks.length - 2; i++) {
    const r1 = ranks[i], r2 = ranks[i + 1];
    if (RANK_VALUE[r2] - RANK_VALUE[r1] === 1 && groups[r1].length >= 3 && groups[r2].length >= 3) {
      addPlay([...groups[r1].slice(0, 3), ...groups[r2].slice(0, 3)], { type: 'plane', weight: 6, mainRank: r2, mainRankValue: getEffectiveRankValue(r2, level) });
    }
  }

  return plays;
}

// 在手中找到能压过目标牌型的出牌
function findBeatingPlays(hand, targetType, level) {
  const allPlays = findAllPlays(hand, level);
  return allPlays.filter(play => {
    const cmp = compareCardTypes(play.type, targetType);
    return cmp > 0;
  });
}

// 找最小的合法出牌（用于超时自动出牌）
function findSmallestPlay(hand, level) {
  const sorted = sortHand(hand, level);
  if (sorted.length === 0) return null;
  // 最小单张
  const smallest = sorted[sorted.length - 1];
  return { cards: [smallest], type: { type: 'single', weight: 0, mainRank: smallest.rank, mainRankValue: getEffectiveRankValue(smallest.rank, level) } };
}

// 导出（浏览器端用全局变量）
if (typeof window !== 'undefined') {
  window.CardEngine = {
    SUITS, SUIT_NAMES, RANK_ORDER, RANK_VALUE, RANK_TO_IMG,
    isLevelCard, getEffectiveRank, getEffectiveRankValue, compareCards,
    createDeck, shuffle, sortHand,
    getCardImage, getCardBackImage, isWildCard,
    identifyCardType, compareCardTypes,
    findAllPlays, findBeatingPlays, findSmallestPlay,
    HAND_TYPES, TYPE_WEIGHT,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SUITS, SUIT_NAMES, RANK_ORDER, RANK_VALUE,
    isLevelCard, getEffectiveRank, getEffectiveRankValue, compareCards,
    createDeck, shuffle, sortHand,
    getCardImage, getCardBackImage, isWildCard,
    identifyCardType, compareCardTypes,
    findAllPlays, findBeatingPlays, findSmallestPlay,
    HAND_TYPES, TYPE_WEIGHT,
  };
}
