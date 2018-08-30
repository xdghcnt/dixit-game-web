function init(wsServer, path, vkToken) {
    const
        fs = require("fs"),
        express = require("express"),
        {VK} = require("vk-io"),
        fileUpload = require("express-fileupload"),
        exec = require("child_process").exec,
        app = wsServer.app,
        users = wsServer.users.of("memexit"),
        log = (msg) => {
            fs.appendFile(`${__dirname}/memexit-logs.txt`, `${msg}\n`, () => {
            })
        };

    const vk = new VK();
    vk.setToken(vkToken);

    app.use(fileUpload({
        limits: {fileSize: 5 * 1024 * 1024},
        abortOnLimit: true
    }));

    app.post("/memexit/upload-avatar", function (req, res) {
        if (req.files && req.files.avatar && wsServer.users.checkUserToken(req.body.userId, req.body.userToken)) {
            const userDir = `${__dirname}/public/avatars/${req.body.userId}`;
            exec(`rm -r ${userDir}`, () => {
                fs.mkdir(userDir, () => {
                    req.files.avatar.mv(`${userDir}/${req.files.avatar.md5}.png`, function (err) {
                        if (err) {
                            log(`fileUpload mv error ${err}`);
                            return res.status(500).send("FAIL");
                        }
                        res.send(req.files.avatar.md5);
                    });
                })

            });
        }
    });
    app.use("/memexit", express.static(`${__dirname}/public`));
    app.get(path, function (req, res) {
        res.sendFile(`${__dirname}/public/app.html`);
    });

    const
        rooms = new Map(),
        onlineUsers = new Map();
    users.on("user-joined", (id, data) => {
        if (data.roomId) {
            if (!rooms.has(data.roomId))
                rooms.set(data.roomId, new GameState(id, data, users));
            rooms.get(data.roomId).userJoin(data);
            onlineUsers.set(data.userId, data.roomId);
        }
    });
    users.on("user-left", (id) => {
        if (onlineUsers.has(id)) {
            const roomId = onlineUsers.get(id);
            if (rooms.has(roomId))
                rooms.get(roomId).userLeft(id);
            onlineUsers.delete(id);
        }
    });
    users.on("user-event", (id, event, data) => {
        if (onlineUsers.has(id)) {
            const roomId = onlineUsers.get(id);
            if (rooms.has(roomId))
                rooms.get(roomId).userEvent(id, event, data);
        }
    });

    class GameState {
        constructor(hostId, hostData, userRegistry) {
            const
                room = {
                    inited: true,
                    hostId: hostId,
                    spectators: new JSONSet(),
                    playerNames: {},
                    playerColors: {},
                    onlinePlayers: new JSONSet(),
                    currentPlayer: null,
                    players: new JSONSet(),
                    readyPlayers: new JSONSet(),
                    activePlayers: new JSONSet(),
                    playerScores: {},
                    teamsLocked: false,
                    timed: true,
                    command: null,
                    playerWin: null,
                    playerLeader: null,
                    deskCards: [],
                    phase: 0,
                    masterTime: 60,
                    teamTime: 40,
                    votingTime: 40,
                    goal: 30,
                    time: null,
                    paused: true,
                    loadingCards: false,
                    authRequired: false,
                    playerAvatars: {},
                    groupURI: "https://vk.com/ayy_memes"
                },
                state = {},
                player = {};
            let interval;
            const
                send = (target, event, data) => userRegistry.send(target, event, data),
                update = () => send(room.onlinePlayers, "state", room),
                updatePlayerState = () => {
                    [...room.activePlayers].forEach(playerId => {
                        send(playerId, "player-state", player[playerId]);
                    });
                },
                getGroupInfo = () => new Promise((resolve, reject) => {
                    const match = room.groupURI.match(/\/([^/]+)$/);
                    if (match && match[1]) {
                        vk.api.groups.getById({
                            group_id: match[1]
                        }).then(res => {
                            room.groupId = res[0].id;
                            vk.api.photos.get({
                                owner_id: -room.groupId,
                                album_id: "wall",
                                count: 0
                            }).then(res => {
                                room.groupCount = res.count;
                                if (room.groupCount < 1)
                                    reject("Group has no images");
                                else
                                    resolve();
                            }).catch(reject)
                        }).catch(reject);
                    }
                    else
                        reject("Invalid group id");
                }),
                getCards = (count) => Promise.all(
                    Array.apply(null, new Array(count)).map(() => vk.api.photos.get({
                        owner_id: -room.groupId,
                        album_id: "wall",
                        photo_sizes: 1,
                        count: 1,
                        offset: getRandomInt(0, room.groupCount - 1)
                    }).then(data => data.items[0].sizes[data.items[0].sizes.length - 1].url))
                ),
                getNextPlayer = () => {
                    const nextPlayerIndex = [...room.players].indexOf(room.currentPlayer) + 1;
                    return [...room.players][(room.players.size === nextPlayerIndex) ? 0 : nextPlayerIndex];
                },
                startTimer = () => {
                    if (room.timed) {
                        clearInterval(interval);
                        if (room.phase === 1)
                            room.time = room.masterTime * 1000;
                        else if (room.phase === 2)
                            room.time = room.teamTime * 1000;
                        else if (room.phase === 3)
                            room.time = room.votingTime * 1000;
                        let time = new Date();
                        interval = setInterval(() => {
                            if (!room.paused) {
                                room.time -= new Date() - time;
                                time = new Date();
                                if (room.time <= 0) {
                                    log(`timeout triggered ${printState()}`);
                                    clearInterval(interval);
                                    if (room.phase === 1) {
                                        room.currentPlayer = getNextPlayer();
                                        startRound();
                                    }
                                    else if (room.phase === 2) {
                                        [...room.activePlayers].forEach(playerId => {
                                            if (room.currentPlayer !== playerId && !room.readyPlayers.has(playerId))
                                                playCard(playerId, getRandomInt(0, 6));
                                        });
                                    }
                                    else if (room.phase === 3) {
                                        [...room.activePlayers].forEach(playerId => {
                                            if (room.phase === 3 && room.currentPlayer !== playerId && !room.readyPlayers.has(playerId)) {
                                                if (room.activePlayers.size > 1) {
                                                    let randomCard;
                                                    while (randomCard === undefined) {
                                                        let rand = getRandomInt(0, room.activePlayers.size - 1);
                                                        if (rand !== player[playerId].cardOnDesk)
                                                            randomCard = rand;
                                                    }
                                                    voteCard(playerId, randomCard);
                                                } else endGame();
                                            }
                                        });
                                    }
                                    update();
                                }
                            } else time = new Date();
                        }, 100);
                    }
                },
                dealCards = () => {
                    let cardsRequired = 0;
                    [...room.activePlayers].forEach(playerId => {
                        cardsRequired += 6 - player[playerId].cards.length;
                    });
                    return getCards(cardsRequired).then((newCards) => {
                        [...room.activePlayers].forEach(playerId => {
                            player[playerId].cards = player[playerId].cards.concat(newCards.splice(0, 6 - player[playerId].cards.length))
                        });
                        updatePlayerState();
                    });
                },
                startGame = () => {
                    if (room.players.size > 2)
                        getGroupInfo()
                            .then(() => {
                                room.paused = false;
                                room.teamsLocked = true;
                                room.playerWin = null;
                                room.time = null;
                                room.playerScores = {};
                                room.deskCards = [];
                                [...room.players].forEach((id) => player[id].cards = []);
                                clearInterval(interval);
                                startRound();
                            })
                            .catch((error) => {
                                endGame();
                                send(room.hostId, "message", error.message || error);
                                update();
                            });
                },
                endGame = () => {
                    room.paused = true;
                    room.teamsLocked = false;
                    room.time = null;
                    room.phase = 0;
                    clearInterval(interval);
                },
                endRound = () => {
                    revealVotes();
                    countPoints();
                    room.activePlayers.clear();
                    room.currentPlayer = getNextPlayer();
                    if (!room.playerWin && room.players.size > 1)
                        startRound();
                    else
                        endGame();
                },
                startRound = () => {
                    log(`round started ${printState()}`);
                    room.command = null;
                    room.readyPlayers.clear();
                    room.phase = 1;
                    [...room.players].forEach(playerId => room.activePlayers.add(playerId));
                    [...room.players].forEach(playerId => {
                        player[playerId].cardOnDesk = null;
                        player[playerId].playedCard = null;
                        player[playerId].votedCard = null;
                    });
                    room.paused = true;
                    startTimer();
                    room.loadingCards = true;
                    dealCards().then(() => {
                        room.loadingCards = false;
                        room.paused = false;
                        update();
                    });
                    update();
                },
                addCommand = (user, command) => {
                    const cardId = player[room.currentPlayer].playedCard;
                    if (cardId !== null) {
                        room.deskCards = [];
                        room.teamsLocked = true;
                        room.command = command;
                        room.readyPlayers.add(user);
                        state.masterPlayedCard = player[user].cards[cardId];
                        player[user].cards.splice(cardId, 1);
                        player[user].playedCard = null;
                        room.phase = 2;
                        startTimer();
                        updatePlayerState();
                    }
                },
                playCard = (playerId, cardIndex) => {
                    if (player[playerId].playedCard !== cardIndex) {
                        player[playerId].playedCard = cardIndex;
                        room.readyPlayers.add(playerId);
                        if (room.readyPlayers.size === room.activePlayers.size) {
                            room.readyPlayers.clear();
                            room.phase = 3;
                            revealCards();
                            startTimer();
                        }
                    } else {
                        player[playerId].playedCard = null;
                        room.readyPlayers.delete(playerId);
                    }
                    updatePlayerState();
                },
                voteCard = (playerId, cardIndex) => {
                    if (player[playerId].votedCard !== cardIndex) {
                        player[playerId].votedCard = cardIndex;
                        room.readyPlayers.add(playerId);
                        if (room.readyPlayers.size === room.activePlayers.size - 1)
                            endRound();
                    } else {
                        player[playerId].votedCard = null;
                        room.readyPlayers.delete(playerId);
                    }
                    updatePlayerState();
                },
                revealCards = () => {
                    room.deskCards = [];
                    shuffleArray([...room.activePlayers]).forEach((playerId, index) => {
                        room.deskCards.push({
                            img: playerId !== room.currentPlayer
                                ? player[playerId].cards.splice(player[playerId].playedCard, 1)[0]
                                : state.masterPlayedCard,
                            owner: null,
                            votes: []
                        });
                        player[playerId].playedCard = null;
                        player[playerId].cardOnDesk = index;
                    });
                    updatePlayerState();
                    update();
                },
                revealVotes = () => {
                    [...room.activePlayers].forEach(playerId => {
                        const
                            playerPlayedCard = room.deskCards[player[playerId].cardOnDesk],
                            playerVotedCard = room.deskCards[player[playerId].votedCard];
                        if (playerPlayedCard) {
                            playerPlayedCard.owner = playerId;
                            if (playerId === room.currentPlayer)
                                playerPlayedCard.correct = true;
                        }
                        else
                            log(`unexpected cardOnDesk empty ${printState()}`);
                        if (room.currentPlayer !== playerId) {
                            if (playerVotedCard)
                                playerVotedCard.votes.push(playerId);
                            else
                                log(`unexpected cardVotes empty ${printState()}`);
                        }
                    });
                },
                countPoints = () => {
                    room.deskCards.forEach(card => {
                        if (card.owner === room.currentPlayer && card.votes.length > 0) {
                            if (card.votes.length !== room.activePlayers.size - 1) {
                                addPoints(card.owner, 3);
                                addPoints(card.owner, card.votes.length);
                                card.votes.forEach(playerId => {
                                    addPoints(playerId, 3);
                                });
                            }
                            else
                                addPoints(card.owner, -3);
                        }
                        else
                            addPoints(card.owner, card.votes.length);
                    });
                    const scores = [...room.activePlayers].map(playerId => room.playerScores[playerId] || 0).sort().reverse();
                    if (scores[0] > scores[1]) {
                        room.playerLeader = [...room.activePlayers].filter(playerId => room.playerScores[playerId] === scores[0])[0];
                        if (scores[0] >= room.goal)
                            room.playerWin = room.playerLeader;
                    }
                },
                addPoints = (playerId, points) => {
                    room.playerScores[playerId] = room.playerScores[playerId] || 0;
                    room.playerScores[playerId] += points;
                    if (room.playerScores[playerId] < 0)
                        room.playerScores[playerId] = 0;
                },
                getRandomColor = () => {
                    return "#" + ((1 << 24) * Math.random() | 0).toString(16);
                },
                removePlayer = (playerId) => {
                    room.onlinePlayers.delete(playerId);
                    room.activePlayers.delete(playerId);
                    room.players.delete(playerId);
                    room.spectators.delete(playerId);
                    if (room.currentPlayer === playerId)
                        startRound();
                },
                printState = () => `\m player-state: ${JSON.stringify(player, null, 4)} \n game-state: ${JSON.stringify(room, null, 4)}`,
                userJoin = (data) => {
                    const user = data.userId;
                    if (!room.playerNames[user]) {
                        room.spectators.add(user);
                        player[user] = {
                            cards: [],
                            playedCard: null,
                            cardOnDesk: null,
                            votedCard: null
                        };
                    }
                    room.playerColors[user] = room.playerColors[user] || getRandomColor();
                    room.onlinePlayers.add(user);
                    room.playerNames[user] = data.userName.substr && data.userName.substr(0, 60);
                    if (data.avatarId)
                        room.playerAvatars[user] = data.avatarId;
                    update();
                    updatePlayerState();
                },
                userLeft = (user) => {
                    room.onlinePlayers.delete(user);
                    if (room.spectators.has(user))
                        delete room.playerNames[user];
                    room.spectators.delete(user);
                    update();
                },
                userEvent = (user, event, data) => {
                    try {
                        if (this.eventHandlers[event])
                            this.eventHandlers[event](user, data[0], data[1], data[2]);
                    } catch (error) {
                        console.error(error);
                        wsServer.users.log(error.message);
                    }
                };
            this.userJoin = userJoin;
            this.userLeft = userLeft;
            this.userEvent = userEvent;
            this.eventHandlers = {
                "update-avatar": (user, id) => {
                    room.playerAvatars[user] = id;
                    update()
                },
                "set-group-uri": (user, value) => {
                    if (user === room.hostId)
                        room.groupURI = value;
                    update();
                },
                "toggle-lock": (user) => {
                    if (user === room.hostId)
                        room.teamsLocked = !room.teamsLocked;
                    update();
                },
                "add-command": (user, command) => {
                    if (command != null && room.currentPlayer === user)
                        addCommand(user, command);
                    update();
                },
                "play-card": (user, cardIndex) => {
                    if (room.activePlayers.has(user) && cardIndex != null && (room.currentPlayer === user ? room.phase === 1 : room.phase === 2))
                        playCard(user, cardIndex);
                    update();
                },
                "vote-card": (user, cardIndex) => {
                    if (cardIndex != null && room.phase === 3 && room.activePlayers.has(user) && room.currentPlayer !== user && player[user].cardOnDesk !== cardIndex)
                        voteCard(user, cardIndex);
                    update();
                },
                "stop-game": (user) => {
                    if (user === room.hostId)
                        room.teamsLocked = false;
                    update();
                },
                "toggle-pause": (user) => {
                    if (user === room.hostId && !room.loadingCards) {
                        room.paused = !room.paused;
                        if (!room.paused)
                            room.teamsLocked = true;
                        if (room.phase === 0)
                            startGame();
                    }
                    update();
                },
                "restart": (user) => {
                    if (user === room.hostId)
                        startGame();
                    update();
                },
                "toggle-timed": (user) => {
                    if (user === room.hostId) {
                        room.timed = !room.timed;
                        if (!room.timed) {
                            room.time = null;
                            clearInterval(interval);
                        }
                    }
                    update();
                },
                "set-time": (user, type, value) => {
                    if (user === room.hostId && ~["masterTime", "teamTime", "votingTime"].indexOf(type) && !isNaN(parseInt(value)))
                        room[type] = parseFloat(value);
                    update();
                },
                "change-name": (user, value) => {
                    if (value)
                        room.playerNames[user] = value.substr && value.substr(0, 60);
                    update();
                },
                "remove-player": (user, playerId) => {
                    if (playerId && user === room.hostId) {
                        removePlayer(playerId);
                        if (room.onlinePlayers.has(playerId))
                            room.spectators.add(playerId);
                    }
                    update();
                },
                "give-host": (user, playerId) => {
                    if (playerId && user === room.hostId)
                        room.hostId = playerId;
                    update();
                },
                "players-join": (user) => {
                    if (!room.teamsLocked) {
                        room.spectators.delete(user);
                        room.players.add(user);
                        if (room.players.size === 1)
                            room.currentPlayer = user;
                        update();
                    }
                },
                "spectators-join": (user) => {
                    if (!room.teamsLocked) {
                        if (room.currentPlayer === user)
                            room.currentPlayer = getNextPlayer();
                        room.players.delete(user);
                        room.activePlayers.delete(user);
                        room.spectators.add(user);
                        update();
                    }
                },
                "ping": (user) => {
                    room.onlinePlayers.add(user);
                    update();
                }
            };
        }
    }

    function makeId() {
        let text = "";
        const possible = "abcdefghijklmnopqrstuvwxyz0123456789";

        for (let i = 0; i < 5; i++)
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        return text;
    }

    function shuffleArray(array) {
        array.sort(() => (Math.random() - 0.5));
        return array;
    }

    function getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1) + min);
    }

    class JSONSet extends Set {
        constructor(iterable) {
            super(iterable)
        }

        toJSON() {
            return [...this]
        }
    }
}

module.exports = init;

