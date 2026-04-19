// ========================================
// 🌙 Werewolf Game - Client Logic
// ========================================

// Connect to Socket.IO server
const socket = io();

// ========================================
// Client State
// ========================================
const clientState = {
  mySocketId: null,
  myName: '',
  roomCode: null,
  isHost: false,
  myRole: null,
  isJudge: false,
  allAssignments: []
};

// All roles with their factions
const ROLES_INFO = {
  '狼人': { faction: 'wolf', icon: '🐺', factionName: '狼人阵营' },
  '狼王': { faction: 'wolf', icon: '👑', factionName: '狼人阵营' },
  '白狼王': { faction: 'wolf', icon: '🤍', factionName: '狼人阵营' },
  '狼美人': { faction: 'wolf', icon: '💋', factionName: '狼人阵营' },
  '隐狼': { faction: 'wolf', icon: '👤', factionName: '狼人阵营' },
  '预言家': { faction: 'god', icon: '🔮', factionName: '神职阵营' },
  '女巫': { faction: 'god', icon: '🧪', factionName: '神职阵营' },
  '猎人': { faction: 'god', icon: '🏹', factionName: '神职阵营' },
  '守卫': { faction: 'god', icon: '🛡️', factionName: '神职阵营' },
  '白痴': { faction: 'god', icon: '🤪', factionName: '神职阵营' },
  '丘比特': { faction: 'god', icon: '💘', factionName: '神职阵营' },
  '魔术师': { faction: 'god', icon: '🎩', factionName: '神职阵营' },
  '石匠': { faction: 'god', icon: '🔨', factionName: '神职阵营' },
  '长老': { faction: 'god', icon: '👴', factionName: '神职阵营' },
  '驯狼师': { faction: 'god', icon: '🐺', factionName: '神职阵营' },
  '村民': { faction: 'village', icon: '👨‍🌾', factionName: '村民阵营' },
  '法官': { faction: 'neutral', icon: '⚖️', factionName: '中立' }
};

// Default role config for UI
const DEFAULT_ROLE_CONFIG = {
  '狼人': 2,
  '预言家': 1,
  '女巫': 1,
  '猎人': 1,
  '守卫': 1,
  '村民': 2,
  '法官': 1
};

// Current role config (editable by host)
let currentRoleConfig = { ...DEFAULT_ROLE_CONFIG };

// ========================================
// DOM Elements
// ========================================
const screens = {
  login: document.getElementById('login-screen'),
  lobby: document.getElementById('lobby-screen'),
  card: document.getElementById('card-screen')
};

const elements = {
  playerName: document.getElementById('player-name'),
  roomCodeInput: document.getElementById('room-code-input'),
  btnCreateRoom: document.getElementById('btn-create-room'),
  btnJoinRoom: document.getElementById('btn-join-room'),
  loginError: document.getElementById('login-error'),
  
  displayRoomCode: document.getElementById('display-room-code'),
  btnCopyCode: document.getElementById('btn-copy-code'),
  btnLeaveRoom: document.getElementById('btn-leave-room'),
  playerCount: document.getElementById('player-count'),
  playersList: document.getElementById('players-list'),
  hostControls: document.getElementById('host-controls'),
  guestInfo: document.getElementById('guest-info'),
  roleConfig: document.getElementById('role-config'),
  totalCards: document.getElementById('total-cards'),
  totalPlayers: document.getElementById('total-players'),
  configStatus: document.getElementById('config-status'),
  btnDealCards: document.getElementById('btn-deal-cards'),
  
  normalCard: document.getElementById('normal-card'),
  judgeView: document.getElementById('judge-view'),
  roleIcon: document.getElementById('role-icon'),
  roleName: document.getElementById('role-name'),
  roleFaction: document.getElementById('role-faction'),
  roleAbility: document.getElementById('role-ability'),
  allRolesList: document.getElementById('all-roles-list'),
  btnBackToLobby: document.getElementById('btn-back-to-lobby'),
  
  notification: document.getElementById('notification')
};

// ========================================
// Screen Navigation
// ========================================
function showScreen(screenName) {
  Object.values(screens).forEach(screen => screen.classList.remove('active'));
  screens[screenName].classList.add('active');
}

function showNotification(message, type = 'info') {
  elements.notification.textContent = message;
  elements.notification.className = `notification show ${type}`;
  setTimeout(() => {
    elements.notification.classList.remove('show');
  }, 3000);
}

// ========================================
// Login Screen Functions
// ========================================
function getPlayerName() {
  const name = elements.playerName.value.trim();
  if (!name) {
    elements.loginError.textContent = '请输入你的名字';
    return null;
  }
  if (name.length < 2) {
    elements.loginError.textContent = '名字至少2个字符';
    return null;
  }
  elements.loginError.textContent = '';
  return name;
}

function createRoom() {
  const playerName = getPlayerName();
  if (!playerName) return;
  
  socket.emit('create_room', { playerName });
}

function joinRoom() {
  const playerName = getPlayerName();
  if (!playerName) return;
  
  const roomCode = elements.roomCodeInput.value.trim();
  if (!roomCode || roomCode.length !== 6) {
    elements.loginError.textContent = '请输入6位房间号';
    return;
  }
  elements.loginError.textContent = '';
  
  socket.emit('join_room', { roomCode, playerName });
}

