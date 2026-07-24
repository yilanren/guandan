const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 房间存储 { roomId: { players: [], gameState: {}, host: socketId } }
const rooms = {};

// 生成6位房间号
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

io.on('connection', (socket) => {
  console.log(`[连接] ${socket.id}`);

  // 创建房间
  socket.on('create_room', (data, callback) => {
    const { playerName, mode, totalSlots } = data;
    const roomCode = generateRoomCode();
    rooms[roomCode] = {
      code: roomCode,
      mode,
      totalSlots,
      host: socket.id,
      players: [{
        id: socket.id,
        name: playerName || '玩家1',
        seat: 0,
        ready: true,
        isAI: false,
      }],
      gameState: null,
      started: false,
    };
    socket.join(roomCode);
    callback({ success: true, roomCode, players: rooms[roomCode].players });
    io.to(roomCode).emit('room_update', { players: rooms[roomCode].players });
    console.log(`[房间] ${roomCode} 创建, 模式: ${mode}, 人数: ${totalSlots}`);
  });

  // 加入房间
  socket.on('join_room', (data, callback) => {
    const { roomCode, playerName } = data;
    const room = rooms[roomCode];
    if (!room) {
      callback({ success: false, error: '房间不存在' });
      return;
    }
    if (room.players.length >= room.totalSlots) {
      callback({ success: false, error: '房间已满' });
      return;
    }
    if (room.started) {
      callback({ success: false, error: '游戏已开始' });
      return;
    }
    const player = {
      id: socket.id,
      name: playerName || `玩家${room.players.length + 1}`,
      seat: room.players.length,
      ready: true,
      isAI: false,
    };
    room.players.push(player);
    socket.join(roomCode);
    callback({ success: true, roomCode, seat: player.seat, players: room.players });
    io.to(roomCode).emit('room_update', { players: room.players });
    console.log(`[房间] ${roomCode} 加入玩家 ${player.name}, 当前 ${room.players.length}/${room.totalSlots}`);
  });

  // 添加AI玩家
  socket.on('add_ai_player', (data, callback) => {
    const { roomCode } = data;
    const room = rooms[roomCode];
    if (!room) { callback({ success: false }); return; }
    if (room.players.length >= room.totalSlots) {
      callback({ success: false, error: '房间已满' });
      return;
    }
    const aiPlayer = {
      id: `ai_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: `AI玩家${room.players.length + 1}`,
      seat: room.players.length,
      ready: true,
      isAI: true,
    };
    room.players.push(aiPlayer);
    callback({ success: true, players: room.players });
    io.to(roomCode).emit('room_update', { players: room.players });
  });

  // 开始游戏
  socket.on('start_game', (data, callback) => {
    const { roomCode } = data;
    const room = rooms[roomCode];
    if (!room || room.host !== socket.id) {
      callback({ success: false, error: '只有房主可以开始' });
      return;
    }
    if (room.players.length < room.totalSlots) {
      callback({ success: false, error: '玩家不足' });
      return;
    }
    room.started = true;
    io.to(roomCode).emit('game_starting', { roomCode });
    callback({ success: true });
    console.log(`[游戏] 房间 ${roomCode} 开始游戏`);
  });

  // 出牌
  socket.on('play_cards', (data, callback) => {
    const { roomCode, cards, cardType } = data;
    const room = rooms[roomCode];
    if (!room) { callback({ success: false }); return; }
    io.to(roomCode).emit('cards_played', {
      playerId: socket.id,
      cards,
      cardType,
    });
    callback({ success: true });
  });

  // 过牌
  socket.on('pass_turn', (data, callback) => {
    const { roomCode } = data;
    io.to(roomCode).emit('player_passed', { playerId: socket.id });
    callback({ success: true });
  });

  // 准备切换模式
  socket.on('set_ready', (data) => {
    const { roomCode, ready } = data;
    const room = rooms[roomCode];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (player) player.ready = ready;
    io.to(roomCode).emit('room_update', { players: room.players });
  });

  // 发送聊天/表情
  socket.on('send_emoji', (data) => {
    const { roomCode, emoji } = data;
    socket.to(roomCode).emit('emoji_received', { playerId: socket.id, emoji });
  });

  // 断线
  socket.on('disconnect', () => {
    console.log(`[断开] ${socket.id}`);
    // 清理房间中的玩家
    for (const code of Object.keys(rooms)) {
      const room = rooms[code];
      room.players = room.players.filter(p => p.id !== socket.id);
      if (room.players.length === 0) {
        delete rooms[code];
        console.log(`[房间] ${code} 已删除（无玩家）`);
      } else {
        if (room.host === socket.id) {
          room.host = room.players[0].id;
        }
        io.to(code).emit('room_update', { players: room.players });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🃏 掼蛋游戏服务器已启动: http://0.0.0.0:${PORT}`);
  console.log(`   本地访问: http://localhost:${PORT}`);
});
