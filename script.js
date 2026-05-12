let currentView = 'menu-view';
let currentGame = null;
let currentMode = 'normal';
let gameHistory = {};
let players = ['Player 1', 'Player 2'];
let currentPlayerIndex = 0;

// Supabase Multiplayer Logic
let supabaseClient = null;
let roomChannel = null;
let isMultiplayer = false;
let currentRoomCode = null;

// Audio and Haptics
const flipSound = new Audio('https://www.soundjay.com/misc/sounds/page-flip-01a.mp3');
flipSound.volume = 0.5;

function triggerEffects() {
    // Sound
    flipSound.currentTime = 0;
    flipSound.play().catch(e => console.log("Audio play blocked until interaction"));
    
    // Haptics (Mobile)
    if (navigator.vibrate) {
        navigator.vibrate(40); // Short 40ms vibration
    }
}

const SUPABASE_URL = 'https://xysufyfzscripnkozsfa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5c3VmeWZ6c2NyaXBua296c2ZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MzQzMDEsImV4cCI6MjA5NDExMDMwMX0.-lEabpLCOHVJFIyn-NsznVWwSB2K2TTCGKEvqhBVqes';

function initSupabase() {
    if (SUPABASE_URL === 'YOUR_SUPABASE_URL') return;
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

function toggleMultiplayer(enabled) {
    isMultiplayer = enabled;
    document.getElementById('offline-options').style.display = enabled ? 'none' : 'block';
    document.getElementById('online-options').style.display = enabled ? 'block' : 'none';
    
    if (enabled && !supabaseClient) {
        initSupabase();
    }
}

async function createRoom() {
    if (!supabaseClient) return alert('Please configure Supabase URL and Key first!');
    
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    currentRoomCode = code;
    
    joinChannel(code);
    
    document.getElementById('display-room-code').innerText = code;
    document.getElementById('room-info').style.display = 'block';
    document.getElementById('create-room-box').style.display = 'none';
    document.getElementById('join-room-box').style.display = 'none';
}

function joinRoom() {
    if (!supabaseClient) return alert('Please configure Supabase URL and Key first!');
    
    const code = document.getElementById('room-code-input').value.trim().toUpperCase();
    if (code.length !== 4) return alert('Enter a 4-digit code');
    
    currentRoomCode = code;
    joinChannel(code);
    
    document.getElementById('display-room-code').innerText = code;
    document.getElementById('room-info').style.display = 'block';
    document.getElementById('create-room-box').style.display = 'none';
    document.getElementById('join-room-box').style.display = 'none';
}

function joinChannel(code) {
    if (roomChannel) supabaseClient.removeChannel(roomChannel);
    
    roomChannel = supabaseClient.channel(`room-${code}`, {
        config: { broadcast: { self: true } }
    });

    roomChannel
        .on('broadcast', { event: 'game-state' }, (payload) => {
            syncGameState(payload.payload);
        })
        .on('presence', { event: 'sync' }, () => {
            const state = roomChannel.presenceState();
            const count = Object.keys(state).length;
            document.getElementById('connection-status').innerText = count > 1 ? 'Partner Connected!' : 'Waiting for partner...';
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await roomChannel.track({ user: 'player', joined_at: new Date().toISOString() });
            }
        });
}

function syncGameState(state) {
    currentGame = state.gameKey;
    currentMode = state.mode;
    players = state.players;
    currentPlayerIndex = state.turn;
    
    setMode(state.mode, false);
    
    const game = gameData[currentGame];
    document.getElementById('game-title').innerText = game.title;
    updateTurnIndicator();
    
    // Determine which face to update based on current flip state
    const card = document.getElementById('card-display');
    const isFlipped = card.classList.contains('is-flipped');
    const nextFace = isFlipped ? document.getElementById('card-content') : document.getElementById('card-content-back');
    
    nextFace.innerHTML = state.cardContent;
    card.classList.toggle('is-flipped');
    triggerEffects();

    if (currentView !== 'play-view') {
        showView('play-view');
    }
}

function broadcastState(cardContent) {
    if (!isMultiplayer || !roomChannel) return;
    
    roomChannel.send({
        type: 'broadcast',
        event: 'game-state',
        payload: {
            gameKey: currentGame,
            mode: currentMode,
            players: players,
            turn: currentPlayerIndex,
            cardContent: cardContent
        }
    });
}

