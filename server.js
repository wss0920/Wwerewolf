const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Werewolf Game Server is running!');
});

// In-memory storage for rooms
const rooms = new Map();

// Generate 6-digit room code
function generateRoomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Fisher-Yates shuffle algorithm
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// All available roles with their factions
const ALL_ROLES = [
  // 狼人阵营
  { name: '狼人', faction: 'wolf', ability: '夜间淘汰村民' },
  { name: '狼王', faction: 'wolf', ability: '死亡时可指定带走一人' },
  { name: '白狼王', faction: 'wolf', ability: '可主动自爆，带走一名村民' },
  { name: '狼美人', faction: 'wolf', ability: '魅惑一名玩家与自己同生死' },
  { name: '隐狼', faction: 'wolf', ability: '查验结果显示为村民' },
  // 神职阵营
  { name: '预言家', faction: 'god', ability: '每晚查验一名玩家身份' },
  { name: '女巫', faction: 'god', ability: '拥有解药和毒药各一瓶' },
  { name: '猎人', faction: 'god', ability: '死亡时可开枪带走一人' },
  { name: '守卫', faction: 'god', ability: '每晚保护一名玩家' },
  { name: '白痴', faction: 'god', ability: '被投票出局时翻牌免死一次' },
  { name: '丘比特', faction: 'god', ability: '首夜连接两名玩家为恋人' },
  { name: '魔术师', faction: 'god', ability: '可交换两名玩家的身份牌' },
  { name: '石匠', faction: 'god', ability: '首夜互相认识同伴石匠' },
  { name: '长老', faction: 'god', ability: '首次被狼人淘汰可免死' },
  { name: '驯狼师', faction: 'god', ability: '可驯服一只狼人为己用' },
  // 村民阵营
  { name: '村民', faction: 'village', ability: '无特殊能力，参与投票' },
  // 中立
  { name: '法官', faction: 'neutral', ability: '全程知晓所有人身份' }
];

// Default role configuration
function getDefaultRoleConfig() {
  return {
    '狼人': 2,
    '预言家': 1,
    '女巫': 1,
    '猎人': 1,
    '守卫': 1,
    '村民': 2,
    '法官': 1
  };
}

// Create a new room
function createRoom(code, hostId, hostName) {
  const room = {
    code,
    hostId,
    status: 'waiting',
    config: getDefaultRoleConfig(),
    players: new Map([[hostId, { name: hostName, isHost: true }]]),
    assignments: new Map()
  };
  rooms.set(code, room);
  return room;
}

// Broadcast room update to all players in the room
function broadcastRoomUpdate(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const players = [];
  room.players.forEach((player, socketId) => {
    players.push({
      id: socketId,
      name: player.name,
      isHost: player.isHost
    });
  });

  const roomData = {
    players,
    status: room.status,
    config: room.config,
    hostId: room.hostId
  };

  io.to(roomCode).emit('room_update', roomData);
}

