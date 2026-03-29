var socket = null;
var bootConfig = window.QUIPLASH_BOOT || {};

//Prepare game
var app = new Vue({
    el: '#game',
    data: {
        error: null,
        connected: false,
        theme: 'dark',
        isJoined: false,
        showWelcomeScreen: !!bootConfig.hostIntro,
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
        me: {
            name: '',
            state: 0, 
            admin: false,
            roundPrompts: [], //Array to hold prompts for current round
            roundAnswers: {}, //Map to hold answers for current round (keyed by prompt)
            currentVotes: [],
            roundScore:0,
            totalScore: 0
        },
        state: {
            state: 0, //Represents current state of the game
            round: 1, //Represents current round of the game
            promptPlayers: {},//Prompt Allocation for current round
            pastPrompts: [],
            answers: {}, //Map to hold player answers (keyed by prompt)
            playerAnswers: {}, //Map to hold player answers (keyed by player)
            votes: {}, //Map to hold player votes (keyed by answer)
            currentPrompt: null, //Current prompt up for voting
            roundScores: {}, //Map to hold round scores (keyed by player)
            totalScores: {}, //Map to hold total scores (keyed by player)
        },
        players: {}, //
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
            let playersNeeded = 3 - this.playerCount;
            if (playersNeeded > 0) {
                return 'Waiting for ' + playersNeeded + ' more player(s)... Need a minimum of 3 players to start the game.';
            } else {
                return 'Ready to start the game!';
            }
        },
        isPromptValid: function() {
            return this.prompt.length >= 15 && this.prompt.length <= 80;
        },
        isWaitingForPrompts: function() {
            return Object.keys(this.suggestedPrompts).length < Object.keys(this.players).length;
        },
        isWaitingForAnswers: function() {
            return Object.keys(this.state.answers).length !== Object.keys(this.state.promptPlayers).length || !Object.values(this.state.answers).every(answers => answers.length === 2);
        },
        submittedAnswer:function(){
            if (this.state.currentPrompt in this.me.roundAnswers){
                return true;
            } else {
                return false;
            }
        },
        isWaitingForVotes: function(){
            // Calculate the total number of votes cast
            let totalVotesCast = Object.values(this.state.votes).flat().length;

            // Calculate the total number of potential voters (all players and audience members minus 2)
            let totalPotentialVoters = this.playerCount - 2;

            // Check if we are still waiting for votes
            return totalVotesCast < totalPotentialVoters;
        },
        currentPromptAnswers: function() {
            if (!this.state.currentPrompt || !this.state.answers[this.state.currentPrompt]) {
                return [];
            }
            return this.state.answers[this.state.currentPrompt];
        },
        roundScoreEntries: function() {
            return Object.entries(this.state.roundScores).sort((a, b) => b[1] - a[1]);
        },
        totalScoreEntries: function() {
            return Object.entries(this.state.totalScores).sort((a, b) => b[1] - a[1]);
        }
    },
    mounted: function() {
        this.loadTheme();
        connect(); 
    },
    methods: {
        toggleForm() {
            this.isLogin = !this.isLogin;
        },
        dismissWelcomeScreen() {
            this.showWelcomeScreen = false;
        },
        loadTheme() {
            const storedTheme = window.localStorage.getItem('quiplash-theme');
            if (storedTheme === 'light' || storedTheme === 'dark') {
                this.theme = storedTheme;
            }
            this.applyTheme();
        },
        applyTheme() {
            document.body.setAttribute('data-theme', this.theme);
        },
        toggleTheme() {
            this.theme = this.theme === 'dark' ? 'light' : 'dark';
            window.localStorage.setItem('quiplash-theme', this.theme);
            this.applyTheme();
        },
        handleChat(message) {
            const normalizedMessage = typeof message === 'string'
                ? {
                    sender: 'System',
                    senderType: 'system',
                    text: message,
                    avatarSeed: 'System'
                }
                : message;

            if(this.messages.length + 1 > 20) {
                this.messages.shift();
            }
            this.messages.push(normalizedMessage);
            this.$nextTick(this.scrollChatToBottom);
        },
        chat() {
            if (!this.chatmessage.trim()) {
                return;
            }
            socket.emit('chat',this.chatmessage);
            this.chatmessage = '';
        },
        register(username, password) {
            // Emit register event with username & password
            this.showWelcomeScreen = false;
            socket.emit('register',{username,password});
            // this.username = '';
            // this.password = '';
        },
        login(username, password) {
            // Emit login event with username & password
            this.showWelcomeScreen = false;
            socket.emit('login',{username,password});
            // this.username = '';
            // this.password = '';
        },
        async copyJoinLink() {
            try {
                await navigator.clipboard.writeText(this.joinUrl);
                this.shareStatus = 'Join link copied.';
            } catch (error) {
                this.shareStatus = 'Copy failed. You can still share the link manually.';
            }
        },
        submitPrompt(promptText) {
            if (this.isPromptValid) {
                // Logic to handle the prompt submission
                console.log('Prompt submitted:', promptText);
                // Emit prompt event with promptText
                socket.emit('prompt', { prompt: promptText });
                // Reset the prompt input after submission
                this.prompt = '';
            } else {
                alert('Prompt is not valid');
                console.log('Prompt is not valid');
            }
        },
        submitAnswer(promptText, answerText) {

            // socket.emit('answer', {prompt: promptText, answer: answerText});


            // Clear the current answer input
            this.currentAnswer = '';
            this.me.roundAnswers[promptText] = answerText;
            
            
            // Move to the next prompt if available
            if (this.promptIndex < this.me.roundPrompts.length - 1) {
                this.promptIndex++;
            } else {
                // All prompts answered, proceed to next stage
                // Emit an event or call a method to move to the next game state
                this.finishAnswering();
            }
        },
        finishAnswering() {
            // Logic to handle the end of answering phase
            console.log('Finished answering all prompts');
            this.promptIndex = 0;
            this.currentAnswer = '';
            // this.me.state++;
            socket.emit('answer', this.me.roundAnswers);
            // Emit event or call method to advance the game state
        },
        submitVote(answer) {
            // Emit vote event with answerId
            socket.emit('vote',answer);
        },
        advanceGame() {
            // Emit advance event
            socket.emit('advance/next');
        },
        update(data) {
            this.me = data.me;
            this.state = data.state;
            // this.state.prompts = Object.fromEntries(data.state.prompts);
            this.players = data.players;
            this.audience = data.audience;
            this.suggestedPrompts = data.suggestedPrompts;
        },
        admin(action) {
            // Emit admin event with action
            socket.emit('admin',action);
        },
        playerName(playerNumber) {
            return this.players[playerNumber] ? this.players[playerNumber].name : 'Unknown player';
        },
        chatAvatarLabel(message) {
            return (message.sender || '?').trim().charAt(0).toUpperCase();
        },
        chatAvatarStyle(message) {
            let hash = 0;
            const seed = message.avatarSeed || message.sender || 'Player';

            for (let i = 0; i < seed.length; i++) {
                hash = seed.charCodeAt(i) + ((hash << 5) - hash);
            }

            const hue = Math.abs(hash) % 360;
            return {
                background: 'linear-gradient(135deg, hsl(' + hue + ', 72%, 58%), hsl(' + ((hue + 32) % 360) + ', 78%, 46%))'
            };
        },
        chatRoleLabel(message) {
            if (message.senderType === 'system') {
                return 'Announcement';
            }
            const matchingPlayer = Object.values(this.players).find(player => player.name === message.sender);
            if (matchingPlayer && matchingPlayer.admin) {
                return 'Host';
            }
            if (message.senderType === 'audience') {
                return 'Audience';
            }
            return 'Player';
        },
        isOwnMessage(message) {
            return message.senderType !== 'system' && this.me && this.me.name && message.sender === this.me.name;
        },
        scrollChatToBottom() {
            const chatList = this.$refs.chatList;
            if (!chatList) {
                return;
            }
            chatList.scrollTop = chatList.scrollHeight;
        },
        handleEndOfVoting() {
            socket.emit('updateScore',{prompt: this.state.currentPrompt, votes: this.state.votes})
            let keys = Object.keys(this.state.promptPlayers);
            let position = keys.indexOf(this.state.currentPrompt);
            if (position < keys.length - 1) {
                this.state.currentPrompt = keys[position + 1];
                socket.emit('nextPrompt',this.state.currentPrompt)
            } else {
                this.state.currentPrompt = null;
                this.finishVoting();
            }
        },
        finishVoting() {
            // Logic to handle the end of voting phase
            console.log('Finished voting');
            // Emit event or call method to advance the game state
            socket.emit('finishVoting');
        },
        // Find answer
        findAnswerSubmitter(currentPrompt, answerText) {
            const playersForPrompt = this.state.promptPlayers[currentPrompt];
            const submitter = playersForPrompt.find(player => {
                // Check if the list of answers includes the answerText
                return this.state.playerAnswers[player].includes(answerText);
            });
            return this.players[submitter].name;
        }
    }
});



function connect() {
    //Prepare web socket
    socket = io();

    //Connect
    socket.on('connect', function() {
        //Set connected state to true
        app.connected = true;
        app.state.state = 0;
    });

    // State update
    socket.on('state', function(data) {
        app.update(data);
    });

    //Handle connection error
    socket.on('connect_error', function(message) {
        alert('Unable to connect: ' + message);
    });

    //Handle disconnection
    socket.on('disconnect', function() {
        alert('Disconnected');
        app.connected = false;
    });

    //Handle incoming chat message
    socket.on('chat', function(message) {
        app.handleChat(message);
    });

    socket.on('reg_success', function(){
        app.success = 'Registration successful!';
        app.error= null;
        app.isLogin = true;
        app.isJoined = true;
    });

    socket.on('reg_fail', function(message){
        app.error = message;
        app.success = null;
    });

    socket.on('login_success', function(){
        app.success = 'Login successful!';
        app.error= null;
        app.isJoined = true;
    });

    socket.on('login_fail', function(message){
        app.error = message;
        app.success = null;
    });

    socket.on('prompts', function(data){
        app.me.roundPrompts = data;
    });
}
