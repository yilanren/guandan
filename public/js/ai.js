/**
 * 掼蛋 AI 策略引擎
 * 智能评估手牌，做出合理的出牌/过牌决策
 */

const AI = (function() {
  const CE = window.CardEngine;

  /**
   * 评估一手牌的整体价值（用于选择最优出牌）
   * 分数越低越好（越容易出完）
   */
  function evaluateHand(hand, level) {
    if (hand.length === 0) return 0;
    let score = 0;
    // 基础分 = 剩余牌数
    score += hand.length * 10;

    // 分析牌型结构
    const rankCounts = {};
    for (const c of hand) {
      const r = CE.isWildCard(c, level) ? 'WILD' : c.rank;
      rankCounts[r] = (rankCounts[r] || 0) + 1;
    }

    const counts = Object.values(rankCounts);
    const wildCount = rankCounts['WILD'] || 0;

    // 炸弹是加分项（保留）
    for (const c of counts) {
      if (c >= 4) score -= 20 * c;
      if (c === 3) score -= 10;
      if (c === 2) score -= 5;
    }

    // 单张是负担
    const singles = counts.filter(c => c === 1 && !rankCounts['WILD']);
    score += singles.length * 8;

    // 大小王是强力牌
    const bigKings = hand.filter(c => c.rank === 'XB').length;
    const smallKings = hand.filter(c => c.rank === 'XS').length;
    score -= bigKings * 30;
    score -= smallKings * 20;
    score -= wildCount * 25;

    return score;
  }

  /**
   * AI 决定出的牌
   * @param {Array} hand - 手牌
   * @param {Object|null} lastPlay - 上家出的牌（null表示AI先手）
   * @param {string} level - 当前级牌
   * @param {number} opponentCount - 对手剩余牌数
   * @returns {Object|null} { cards, type } 或 null（过牌）
   */
  function decidePlay(hand, lastPlay, level, opponentCount) {
    // 先手（领出）
    if (!lastPlay || lastPlay.type === 'pass') {
      return decideLead(hand, level, opponentCount);
    }
    // 跟牌/压牌
    return decideFollow(hand, lastPlay, level, opponentCount);
  }

  /**
   * AI 先手出牌策略
   */
  function decideLead(hand, level, opponentCount) {
    const allPlays = CE.findAllPlays(hand, level);
    if (allPlays.length === 0) return null;

    // 只剩少量牌，直接出最优组合
    if (hand.length <= 3) {
      // 尝试一次性出完
      const finish = allPlays.find(p => p.cards.length === hand.length);
      if (finish) return finish;
    }

    // 对手快赢了，保留炸弹，出小牌
    if (opponentCount <= 5) {
      // 先出炸弹清场
      const bombs = allPlays.filter(p => p.type.weight >= 100);
      if (bombs.length > 0) {
        // 出最大的炸弹
        return bombs[bombs.length - 1];
      }
    }

    // 评分并排序
    const scored = allPlays.map(play => ({
      ...play,
      score: scorePlay(play, hand, level, opponentCount),
    }));

    // 移除炸弹（开局不轻易出炸弹）
    const nonBombs = scored.filter(p => p.type.weight < 100);
    const bombs = scored.filter(p => p.type.weight >= 100);

    // 从非炸弹中选择最优
    if (nonBombs.length > 0) {
      nonBombs.sort((a, b) => a.score - b.score);
      // 通常出最小/最合理的牌
      return nonBombs[0];
    }

    // 只有炸弹可出
    if (bombs.length > 0) {
      bombs.sort((a, b) => a.score - b.score);
      return bombs[0];
    }

    return allPlays[0];
  }

  /**
   * AI 跟牌/压牌策略
   */
  function decideFollow(hand, lastPlay, level, opponentCount) {
    // 只有手上牌少的情况下考虑压
    const beatingPlays = CE.findBeatingPlays(hand, lastPlay.type, level);

    if (beatingPlays.length === 0) return null; // 过牌

    // 分离普通压牌和炸弹压牌
    const normalBeats = beatingPlays.filter(p => p.type.weight < 100);
    const bombBeats = beatingPlays.filter(p => p.type.weight >= 100);

    // 如果手牌不多，直接压
    if (hand.length <= 5) {
      if (normalBeats.length > 0) {
        normalBeats.sort((a, b) => a.cards.length - b.cards.length);
        return normalBeats[0];
      }
      if (bombBeats.length > 0) {
        bombBeats.sort((a, b) => a.type.weight - b.type.weight);
        return bombBeats[0];
      }
      return null;
    }

    // 对手快赢了，必须压
    if (opponentCount <= 5) {
      if (normalBeats.length > 0) {
        normalBeats.sort((a, b) => a.type.mainRankValue - b.type.mainRankValue);
        return normalBeats[0]; // 用最小的能压过的牌
      }
      if (bombBeats.length > 0) {
        bombBeats.sort((a, b) => a.type.weight - b.type.weight);
        return bombBeats[0];
      }
      return null;
    }

    // 一般情况下，选择性压牌
    // 如果有普通方式能压
    if (normalBeats.length > 0) {
      const scored = normalBeats.map(play => ({
        ...play,
        score: scorePlay(play, hand, level, opponentCount),
      }));
      scored.sort((a, b) => a.score - b.score);

      // 如果压牌的代价不高（比如用小对子压大对子），才压
      // 大约40%概率选择压牌，60%过
      if (Math.random() < 0.4) {
        return scored[0];
      }
      return null; // 保存实力
    }

    // 只有炸弹能压
    if (bombBeats.length > 0) {
      // 对手快赢或最后几手才用炸弹
      if (opponentCount <= 8) {
        bombBeats.sort((a, b) => a.type.weight - b.type.weight);
        return bombBeats[0];
      }
      // 大约15%概率用炸弹（保留炸弹）
      if (Math.random() < 0.15 && opponentCount > 15) {
        bombBeats.sort((a, b) => a.type.weight - b.type.weight);
        return bombBeats[0];
      }
      return null;
    }

    return null;
  }

  /**
   * 为一手出牌打分（越低越好/越应该出）
   */
  function scorePlay(play, hand, level, opponentCount) {
    let score = 0;
    const { type, cards } = play;

    // 基础分：牌数越多越好（快速减少手牌）
    score -= cards.length * 15;

    // 出单张
    if (type.type === 'single') {
      const rankValue = type.mainRankValue;
      // 出小单张更好（扔掉负担）
      score -= (14 - rankValue) * 3;
      // 但如果是对手快赢了，出大牌
      if (opponentCount <= 5 && rankValue > 8) score -= 20;
    }

    // 出对子
    if (type.type === 'pair') {
      score -= 10;
    }

    // 炸弹：一般不主动出
    if (type.weight >= 100) {
      score += 50;
      // 除非是对手快没牌了
      if (opponentCount <= 5) score -= 60;
    }

    // 同花顺：比较好用
    if (type.type === 'flush_straight') {
      score -= 15;
    }

    // 如果包含万能牌，+分（节约万能牌）
    const hasWild = cards.some(c => CE.isWildCard(c, level));
    if (hasWild) score += 20;

    // 包含大小王
    const hasKing = cards.some(c => c.rank === 'XB' || c.rank === 'XS');
    if (hasKing) score += 15;

    // 如果出完后剩余手牌评估更高（更差），降分
    const remaining = hand.filter(c => !cards.some(pc => pc.uid === c.uid));
    const handScoreBefore = evaluateHand(hand, level);
    const handScoreAfter = evaluateHand(remaining, level);
    score += (handScoreAfter - handScoreBefore) * 0.5;

    return score;
  }

  // 暴露的公开API
  return {
    decidePlay,
    evaluateHand,
  };
})();

if (typeof window !== 'undefined') {
  window.AI = AI;
}