// Get all assignments for judge
function getAllAssignments(room) {
  const assignments = [];
  room.assignments.forEach((role, socketId) => {
    const player = room.players.get(socketId);
    if (player) {
      assignments.push({
        id: socketId,
        name: player.name,
        role,
        isMe: false
      });
    }
  });
  return assignments;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Create a new room
  socket.on('create_room', ({ playerName }) => {
    const roomCode = generateRoomCode();
    const room = createRoom(roomCode, socket.id, playerName);
    
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.playerName = playerName;

    console.log(`Room created: ${roomCode} by ${playerName}`);
    socket.emit('room_created', { roomCode });
    broadcastRoomUpdate(roomCode);
  });

  // Join an existing room
  socket.on('join_room', ({ roomCode, playerName }) => {
    const room = rooms.get(roomCode);
    
    if (!room) {
      socket.emit('error_msg', { message: '房间不存在' });
      return;
    }

    if (room.status !== 'waiting') {
      socket.emit('error_msg', { message: '游戏已经开始，无法加入' });
      return;
    }

    if (room.players.size >= 12) {
      socket.emit('error_msg', { message: '房间人数已满' });
      return;
    }

    room.players.set(socket.id, { name: playerName, isHost: false });
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.playerName = playerName;

    console.log(`${playerName} joined room ${roomCode}`);
    socket.emit('room_joined', { roomCode });
    broadcastRoomUpdate(roomCode);
  });

  // Update room configuration (host only)
  socket.on('update_config', ({ roomCode, config }) => {
    const room = rooms.get(roomCode);
    
    if (!room) {
      socket.emit('error_msg', { message: '房间不存在' });
      return;
    }

    if (socket.id !== room.hostId) {
      socket.emit('error_msg', { message: '只有房主可以修改配置' });
      return;
    }

    room.config = config;
    console.log(`Room ${roomCode} config updated`);
    broadcastRoomUpdate(roomCode);
  });

  // Deal cards (host only)
  socket.on('deal_cards', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    
    if (!room) {
      socket.emit('error_msg', { message: '房间不存在' });
      return;
    }

    if (socket.id !== room.hostId) {
      socket.emit('error_msg', { message: '只有房主可以发牌' });
      return;
    }

    const playerCount = room.players.size;
    const config = room.config;

    // Calculate total cards needed
    let totalCards = 0;
    for (const role in config) {
      totalCards += config[role];
    }

    if (totalCards !== playerCount) {
      socket.emit('error_msg', { 
        message: `身份牌数量(${totalCards})与玩家数量(${playerCount})不匹配` 
      });
      return;
    }

    // Build deck
    const deck = [];
    for (const role in config) {
      for (let i = 0; i < config[role]; i++) {
        deck.push(role);
      }
    }

    // Shuffle deck
    const shuffledDeck = shuffleArray(deck);

    // Assign roles to players
    room.status = 'assigned';
    room.assignments.clear();
    
    const socketIds = Array.from(room.players.keys());
    socketIds.forEach((socketId, index) => {
      room.assignments.set(socketId, shuffledDeck[index]);
    });

    console.log(`Cards dealt in room ${roomCode}`);

    // Send card info to each player
    room.players.forEach((player, socketId) => {
      const role = room.assignments.get(socketId);
      const isJudge = role === '法官';

      const cardData = {
        myRole: role,
        isJudge,
        allAssignments: isJudge ? getAllAssignments(room) : undefined
      };

      io.to(socketId).emit('card_dealt', cardData);
    });

    broadcastRoomUpdate(roomCode);
  });

  // Reset game (host only)
  socket.on('reset_game', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    
    if (!room) {
      socket.emit('error_msg', { message: '房间不存在' });
      return;
    }

    if (socket.id !== room.hostId) {
      socket.emit('error_msg', { message: '只有房主可以重置游戏' });
      return;
    }

    room.status = 'waiting';
    room.assignments.clear();
    room.config = getDefaultRoleConfig();

    console.log(`Game reset in room ${roomCode}`);
    io.to(roomCode).emit('game_reset');
    broadcastRoomUpdate(roomCode);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);

    if (!socket.roomCode) return;

    const room = rooms.get(socket.roomCode);
    if (!room) return;

    const playerName = socket.playerName;
    
    // Remove player from room
    room.players.delete(socket.id);
    room.assignments.delete(socket.id);

    // If room is empty, delete it
    if (room.players.size === 0) {
      rooms.delete(socket.roomCode);
      console.log(`Room ${socket.roomCode} deleted (empty)`);
      return;
    }

    // Transfer host if needed
    if (room.hostId === socket.id) {
      const newHostId = room.players.keys().next().value;
      const newHost = room.players.get(newHostId);
      newHost.isHost = true;
      room.hostId = newHostId;
      io.to(newHostId).emit('host_transferred');
      console.log(`Host transferred to ${newHost.name} in room ${socket.roomCode}`);
    }

    // Notify remaining players
    io.to(socket.roomCode).emit('player_left', { 
      message: `${playerName} 离开了游戏` 
    });

    // If game was in progress and not enough players, reset
    if (room.status === 'assigned') {
      const minPlayers = 4;
      if (room.players.size < minPlayers) {
        room.status = 'waiting';
        room.assignments.clear();
        room.config = getDefaultRoleConfig();
        io.to(socket.roomCode).emit('game_reset');
      }
    }

    broadcastRoomUpdate(socket.roomCode);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🐺 Werewolf Game Server running on port ${PORT}`);
  console.log(`📡 Waiting for connections...`);
});
