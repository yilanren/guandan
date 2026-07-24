/**
 * 掼蛋游戏核心逻辑
 * 管理游戏状态、回合控制、胜负判定、升级体系
 */

const GameEngine = (function() {
  const CE = window.CardEngine;

  // 级牌升级序列
  const LEVEL_SEQUENCE = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

  /**
   * 创建新游戏
   */
  function createGame(config) {
    const { mode, playerNames, aiSlots } = config;
    let totalPlayers, decksNeeded;

    switch (mode) {
      case 'single': totalPlayers = 2; decksNeeded = 1; break;
      case 'two': totalPlayers = 2; decksNeeded = 1; break;
      case 'three': totalPlayers = 3; decksNeeded = 2; break;
      case 'four': totalPlayers = 4; decksNeeded = 2; break;
      default: totalPlayers = 2; decksNeeded = 1;
    }

    // 创建牌堆
    let deck = [];
    for (let i = 0; i < decksNeeded; i++) {
      deck = deck.concat(CE.createDeck(i));
    }
    deck = CE.shuffle(deck);

    // 发牌（每人27张）
    const cardsPerPlayer = 27;
    const players = [];
    for (let i = 0; i < totalPlayers; i++) {
      const hand = deck.slice(i * cardsPerPlayer, (i + 1) * cardsPerPlayer);
      const isAI = aiSlots ? aiSlots.includes(i) : (i !== 0);
      players.push({
        id: `p${i}`,
        name: playerNames ? playerNames[i] : (i === 0 ? '你' : (isAI ? `AI玩家${i}` : `玩家${i+1}`)),
        hand: CE.sortHand(hand, '2'),
        isAI: isAI,
        seat: i,
        finished: false,
        finishOrder: -1,
      });
    }

    const gameState = {
      mode,
      players,
      totalPlayers,
      currentPlayerIndex: 0,
      lastPlay: null,         // { playerIndex, cards, type }
      lastPlayPlayerIndex: -1, // 最后出牌的人（不是过牌的人）
      passCount: 0,           // 连续过牌计数
      roundNumber: 0,
      level: '2',             // 当前级牌
      phase: 'playing',       // dealing | playing | finished
      deckRemaining: deck.slice(totalPlayers * cardsPerPlayer),
      timerSeconds: 60,
      timerInterval: null,
      history: [],
      finishedPlayers: [],
      // 进贡相关
      tributePhase: false,
      tributes: [],
    };

    // 确定先手（默认玩家0先手）
    gameState.currentPlayerIndex = 0;
    gameState.lastPlayPlayerIndex = 0;

    return gameState;
  }

  /**
   * 验证出牌是否合法
   */
  function isValidPlay(gameState, playerIndex, cards) {
    const player = gameState.players[playerIndex];
    const level = gameState.level;

    // 检查牌是否在手中
    for (const c of cards) {
      if (!player.hand.find(h => h.uid === c.uid)) return { valid: false, error: '牌不在手中' };
    }

    // 识别牌型
    const cardType = CE.identifyCardType(cards, level);
    if (!cardType) return { valid: false, error: '无效牌型' };

    // 检查张数
    if (cards.length < 1 || cards.length > 6) {
      return { valid: false, error: '只能出1-6张牌' };
    }

    // 如果是领出（上家是过牌或者自己是先手），任何合法牌型都可以
    if (gameState.lastPlay === null || gameState.lastPlayPlayerIndex === playerIndex) {
      return { valid: true, cardType };
    }

    // 不是领出，需要能压过上家
    const lastType = gameState.lastPlay.type;
    const cmp = CE.compareCardTypes(cardType, lastType);
    if (cmp === null) return { valid: false, error: '牌型不匹配，无法压牌（可出炸弹/同花顺）' };
    if (cmp <= 0) return { valid: false, error: '牌不够大，压不过上家' };

    return { valid: true, cardType };
  }

  /**
   * 执行出牌
   */
  function playCards(gameState, playerIndex, cards) {
    const result = isValidPlay(gameState, playerIndex, cards);
    if (!result.valid) return result;

    const player = gameState.players[playerIndex];

    // 从手牌移除
    const remaining = player.hand.filter(h => !cards.find(c => c.uid === h.uid));
    player.hand = remaining;

    // 更新游戏状态
    gameState.lastPlay = {
      playerIndex,
      cards,
      type: result.cardType,
    };
    gameState.lastPlayPlayerIndex = playerIndex;
    gameState.passCount = 0;
    gameState.roundNumber++;

    // 记录历史
    gameState.history.push({
      round: gameState.roundNumber,
      playerIndex,
      cards,
      type: result.cardType,
    });

    // 检查是否出完
    if (player.hand.length === 0) {
      player.finished = true;
      player.finishOrder = gameState.finishedPlayers.length + 1;
      gameState.finishedPlayers.push(playerIndex);

      // 检查游戏是否结束
      if (gameState.finishedPlayers.length >= gameState.totalPlayers - 1) {
        // 只剩一人没出完
        gameState.phase = 'finished';
        // 最后一个没出完的是末游
        const lastPlayer = gameState.players.find(p => !p.finished);
        if (lastPlayer) {
          lastPlayer.finished = true;
          lastPlayer.finishOrder = gameState.totalPlayers;
          gameState.finishedPlayers.push(gameState.players.indexOf(lastPlayer));
        }
      }
    }

    return { valid: true, gameState };
  }

  /**
   * 过牌
   * 规则：连续两人Pass → 新一轮，由最后出牌者领出
   */
  function passTurn(gameState, playerIndex) {
    gameState.passCount++;
    gameState.history.push({
      round: gameState.roundNumber,
      playerIndex,
      pass: true,
    });

    // 连续两人Pass → 新一轮
    if (gameState.passCount >= 2) {
      gameState.lastPlay = null;
      gameState.passCount = 0;
      // 最后出牌者领出新一轮
      gameState.currentPlayerIndex = gameState.lastPlayPlayerIndex;
      return { newRound: true, leaderIndex: gameState.lastPlayPlayerIndex };
    }

    return { newRound: false };
  }

  /**
   * 找到下一个未出完的玩家
   */
  function findNextActivePlayer(gameState, fromIndex) {
    const total = gameState.totalPlayers;
    for (let i = 1; i <= total; i++) {
      const idx = (fromIndex + i) % total;
      if (!gameState.players[idx].finished) return idx;
    }
    return fromIndex;
  }

  /**
   * 移动到下一个玩家
   */
  function nextTurn(gameState) {
    const next = findNextActivePlayer(gameState, gameState.currentPlayerIndex);
    gameState.currentPlayerIndex = next;

    // 如果是新一轮（上家出完或全部过牌），清除lastPlay
    if (gameState.lastPlayPlayerIndex === next || gameState.passCount === 0) {
      // 检查是否需要重置
      const activePlayers = gameState.players.filter(p => !p.finished);
      if (gameState.passCount >= activePlayers.length - 1) {
        gameState.lastPlay = null;
        gameState.passCount = 0;
      }
    }

    return gameState.currentPlayerIndex;
  }

  /**
   * 获取游戏结果
   */
  function getResults(gameState) {
    const order = [...gameState.finishedPlayers];
    return {
      order, // 完成顺序
      head: order[0],      // 头游
      second: order[1],    // 二游
      third: gameState.totalPlayers >= 4 ? order[2] : -1,  // 三游
      tail: order[order.length - 1],  // 末游
    };
  }

  /**
   * 计算升级数（四人模式）
   */
  function calculateUpgrade(gameState) {
    if (gameState.mode !== 'four') return 1; // 非四人模式简单升1级

    const results = getResults(gameState);
    const team1 = [0, 2]; // 0和2是队友
    const team2 = [1, 3]; // 1和3是队友

    // 判断头游属于哪个队伍
    const headTeam = team1.includes(results.head) ? team1 : team2;
    const headTeammate = headTeam[0] === results.head ? headTeam[1] : headTeam[0];
    const teammateFinish = gameState.players[headTeammate].finishOrder;

    if (teammateFinish === 2) return 3; // 头游+二游 = 升3级
    if (teammateFinish === 3) return 2; // 头游+三游 = 升2级
    if (teammateFinish === 4) return 1; // 头游+下游 = 升1级
    return 1;
  }

  /**
   * 升级
   */
  function levelUp(gameState, levels) {
    const currentIdx = LEVEL_SEQUENCE.indexOf(gameState.level);
    const newIdx = Math.min(currentIdx + levels, LEVEL_SEQUENCE.length - 1);
    gameState.level = LEVEL_SEQUENCE[newIdx];

    // 过A检测
    if (gameState.level === 'A') {
      const results = getResults(gameState);
      const head = results.head;
      const team1 = [0, 2];
      const team2 = [1, 3];
      const headTeam = team1.includes(head) ? team1 : team2;
      const headTeammate = headTeam[0] === head ? headTeam[1] : headTeam[0];
      const mateFinish = gameState.players[headTeammate].finishOrder;

      if (mateFinish === 4) {
        // 头游队友末游，冲A失败，退回K
        gameState.level = 'K';
        return { passedA: false, newLevel: 'K' };
      }
      return { passedA: true, newLevel: 'A' };
    }

    return { passedA: false, newLevel: gameState.level };
  }

  /**
   * 进贡计算（掼蛋完整规则）
   * 单下：末游→头游进贡最大牌（逢人配除外），头游还≤10的牌，末游先出
   * 双下：两个输家各进贡，头游收大牌二游收小牌；进贡大者先出
   */
  function calculateTribute(gameState) {
    if (gameState.mode !== 'four') return [];

    const results = getResults(gameState);
    const tributes = [];
    const team1 = [0, 2];
    const team2 = [1, 3];
    const headTeam = team1.includes(results.head) ? team1 : team2;
    const loseTeam = headTeam[0] === 0 ? team2 : team1;
    const level = gameState.level;

    // 判断双下：输方两人是三四名
    const losePlayer1 = gameState.players[loseTeam[0]];
    const losePlayer2 = gameState.players[loseTeam[1]];
    const isDoubleDown = (losePlayer1.finishOrder >= 3 && losePlayer2.finishOrder >= 3);

    if (isDoubleDown) {
      // 双下：找两个输家各自最大的非逢人配牌
      const lose1Max = findTributeCard(losePlayer1, level);
      const lose2Max = findTributeCard(losePlayer2, level);

      if (lose1Max && lose2Max) {
        const cmp = CE.compareCards(lose1Max.card, lose2Max.card, level);
        if (cmp > 0) {
          tributes.push({ from: loseTeam[0], to: results.head, card: lose1Max.card, isBigger: true });
          tributes.push({ from: loseTeam[1], to: results.second, card: lose2Max.card, isBigger: false });
        } else {
          tributes.push({ from: loseTeam[1], to: results.head, card: lose2Max.card, isBigger: true });
          tributes.push({ from: loseTeam[0], to: results.second, card: lose1Max.card, isBigger: false });
        }
      }
    } else {
      // 单下：末游→头游进贡
      const tailPlayer = gameState.players[results.tail];
      const tributeCard = findTributeCard(tailPlayer, level);
      if (tributeCard) {
        tributes.push({ from: results.tail, to: results.head, card: tributeCard.card, isBigger: true });
      }
    }

    return tributes;
  }

  function findTributeCard(player, level) {
    const eligible = player.hand.filter(c => !CE.isWildCard(c, level));
    if (eligible.length === 0) return null;
    const sorted = CE.sortHand(eligible, level);
    return { card: sorted[0], rank: sorted[0].rank };
  }

  /**
   * 执行进贡和还牌
   */
  function executeTribute(gameState, tributes) {
    const level = gameState.level;
    for (const t of tributes) {
      const fromPlayer = gameState.players[t.from];
      const toPlayer = gameState.players[t.to];

      // 进贡
      fromPlayer.hand = fromPlayer.hand.filter(c => c.uid !== t.card.uid);
      toPlayer.hand.push(t.card);
      toPlayer.hand = CE.sortHand(toPlayer.hand, level);

      // 还牌：赢家还一张≤10的牌（逢人配不还）
      const smallCards = toPlayer.hand.filter(c => {
        if (CE.isWildCard(c, level)) return false;
        const rv = CE.RANK_VALUE[c.rank];
        return rv !== undefined && rv <= CE.RANK_VALUE['10'];
      });
      if (smallCards.length > 0) {
        const returnCard = smallCards[smallCards.length - 1];
        toPlayer.hand = toPlayer.hand.filter(c => c.uid !== returnCard.uid);
        fromPlayer.hand.push(returnCard);
        fromPlayer.hand = CE.sortHand(fromPlayer.hand, level);
      }
    }
  }

  /**
   * 获取进贡后先手玩家
   * 双下：进贡大者先出 | 单下：进贡者（末游）先出 | 抗贡：头游先出
   */
  function getTributeFirstPlayer(gameState, tributes, resisted) {
    if (resisted) return getResults(gameState).head;
    if (tributes.length === 0) return 0;
    const bigger = tributes.find(t => t.isBigger);
    return bigger ? bigger.from : tributes[0].from;
  }

  /**
   * 检查抗贡：末游有2张大王 → 免贡，头游先出
   */
  function checkTributeResist(gameState) {
    const results = getResults(gameState);
    const tail = results.tail;
    const tailPlayer = gameState.players[tail];
    const bigKings = tailPlayer.hand.filter(c => c.rank === 'XB').length;
    return bigKings >= 2;
  }

  return {
    createGame,
    isValidPlay,
    playCards,
    passTurn,
    findNextActivePlayer,
    nextTurn,
    getResults,
    calculateUpgrade,
    levelUp,
    calculateTribute,
    executeTribute,
    checkTributeResist,
    getTributeFirstPlayer,
    LEVEL_SEQUENCE,
  };
})();

if (typeof window !== 'undefined') {
  window.GameEngine = GameEngine;
}
