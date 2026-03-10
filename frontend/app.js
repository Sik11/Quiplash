'use strict';

//Set up express
const express = require('express');
const app = express();

//Setup socket.io
const server = require('http').Server(app);
const io = require('socket.io')(server);

const request = require('request');

// set up axios
const axios = require('axios');
const { type } = require('os');

// List of players 
let players = new Map();
let playersToSockets = new Map();
let socketsToPlayers = new Map();

// List of audience members
let audience = new Map();
let audienceToSockets = new Map();
let socketsToAudience = new Map();

let nextPlayerNumber = 0;
let nextAudienceNumber = 0;
// Can be a map of players to prompts or an array in the players object.
let suggestedPrompts = new Map(); //Keyed by Player
let playerPrompts = new Map(); //Keyed by Player


let lastPlayer = null;
let timer = null;
let roundNo = 0;

let state = {
  state: 0, //Represents current state of the game
  round: 0, //Represents current round of the game
  promptPlayers: {}, //Prompt Allocation for current round
  pastPrompts: [],
  answers: {}, //Map to hold player answers (keyed by prompt)
  playerAnswers: {}, //Map to hold player answers (keyed by player)
  votes: {}, //Map to hold player votes (keyed by answer)
  currentPrompt: null, //Current prompt up for voting
  roundScores: {}, //Map to hold round scores (keyed by player)
  totalScores: {} //Map to hold total scores (keyed by player)
}

//Setup static page handling
app.set('view engine', 'ejs');
app.use('/static', express.static('public'));

//Handle client interface on /
app.get('/', (req, res) => {
  res.render('client');
});
//Handle display interface on /display
app.get('/display', (req, res) => {
  res.render('display');
});

// URL of the backend API
const BACKEND_ENDPOINT = process.env.BACKEND || 'http://localhost:8181';

//Start the server
function startServer() {
    const PORT = process.env.PORT || 8080;
    server.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
    });
}

