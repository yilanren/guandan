/**
 * 掼蛋游戏 - 前端主控制器
 * 管理界面切换、用户交互、动画效果
 */

(function() {
  'use strict';

  // === DOM引用 ===
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // === 游戏状态 ===
  let game = null;
  let currentScreen = 'menu';
  let selectedCards = [];
  let timerInterval = null;
  let timerSeconds = 60;
  let currentMode = null;
  let teammateType = null;
  let isMultiplayer = false;
  let socket = null;
  let roomCode = null;
  let playerSeat = 0;
  const CE = window.CardEngine;
  let dealingInProgress = false;

  // === 初始化 ===
  function init() {
    bindMenuEvents();
    checkSaveGame();
  }

  // === 屏幕切换 ===
  function switchScreen(name) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    const screen = $(`#${name}-screen`);
    if (screen) screen.classList.add('active');
    currentScreen = name;
  }

  // === 检查存档 ===
  function checkSaveGame() {
    if (GameStorage.hasSave()) {
      switchScreen('save');
      $('#btn-continue').onclick = () => {
        const saveData = GameStorage.loadGame();
        if (saveData) {
          restoreGame(saveData);
        } else {
          switchScreen('menu');
        }
      };
      $('#btn-restart').onclick = () => {
        GameStorage.clearSave();
        switchScreen('menu');
      };
    }
  }

  // === 恢复游戏 ===
  function restoreGame(saveData) {
    // 恢复游戏状态
    const gs = saveData.gameState;
    game = {
      mode: gs.mode,
      totalPlayers: gs.totalPlayers,
      players: gs.players,
      currentPlayerIndex: gs.currentPlayerIndex,
      lastPlay: gs.lastPlay,
      lastPlayPlayerIndex: gs.lastPlayPlayerIndex,
      passCount: gs.passCount,
      roundNumber: gs.roundNumber,
      level: gs.level,
      phase: gs.phase,
      history: gs.history || [],
      finishedPlayers: gs.finishedPlayers || [],
      timerSeconds: 60,
      timerInterval: null,
      tributePhase: false,
      tributes: [],
    };
    currentMode = gs.mode;
    startGameScreen();
    renderGame();
    startTimer();
  }

  // === 菜单事件绑定 ===
  function bindMenuEvents() {
    // 主菜单模式按钮
    $$('#menu-screen .menu-btn[data-mode]').forEach(btn => {
      btn.addEventListener('click', function() {
        currentMode = this.dataset.mode;
        if (currentMode === 'single') {
          teammateType = 'ai';
          startSinglePlayerGame();
        } else {
          // 多人模式，弹出匹配选择
          const titles = { two: '两人对局', three: '三人对局', four: '四人对局' };
          $('#match-modal-title').textContent = titles[currentMode] || currentMode;
          $('#match-modal').style.display = 'flex';
        }
      });
    });

    // 匹配弹窗
    $('#btn-match-real').addEventListener('click', () => {
      $('#match-modal').style.display = 'none';
      teammateType = 'real';
      startMultiplayerGame();
    });
    $('#btn-match-ai').addEventListener('click', () => {
      $('#match-modal').style.display = 'none';
      teammateType = 'ai';
      startGameWithAI();
    });
    $('#btn-match-cancel').addEventListener('click', () => {
      $('#match-modal').style.display = 'none';
    });

    // 新手教程
    $('#btn-tutorial').addEventListener('click', () => {
      switchScreen('tutorial');
    });
    $('#btn-tutorial-close').addEventListener('click', () => {
      switchScreen('menu');
    });

    // 模式选择
    $('#btn-ai-teammate').addEventListener('click', () => {
      teammateType = 'ai';
      startGameWithAI();
    });
    $('#btn-real-teammate').addEventListener('click', () => {
      teammateType = 'real';
      startMultiplayerGame();
    });
    $('#btn-mode-back').addEventListener('click', () => {
      switchScreen('menu');
    });

    // 色子
    $('#btn-roll-dice').addEventListener('click', rollDice);

    // 游戏操作
    $('#btn-play').addEventListener('click', playSelectedCardsAction);
    $('#btn-pass').addEventListener('click', passTurnAction);
    $('#btn-hint').addEventListener('click', showHint);

    // 结果
    $('#btn-next-game').addEventListener('click', startNextGame);
    $('#btn-back-menu').addEventListener('click', () => {
      stopTimer();
      switchScreen('menu');
    });

    // 房间
    $('#btn-copy-code').addEventListener('click', copyRoomCode);
    $('#btn-add-ai').addEventListener('click', addAIToRoom);
    $('#btn-start-game').addEventListener('click', startRoomGame);
    $('#btn-leave-room').addEventListener('click', leaveRoom);
  }

  // === 单人模式 ===
  function startSinglePlayerGame() {
    isMultiplayer = false;
    game = GameEngine.createGame({
      mode: 'single',
      playerNames: ['你', 'AI对手'],
      aiSlots: [1], // 玩家0是人类，玩家1是AI
    });
    switchScreen('dice');
  }

  // === 摇色子 ===
  function rollDice() {
    const diceEl = $('#dice-element');
    const resultEl = $('#dice-result');
    const btn = $('#btn-roll-dice');

    btn.disabled = true;
    resultEl.style.display = 'none';
    diceEl.textContent = '🎲';
    diceEl.classList.add('rolling');

    setTimeout(() => {
      diceEl.classList.remove('rolling');
      // 随机决定结果
      const isBlue = Math.random() < 0.5;

      if (isBlue) {
        diceEl.textContent = '🔵';
        resultEl.textContent = '🔵 蓝色！你先手';
        resultEl.className = 'dice-result blue';
        playerSeat = 0;
        game.currentPlayerIndex = 0;
        game.lastPlayPlayerIndex = 0;
      } else {
        diceEl.textContent = '🔴';
        resultEl.textContent = '🔴 红色！对方先手';
        resultEl.className = 'dice-result red';
        playerSeat = 0;
        game.currentPlayerIndex = 1;
        game.lastPlayPlayerIndex = 1;
      }
      resultEl.style.display = 'block';

      // 2秒后进入游戏
      setTimeout(() => {
        startGameScreen();
        instantDeal();
      }, 2000);
    }, 800);
  }

  // === AI队友模式 - 直接开始 ===
  function startGameWithAI() {
    isMultiplayer = false;
    const totalPlayers = { two: 2, three: 3, four: 4 }[currentMode] || 4;
    const names = ['你'];
    const aiSlots = [];
    for (let i = 1; i < totalPlayers; i++) {
      names.push(currentMode === 'four' && i === 2 ? 'AI队友' : `AI玩家${i+1}`);
      aiSlots.push(i);
    }

    game = GameEngine.createGame({
      mode: currentMode,
      playerNames: names,
      aiSlots,
    });

    // 随机先手
    game.currentPlayerIndex = Math.floor(Math.random() * totalPlayers);
    game.lastPlayPlayerIndex = game.currentPlayerIndex;
    playerSeat = 0;

    startGameScreen();
    instantDeal();
  }

  // === 真人对战模式 - 创建房间 ===
  function startMultiplayerGame() {
    isMultiplayer = true;
    connectSocket();
  }

  // === Socket.io 连接 ===
  function connectSocket() {
    socket = io();

    socket.on('connect', () => {
      // 加入匹配队列（而不是创建房间）
      socket.emit('join_matchmaking', { mode: currentMode }, (res) => {
        if (res.success) {
          switchScreen('room');
          const totalSlots = { two: 2, three: 3, four: 4 }[currentMode];
          $('#room-code').textContent = '匹配中...';
          $('#room-waiting-text').textContent =
            `正在匹配 ${res.queueLen}/${res.needed} 人...`;
          $('#room-players-list').innerHTML =
            `<div style="text-align:center;color:var(--gold-light);">已就位: ${res.queueLen} / ${res.needed}</div>`;
        }
      });
    });

    // 匹配成功
    socket.on('match_found', (data) => {
      roomCode = data.roomCode;
      playerSeat = data.players.findIndex(p => p.id === socket.id);
      $('#room-code').textContent = roomCode;
      $('#room-waiting-text').textContent = '✅ 匹配成功！即将开始...';
      renderRoomPlayers(data.players);

      // 1.5秒后摇色子进游戏
      setTimeout(() => {
        // 摇色子定先手
        const diceResult = Math.random() < 0.5 ? 'blue' : 'red';
        if (diceResult === 'blue') {
          playerFirst = true;
        }
        startMultiplayerGameScreen(data.players);
      }, 1500);
    });

    socket.on('room_update', (data) => {
      renderRoomPlayers(data.players);
    });

    socket.on('game_starting', () => {
      startMultiplayerGameScreen();
    });

    socket.on('cards_played', (data) => handleRemotePlay(data));
    socket.on('player_passed', (data) => handleRemotePass(data));

    socket.on('disconnect', () => {
      if (currentScreen === 'game' || currentScreen === 'room') {
        showToast('连接断开');
      }
    });
  }

  function renderRoomPlayers(players) {
    const container = $('#room-players-list');
    const totalSlots = { two: 2, three: 3, four: 4 }[currentMode] || 4;
    let html = '';
    for (let i = 0; i < totalSlots; i++) {
      const player = players[i];
      if (player) {
        html += `<div class="room-player-slot filled">
          <span>👤 ${player.name}</span>
          <span style="color:#4caf50;">✓ 已就位</span>
        </div>`;
      } else {
        html += `<div class="room-player-slot empty">
          <span>空位</span>
          <span>等待加入...</span>
        </div>`;
      }
    }
    container.innerHTML = html;
  }

  function updateRoomWaitingText(players, totalSlots) {
    const waiting = $('#room-waiting-text');
    const remaining = totalSlots - players.length;
    if (remaining <= 0) {
      waiting.textContent = '✅ 人数已满，可以开始游戏！';
      waiting.style.color = '#4caf50';
    } else {
      waiting.textContent = `等待玩家加入... 还差 ${remaining} 人`;
    }
  }

  function copyRoomCode() {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode).then(() => {
        showToast('✅ 房间号已复制！发送给好友加入');
      }).catch(() => {
        showToast(`房间号: ${roomCode} (请手动复制)`);
      });
    }
  }

  function addAIToRoom() {
    socket.emit('add_ai_player', { roomCode }, (res) => {
      if (res.success) {
        renderRoomPlayers(res.players);
      }
    });
  }

  function startRoomGame() {
    socket.emit('start_game', { roomCode }, (res) => {
      if (!res.success) {
        showToast(res.error || '无法开始游戏');
      }
    });
  }

  function leaveRoom() {
    if (socket) {
      socket.emit('cancel_matchmaking');
      socket.disconnect();
      socket = null;
    }
    roomCode = null;
    switchScreen('menu');
  }

  function startMultiplayerGameScreen(players) {
    const names = (players || []).map(p => p.name);
    game = GameEngine.createGame({
      mode: currentMode,
      playerNames: names.length > 0 ? names : ['你'],
      aiSlots: [],
    });
    playerSeat = 0;
    game.currentPlayerIndex = Math.floor(Math.random() * game.totalPlayers);
    game.lastPlayPlayerIndex = game.currentPlayerIndex;
    startGameScreen();
    instantDeal();
  }

  function handleRemotePlay(data) {
    // 远程玩家出牌
    // TODO: 更新游戏状态
    renderGame();
  }

  function handleRemotePass(data) {
    // 远程玩家过牌
    GameEngine.passTurn(game, data.playerSeat);
    GameEngine.nextTurn(game);
    renderGame();
  }

  // === 开始游戏界面 ===
  function startGameScreen() {
    switchScreen('game');
    // 显示级牌
    showLevelCardDisplay(game.level);
    renderGame();
    startTimer();
    saveCurrentGame();

    // 新手教程提示
    if (GameStorage.shouldShowTutorial()) {
      setTimeout(() => {
        showToast('💡 提示：每回合60秒，超时自动出最小牌。选牌后点击"出牌"按钮。');
        GameStorage.incrementTutorial();
      }, 1500);
    }

    // 如果是AI回合，触发AI
    if (isCurrentPlayerAI()) {
      setTimeout(() => aiTakeTurn(), 1500);
    }
  }

  // === 级牌展示动画（纯CSS牌） ===
  function showLevelCardDisplay(level) {
    const div = document.createElement('div');
    div.className = 'level-card-display';
    const cardDiv = makePokerCard({ suit: 'H', rank: level, uid: 'level' }, 'lg');
    cardDiv.style.width = '80px';
    cardDiv.style.height = '112px';
    cardDiv.style.margin = '0 auto';
    cardDiv.querySelector('.center-suit').style.fontSize = '44px';
    cardDiv.querySelector('.corner-rank').style.fontSize = '20px';
    cardDiv.querySelector('.corner-suit').style.fontSize = '16px';
    div.innerHTML = `<div style="text-align:center;color:var(--gold);margin-bottom:10px;font-weight:900;font-size:1.1em;">⭐ 本局级牌: ${level}</div>`;
    div.appendChild(cardDiv);
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 1800);
  }

  // === 即时发牌（不逐张动画） ===
  function instantDeal() {
    renderGame();
    if (isCurrentPlayerAI()) {
      setTimeout(() => aiTakeTurn(), 800);
    }
  }

  // === 渲染游戏 ===
  function renderGame() {
    if (!game) return;

    // 更新级牌显示
    $('#game-level').textContent = game.level;

    renderOpponents();
    renderPlayArea();
    renderMyHand();
    updateActionButtons();
    saveCurrentGame();

    // 检查游戏是否结束
    if (game.phase === 'finished') {
      setTimeout(() => showResults(), 1500);
      return;
    }

    // 检查是否该当前玩家出牌
    if (game.currentPlayerIndex !== 0 && isCurrentPlayerAI() && !dealingInProgress) {
      setTimeout(() => aiTakeTurn(), 800);
    }
  }

  // === 渲染对手（紧凑版） ===
  function renderOpponents() {
    const container = $('#opponents-area');
    if (!container) return;

    let html = '';
    for (let i = 0; i < game.totalPlayers; i++) {
      if (i === 0) continue;
      const player = game.players[i];
      const activeClass = (game.currentPlayerIndex === i && !player.finished) ? ' active-turn' : '';

      if (player.finished) {
        html += `<div class="opponent-slot" style="opacity:0.4;">
          <div class="opponent-name">${player.name} ✅ #${player.finishOrder}</div>
        </div>`;
      } else {
        const count = player.hand.length;
        const backImgs = [];
        for (let j = 0; j < Math.min(count, 8); j++) {
          backImgs.push(`<img src="cards/back.png" alt="背面">`);
        }
        html += `<div class="opponent-slot${activeClass}">
          <div class="opponent-name">${player.name}${activeClass ? ' ⏳' : ''}</div>
          <div class="opponent-cards-row">${backImgs.join('')}</div>
          <div class="opponent-count">${count}张</div>
        </div>`;
      }
    }
    container.innerHTML = html;
  }

  // === 渲染当前出牌（只显示桌上最新出的牌） ===
  function renderPlayArea() {
    const container = $('#play-history');
    const hint = $('#play-current-hint');
    if (!container) return;

    const typeNames = {
      single: '单张', pair: '对子', triple: '三同张',
      triple_pair: '三带二', triple_pair_5: '三带二',
      straight: '顺子',
      triple_straight: '木板', plane: '钢板',
      flush_straight: '同花顺', bomb_4: '💣4炸',
      bomb_5: '💣5炸', bomb_6: '💣6炸',
      four_kings: '👑天王炸',
    };

    // 只显示桌上最新出的牌
    let html = '';
    if (game.lastPlay && game.lastPlay.cards) {
      const lp = game.lastPlay;
      const p = game.players[lp.playerIndex];
      const isMe = lp.playerIndex === 0;
      const tagClass = isMe ? 'me' : 'ai';
      const cardsDivs = lp.cards.map(c => {
        const isRed = c.suit === 'H' || c.suit === 'D' || c.suit === 'Joker';
        const s = SUIT_SYMBOLS[c.suit] || '';
        let r = c.rank;
        if (r === 'XS') r = '小'; else if (r === 'XB') r = '大';
        return `<div class="poker-card-sm ${isRed ? 'red' : 'black'}">
          <span class="corner-rank">${r}</span><span class="corner-suit">${s}</span>
          <span class="center-suit">${s}</span></div>`;
      }).join('');
      const typeName = typeNames[lp.type.type] || (lp.type.subtype ? typeNames[lp.type.subtype] : lp.type.type);
      html = `<div class="play-round leader">
        <span class="player-tag ${tagClass}">${p.name}</span>
        <div class="play-cards-imgs">${cardsDivs}</div>
        <span class="play-type-tag">${typeName}</span>
      </div>`;
    } else {
      html = '<div style="text-align:center;color:rgba(255,255,255,0.3);font-size:0.85em;">新一轮，请出牌</div>';
    }
    container.innerHTML = html;

    // 当前轮到谁
    if (hint) {
      const curP = game.players[game.currentPlayerIndex];
      if (curP && !curP.finished) {
        const isLeader = !game.lastPlay || game.lastPlayPlayerIndex === game.currentPlayerIndex;
        hint.textContent = isLeader ? `👉 ${curP.name} 请出牌（领出）` : `👉 ${curP.name} 请跟牌`;
      }
    }
  }

  // === 纯CSS扑克牌（不用PNG图片，加载快，不会失败） ===
  const SUIT_SYMBOLS = { S: '♠', H: '♥', C: '♣', D: '♦', Joker: '★' };

  function makePokerCard(card, size) {
    const isRed = card.suit === 'H' || card.suit === 'D' || card.suit === 'Joker';
    const symbol = SUIT_SYMBOLS[card.suit] || '';
    let rank = card.rank;
    if (rank === 'XS') rank = '小';
    else if (rank === 'XB') rank = '大';

    // 逢人配标记
    const isWild = game && CE.isWildCard(card, game.level);

    const cls = size === 'sm' ? 'poker-card-sm' : 'poker-card';
    const div = document.createElement('div');
    div.className = `${cls} ${isRed ? 'red' : 'black'}${isWild ? ' wild-card' : ''}`;
    div.dataset.cardUid = card.uid;
    div.innerHTML = `
      <span class="corner-rank">${rank}</span>
      <span class="corner-suit">${symbol}</span>
      <span class="center-suit">${symbol}</span>
      ${isWild ? '<span class="wild-badge">百</span>' : ''}
      ${size !== 'sm' ? `<span class="bottom-rank">${rank}</span>` : ''}`;
    return div;
  }

  function createCardElement(card) {
    const el = makePokerCard(card, 'lg');
    el.addEventListener('click', function() {
      toggleCardSelection(el, card);
    });
    return el;
  }

  // === 渲染我的手牌 ===
  function renderMyHand() {
    const container = $('#my-hand-cards');
    if (!container) return;
    container.innerHTML = '';
    for (const card of game.players[0].hand) {
      const el = createCardElement(card);
      if (selectedCards.find(c => c.uid === card.uid)) el.classList.add('selected');
      container.appendChild(el);
    }
    const hint = $('#play-current-hint');
    const myLen = game.players[0].hand.length;
    if (hint && myLen <= 10) {
      const baseText = (hint.textContent || '').split('|')[0];
      hint.textContent = baseText + ` | ⚠️ 你剩 ${myLen} 张`;
    }
  }

  // === 选牌 ===
  function toggleCardSelection(imgEl, card) {
    const idx = selectedCards.findIndex(c => c.uid === card.uid);
    if (idx >= 0) {
      selectedCards.splice(idx, 1);
      imgEl.classList.remove('selected');
    } else {
      // 最多选6张
      if (selectedCards.length >= 6) {
        showToast('最多只能选6张牌');
        return;
      }
      selectedCards.push(card);
      imgEl.classList.add('selected');
    }
  }

  // === 出牌 ===
  function playSelectedCardsAction() {
    if (selectedCards.length === 0) {
      showToast('请先选择要出的牌（点击手牌）');
      return;
    }
    if (selectedCards.length > 6) {
      showToast('最多只能出6张牌');
      return;
    }

    const result = GameEngine.playCards(game, 0, selectedCards);
    if (!result.valid) {
      showToast(result.error || '出牌不合法');
      return;
    }

    // 保存已出的牌（在清空selectedCards之前）
    const playedCards = [...selectedCards];
    const playedType = game.lastPlay.type;

    // 清除选中
    selectedCards = [];
    $$('#my-hand-cards .poker-card.selected').forEach(el => el.classList.remove('selected'));

    // 如果联网，同步到服务器
    if (isMultiplayer && socket) {
      socket.emit('play_cards', {
        roomCode,
        cards: playedCards,
        cardType: playedType,
      });
    }

    // 下一回合（出牌不会触发newRound，安全调用）
    GameEngine.nextTurn(game);
    resetTimer();
    renderGame();

    // AI回合
    if (isCurrentPlayerAI()) {
      setTimeout(() => aiTakeTurn(), 800);
    }
  }

  // === 要不起 ===
  function passTurnAction() {
    // 如果是领出，不能要不起
    if (!game.lastPlay || game.lastPlayPlayerIndex === 0) {
      showToast('你是领出者，不能要不起');
      return;
    }

    const passResult = GameEngine.passTurn(game, 0);
    selectedCards = [];
    $$('#my-hand-cards .poker-card.selected').forEach(el => el.classList.remove('selected'));

    if (isMultiplayer && socket) {
      socket.emit('pass_turn', { roomCode });
    }

    // 新回合：领出者已经在 passTurn 中设好了，不要再 nextTurn
    if (!passResult.newRound) {
      GameEngine.nextTurn(game);
    } else {
      // 新回合，桌面清空
    }
    resetTimer();
    renderGame();

    if (isCurrentPlayerAI()) {
      setTimeout(() => aiTakeTurn(), 800);
    }
  }

  // === 更新操作按钮 ===
  function updateActionButtons() {
    const playBtn = $('#btn-play');
    const passBtn = $('#btn-pass');

    if (game.phase === 'finished') {
      playBtn.disabled = true;
      passBtn.disabled = true;
      return;
    }

    if (game.currentPlayerIndex === 0) {
      // 我的回合
      playBtn.disabled = false;
      const isLeader = !game.lastPlay || game.lastPlayPlayerIndex === 0;
      passBtn.disabled = isLeader;
    } else {
      // 等待中
      playBtn.disabled = true;
      passBtn.disabled = true;
    }
  }

  // === 计时器 ===
  function startTimer() {
    stopTimer();
    timerSeconds = 60;
    updateTimerDisplay();

    timerInterval = setInterval(() => {
      timerSeconds--;
      updateTimerDisplay();

      if (timerSeconds <= 10) {
        $('#game-timer').classList.add('urgent');
      }

      if (timerSeconds <= 0) {
        // 超时
        if (game.currentPlayerIndex === 0) {
          autoPlaySmallest();
        }
        resetTimer();
      }
    }, 1000);
  }

  function resetTimer() {
    stopTimer();
    timerSeconds = 60;
    updateTimerDisplay();
    $('#game-timer').classList.remove('urgent');
    startTimer();
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function updateTimerDisplay() {
    const el = $('#game-timer');
    if (el) {
      const mins = Math.floor(timerSeconds / 60);
      const secs = timerSeconds % 60;
      el.textContent = `⏱ ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
  }

  // === 超时自动出最小牌 ===
  function autoPlaySmallest() {
    const hand = game.players[0].hand;
    const level = game.level;
    const isLeader = !game.lastPlay || game.lastPlayPlayerIndex === 0;

    let newRound = false;
    if (isLeader) {
      const smallest = GameEngine.findSmallestPlay(hand, level);
      if (smallest) {
        GameEngine.playCards(game, 0, smallest.cards);
      }
    } else {
      const beating = GameEngine.findBeatingPlays(hand, game.lastPlay.type, level);
      if (beating.length > 0) {
        beating.sort((a, b) => a.type.mainRankValue - b.type.mainRankValue);
        GameEngine.playCards(game, 0, beating[0].cards);
      } else {
        const pr = GameEngine.passTurn(game, 0);
        newRound = pr.newRound;
      }
    }

    selectedCards = [];
    if (!newRound) {
      GameEngine.nextTurn(game);
    }
    renderGame();

    if (GameStorage.shouldShowTutorial()) {
      showToast('⏰ 时间到！已自动出牌。请记得及时出牌哦~');
      GameStorage.incrementTutorial();
    }
  }

  // === 提示 ===
  function showHint() {
    if (game.currentPlayerIndex !== 0) return;

    // 找到能打的牌
    if (game.lastPlay && game.lastPlayPlayerIndex !== 0) {
      const beating = GameEngine.findBeatingPlays(game.players[0].hand, game.lastPlay.type, game.level);
      if (beating.length > 0) {
        // 选最小的能压过的牌
        beating.sort((a, b) => a.type.mainRankValue - b.type.mainRankValue);
        showToast(`💡 建议出：${beating[0].type.type} (${beating[0].cards.length}张)`);
        // 自动选中
        selectedCards = beating[0].cards;
        renderMyHand();
      } else {
        showToast('💡 没有能压过的牌，建议要不起');
      }
    } else {
      const allPlays = GameEngine.findAllPlays(game.players[0].hand, game.level);
      if (allPlays.length > 0) {
        const smallest = allPlays.sort((a, b) => a.type.mainRankValue - b.type.mainRankValue)[0];
        showToast(`💡 建议出：${smallest.type.type} (${smallest.cards.length}张)`);
      }
    }
  }

  // === AI回合 ===
  function aiTakeTurn() {
    if (game.phase === 'finished') return;

    const aiIndex = game.currentPlayerIndex;
    const aiPlayer = game.players[aiIndex];
    if (!aiPlayer.isAI) return;

    const myRemaining = game.players[0].hand.length;

    // 判断当前是否领出
    let lastPlay = null;
    if (game.lastPlay && game.lastPlayPlayerIndex !== aiIndex) {
      lastPlay = game.lastPlay;
    }

    const decision = AI.decidePlay(aiPlayer.hand, lastPlay, game.level, myRemaining);

    let newRound = false;
    if (decision) {
      GameEngine.playCards(game, aiIndex, decision.cards);
    } else {
      if (game.lastPlay && game.lastPlayPlayerIndex !== aiIndex) {
        const pr = GameEngine.passTurn(game, aiIndex);
        newRound = pr.newRound;
      } else {
        const smallest = GameEngine.findSmallestPlay(aiPlayer.hand, game.level);
        if (smallest) {
          GameEngine.playCards(game, aiIndex, smallest.cards);
        }
      }
    }

    if (!newRound) {
      GameEngine.nextTurn(game);
    }
    resetTimer();
    renderGame();

    // 如果下一个还是AI，继续
    if (isCurrentPlayerAI() && game.phase !== 'finished') {
      setTimeout(() => aiTakeTurn(), 1000);
    }
  }

  function isCurrentPlayerAI() {
    if (!game) return false;
    const player = game.players[game.currentPlayerIndex];
    return player && player.isAI && !player.finished;
  }

  // === 显示结果 ===
  function showResults() {
    stopTimer();
    switchScreen('result');

    const results = GameEngine.getResults(game);
    const head = results.head;
    const isWin = head === 0; // 玩家是否是头游

    $('#result-title').textContent = isWin ? '🎉 恭喜获胜！' : '😞 再接再厉';
    $('#result-title').style.color = isWin ? 'var(--gold)' : '#ccc';

    // 升级计算
    let levelInfo = '';
    if (game.mode === 'four') {
      const upgrade = GameEngine.calculateUpgrade(game);
      const lvlResult = GameEngine.levelUp(game, upgrade);
      levelInfo = `⬆ 升 ${upgrade} 级 → 当前级牌: ${lvlResult.newLevel}`;
      if (lvlResult.passedA) levelInfo += ' 🏆 恭喜过A！';
    } else {
      game.level = GameEngine.LEVEL_SEQUENCE[
        Math.min(GameEngine.LEVEL_SEQUENCE.indexOf(game.level) + 1, GameEngine.LEVEL_SEQUENCE.length - 1)
      ];
      levelInfo = `⬆ 升至 ${game.level}`;
    }
    $('#result-level-up').textContent = levelInfo;

    // 排名列表
    const order = game.finishedPlayers;
    const rankNames = ['头游🥇', '二游🥈', '三游🥉', '末游'];
    const rankClasses = ['head', 'second', 'third', 'tail'];
    let html = '';
    for (let i = 0; i < order.length; i++) {
      const p = game.players[order[i]];
      html += `<div class="result-player ${rankClasses[i]}">
        <span>${rankNames[i]}</span>
        <span>${p.name}</span>
      </div>`;
    }
    $('#result-players-list').innerHTML = html;

    // 升级动画
    setTimeout(() => {
      showLevelUpAnimation(game.level);
    }, 800);

    // 清除选中
    selectedCards = [];
  }

  // === 升级动画 ===
  function showLevelUpAnimation(newLevel) {
    const overlay = document.createElement('div');
    overlay.className = 'level-up-overlay';
    overlay.innerHTML = `
      <div class="level-up-stars">⭐✨⭐</div>
      <div class="level-up-text">级牌: ${newLevel}</div>
      <div style="color:var(--gold-light);margin-top:8px;">升级成功！</div>
    `;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 2000);
  }

  // === 下一局 ===
  function startNextGame() {
    const currentLevel = game.level;
    const currentMode = game.mode;

    // 计算升级
    if (currentMode === 'four') {
      const upgrade = GameEngine.calculateUpgrade(game);
      const lvlResult = GameEngine.levelUp(game, upgrade);
    } else {
      const idx = GameEngine.LEVEL_SEQUENCE.indexOf(currentLevel);
      game.level = GameEngine.LEVEL_SEQUENCE[Math.min(idx + 1, GameEngine.LEVEL_SEQUENCE.length - 1)];
    }

    // 保存旧游戏结果（进贡需要）
    const oldResults = GameEngine.getResults(game);
    const tributes = GameEngine.calculateTribute(game);
    const resisted = (currentMode === 'four') ? GameEngine.checkTributeResist(game) : false;
    const oldPlayerConfig = game.players.map(p => ({ name: p.name, isAI: p.isAI }));

    // 创建新游戏（重新发牌）
    game = GameEngine.createGame({
      mode: currentMode,
      playerNames: oldPlayerConfig.map(p => p.name),
      aiSlots: oldPlayerConfig.map((p, i) => p.isAI ? i : -1).filter(i => i >= 0),
    });
    game.level = currentLevel;

    // 执行进贡（在新手牌上进行）
    if (tributes.length > 0 && !resisted) {
      // 重新计算进贡（因为手牌变了）
      const newTributes = GameEngine.calculateTribute(game);
      if (newTributes.length > 0) {
        GameEngine.executeTribute(game, newTributes);
        // 确定先手
        const firstPlayer = GameEngine.getTributeFirstPlayer(game, newTributes, false);
        game.currentPlayerIndex = firstPlayer;
        game.lastPlayPlayerIndex = firstPlayer;
      }
    } else {
      // 抗贡或无进贡：头游先出
      const firstPlayer = resisted ? oldResults.head : 0;
      game.currentPlayerIndex = firstPlayer;
      game.lastPlayPlayerIndex = firstPlayer;
    }

    startGameScreen();
    instantDeal();
  }

  // === 存档 ===
  function saveCurrentGame() {
    if (!game || game.phase === 'finished') return;
    GameStorage.saveGame(game, {
      totalWins: 0,
      totalGames: 0,
    });
  }

  // === Toast消息 ===
  function showToast(msg) {
    const existing = document.querySelector('.tutorial-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'tutorial-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  function showEmoji(data) {
    showToast(`${data.emoji}`);
  }

  // === 启动 ===
  init();

})();