// Update existing functions to support multiplayer
function setMode(mode, broadcast = true) {
    currentMode = mode;
    
    // Clear all mode classes
    document.body.classList.remove('funny-mode', 'naughty-mode', 'adult-mode');
    
    // Deactivate all buttons
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    
    // Update UI
    const modeBtnMap = {
        'normal': 'normal-mode-btn',
        'funny': 'funny-mode-btn',
        'naughty': 'naughty-mode-btn',
        'adult': 'adult-mode-btn'
    };
    
    if (mode !== 'normal') {
        document.body.classList.add(`${mode}-mode`);
    }
    
    document.getElementById(modeBtnMap[mode]).classList.add('active');
    
    // If a game is active and we are in local or broadcasting is requested
    if (currentGame && broadcast) {
        nextItem();
    }
}

function startGame(gameKey) {
    // Get names from inputs
    const p1 = document.getElementById('p1-name').value.trim() || 'Player 1';
    const p2 = document.getElementById('p2-name').value.trim() || 'Player 2';
    players = [p1, p2];
    
    currentPlayerIndex = Math.floor(Math.random() * 2);

    currentGame = gameKey;
    const game = gameData[gameKey];
    
    document.getElementById('game-title').innerText = game.title;
    updateTurnIndicator();
    showView('play-view');
    nextItem();
}

function nextItem() {
    if (!currentGame) return;
    
    const historyKey = `${currentGame}-${currentMode}`;
    if (!gameHistory[historyKey]) {
        gameHistory[historyKey] = [];
    }
    
    const items = gameData[currentGame][currentMode];
    
    // Find indices that haven't been used
    let availableIndices = items.map((_, i) => i).filter(i => !gameHistory[historyKey].includes(i));
    
    // If all items have been used, reset the history for this game/mode
    if (availableIndices.length === 0) {
        gameHistory[historyKey] = [];
        availableIndices = items.map((_, i) => i);
    }
    
    const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    gameHistory[historyKey].push(randomIndex);
    
    const item = items[randomIndex];
    
    const card = document.getElementById('card-display');
    const isFlipped = card.classList.contains('is-flipped');
    const nextFace = isFlipped ? document.getElementById('card-content') : document.getElementById('card-content-back');
    let content = '';
    const player = `<strong>${players[currentPlayerIndex]}</strong>`;
    const partner = `<strong>${players[1 - currentPlayerIndex]}</strong>`;

    if (typeof item === 'object') {
        // Personalize Truth or Dare: "(Name) Truth/Dare: Question"
        let text = item.text.replace(/me/g, partner).replace(/I/g, partner);
        content = `(${player}) <span style="color: var(--primary-red); font-weight: bold;">${item.type}:</span><br>${text}`;
    } else {
        // Personalize others: "(Name) Question"
        let text = item.replace(/{player}/g, player).replace(/{partner}/g, partner);
        content = `(${player}) ${text}`;
    }
    
    nextFace.innerHTML = content;
    card.classList.toggle('is-flipped');
    triggerEffects();
    
    // Update indicator
    updateTurnIndicator();

    // Broadcast if in multiplayer
    if (isMultiplayer) {
        broadcastState(content);
    }

    // Prepare next turn index
    currentPlayerIndex = 1 - currentPlayerIndex;
}

// Event Listeners for new UI
document.getElementById('create-room-btn').addEventListener('click', createRoom);
document.getElementById('join-room-btn').addEventListener('click', joinRoom);
document.getElementById('next-btn').addEventListener('click', nextItem);

function updateTurnIndicator() {
    const indicator = document.getElementById('turn-indicator');
    if (indicator) {
        indicator.innerText = `${players[currentPlayerIndex]}'s Turn`;
    }
}

function showMenu() {
    showView('menu-view');
    currentGame = null;
}

function showView(viewId) {
    document.getElementById(currentView).classList.remove('active');
    setTimeout(() => {
        document.getElementById(currentView).style.display = 'none';
        document.getElementById(viewId).style.display = 'block';
        setTimeout(() => {
            document.getElementById(viewId).classList.add('active');
            currentView = viewId;
        }, 50);
    }, 300);
}

// Initial setup
document.getElementById('play-view').style.display = 'none';