// ========================================
// Lobby Screen Functions
// ========================================
function updatePlayersList(players) {
  elements.playersList.innerHTML = '';
  elements.playerCount.textContent = players.length;
  
  players.forEach(player => {
    const li = document.createElement('li');
    li.className = 'player-item';
    li.innerHTML = `
      <div class="player-avatar">${player.name.charAt(0).toUpperCase()}</div>
      <span class="player-name">${player.name}${player.id === clientState.mySocketId ? ' (你)' : ''}</span>
      ${player.isHost ? '<span class="player-badge host">房主</span>' : ''}
    `;
    elements.playersList.appendChild(li);
  });
}

function updateConfigUI(config) {
  currentRoleConfig = { ...config };
  elements.roleConfig.innerHTML = '';
  
  const allRoles = Object.keys(ROLES_INFO);
  
  allRoles.forEach(roleName => {
    const count = config[roleName] || 0;
    
    const div = document.createElement('div');
    div.className = 'role-item';
    div.innerHTML = `
      <span class="role-name">
        <span class="icon-${roleName.toLowerCase().replace(/[^a-z]/g, '')}"></span>
        ${roleName}
      </span>
      <div class="role-controls">
        <button class="role-btn" data-role="${roleName}" data-action="decrease" ${count <= 0 ? 'disabled' : ''}>−</button>
        <span class="role-count">${count}</span>
        <button class="role-btn" data-role="${roleName}" data-action="increase">+</button>
      </div>
    `;
    elements.roleConfig.appendChild(div);
  });
  
  // Add event listeners
  elements.roleConfig.querySelectorAll('.role-btn').forEach(btn => {
    btn.addEventListener('click', handleRoleConfigChange);
  });
  
  updateDeckInfo();
}

function handleRoleConfigChange(e) {
  const role = e.target.dataset.role;
  const action = e.target.dataset.action;
  const currentCount = currentRoleConfig[role] || 0;
  
  if (action === 'increase') {
    currentRoleConfig[role] = currentCount + 1;
  } else if (action === 'decrease' && currentCount > 0) {
    currentRoleConfig[role] = currentCount - 1;
  }
  
  socket.emit('update_config', {
    roomCode: clientState.roomCode,
    config: currentRoleConfig
  });
}

function updateDeckInfo() {
  const totalCards = Object.values(currentRoleConfig).reduce((a, b) => a + b, 0);
  const totalPlayers = elements.playerCount.textContent;
  
  elements.totalCards.textContent = totalCards;
  elements.totalPlayers.textContent = totalPlayers;
  
  if (totalCards === parseInt(totalPlayers)) {
    elements.configStatus.textContent = '✓ 匹配';
    elements.configStatus.className = 'status-ok';
    elements.btnDealCards.disabled = false;
  } else {
    elements.configStatus.textContent = `✗ 多${totalCards - totalPlayers}张或少${parseInt(totalPlayers) - totalCards}人`;
    elements.configStatus.className = 'status-error';
    elements.btnDealCards.disabled = true;
  }
}

function dealCards() {
  socket.emit('deal_cards', { roomCode: clientState.roomCode });
}

function copyRoomCode() {
  navigator.clipboard.writeText(clientState.roomCode).then(() => {
    showNotification('房间号已复制', 'success');
  }).catch(() => {
    showNotification('复制失败，请手动复制', 'error');
  });
}

function leaveRoom() {
  window.location.reload();
}

function resetGameUI() {
  clientState.myRole = null;
  clientState.isJudge = false;
  clientState.allAssignments = [];
  
  elements.normalCard.style.display = 'none';
  elements.normalCard.classList.remove('flipped', 'faction-wolf', 'faction-god', 'faction-village', 'faction-neutral');
  elements.normalCard.querySelector('.card-front').style.transform = 'rotateY(180deg)';
  elements.judgeView.style.display = 'none';
  elements.btnBackToLobby.style.display = 'none';
}

// ========================================
// Card Reveal Functions
// ========================================
function showMyCard(myRole, isJudge, allAssignments) {
  showScreen('card');
  clientState.myRole = myRole;
  clientState.isJudge = isJudge;
  clientState.allAssignments = allAssignments || [];
  
  if (isJudge) {
    showJudgeView();
  } else {
    showNormalCard();
  }
}

function showNormalCard() {
  elements.normalCard.style.display = 'block';
  elements.normalCard.classList.remove('flipped');
  elements.judgeView.style.display = 'none';
  elements.btnBackToLobby.style.display = 'none';
  
  // Pre-fill card info
  const roleInfo = ROLES_INFO[clientState.myRole] || ROLES_INFO['村民'];
  
  // Reset card to back side, show front hidden
  elements.normalCard.querySelector('.card-back').style.display = 'flex';
  elements.normalCard.querySelector('.card-front').style.display = 'flex';
  elements.normalCard.querySelector('.card-front').style.transform = 'rotateY(180deg)';
  
  // Set faction class
  elements.normalCard.className = `role-card faction-${roleInfo.faction}`;
  
  // Update card content
  elements.roleIcon.textContent = roleInfo.icon;
  elements.roleName.textContent = clientState.myRole;
  elements.roleFaction.textContent = roleInfo.factionName;
  elements.roleAbility.textContent = `能力: ${getRoleAbility(clientState.myRole)}`;
  
  // Click to flip
  elements.normalCard.onclick = () => {
    if (!elements.normalCard.classList.contains('flipped')) {
      elements.normalCard.classList.add('flipped');
      elements.normalCard.querySelector('.card-front').style.transform = 'rotateY(0deg)';
    }
  };
}

