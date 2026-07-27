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

  // === 跨局持久状态（等级追踪） ===
  let playerLevels = ['2', '2', '2', '2']; // 每个玩家的当前等级
  let dealerSeat = 0; // 当前坐庄的玩家
  let playerAAttempts = [0, 0, 0, 0]; // 冲A已尝试次数（每人独立）

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

    // 创建房间
    const btnCreateRoom = $('#btn-create-room');
    if (btnCreateRoom) btnCreateRoom.addEventListener('click', () => {
      // 默认四人模式（经典），弹出模式选择
      currentMode = 'four';
      teammateType = 'real';
      createRoomAndWait();
    });

    // 新手教程
    $('#btn-tutorial').addEventListener('click', () => {
      switchScreen('tutorial');
    });
    $('#btn-tutorial-close').addEventListener('click', () => {
      switchScreen('menu');
    });

    // 模式选择（旧版UI兼容，元素可能不存在）
    const btnAiTeammate = $('#btn-ai-teammate');
    if (btnAiTeammate) btnAiTeammate.addEventListener('click', () => {
      teammateType = 'ai';
      startGameWithAI();
    });
    const btnRealTeammate = $('#btn-real-teammate');
    if (btnRealTeammate) btnRealTeammate.addEventListener('click', () => {
      teammateType = 'real';
      startMultiplayerGame();
    });
    const btnModeBack = $('#btn-mode-back');
    if (btnModeBack) btnModeBack.addEventListener('click', () => {
      switchScreen('menu');
    });

    // 色子
    const btnRollDice = $('#btn-roll-dice');
    if (btnRollDice) btnRollDice.addEventListener('click', rollDice);

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
    const btnCopyCode = $('#btn-copy-code');
    if (btnCopyCode) btnCopyCode.addEventListener('click', copyRoomCode);
    const btnAddAi = $('#btn-add-ai');
    if (btnAddAi) btnAddAi.addEventListener('click', addAIToRoom);
    const btnStartGame = $('#btn-start-game');
    if (btnStartGame) btnStartGame.addEventListener('click', startRoomGame);
    const btnLeaveRoom = $('#btn-leave-room');
    if (btnLeaveRoom) btnLeaveRoom.addEventListener('click', leaveRoom);

    // 加入房间
    const btnJoinRoom = $('#btn-join-room');
    if (btnJoinRoom) btnJoinRoom.addEventListener('click', showJoinRoomModal);
    const btnConfirmJoin = $('#btn-confirm-join');
    if (btnConfirmJoin) btnConfirmJoin.addEventListener('click', confirmJoinRoom);
    const btnCancelJoin = $('#btn-cancel-join');
    if (btnCancelJoin) btnCancelJoin.addEventListener('click', () => {
      $('#join-room-modal').style.display = 'none';
    });

  }

  // === 单人模式 ===
  function startSinglePlayerGame() {
    isMultiplayer = false;
    playerLevels = ['2', '2', '2', '2']; // 重置等级
    playerAAttempts = [0, 0, 0, 0]; // 重置冲A计数
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
        dealerSeat = 0;
      } else {
        diceEl.textContent = '🔴';
        resultEl.textContent = '🔴 红色！对方先手';
        resultEl.className = 'dice-result red';
        playerSeat = 0;
        game.currentPlayerIndex = 1;
        game.lastPlayPlayerIndex = 1;
        dealerSeat = 1;
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

    // 随机先手，先手即庄家
    game.currentPlayerIndex = Math.floor(Math.random() * totalPlayers);
    game.lastPlayPlayerIndex = game.currentPlayerIndex;
    dealerSeat = game.currentPlayerIndex;
    playerSeat = 0;
    // 重置等级
    playerLevels = ['2', '2', '2', '2'];
    playerAAttempts = [0, 0, 0, 0];
    game.level = playerLevels[dealerSeat];

    startGameScreen();
    instantDeal();
  }

  // === 真人对战模式 - 创建房间 ===
  function startMultiplayerGame() {
    isMultiplayer = true;
    connectSocket();
  }

  // === Socket.io 连接（匹配模式） ===
  function connectSocket() {
    socket = io();

    socket.on('connect', () => {
      // 加入匹配队列
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

    // 复用多人游戏事件绑定
    bindMultiplayerGameEvents();
    bindDisconnectEvent();
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

  // === 创建房间并等待 ===
  function createRoomAndWait() {
    if (!currentMode) {
      showToast('请先选择游戏模式');
      return;
    }
    isMultiplayer = true;
    socket = io();

    socket.on('connect', () => {
      const totalSlots = { two: 2, three: 3, four: 4 }[currentMode] || 4;
      socket.emit('create_room', {
        playerName: '玩家1',
        mode: currentMode,
        totalSlots: totalSlots,
      }, (res) => {
        if (res.success) {
          roomCode = res.roomCode;
          playerSeat = 0;
          switchScreen('room');
          $('#room-code').textContent = roomCode;
          $('#room-waiting-text').textContent = '等待玩家加入... 还差 ' + (totalSlots - 1) + ' 人';
          renderRoomPlayers(res.players);
        } else {
          showToast('创建房间失败');
        }
      });
    });

    socket.on('room_update', (data) => {
      renderRoomPlayers(data.players);
      const totalSlots = { two: 2, three: 3, four: 4 }[currentMode] || 4;
      updateRoomWaitingText(data.players, totalSlots);
    });

    // 多人游戏事件由 bindMultiplayerGameEvents 统一处理（match_found 等）
    bindMultiplayerGameEvents();
    bindDisconnectEvent();
  }

  // === 加入房间 ===
  function showJoinRoomModal() {
    if (!currentMode) {
      const modes = ['two', 'three', 'four'];
      const modeNames = { two: '两人', three: '三人', four: '四人' };
      // 默认两人模式
      currentMode = 'two';
    }
    const modal = $('#join-room-modal');
    if (modal) {
      modal.style.display = 'flex';
      // 聚焦输入框
      setTimeout(() => {
        const input = $('#join-room-input');
        if (input) input.focus();
      }, 100);
    }
  }

  function confirmJoinRoom() {
    const input = $('#join-room-input');
    if (!input) return;
    const code = input.value.trim().toUpperCase();
    if (!code || code.length !== 6) {
      showToast('请输入6位房间号');
      return;
    }

    isMultiplayer = true;
    socket = io();

    socket.on('connect', () => {
      socket.emit('join_room', {
        roomCode: code,
        playerName: '玩家' + (Math.floor(Math.random() * 1000)),
      }, (res) => {
        if (res.success) {
          roomCode = code;
          playerSeat = res.seat;
          $('#join-room-modal').style.display = 'none';
          switchScreen('room');
          $('#room-code').textContent = roomCode;
          renderRoomPlayers(res.players);
          const totalSlots = { two: 2, three: 3, four: 4 }[currentMode] || 4;
          updateRoomWaitingText(res.players, totalSlots);
        } else {
          showToast(res.error || '加入房间失败');
        }
      });
    });

    socket.on('room_update', (data) => {
      renderRoomPlayers(data.players);
      const totalSlots = { two: 2, three: 3, four: 4 }[currentMode] || 4;
      updateRoomWaitingText(data.players, totalSlots);
    });

    bindMultiplayerGameEvents();
    bindDisconnectEvent();
  }

  // === 复用多人游戏事件绑定 ===
  function bindMultiplayerGameEvents() {
    if (!socket) return;

    socket.on('match_found', (data) => {
      try {
        roomCode = data.roomCode;
        playerSeat = data.seat;
        const firstSeat = data.firstSeat;
        $('#room-code').textContent = roomCode;
        $('#room-waiting-text').textContent = '✅ 匹配成功！';
        renderRoomPlayers(data.players);

        // 用 GameEngine.createGame 创建标准游戏对象（确保和单人模式结构一致！）
        const names = data.players.map(p => p.name);
        game = GameEngine.createGame({
          mode: currentMode,
          playerNames: names,
          aiSlots: [],
        });

        // 用服务端统一手牌替换（确保所有玩家卡牌uid一致）
        game.players.forEach((p, i) => {
          p.id = data.players[i].id;   // 用socket id标识
          p.isAI = false;
          if (i === playerSeat) {
            p.hand = data.myHand;       // 自己：服务端发的真实手牌
          } else {
            const opp = data.opponents.find(o => o.seat === i);
            const sz = opp ? opp.handSize : 27;
            p.hand = new Array(sz).fill(null).map(() => ({ suit: '?', rank: '?', id: '?', uid: '?' }));
          }
        });

        // 设置先手，先手即庄家
        game.currentPlayerIndex = firstSeat;
        game.lastPlayPlayerIndex = firstSeat;
        dealerSeat = firstSeat;
        playerLevels = ['2', '2', '2', '2'];
        playerAAttempts = [0, 0, 0, 0];
        game.level = playerLevels[dealerSeat];

        setTimeout(() => {
          const isMyTurn = firstSeat === playerSeat;
          showDiceResultForMultiplayer(isMyTurn, firstSeat);
        }, 1500);
      } catch (e) {
        showToast('匹配初始化失败: ' + e.message);
        console.error('match_found error:', e);
      }
    });

    socket.on('opponent_played', (data) => {
      if (!game || game.phase === 'finished') return;
      game.lastPlay = { playerIndex: data.seat, cards: data.cards, type: data.cardType };
      game.lastPlayPlayerIndex = data.seat;
      game.passCount = 0;
      game.roundNumber++;
      game.history.push({ round: game.roundNumber, playerIndex: data.seat, cards: data.cards, type: data.cardType });
      const oppPlayer = game.players[data.seat];
      if (oppPlayer && oppPlayer.hand) {
        oppPlayer.hand = oppPlayer.hand.slice(data.cards.length);
        if (oppPlayer.hand.length === 0) {
          oppPlayer.finished = true;
          oppPlayer.finishOrder = game.finishedPlayers.length + 1;
          game.finishedPlayers.push(data.seat);
          if (game.finishedPlayers.length >= game.totalPlayers - 1) game.phase = 'finished';
        }
      }
      game.currentPlayerIndex = (data.seat + 1) % game.totalPlayers;
      while (game.players[game.currentPlayerIndex] && game.players[game.currentPlayerIndex].finished) {
        game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.totalPlayers;
      }
      resetTimer();
      renderGame();
    });

    socket.on('opponent_passed', (data) => {
      if (!game || game.phase === 'finished') return;
      game.passCount++;
      game.history.push({ round: game.roundNumber, playerIndex: data.seat, pass: true });
      const activePlayers = game.players.filter(p => !p.finished);
      const needed = activePlayers.length - 1;
      if (game.passCount >= needed) {
        game.lastPlay = null;
        game.passCount = 0;
        game.currentPlayerIndex = game.lastPlayPlayerIndex;
      } else {
        game.currentPlayerIndex = (data.seat + 1) % game.totalPlayers;
        while (game.players[game.currentPlayerIndex] && game.players[game.currentPlayerIndex].finished) {
          game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.totalPlayers;
        }
      }
      resetTimer();
      renderGame();
    });

    // 下一局（多人模式服务端统一发牌）
    socket.on('next_game_start', (data) => {
      playerSeat = data.seat;
      dealerSeat = data.dealerSeat;

      // 用 GameEngine.createGame 创建标准游戏对象
      const names = data.players.map(p => p.name);
      game = GameEngine.createGame({
        mode: currentMode,
        playerNames: names,
        aiSlots: [],
      });

      // 用服务端统一手牌替换
      game.players.forEach((p, i) => {
        p.id = data.players[i].id;
        p.isAI = false;
        if (i === playerSeat) {
          p.hand = data.myHand;
        } else {
          const opp = data.opponents.find(o => o.seat === i);
          const sz = opp ? opp.handSize : 27;
          p.hand = new Array(sz).fill(null).map(() => ({ suit: '?', rank: '?', id: '?', uid: '?' }));
        }
      });

      // 使用服务器指定的等级和庄家
      game.level = data.level;
      game.currentPlayerIndex = dealerSeat;
      game.lastPlayPlayerIndex = dealerSeat;

      startGameScreen();
      instantDeal();
    });
  }

  function bindDisconnectEvent() {
    if (!socket) return;
    socket.on('disconnect', () => {
      if (currentScreen === 'game' || currentScreen === 'room') {
        showToast('连接断开');
      }
    });
  }

  function startMultiplayerGameScreen() {
    // match_found 已经处理了游戏初始化，这里只是进界面
    startGameScreen();
    instantDeal();
  }

  function showDiceResultForMultiplayer(isMyTurn, firstSeat) {
    const overlay = document.createElement('div');
    overlay.className = 'level-up-overlay';
    overlay.innerHTML = `
      <div style="font-size:4em;">🎲</div>
      <div style="font-size:1.5em;color:var(--gold);margin-top:12px;font-weight:900;">
        ${isMyTurn ? '🔵 你先手！' : '🔴 对方先手'}
      </div>
      <div style="color:var(--gold-light);margin-top:8px;">玩家${firstSeat + 1} 先出牌</div>`;
    document.body.appendChild(overlay);
    setTimeout(() => {
      overlay.remove();
      startMultiplayerGameScreen();
    }, 2000);
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

    // AI回合由 renderGame() 统一触发，不在此重复调度
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
    // AI回合由 renderGame() 统一触发
  }

  // === 渲染游戏 ===
  function renderGame() {
    if (!game) return;

    // 更新级牌显示和庄家
    $('#game-level').textContent = game.level;
    const dealerName = game.players[dealerSeat] ? game.players[dealerSeat].name : '';
    const levelEl = $('#game-level').parentElement;
    if (levelEl) {
      levelEl.setAttribute('title', '当前庄家: ' + dealerName);
    }

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
    if (game.currentPlayerIndex !== playerSeat && isCurrentPlayerAI() && !dealingInProgress) {
      setTimeout(() => aiTakeTurn(), 800);
    }
  }

  // === 渲染对手（紧凑版） ===
  function renderOpponents() {
    const container = $('#opponents-area');
    if (!container) return;

    let html = '';
    for (let i = 0; i < game.totalPlayers; i++) {
      if (i === playerSeat) continue;
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
      straight: '一句话',
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
      const isMe = lp.playerIndex === playerSeat;
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

    // 显示最近的"要不起"
    if (game.history && game.history.length > 0) {
      const lastEntry = game.history[game.history.length - 1];
      if (lastEntry.pass && lastEntry.playerIndex !== game.lastPlayPlayerIndex) {
        const passer = game.players[lastEntry.playerIndex];
        html += `<div class="play-round" style="justify-content:center;margin-top:4px;">
          <span style="color:#999;font-style:italic;">${passer.name}：要不起</span>
        </div>`;
      }
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
    // 从大到小排列（左大右小，符合持牌习惯）
    const sorted = [...game.players[playerSeat].hand].sort((a, b) => CE.compareCards(b, a, game.level));
    for (const card of sorted) {
      const el = createCardElement(card);
      if (selectedCards.find(c => c.uid === card.uid)) el.classList.add('selected');
      container.appendChild(el);
    }
    const hint = $('#play-current-hint');
    const myLen = game.players[playerSeat].hand.length;
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
    console.log('[出牌] playerSeat:', playerSeat, 'currentPlayerIndex:', game && game.currentPlayerIndex, 'selectedCards:', selectedCards.length, 'isMultiplayer:', isMultiplayer);
    if (selectedCards.length === 0) {
      showToast('请先选择要出的牌（点击手牌）');
      return;
    }
    if (selectedCards.length > 6) {
      showToast('最多只能出6张牌');
      return;
    }

    const result = GameEngine.playCards(game, playerSeat, selectedCards);
    if (!result.valid) {
      showToast(result.error || '出牌不合法');
      return;
    }

    // 炸弹音效提示（视觉）
    if (result.cardType && result.cardType.weight >= 100) {
      showToast('💣 炸弹！');
    }

    // 保存已出的牌（在清空selectedCards之前）
    const playedCards = [...selectedCards];
    const playedType = game.lastPlay.type;

    // 清除选中
    selectedCards = [];
    $$('#my-hand-cards .poker-card.selected').forEach(el => el.classList.remove('selected'));

    // 多人模式：发送给服务器中继
    if (isMultiplayer && socket && roomCode) {
      socket.emit('play_cards', {
        roomCode,
        playerSeat,
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
    if (game.phase === 'finished') return;
    // 如果是领出，不能要不起
    if (!game.lastPlay || game.lastPlayPlayerIndex === playerSeat) {
      showToast('你是领出者，不能要不起');
      return;
    }

    const passResult = GameEngine.passTurn(game, playerSeat);
    selectedCards = [];
    $$('#my-hand-cards .poker-card.selected').forEach(el => el.classList.remove('selected'));

    if (isMultiplayer && socket && roomCode) {
      socket.emit('pass_turn', { roomCode, playerSeat });
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
    console.log('[按钮] currentPlayerIndex:', game.currentPlayerIndex, 'playerSeat:', playerSeat, 'lastPlay:', !!game.lastPlay, 'lastPlayPlayerIndex:', game.lastPlayPlayerIndex);

    if (game.phase === 'finished') {
      playBtn.disabled = true;
      passBtn.disabled = true;
      return;
    }

    if (game.currentPlayerIndex === playerSeat) {
      // 我的回合
      playBtn.disabled = false;
      const isLeader = !game.lastPlay || game.lastPlayPlayerIndex === playerSeat;
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
        if (game.currentPlayerIndex === playerSeat) {
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
    const hand = game.players[playerSeat].hand;
    const level = game.level;
    const isLeader = !game.lastPlay || game.lastPlayPlayerIndex === playerSeat;

    let newRound = false;
    if (isLeader) {
      const smallest = CE.findSmallestPlay(hand, level);
      if (smallest) {
        GameEngine.playCards(game, playerSeat, smallest.cards);
      }
    } else {
      const beating = CE.findBeatingPlays(hand, game.lastPlay.type, level);
      if (beating.length > 0) {
        beating.sort((a, b) => a.type.mainRankValue - b.type.mainRankValue);
        GameEngine.playCards(game, playerSeat, beating[0].cards);
      } else {
        const pr = GameEngine.passTurn(game, playerSeat);
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
    if (game.currentPlayerIndex !== playerSeat) return;

    // 找到能打的牌
    if (game.lastPlay && game.lastPlayPlayerIndex !== playerSeat) {
      const beating = CE.findBeatingPlays(game.players[playerSeat].hand, game.lastPlay.type, game.level);
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
      const allPlays = CE.findAllPlays(game.players[playerSeat].hand, game.level);
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
    if (!aiPlayer || !aiPlayer.isAI || aiPlayer.finished) return;

    const myRemaining = game.players[playerSeat].hand.length;

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
        const smallest = CE.findSmallestPlay(aiPlayer.hand, game.level);
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

    // 判断坐庄方是否赢了
    const dealerWon = game.mode === 'four'
      ? (head === dealerSeat || head === (dealerSeat + 2) % 4)
      : head === dealerSeat;

    // 玩家自己是否头游（或队友头游）
    const iAmHead = game.mode === 'four'
      ? (head === playerSeat || (head + 2) % 4 === playerSeat)
      : head === playerSeat;

    $('#result-title').textContent = iAmHead ? '🎉 恭喜获胜！' : '😞 再接再厉';
    $('#result-title').style.color = iAmHead ? 'var(--gold)' : '#ccc';

    // 升级计算：坐庄方赢→晋级，输→换庄
    let levelInfo = '';
    if (dealerWon) {
      if (dealerLevel === 'A') {
        // 🏆 冲A成功！彻底胜利！
        levelInfo = '🏆🏆🏆 恭喜通关！冲A成功！🏆🏆🏆';
        playerAAttempts[dealerSeat] = 0;
        setTimeout(() => showGrandVictory(), 500);
      } else {
        // 正常晋级
        if (game.mode === 'four') {
          const upgrade = GameEngine.calculateUpgrade(game);
          const currentIdx = GameEngine.LEVEL_SEQUENCE.indexOf(dealerLevel);
          const newIdx = Math.min(currentIdx + upgrade, GameEngine.LEVEL_SEQUENCE.length - 1);
          playerLevels[dealerSeat] = GameEngine.LEVEL_SEQUENCE[newIdx];
          playerLevels[(dealerSeat + 2) % 4] = playerLevels[dealerSeat];
          levelInfo = '⬆ 升 ' + upgrade + ' 级 → 庄家级牌: ' + playerLevels[dealerSeat];
        } else {
          const currentIdx = GameEngine.LEVEL_SEQUENCE.indexOf(dealerLevel);
          playerLevels[dealerSeat] = GameEngine.LEVEL_SEQUENCE[
            Math.min(currentIdx + 1, GameEngine.LEVEL_SEQUENCE.length - 1)
          ];
          levelInfo = '⬆ 庄家升至 ' + playerLevels[dealerSeat];
        }
        if (playerLevels[dealerSeat] === 'A') {
          levelInfo += ' | 🔥 进入冲A阶段！2次机会！';
          playerAAttempts[dealerSeat] = 0;
        }
      }
      // 庄家不变，继续坐庄
    } else {
      // 庄家输
      if (dealerLevel === 'A') {
        // 冲A失败一次
        playerAAttempts[dealerSeat]++;
        const remaining = 2 - playerAAttempts[dealerSeat];
        if (remaining <= 0) {
          // 两次都失败：从头再来
          playerLevels[dealerSeat] = '2';
          playerAAttempts[dealerSeat] = 0;
          if (game.mode === 'four') {
            playerLevels[(dealerSeat + 2) % 4] = '2';
          }
          levelInfo = '💔 冲A失败2次！庄家降回2级从头开始';
        } else {
          levelInfo = '⚠️ 冲A失败！还剩 ' + remaining + ' 次机会';
        }
        // 换庄
        const newDealer = head;
        dealerSeat = newDealer;
      } else {
        // 正常换庄
        const newDealer = head;
        dealerSeat = newDealer;
        levelInfo = '🔄 换庄！新庄家: ' + game.players[newDealer].name + '（级牌: ' + playerLevels[newDealer] + '）';
      }
    }

    game.level = playerLevels[dealerSeat];
    $('#result-level-up').textContent = levelInfo;

    // 排名列表（根据模式显示不同名称）
    const order = game.finishedPlayers;
    let rankNames, rankClasses;
    if (game.mode === 'single' || game.mode === 'two') {
      rankNames = ['头游🥇', '末游'];
      rankClasses = ['head', 'tail'];
    } else if (game.mode === 'three') {
      rankNames = ['头游🥇', '二游🥈', '末游'];
      rankClasses = ['head', 'second', 'tail'];
    } else {
      rankNames = ['头游🥇', '二游🥈', '三游🥉', '末游'];
      rankClasses = ['head', 'second', 'third', 'tail'];
    }
    let html = '';
    for (let i = 0; i < order.length; i++) {
      const p = game.players[order[i]];
      html += '<div class="result-player ' + (rankClasses[i] || 'tail') + '">' +
        '<span>' + rankNames[i] + '</span>' +
        '<span>' + p.name + '</span>' +
        '</div>';
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

  // === 盛大胜利画面（过A通关） ===
  function showGrandVictory() {
    // 隐藏结果画面
    switchScreen('result');
    const overlay = document.createElement('div');
    overlay.className = 'grand-victory-overlay';
    overlay.innerHTML = `
      <div class="grand-victory-fireworks">🎆🎇🎆🎇🎆</div>
      <div class="grand-victory-trophy">🏆</div>
      <div class="grand-victory-title">恭喜通关！</div>
      <div class="grand-victory-subtitle">掼 蛋 之 王</div>
      <div class="grand-victory-stars">⭐⭐⭐⭐⭐</div>
      <div style="color:var(--gold-light);margin-top:12px;font-size:1.1em;">你已成功通过级牌A的考验！</div>
      <button class="menu-btn" id="btn-grand-victory-ok" style="margin-top:24px;max-width:200px;">🏠 返回菜单</button>
    `;
    document.body.appendChild(overlay);
    $('#btn-grand-victory-ok').addEventListener('click', () => {
      overlay.remove();
      switchScreen('menu');
      // 重置所有等级
      playerLevels = ['2', '2', '2', '2'];
      playerAAttempts = [0, 0, 0, 0];
      dealerSeat = 0;
      game = null;
    });
  }

  // === 下一局 ===
  function startNextGame() {
    const currentMode = game.mode;
    const nextLevel = playerLevels[dealerSeat];

    // 多人模式：请求服务器发新牌（统一牌堆，防止各客户端不同步）
    if (isMultiplayer && socket && roomCode) {
      socket.emit('request_next_game', {
        roomCode,
        level: nextLevel,
        dealerSeat,
      }, (res) => {
        if (!res || !res.success) {
          showToast('开始下一局失败，请返回菜单重试');
        }
        // 等待服务器 next_game_start 事件
      });
      return;
    }

    // 单人/AI模式：本地创建新游戏
    const oldResults = GameEngine.getResults(game);
    const tributes = GameEngine.calculateTribute(game);
    const resisted = (currentMode === 'four') ? GameEngine.checkTributeResist(game) : false;
    const oldPlayerConfig = game.players.map(p => ({ name: p.name, isAI: p.isAI }));

    game = GameEngine.createGame({
      mode: currentMode,
      playerNames: oldPlayerConfig.map(p => p.name),
      aiSlots: oldPlayerConfig.map((p, i) => p.isAI ? i : -1).filter(i => i >= 0),
    });
    game.level = nextLevel;

    if (tributes.length > 0 && !resisted) {
      const newTributes = GameEngine.calculateTribute(game);
      if (newTributes.length > 0) {
        GameEngine.executeTribute(game, newTributes);
        const firstPlayer = GameEngine.getTributeFirstPlayer(game, newTributes, false);
        game.currentPlayerIndex = firstPlayer;
        game.lastPlayPlayerIndex = firstPlayer;
        dealerSeat = firstPlayer;
      }
    } else {
      game.currentPlayerIndex = dealerSeat;
      game.lastPlayPlayerIndex = dealerSeat;
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

  // === 错误捕获（调试用） ===
  window.addEventListener('error', function(e) {
    const msg = `JS错误: ${e.message} @ ${e.filename}:${e.lineno}`;
    console.error(msg, e.error);
    const toast = document.createElement('div');
    toast.className = 'tutorial-toast';
    toast.textContent = msg;
    toast.style.color = '#e74c3c';
    toast.style.borderColor = '#e74c3c';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  });

  // === 启动 ===
  init();

})();
