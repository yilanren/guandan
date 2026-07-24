/**
 * 存档系统 - localStorage 存储
 * 自动保存/恢复/重置游戏进度
 */

const GameStorage = (function() {
  const STORAGE_KEY = 'guandan_game_save';
  const SETTINGS_KEY = 'guandan_settings';

  /**
   * 保存游戏状态
   */
  function saveGame(gameState, meta = {}) {
    const saveData = {
      version: 1,
      timestamp: Date.now(),
      gameState: {
        mode: gameState.mode,
        totalPlayers: gameState.totalPlayers,
        players: gameState.players.map(p => ({
          id: p.id,
          name: p.name,
          hand: p.hand,
          isAI: p.isAI,
          seat: p.seat,
          finished: p.finished,
          finishOrder: p.finishOrder,
        })),
        currentPlayerIndex: gameState.currentPlayerIndex,
        lastPlay: gameState.lastPlay,
        lastPlayPlayerIndex: gameState.lastPlayPlayerIndex,
        passCount: gameState.passCount,
        roundNumber: gameState.roundNumber,
        level: gameState.level,
        phase: gameState.phase,
        history: gameState.history.slice(-50), // 只保留最近50条
        finishedPlayers: gameState.finishedPlayers,
      },
      meta: {
        ...meta,
        totalWins: meta.totalWins || 0,
        totalGames: meta.totalGames || 0,
      },
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saveData));
      return true;
    } catch (e) {
      console.error('存档失败:', e);
      return false;
    }
  }

  /**
   * 加载游戏存档
   */
  function loadGame() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const saveData = JSON.parse(raw);

      // 版本检查
      if (saveData.version !== 1) return null;

      // 检查存档是否过期（7天）
      const age = Date.now() - saveData.timestamp;
      const maxAge = 7 * 24 * 60 * 60 * 1000;
      if (age > maxAge) {
        clearSave();
        return null;
      }

      return saveData;
    } catch (e) {
      console.error('读档失败:', e);
      return null;
    }
  }

  /**
   * 检查是否有存档
   */
  function hasSave() {
    return loadGame() !== null;
  }

  /**
   * 清除存档
   */
  function clearSave() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SETTINGS_KEY);
  }

  /**
   * 保存游戏元数据（胜利计数、升级进度等）
   */
  function saveMeta(meta) {
    const saveData = loadGame();
    if (saveData) {
      saveData.meta = { ...saveData.meta, ...meta };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saveData));
        return true;
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  /**
   * 获取新手教程状态
   */
  function getTutorialCount() {
    try {
      return parseInt(localStorage.getItem('guandan_tutorial_count') || '0');
    } catch (e) {
      return 0;
    }
  }

  /**
   * 增加新手教程计数
   */
  function incrementTutorial() {
    const count = getTutorialCount() + 1;
    localStorage.setItem('guandan_tutorial_count', String(count));
    return count;
  }

  /**
   * 检查是否应该显示新手教程（前2次）
   */
  function shouldShowTutorial() {
    return getTutorialCount() < 2;
  }

  return {
    saveGame,
    loadGame,
    hasSave,
    clearSave,
    saveMeta,
    getTutorialCount,
    incrementTutorial,
    shouldShowTutorial,
  };
})();

if (typeof window !== 'undefined') {
  window.GameStorage = GameStorage;
}