// Call Azure Functions
async function callAzureFunction(endpoint, method, data) {
  try {
    let config = {
      method: method,
      url: endpoint,
    };

    if (data != '') {
      config.data = data;
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error('Error calling Azure Function:', error.message);
    throw error;
  }
}

// Handle errors
function error(socket,message,halt){
  console.log('Error: ' + message);
  socket.emit('fail',message);
  if(halt) {
    socket.disconnect();
  }
}

// Update all connected players with the latest state
function updateAll(){
  console.log('Updating all players');
  // loop through all connected players and update each one
  for (let [playerNumber,socket] of playersToSockets) {
    updatePlayer(socket);
  }
  for (let [playerNumber,socket] of audienceToSockets) {
    updateAudienceMember(socket);
  }
}

// Update one player's state and send it to the client
function updatePlayer(socket){
  const playerNumber = socketsToPlayers.get(socket);
  const thePlayer = players.get(playerNumber);
  // Construct the data object with the latest state
  const data = {
    state: state, //Global game state
    me: thePlayer, //The current player's state
    players: Object.fromEntries(players), //All players' states
    audience: Object.fromEntries(audience), //All audience members' states
    suggestedPrompts: Object.fromEntries(suggestedPrompts) //All
  }; 

  // Send the 'state' event to the client, providing the latest state
  console.log('Sending state to player ' + playerNumber);
  // console.log(data);

  socket.emit('state',data);
}

// Update one audience member's state and send it to the client
function updateAudienceMember(socket){
  const audienceNumber = socketsToAudience.get(socket);
  const theAudienceMember = audience.get(audienceNumber);
  // Construct the data object with the latest state
  const data = {
    state: state, //Global game state
    me: theAudienceMember, //The current player's state
    players: Object.fromEntries(players), //All players' states
    audience: Object.fromEntries(audience), //All audience members' states
    suggestedPrompts: Object.fromEntries(suggestedPrompts) //All
  }; 

  // Send the 'state' event to the client, providing the latest state
  console.log('Sending state to audience member ' + audienceNumber);
  // console.log(data);

  socket.emit('state',data);
}

//Chat message
function handleChat(player,message) {
    console.log('Handling chat from player ' + player + ': ' + message);
    io.emit('chat',message);
}

// Handle Join
function handleJoin(socket,username) {
    console.log('Handling join');
    console.log('state: ' + state.state);
    if (state.state > 0) {
      console.log('Game in progress, joining audience');
      // Start new audience member
      nextAudienceNumber++;
      console.log('Welcome to audience member ' + nextAudienceNumber);
      announce('Welcome audience member ' + nextAudienceNumber);
      
      audience.set(nextAudienceNumber, {
        name: username,
        audience: true
      });
      audienceToSockets.set(nextAudienceNumber, socket);
      socketsToAudience.set(socket, nextAudienceNumber);  
      return;
    }

    if(players.size < 8) {

        // Start new player
        nextPlayerNumber++;
        console.log('Welcome to player ' + nextPlayerNumber);
        announce('Welcome player ' + nextPlayerNumber);

        if (nextPlayerNumber == 1) {
          players.set(nextPlayerNumber, {
            name: username,
            admin: true,
            state: 1,
            roundPrompts: [], //Prompts to answer for the round
            roundAnswers: {}, //Keyed by prompt
            currentVotes: [],
            roundScore:0,
            totalScore: 0
          });
        } else {
          players.set(nextPlayerNumber, {
            name: username,
            admin: false,
            state: 1,
            roundPrompts: [], //Prompts to answer for the round
            roundAnswers: {}, //Keyed by prompt
            currentVotes: [],
            roundScore:0,
            totalScore: 0
          }); 
        }
        playersToSockets.set(nextPlayerNumber, socket);
        socketsToPlayers.set(socket, nextPlayerNumber);
    } else {

        // Start new audience member
        nextAudienceNumber++;
        console.log('Welcome to audience member ' + nextAudienceNumber);
        announce('Welcome audience member ' + nextAudienceNumber);

        audience.set(nextAudienceNumber, {
          name: username,
          audience: true,
        });
        audienceToSockets.set(nextAudienceNumber, socket);
        socketsToAudience.set(socket, nextAudienceNumber);
    }
}

// Handle admin action
function handleAdmin(action) {
  console.log('Admin event: ' + action); 
}

function handleAdmin(player,action) {
  // Checks if the player attempting the admin action is not player number 1. The intent is to restrict admin privileges only to the first player.
  if (players.get(player).admin == false){
    console.log('Failed admin action from player ' + player + ' for ' + action);
    return;
  }

  // Checks if the action requested is 'start' and if the current game state is 0 (not started). This condition is to ensure the game can only be started if it has not already started.
  if (action == 'start' && state.state == 0){
    console.log('Starting game');
    advanceGameState();
    return;
  }
}

function handleAction(player, action){

}

// Handle login
async function handleLogin(socket,data) {
  let player = {
    "username": data.username,
    "password": data.password
  };

  console.log('Logging in player: ' + player.username);
  try {
    // let response = await callAzureFunction("https://quiplash-oew1g21-2324.azurewebsites.net/player/login?code=smKRNInjrZv59QhFw2PJBZRVb6uOCU6nmEIeMU6O_GCMAzFujm9VRA==",'get',player);
    let response = await callAzureFunction(BACKEND_ENDPOINT + '/player/login','post',player);
  
    if (response.result == true){
      console.log('Login successful');
      handleJoin(socket,player.username); // Ensure this function handles both players and audience appropriately
      updateAll();
      socket.emit('login_success');
    } else {
      console.log('Login failed: ' + response.msg);
      socket.emit('login_fail',response.msg);
    }
  } catch(error){
    console.log('Error calling azure function: ' + error);
    error(socket,'An error occurred while logging in',false);
  }
}

// Handle register
async function handleRegister(socket,data) {
  let player = {
    "username": data.username,
    "password": data.password
  };
  console.log('Registering player: ' + player.username);
  try {
    // let response = await callAzureFunction('https://quiplash-oew1g21-2324.azurewebsites.net/player/register?code=mWB-sHL3hMtQJpdvh8CGxYcv-4KyEfNHNwOk-hR9TLIJAzFubRF3Zg==','post',player);
    let response = await callAzureFunction(BACKEND_ENDPOINT + '/player/register','post',player)
    console.log(response);
    if (response.result == true){
      console.log('Registration successful');
      handleJoin(socket,player.username); // Ensure this function handles both players and audience appropriately
      updateAll();
      socket.emit('reg_success');
    } else {
      socket.emit('reg_fail',response.msg);
    }
  } catch(error){
    console.log('Error calling azure function: ' + error);
    error(socket,'An error occurred while registering',false);
  }
}

// Handle prompt
async function handlePrompt(player,data) {
  console.log('Player: ' + player + " submitted a prompt: " + data.prompt);
  console.log(data.prompt.length);
  suggestedPrompts.set(player,data.prompt);
  players.get(player).state = 2;
  updateAll();
  // advanceGameState();
  // TODO: MAY NEED SOME VALIDATION WHEN SUBMITTING PROMPTS
}

// Handle answer
function handleAnswer(socket,data) {
  const p = socketsToPlayers.get(socket);
  const player = players.get(p);
  if (!p) {
    console.error('Player not found for socket:', socket.id);
    return;
  }
  const p_name = players.get(p).name;

  Object.entries(data).forEach(([promptText, answerText]) => {
    player.roundAnswers[promptText] = answerText;
    if (p in state.playerAnswers) {
      state.playerAnswers[p].push(answerText);
    } else {
      state.playerAnswers[p] = [answerText];
    }
    if (playerPrompts.get(p).includes(promptText)) {
      console.log('Player:', p_name, 'answered:', answerText, 'for prompt:', promptText);
      if (!(promptText in state.answers)) {
        state.answers[promptText] = [];
      } 

      state.answers[promptText].push(answerText);
    }
  });
  player.state++;
  updateAll();
}

// Handle vote
function handleVote(socket,data) {
  const p = socketsToPlayers.get(socket);
  const player = players.get(p);
  if (!p) {
    console.error('Player not found for socket:', socket.id);
    return;
  }
  const p_name = players.get(p).name;
  console.log('Player:', p_name, 'voted for:', data);
  player.currentVotes.push(data);
  if (!(data in state.votes)) {
    state.votes[data] = [p];
  } else {
    state.votes[data].push(p);
  }
  player.state = 6;
  updateAll();
}

// Handle next
function handleNext(socket) {
  advanceGameState();
}

// Announce message to all players and audience
function announce(message) {
  console.log('Announcement: ' + message);
  io.emit('chat',message);
}



function endLoggingIn() {
  console.log('Ending Logging In phase');
  // Logic for the end of Logging In phase
}

function startJoining(){
  console.log('Starting joining');
}

function startGame(){
  console.log('Game starting');
  announce('Let the games begin');
}

function startPrompts(){
  console.log('Starting prompts');
  
  // Increment round number
  state.round++;
  

  // Reset answers, votes & promptAllocation
  state.answers = {};
  state.playerAnswers ={}
  state.promptPlayers = {};
  state.votes = {};
  // Reset current prompt
  state.currentPrompt = null;
  suggestedPrompts.clear();

  // Increment total scores by adding round scores

  // for (const [playerNumber, roundScore] of state.roundScores) {
  //   state.totalScores.set(playerNumber, state.totalScores.get(playerNumber) + roundScore);
  // }
  
  // Reset round scores
  state.roundScores = {};

  // Update players
  for (const [playerNumber, player] of players) {
    player.roundPrompts = [];
    player.roundAnswers = {};
    player.currentVotes = [];
    player.roundScore = 0;
  }
}
// TODO: Implement PLayer state. PLayer State != Game State.
async function endPrompts(){
  console.log('Ending prompts');
  for (const [playerNumber, prompt] of suggestedPrompts) {
    console.log('Submitting prompt to API');
    let p = {
        "username": players.get(playerNumber).name,
        "text": prompt
      };
    try {
      // let response = await callAzureFunction('https://quiplash-oew1g21-2324.azurewebsites.net/prompt/create?code=-UYjrgt9tAX-c1mk-FdriwniRPVvA1ULm-kvXuTsDebJAzFuRuRrbQ==','post',p);

      let response = await callAzureFunction(BACKEND_ENDPOINT + '/prompt/create','post',p);
      console.log(response);
      if (response.result == true){
        console.log('Prompt submitted successfully');
      } else {
        console.log('Prompt submission failed: ' + response.msg);
        throw new Error('Prompt submission failed for player ' + playerNumber);
      }
    } catch(error){
      console.log(error);
      throw error;
    } 
  };
}

function startVotes(){
  console.log('Starting voting');
}

function endVotes(){
  console.log('Ending voting');
  for (const [playerNumber, prompt] of playerPrompts) {
    players.get(playerNumber).state = 7;
  }
}

function calculatePromptNumbers(playerCount) {
  const isEven = playerCount % 2 === 0;
  return isEven ? (playerCount / 2) : playerCount
}

function selectRandom(array){
  const index = Math.floor(Math.random() * array.length);
  return array[index];
}


// Helper function to select a unique set of prompts from an array
function selectUniquePrompts(promptsArray, numPromptsNeeded) {
  let selectedPrompts = new Set();
  let promptsCopy = [...promptsArray]; // Create a copy to avoid mutating the original array

  let attempts = 0;
  while (selectedPrompts.size < numPromptsNeeded && promptsCopy.length > 0) {
    let randomIndex = Math.floor(Math.random() * promptsCopy.length);
    let selectedPrompt = promptsCopy[randomIndex];

    selectedPrompts.add(selectedPrompt);
    promptsCopy.splice(randomIndex, 1);
  }
  return Array.from(selectedPrompts);
}

function selectPrompts(totalPromptsNeeded, suggestedPrompts,apiPrompts) {
  console.log("Number of api prompts: " + apiPrompts.length);
  let selectedPrompts = new Set();
  let halfTotalPrompts = Math.ceil(totalPromptsNeeded / 2);

  // Select prompts from API, but fall back to local prompts if not enough
  let selectedApiPrompts = selectUniquePrompts(apiPrompts, halfTotalPrompts);
  console.log("Number of selected api prompts: " + selectedApiPrompts.length)
  let apiShortfall = halfTotalPrompts - selectedApiPrompts.length;
  console.log("api shortfall: " + apiShortfall);

  // Adjust the number of local prompts needed based on API shortfall
  let localPromptsNeeded = (totalPromptsNeeded - halfTotalPrompts) + apiShortfall;
  console.log("Number of local prompts needed: " + localPromptsNeeded);
  let selectedLocalPrompts = selectUniquePrompts(suggestedPrompts, localPromptsNeeded);
  console.log("Number of selected local prompts: " + selectedLocalPrompts.length);

  // Merge selected prompts
  selectedPrompts = new Set([...selectedApiPrompts, ...selectedLocalPrompts]);

  return Array.from(selectedPrompts);
}


function assignPromptsToPlayers(players, prompts) {
  let playerPrompts = new Map(); // Map to hold prompts for each player
  let playerIds = [...players.keys()]; // Array of player IDs

  if (playerIds.length % 2 === 0) {
      // Even number of players
      for (let i = 0; i < playerIds.length; i += 2) {
          let prompt = prompts[i / 2]; // Each prompt is used twice
          playerPrompts.set(playerIds[i], [prompt]);
          playerPrompts.set(playerIds[i + 1], [prompt]);
      }
  } else {
      // Odd number of players
      for (let i = 0; i < playerIds.length; i++) {
          let prompt1 = prompts[i % prompts.length];
          let prompt2 = prompts[(i + 1) % prompts.length];
          playerPrompts.set(playerIds[i], [prompt1, prompt2]);
      }
  }

  return playerPrompts; // Returns a map of players
}

// TODO: Reformat this, is activePrompts necessary, is updating All necessary?
async function startAnswers(){
  console.log('Starting answers');
  let numPrompts = calculatePromptNumbers(players.size);
  console.log('Number of prompts: ' + numPrompts);
  let playerList = [];
  let apiPrompts = []; 
  for (const [playerNumber, player] of players) {
    playerList.push(player.name);
  }
  for (const [audienceNumber, a] of audience) {
    playerList.push(a.name);
  }
  let input = {
    "players": playerList,
    "language": "en"
  };

  let response = await callAzureFunction(BACKEND_ENDPOINT + '/utils/get','get',input);
  console.log(response);
  for (const prompt of response) {
    // Check if prompt is in apiPrompts list
    if (!apiPrompts.includes(prompt.text)) {
      apiPrompts.push(prompt.text);
    }
  }
  for (const [playerNumber, prompt] of suggestedPrompts) {
    // Check if prompt is in apiPrompts list
    if (apiPrompts.includes(prompt)) {
      const index= apiPrompts.indexOf(prompt);
      if (index !== -1) {
        apiPrompts.splice(index, 1);
      }
    }
  }
  console.log("List of api prompts: "+apiPrompts);
  console.log("List of suggested prompts: "+Array.from(suggestedPrompts.values()));
  let selectedPrompts = selectPrompts(numPrompts, Array.from(suggestedPrompts.values()), apiPrompts);
  console.log("List of selected prompts: "+selectedPrompts)
  playerPrompts = assignPromptsToPlayers(players, selectedPrompts);
  console.log("Mapping of prompts assigned to players: "+ Array.from(playerPrompts.entries()));
  for (const [playerNumber, prompts] of playerPrompts) {
    players.get(playerNumber).roundPrompts = prompts;
    playersToSockets.get(playerNumber).emit('prompts',prompts);
    for (const p of prompts) {
      if (p in state.promptPlayers){
        state.promptPlayers[p].push(playerNumber);
      } else{
        state.promptPlayers[p] = [playerNumber];
      }
    }
    players.get(playerNumber).state = 3;
  }
  
}

// Handles State Changes
function endAnswers(){
  console.log('Ending answers');
  for (const [playerNumber, prompt] of playerPrompts) {
    players.get(playerNumber).state++;
  }
  for (const [playerNumber,player] of players) {
    state.roundScores[playerNumber] = 0;
  }
  state.currentPrompt = Object.keys(state.promptPlayers)[0];
  updateAll();
}

function startResults(){
  console.log('Starting results');
}

function endResults(){
  console.log('Ending results');
}

function startScores(){
  console.log('Starting scores');
}

function endScores(){
  console.log('Ending scores');   
}

function startGameOver(){
  console.log('Starting game over');
}

function endGameOver(){
  console.log('Ending game over');
}

// Function to advance game state and handle transitions
async function advanceGameState() {
  switch (state.state) {
      case 0: // Joining
          startGame();
          state.state = 1;
          startPrompts();
          break;
      case 1: // Prompts
          try {
            await endPrompts();
          } catch (e) {
            console.log('Error during endPrompts:', e.message);
            io.emit('error', { message: 'Failed to submit prompts. Each prompt must be between 15 and 80 characters.' });
            return;
          }
          state.state = 2;
          try {
            await startAnswers();
          } catch (e) {
            console.log('Error during startAnswers:', e.message);
            io.emit('error', { message: 'Failed to start answers phase.' });
            return;
          }
          break;
      case 2: // Answers
          endAnswers();
          state.state = 3;
          startVotes();
          break;
      case 3: // Voting
          endVotes();
          state.state = 4;
          startResults();
          break;
      case 4: // Scores
          endResults();
          if (checkGameOver()) {
              state.state = 5;
              for (const [playerNumber, player] of players) {
                player.totalScore += player.roundScore;
              }
              for (const [player,score] of Object.entries(state.roundScores)) {
                if (player in state.totalScores){
                  state.totalScores[player] += score;
                } else {
                  state.totalScores[player] = score;
                }
              }
              startGameOver();
          } else {
              // If the game is not over, start the next round
              state.state = 1;
              for (const [playerNumber, player] of players) {
                player.state = 1;
                player.totalScore += player.roundScore;
              }
              for (const [player,score] of Object.entries(state.roundScores)) {
                if (player in state.totalScores){
                  state.totalScores[player] += score;
                } else {
                  state.totalScores[player] = score;
                }
              }
              startPrompts();
          }
          break;
      case 5: // Game Over
          endGameOver();
          // Reset the game or start a new game, depending on your game logic
          break;
  }
  updateAll(); // Update all players with the new game state
}

function checkGameOver() {
  // Check if the current round is the third round
  if (state.round >= 3) {
      return true; // Game over if it's the third round or beyond
  } else {
      return false; // Continue the game if it's not yet the third round
  }
}

// Helper function to find the submitter of an answer
// Find answer
function findAnswerSubmitter(currentPrompt, answerText) {
  const playersForPrompt = state.promptPlayers[currentPrompt];
  const submitter = playersForPrompt.find(player => {
      // Check if the list of answers includes the answerText
      return state.playerAnswers[player].includes(answerText);
  });
  return submitter; 
}



//Handle new connection
io.on('connection', socket => { 
  console.log('New connection');

  //Handle on chat message received
  socket.on('chat', message => {
    if (socketsToPlayers.has(socket)) {
      handleChat(socketsToPlayers.get(socket),message)
    } else if (socketsToAudience.has(socket)) {
      handleChat(socketsToAudience.get(socket),message);
    } else {
      return;
    }
  });

  //Handle disconnection
  socket.on('disconnect', () => {
    console.log('Dropped connection');
  });

  socket.on('login',async(data) => {
    if(socketsToPlayers.has(socket)) return;
    if(socketsToAudience.has(socket)) return;

    handleLogin(socket,data);
  }); 

  socket.on('admin',action => {
    console.log("admin action received: "+action);
    if (socketsToPlayers.has(socket)) {
      handleAdmin(socketsToPlayers.get(socket),action);
      // updateAll();
    } else if (socketsToAudience.has(socket)) {
      // handleAdmin(socketsToAudience.get(socket),action);
      return;
    } else {
      return;
    }
  });

  socket.on('register', async (data) => {
    if(socketsToPlayers.has(socket)) return;
    if(socketsToAudience.has(socket)) return;

    handleRegister(socket,data);
  });

  socket.on('prompt', (data) => {
    if (socketsToPlayers.has(socket)) {
      handlePrompt(socketsToPlayers.get(socket),data);
    } else {
      return;
    }
    // state.prompt = data.prompt;
    // state.state = 1;
    // updateAll();
  });

  socket.on('answer', (data) => {
    console.log('Answer: ' + JSON.stringify(data, null, 2));
    handleAnswer(socket,data);
    // state.answers.push({answer: data.answer, player: socketsToPlayers.get(socket)});
    // updateAll();
  });

  socket.on('vote', (data) => {
    handleVote(socket,data);
    // state.votes.push({answerId: data.answerId, player: socketsToPlayers.get(socket)});
    // updateAll();
  });

  socket.on('updateScore', (votesData) => {
    // Iterate over each answer and its voters
    for (const [answer, voters] of Object.entries(votesData.votes)) {
        // Find the player who submitted the answer
        const submitter = findAnswerSubmitter(votesData.prompt, answer);

        // If the submitter is found, calculate and update their round score
        if (submitter && players.has(submitter)) {
            const player = players.get(submitter);
            let roundScore = 0;
            if (voters.length > 0){
              roundScore = state.round * voters.length * 100;
            } else {
              roundScore = state.round * 0 * 100;
            }

            player.roundScore += roundScore; // Assuming you want to accumulate round scores
            if (submitter in state.roundScores){
              state.roundScores[submitter] += roundScore;
            } else{
              state.roundScores[submitter] = roundScore;
            }
        }
    }
    state.votes = {};

    // Call updateAll() to push the new state to all clients
    updateAll();
});

  socket.on('nextPrompt', (data) => {
    console.log('Next prompt: ' + data);
    state.currentPrompt = data;
    for (const [playerNumber, player] of players) {
      player.state = 5;
    }
    updateAll();
  });

  socket.on('finishVoting', () => {
    console.log('Finishing voting');
    state.currentPrompt = null;
    handleNext(socket);
    // state.state++;
    // updateAll();
  });

  socket.on('advance/next', () => {
    console.log('Advancing Game');
    handleNext(socket);
    // state.state++;
    // updateAll();
  });
});

//Start server
if (module === require.main) {
  startServer();
}

module.exports = server;
