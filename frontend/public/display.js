var socket = null;
var displayBootConfig = window.QUIPLASH_DISPLAY_BOOT || {};

function emptyPublicState() {
    return {
        state: 0,
        round: 0,
        promptPlayers: {},
        pastPrompts: [],
        answers: {},
        playerAnswers: {},
        votes: {},
        currentPrompt: null,
        roundScores: {},
        totalScores: {}
    };
}

var displayApp = new Vue({
    el: '#game',
    data: {
        connected: false,
        theme: 'dark',
        roomCode: '',
        roomCodeInput: displayBootConfig.initialRoomCode || '',
        roomError: null,
        publicState: emptyPublicState(),
        players: {},
        audience: {},
        messages: []
    },
    computed: {
        isWatchingRoom: function() {
            return this.roomCode !== '';
        },
        playerCount: function() {
            return Object.keys(this.players).length;
        },
        audienceCount: function() {
            return Object.keys(this.audience).length;
        },
        stateLabel: function() {
            var labels = {
                0: 'Lobby',
                1: 'Prompts',
                2: 'Answers',
                3: 'Voting',
                4: 'Scores',
                5: 'Game Over'
            };
            return labels[this.publicState.state] || 'Unknown';
        }
    },
    mounted: function() {
        this.loadTheme();
        connectDisplay();
    },
    methods: {
        loadTheme: function() {
            var storedTheme = window.localStorage.getItem('quiplash-theme');
            if (storedTheme === 'light' || storedTheme === 'dark') {
                this.theme = storedTheme;
            }
            this.applyTheme();
        },
        applyTheme: function() {
            document.body.setAttribute('data-theme', this.theme);
        },
        toggleTheme: function() {
            this.theme = this.theme === 'dark' ? 'light' : 'dark';
            window.localStorage.setItem('quiplash-theme', this.theme);
            this.applyTheme();
        },
        selectRoom: function() {
            var normalizedCode = String(this.roomCodeInput || '').trim().toUpperCase();
            if (!normalizedCode) {
                this.roomError = 'Enter a room code.';
                return;
            }

            this.roomError = null;
            socket.emit('display/select', { roomCode: normalizedCode });
        },
        updatePublicState: function(data) {
            this.roomCode = data.roomCode || this.roomCode;
            this.publicState = data.state || emptyPublicState();
            this.players = data.players || {};
            this.audience = data.audience || {};
        },
        handleChat: function(message) {
            var normalizedMessage = typeof message === 'string'
                ? { sender: 'System', text: message }
                : message;

            if (this.messages.length + 1 > 30) {
                this.messages.shift();
            }
            this.messages.push(normalizedMessage);
        }
    }
});

function connectDisplay() {
    socket = io();

    socket.on('connect', function() {
        displayApp.connected = true;
        if (displayApp.roomCodeInput) {
            displayApp.selectRoom();
        }
    });

    socket.on('disconnect', function() {
        displayApp.connected = false;
    });

    socket.on('display_selected', function(data) {
        displayApp.roomCode = data.roomCode;
        displayApp.roomCodeInput = data.roomCode;
        displayApp.roomError = null;
    });

    socket.on('display_error', function(message) {
        displayApp.roomError = message;
    });

    socket.on('public_state', function(data) {
        displayApp.updatePublicState(data);
    });

    socket.on('chat', function(message) {
        displayApp.handleChat(message);
    });
}
