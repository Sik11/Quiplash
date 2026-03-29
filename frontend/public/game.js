var socket = null;
var bootConfig = window.QUIPLASH_BOOT || {};
var SESSION_STORAGE_KEY = 'quiplash-session';

function emptyPlayerState() {
    return {
        name: '',
        state: 0,
        admin: false,
        audience: false,
        roundPrompts: [],
        roundAnswers: {},
        currentVotes: [],
        roundScore: 0,
        totalScore: 0
    };
}

function emptyGameState() {
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

function loadStoredSession() {
    try {
        var raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        return null;
    }
}

function saveStoredSession(data) {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
}

var app = new Vue({
    el: '#game',
    data: {
        error: null,
        connected: false,
        theme: 'dark',
        isAuthenticated: false,
        isJoined: false,
        isAuthPending: false,
        authPendingMessage: '',
        phaseLoading: {
            active: false,
            message: ''
        },
        joinUrl: bootConfig.joinUrl || window.location.origin,
        shareStatus: '',
        messages: [],
        chatmessage: '',
        username: '',
        password: '',
        isLogin: true,
        prompt: '',
        success: null,
        promptIndex: 0,
        answerIndex: 0,
        currentAnswer: '',
        entryStep: 'auth',
        roomCodeInput: bootConfig.initialRoomCode || '',
        selectedRoomCode: bootConfig.initialRoomCode || '',
        roomError: null,
        authenticatedUsername: '',
        reconnectNotice: '',
        recoveryInProgress: false,
        me: emptyPlayerState(),
        state: emptyGameState(),
        players: {},
        audience: {},
        suggestedPrompts: {}
    },
    computed: {
        playerCount: function() {
            return Object.keys(this.players).length;
        },
        audienceCount: function() {
            return Object.keys(this.audience).length;
        },
        waitingMessage: function() {
            var playersNeeded = 3 - this.playerCount;
            if (playersNeeded > 0) {
                return 'Waiting for ' + playersNeeded + ' more player(s)... Need a minimum of 3 players to start the game.';
            }
            return 'Ready to start the game!';
        },
        isPromptValid: function() {
            return this.prompt.length >= 15 && this.prompt.length <= 80;
        },
        isWaitingForPrompts: function() {
            return Object.keys(this.suggestedPrompts).length < Object.keys(this.players).length;
        },
        isWaitingForAnswers: function() {
            var prompts = Object.keys(this.state.promptPlayers || {});
            if (prompts.length === 0) {
                return true;
            }

            return prompts.some(function(prompt) {
                var expectedAnswers = (this.state.promptPlayers[prompt] || []).length;
                var submittedAnswers = (this.state.answers[prompt] || []).length;
                return submittedAnswers < expectedAnswers;
            }, this);
        },
        submittedAnswer: function() {
            return this.state.currentPrompt in this.me.roundAnswers;
        },
        isWaitingForVotes: function() {
            var totalVotesCast = Object.values(this.state.votes).flat().length;
            var totalPotentialVoters = this.playerCount - 2;
            return totalVotesCast < totalPotentialVoters;
        },
        currentPromptAnswers: function() {
            if (!this.state.currentPrompt || !this.state.answers[this.state.currentPrompt]) {
                return [];
            }
            return this.state.answers[this.state.currentPrompt];
        },
        roundScoreEntries: function() {
            return Object.entries(this.state.roundScores).sort(function(a, b) {
                return b[1] - a[1];
            });
        },
        totalScoreEntries: function() {
            return Object.entries(this.state.totalScores).sort(function(a, b) {
                return b[1] - a[1];
            });
        },
        roomJoinUrl: function() {
            if (!this.selectedRoomCode) {
                return this.joinUrl;
            }
            return this.joinUrl + '?room=' + encodeURIComponent(this.selectedRoomCode);
        }
    },
    mounted: function() {
        this.loadTheme();
        this.hydrateSessionState();
        connect();
    },
    methods: {
        hydrateSessionState: function() {
            var savedSession = loadStoredSession();
            if (!savedSession) {
                return;
            }

            this.username = savedSession.username || '';
            this.password = savedSession.password || '';
            this.selectedRoomCode = savedSession.roomCode || this.selectedRoomCode;
            this.roomCodeInput = this.selectedRoomCode || this.roomCodeInput;
            this.authenticatedUsername = savedSession.username || '';
        },
        persistSessionState: function() {
            saveStoredSession({
                username: this.authenticatedUsername || this.username,
                password: this.password,
                roomCode: this.selectedRoomCode || ''
            });
        },
        clearStoredRoom: function() {
            var savedSession = loadStoredSession();
            if (!savedSession) {
                return;
            }
            savedSession.roomCode = '';
            saveStoredSession(savedSession);
        },
        beginRecovery: function() {
            var savedSession = loadStoredSession();
            if (!savedSession || !savedSession.username || !savedSession.password) {
                return;
            }

            if (this.recoveryInProgress) {
                return;
            }

            this.recoveryInProgress = true;
            this.reconnectNotice = savedSession.roomCode
                ? 'Reconnecting and rejoining room ' + savedSession.roomCode + '...'
                : 'Reconnecting your session...';
            this.isAuthPending = true;
            this.authPendingMessage = 'Restoring your session...';
            socket.emit('login', {
                username: savedSession.username,
                password: savedSession.password
            });
        },
        toggleForm: function() {
            this.isLogin = !this.isLogin;
        },
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
        resetEntryFeedback: function() {
            this.roomError = null;
            this.error = null;
            this.success = null;
            this.shareStatus = '';
            this.reconnectNotice = '';
        },
        goToStart: function() {
            this.resetEntryFeedback();
            this.entryStep = 'start';
        },
        goToJoinGame: function() {
            this.resetEntryFeedback();
            this.entryStep = 'join';
        },
        createRoom: function() {
            this.resetEntryFeedback();
            socket.emit('room/create');
        },
        selectRoom: function() {
            var normalizedCode = String(this.roomCodeInput || '').trim().toUpperCase();
            if (!normalizedCode) {
                this.roomError = 'Enter a room code.';
                return;
            }

            this.resetEntryFeedback();
            this.roomCodeInput = normalizedCode;
            socket.emit('room/select', { roomCode: normalizedCode });
        },
        setSelectedRoom: function(roomCode) {
            this.selectedRoomCode = roomCode;
            this.roomCodeInput = roomCode;
            this.isJoined = true;
            this.roomError = null;
            this.recoveryInProgress = false;
            this.reconnectNotice = '';
            this.persistSessionState();
        },
        leaveRoomSelection: function() {
            this.selectedRoomCode = '';
            this.roomCodeInput = '';
            this.isJoined = false;
            this.players = {};
            this.audience = {};
            this.me = emptyPlayerState();
            this.state = emptyGameState();
            this.clearStoredRoom();
            this.goToStart();
        },
        handleChat: function(message) {
            var normalizedMessage = typeof message === 'string'
                ? {
                    sender: 'System',
                    senderType: 'system',
                    text: message,
                    avatarSeed: 'System'
                }
                : message;

            if (this.messages.length + 1 > 20) {
                this.messages.shift();
            }
            this.messages.push(normalizedMessage);
            this.$nextTick(this.scrollChatToBottom);
        },
        chat: function() {
            if (!this.chatmessage.trim()) {
                return;
            }
            socket.emit('chat', this.chatmessage);
            this.chatmessage = '';
        },
        register: function(username, password) {
            this.isAuthPending = true;
            this.authPendingMessage = 'Creating your account...';
            socket.emit('register', {
                username: username,
                password: password
            });
        },
        login: function(username, password) {
            this.isAuthPending = true;
            this.authPendingMessage = 'Signing you in...';
            socket.emit('login', {
                username: username,
                password: password
            });
        },
        copyJoinLink: async function() {
            try {
                await navigator.clipboard.writeText(this.roomJoinUrl);
                this.shareStatus = 'Join link copied.';
            } catch (error) {
                this.shareStatus = 'Copy failed. You can still share the link manually.';
            }
        },
        submitPrompt: function(promptText) {
            if (!this.isPromptValid) {
                alert('Prompt is not valid');
                return;
            }

            socket.emit('prompt', { prompt: promptText });
            this.prompt = '';
        },
        submitAnswer: function(promptText, answerText) {
            this.currentAnswer = '';
            this.me.roundAnswers[promptText] = answerText;

            if (this.promptIndex < this.me.roundPrompts.length - 1) {
                this.promptIndex++;
            } else {
                this.finishAnswering();
            }
        },
        finishAnswering: function() {
            this.promptIndex = 0;
            this.currentAnswer = '';
            socket.emit('answer', this.me.roundAnswers);
        },
        submitVote: function(answer) {
            socket.emit('vote', answer);
        },
        advanceGame: function() {
            socket.emit('advance/next');
        },
        update: function(data) {
            this.selectedRoomCode = data.roomCode || this.selectedRoomCode;
            this.me = data.me || emptyPlayerState();
            this.state = data.state || emptyGameState();
            this.players = data.players || {};
            this.audience = data.audience || {};
            this.suggestedPrompts = data.suggestedPrompts || {};
            this.persistSessionState();
        },
        admin: function(action) {
            socket.emit('admin', action);
        },
        playerName: function(playerNumber) {
            return this.players[playerNumber] ? this.players[playerNumber].name : 'Unknown player';
        },
        chatAvatarLabel: function(message) {
            return (message.sender || '?').trim().charAt(0).toUpperCase();
        },
        chatAvatarStyle: function(message) {
            var hash = 0;
            var seed = message.avatarSeed || message.sender || 'Player';

            for (var i = 0; i < seed.length; i++) {
                hash = seed.charCodeAt(i) + ((hash << 5) - hash);
            }

            var hue = Math.abs(hash) % 360;
            return {
                background: 'linear-gradient(135deg, hsl(' + hue + ', 72%, 58%), hsl(' + ((hue + 32) % 360) + ', 78%, 46%))'
            };
        },
        chatRoleLabel: function(message) {
            if (message.senderType === 'system') {
                return 'Announcement';
            }
            var matchingPlayer = Object.values(this.players).find(function(player) {
                return player.name === message.sender;
            });
            if (matchingPlayer && matchingPlayer.admin) {
                return 'Host';
            }
            if (message.senderType === 'audience') {
                return 'Audience';
            }
            return 'Player';
        },
        isOwnMessage: function(message) {
            return message.senderType !== 'system' && this.me && this.me.name && message.sender === this.me.name;
        },
        scrollChatToBottom: function() {
            var chatList = this.$refs.chatList;
            if (!chatList) {
                return;
            }
            chatList.scrollTop = chatList.scrollHeight;
        },
        handleEndOfVoting: function() {
            socket.emit('updateScore', { prompt: this.state.currentPrompt, votes: this.state.votes });
            var keys = Object.keys(this.state.promptPlayers);
            var position = keys.indexOf(this.state.currentPrompt);
            if (position < keys.length - 1) {
                this.state.currentPrompt = keys[position + 1];
                socket.emit('nextPrompt', this.state.currentPrompt);
            } else {
                this.state.currentPrompt = null;
                this.finishVoting();
            }
        },
        finishVoting: function() {
            socket.emit('finishVoting');
        },
        findAnswerSubmitter: function(currentPrompt, answerText) {
            var playersForPrompt = this.state.promptPlayers[currentPrompt];
            var submitter = playersForPrompt.find(function(player) {
                return this.state.playerAnswers[player].includes(answerText);
            }, this);
            return this.players[submitter].name;
        }
    }
});

function connect() {
    socket = io();

    socket.on('connect', function() {
        app.connected = true;
        if (app.isJoined || app.isAuthenticated || loadStoredSession()) {
            app.beginRecovery();
        }
    });

    socket.on('state', function(data) {
        app.update(data);
    });

    socket.on('public_state', function() {
        return;
    });

    socket.on('connect_error', function(message) {
        alert('Unable to connect: ' + message);
    });

    socket.on('fail', function(message) {
        app.error = message;
        app.success = null;
        app.isAuthPending = false;
        app.phaseLoading = { active: false, message: '' };
    });

    socket.on('disconnect', function() {
        app.connected = false;
        app.reconnectNotice = 'Connection lost. Attempting to recover your session...';
    });

    socket.on('chat', function(message) {
        app.handleChat(message);
    });

    socket.on('room_created', function(data) {
        app.setSelectedRoom(data.roomCode);
    });

    socket.on('room_selected', function(data) {
        app.setSelectedRoom(data.roomCode);
    });

    socket.on('room_error', function(message) {
        app.roomError = message;
        app.recoveryInProgress = false;
    });

    socket.on('audience_reset', function(data) {
        app.leaveRoomSelection();
        app.success = data && data.message
            ? data.message
            : 'The game has ended. Join or start a room to play again.';
    });

    socket.on('reg_success', function(data) {
        app.success = 'Registration successful!';
        app.error = null;
        app.isLogin = true;
        app.isAuthenticated = true;
        app.isAuthPending = false;
        app.authPendingMessage = '';
        app.authenticatedUsername = data.username || app.username;
        app.persistSessionState();
        app.entryStep = bootConfig.initialRoomCode ? 'join' : 'start';
    });

    socket.on('reg_fail', function(message) {
        app.error = message;
        app.success = null;
        app.isAuthPending = false;
        app.authPendingMessage = '';
        app.recoveryInProgress = false;
    });

    socket.on('login_success', function(data) {
        app.success = 'Login successful!';
        app.error = null;
        app.isAuthenticated = true;
        app.isAuthPending = false;
        app.authPendingMessage = '';
        app.authenticatedUsername = data.username || app.username;
        app.persistSessionState();
        app.entryStep = bootConfig.initialRoomCode ? 'join' : 'start';
        if (app.recoveryInProgress) {
            var savedSession = loadStoredSession();
            if (savedSession && savedSession.roomCode) {
                socket.emit('room/select', { roomCode: savedSession.roomCode });
            } else {
                app.recoveryInProgress = false;
                app.reconnectNotice = '';
            }
        }
    });

    socket.on('login_fail', function(message) {
        app.error = message;
        app.success = null;
        app.isAuthPending = false;
        app.authPendingMessage = '';
        app.recoveryInProgress = false;
        app.reconnectNotice = '';
    });

    socket.on('prompts', function(data) {
        app.me.roundPrompts = data;
    });

    socket.on('loading', function(data) {
        app.phaseLoading = {
            active: !!data.active,
            message: data.message || ''
        };
        if (!data.active && app.isAuthPending) {
            app.isAuthPending = false;
            app.authPendingMessage = '';
        }
    });

    socket.on('error', function(payload) {
        app.error = payload && payload.message ? payload.message : 'Something went wrong.';
        app.phaseLoading = { active: false, message: '' };
    });

    socket.on('room_created', function() {
        app.phaseLoading = { active: false, message: '' };
    });

    socket.on('room_selected', function() {
        app.phaseLoading = { active: false, message: '' };
    });
}
