/**
 * 掼蛋 AI 策略引擎 - 极难模式
 * 激进压制、精准算牌、残局收割
 */

const AI = (function() {
  const CE = window.CardEngine;

  /**
   * 评估手牌质量（分数越低越好）
   */
  function evaluateHand(hand, level) {
    if (hand.length === 0) return -9999;
    let score = hand.length * 8;
    const rankCounts = {};
    for (const c of hand) {
      const r = CE.isWildCard(c, level) ? 'WILD' : c.rank;
      rankCounts[r] = (rankCounts[r] || 0) + 1;
    }
    const counts = Object.values(rankCounts);
    const wildCount = rankCounts['WILD'] || 0;
    for (const c of counts) {
      if (c >= 4) score -= c * 25;
      if (c === 3) score -= 12;
      if (c === 2) score -= 6;
    }
    const singles = counts.filter(c => c === 1).length;
    score += singles * 12;
    const bigKings = hand.filter(c => c.rank === 'XB').length;
    const smallKings = hand.filter(c => c.rank === 'XS').length;
    score -= bigKings * 35;
    score -= smallKings * 25;
    score -= wildCount * 30;
    return score;
  }

  /**
   * 主决策入口
   */
  function decidePlay(hand, lastPlay, level, opponentCount, isTeammate) {
    if (!lastPlay || lastPlay.type === 'pass') {
      return decideLead(hand, level, opponentCount);
    }
    // 如果是队友出的牌，不压
    if (isTeammate) return null;
    return decideFollow(hand, lastPlay, level, opponentCount);
  }

  /**
   * 领出策略（极难）
   */
  function decideLead(hand, level, opponentCount) {
    const allPlays = CE.findAllPlays(hand, level);
    if (allPlays.length === 0) return null;

    // 能一手出完直接出
    if (hand.length <= 5) {
      const finish = allPlays.find(p => p.cards.length === hand.length);
      if (finish) return finish;
    }

    // 手牌很少时：用最大牌型（炸弹优先）确保收尾
    if (hand.length <= 6) {
      const bombs = allPlays.filter(p => p.type.weight >= 100);
      if (bombs.length > 0) {
        bombs.sort((a, b) => b.type.weight - a.type.weight || b.type.mainRankValue - a.type.mainRankValue);
        return bombs[0];
      }
      // 出最大的非炸弹牌型
      const nonBombs = allPlays.filter(p => p.type.weight < 100);
      nonBombs.sort((a, b) => b.type.mainRankValue - a.type.mainRankValue);
      return nonBombs[0];
    }

    // 对手快赢时出炸弹清场
    if (opponentCount <= 8) {
      const bombs = allPlays.filter(p => p.type.weight >= 100);
      if (bombs.length > 0) {
        bombs.sort((a, b) => b.type.weight - a.type.weight || b.type.mainRankValue - a.type.mainRankValue);
        const best = bombs[bombs.length - 1];
        // 评估出炸弹后能否快速出完
        const remaining = hand.filter(c => !best.cards.some(pc => pc.uid === c.uid));
        if (remaining.length <= 5) return best;
      }
    }

    // 常规策略：优先出单张（扔掉负担），其次出对子
    const singles = allPlays.filter(p => p.type.type === 'single');
    const pairs = allPlays.filter(p => p.type.type === 'pair');
    const triples = allPlays.filter(p => p.type.type === 'triple');
    const bombs = allPlays.filter(p => p.type.weight >= 100);

    // 出最小的单张（优先扔小牌）
    if (singles.length > 0 && hand.length > 10) {
      singles.sort((a, b) => a.type.mainRankValue - b.type.mainRankValue);
      // 不出大小王
      const small = singles.filter(s => s.type.mainRankValue < 12);
      if (small.length > 0) return small[0];
      return singles[0];
    }

    // 手牌中等：出对子或三同张消耗
    if (pairs.length > 0 && hand.length > 6) {
      pairs.sort((a, b) => a.type.mainRankValue - b.type.mainRankValue);
      return pairs[0];
    }

    if (triples.length > 0 && hand.length > 6) {
      triples.sort((a, b) => a.type.mainRankValue - b.type.mainRankValue);
      return triples[0];
    }

    // 没什么好出的，出最小单张
    if (singles.length > 0) {
      singles.sort((a, b) => a.type.mainRankValue - b.type.mainRankValue);
      return singles[0];
    }

    // 只有炸弹
    if (bombs.length > 0) {
      bombs.sort((a, b) => a.type.weight - b.type.weight);
      return bombs[0];
    }

    return allPlays[0];
  }

  /**
   * 跟牌/压牌策略（极难）
   */
  function decideFollow(hand, lastPlay, level, opponentCount) {
    const beatingPlays = CE.findBeatingPlays(hand, lastPlay.type, level);
    if (beatingPlays.length === 0) return null;

    const normalBeats = beatingPlays.filter(p => p.type.weight < 100);
    const bombBeats = beatingPlays.filter(p => p.type.weight >= 100);

    // 残局模式（手牌≤5）：全力压
    if (hand.length <= 5) {
      if (normalBeats.length > 0) {
        normalBeats.sort((a, b) => a.type.mainRankValue - b.type.mainRankValue);
        return normalBeats[0];
      }
      if (bombBeats.length > 0) {
        bombBeats.sort((a, b) => a.type.weight - b.type.weight);
        return bombBeats[0];
      }
      return null;
    }

    // 对手快赢（≤8张）：必须压，用炸弹也在所不惜
    if (opponentCount <= 8) {
      if (normalBeats.length > 0) {
        normalBeats.sort((a, b) => a.type.mainRankValue - b.type.mainRankValue);
        return normalBeats[0];
      }
      if (bombBeats.length > 0) {
        bombBeats.sort((a, b) => a.type.weight - b.type.weight);
        return bombBeats[0];
      }
      return null;
    }

    // AI 手牌较多（>10张）：选择性压牌
    if (hand.length > 10) {
      if (normalBeats.length > 0) {
        normalBeats.sort((a, b) => a.type.mainRankValue - b.type.mainRankValue);
        // 80%概率压牌（激进）
        if (Math.random() < 0.8) return normalBeats[0];
      }
      if (bombBeats.length > 0 && opponentCount <= 12) {
        bombBeats.sort((a, b) => a.type.weight - b.type.weight);
        if (Math.random() < 0.5) return bombBeats[0];
      }
      return null;
    }

    // AI 手牌中等（6-10张）：积极压牌
    if (hand.length <= 10) {
      if (normalBeats.length > 0) {
        // 90%概率压牌
        normalBeats.sort((a, b) => a.type.mainRankValue - b.type.mainRankValue);
        if (Math.random() < 0.9) return normalBeats[0];
        return null;
      }
      // 考虑用炸弹（如果手牌结构好）
      if (bombBeats.length > 0) {
        // 评估：出炸弹后剩余手牌是否容易出完
        for (const bomb of bombBeats) {
          const remaining = hand.filter(c => !bomb.cards.some(pc => pc.uid === c.uid));
          const remEval = evaluateHand(remaining, level);
          if (remEval < 30) { // 剩余手牌结构好，值得用炸弹
            bombBeats.sort((a, b) => a.type.weight - b.type.weight);
            return bombBeats[0];
          }
        }
      }
      return null;
    }

    // 默认：有普通方式就压
    if (normalBeats.length > 0) {
      normalBeats.sort((a, b) => a.type.mainRankValue - b.type.mainRankValue);
      return normalBeats[0];
    }
    if (bombBeats.length > 0 && opponentCount <= 15) {
      bombBeats.sort((a, b) => a.type.weight - b.type.weight);
      return bombBeats[0];
    }

    return null;
  }

  /**
   * 简单AI - 领出（队友用）
   */
  function easyDecideLead(hand, level, opponentCount) {
    const allPlays = CE.findAllPlays(hand, level);
    if (allPlays.length === 0) return null;
    // 去掉炸弹
    const nonBombs = allPlays.filter(p => p.type.weight < 100);
    if (nonBombs.length === 0) {
      const singles = allPlays.filter(p => p.type.type === 'single');
      if (singles.length > 0) return singles[Math.floor(Math.random() * singles.length)];
      return allPlays[Math.floor(Math.random() * allPlays.length)];
    }
    // 随机选一个非炸弹
    return nonBombs[Math.floor(Math.random() * nonBombs.length)];
  }

  /**
   * 简单AI - 跟牌（队友用）
   */
  function easyDecideFollow(hand, lastPlay, level, opponentCount) {
    const beatingPlays = CE.findBeatingPlays(hand, lastPlay.type, level);
    if (beatingPlays.length === 0) return null;
    // 只用普通牌压，绝不用炸弹
    const normalBeats = beatingPlays.filter(p => p.type.weight < 100);
    if (normalBeats.length === 0) return null;
    // 30%概率压牌（大部分时候过）
    if (Math.random() < 0.3) {
      normalBeats.sort((a, b) => a.type.mainRankValue - b.type.mainRankValue);
      return normalBeats[0];
    }
    return null;
  }

  /**
   * 简单AI决策入口（队友用）
   */
  function easyDecidePlay(hand, lastPlay, level, opponentCount, isTeammate) {
    if (!lastPlay || lastPlay.type === 'pass') {
      return easyDecideLead(hand, level, opponentCount);
    }
    return easyDecideFollow(hand, lastPlay, level, opponentCount);
  }

  // 极难AI（对手用）
  const hard = { decidePlay, evaluateHand };
  // 简易AI（队友用）
  const easy = { decidePlay: easyDecidePlay, evaluateHand };

  return { hard, easy, decidePlay, evaluateHand };
})();

if (typeof window !== 'undefined') {
  window.AI = AI;
}