function showJudgeView() {
  elements.normalCard.style.display = 'none';
  elements.judgeView.style.display = 'block';
  elements.btnBackToLobby.style.display = 'block';
  
  elements.allRolesList.innerHTML = '';
  
  clientState.allAssignments.forEach(assignment => {
    const roleInfo = ROLES_INFO[assignment.role] || ROLES_INFO['村民'];
    const div = document.createElement('div');
    div.className = 'judge-player';
    if (assignment.id === clientState.mySocketId) {
      div.classList.add('is-me');
    }
    div.innerHTML = `
      <span class="name">${assignment.name}</span>
      <span class="role">${roleInfo.icon} ${assignment.role}</span>
    `;
    elements.allRolesList.appendChild(div);
  });
}

function getRoleAbility(roleName) {
  const abilities = {
    '狼人': '夜间淘汰村民',
    '狼王': '死亡时可指定带走一人',
    '白狼王': '可主动自爆，带走一名村民',
    '狼美人': '魅惑一名玩家与自己同生死',
    '隐狼': '查验结果显示为村民',
    '预言家': '每晚查验一名玩家身份',
    '女巫': '拥有解药和毒药各一瓶',
    '猎人': '死亡时可开枪带走一人',
    '守卫': '每晚保护一名玩家',
    '白痴': '被投票出局时翻牌免死一次',
    '丘比特': '首夜连接两名玩家为恋人',
    '魔术师': '可交换两名玩家的身份牌',
    '石匠': '首夜互相认识同伴石匠',
    '长老': '首次被狼人淘汰可免死',
    '驯狼师': '可驯服一只狼人为己用',
    '村民': '无特殊能力，参与投票',
    '法官': '全程知晓所有人身份'
  };
  return abilities[roleName] || '无';
}

// ========================================
// Socket Event Handlers
// ========================================
socket.on('connect', () => {
  clientState.mySocketId = socket.id;
  console.log('Connected to server:', socket.id);
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
  showNotification('与服务器断开连接', 'error');
});

socket.on('room_created', ({ roomCode }) => {
  clientState.roomCode = roomCode;
  clientState.isHost = true;
  clientState.myName = elements.playerName.value.trim();
  elements.displayRoomCode.textContent = roomCode;
  showScreen('lobby');
  updateConfigUI(DEFAULT_ROLE_CONFIG);
  showNotification(`房间 ${roomCode} 创建成功`, 'success');
});

socket.on('room_joined', ({ roomCode }) => {
  clientState.roomCode = roomCode;
  clientState.isHost = false;
  clientState.myName = elements.playerName.value.trim();
  elements.displayRoomCode.textContent = roomCode;
  showScreen('lobby');
  showNotification('加入房间成功', 'success');
});

socket.on('room_update', (data) => {
  updatePlayersList(data.players);
  
  if (data.hostId === clientState.mySocketId) {
    clientState.isHost = true;
    elements.hostControls.style.display = 'block';
    elements.guestInfo.style.display = 'none';
    if (data.config) {
      updateConfigUI(data.config);
    }
  } else {
    clientState.isHost = false;
    elements.hostControls.style.display = 'none';
    elements.guestInfo.style.display = 'block';
  }
  
  // Update deck info for host
  if (clientState.isHost && data.config) {
    updateDeckInfo();
  }
});

socket.on('card_dealt', (data) => {
  showMyCard(data.myRole, data.isJudge, data.allAssignments);
});

socket.on('game_reset', () => {
  resetGameUI();
  showScreen('lobby');
  showNotification('游戏已重置', 'info');
});

socket.on('player_left', ({ message }) => {
  showNotification(message, 'info');
});

socket.on('error_msg', ({ message }) => {
  showNotification(message, 'error');
});

socket.on('host_transferred', () => {
  showNotification('你已成为新房主', 'success');
});

// ========================================
// Event Listeners
// ========================================
elements.btnCreateRoom.addEventListener('click', createRoom);
elements.btnJoinRoom.addEventListener('click', joinRoom);
elements.playerName.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') createRoom();
});
elements.roomCodeInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') joinRoom();
});

elements.btnCopyCode.addEventListener('click', copyRoomCode);
elements.btnLeaveRoom.addEventListener('click', leaveRoom);
elements.btnDealCards.addEventListener('click', dealCards);
elements.btnBackToLobby.addEventListener('click', () => {
  showScreen('lobby');
});

// ========================================
// Initialize
// ========================================
console.log('🐺 Werewolf Game Client Initialized');
