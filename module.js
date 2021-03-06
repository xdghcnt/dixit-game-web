function init(wsServer, path, vkToken) {
    const
        fs = require("fs"),
        {VK} = require("vk-io"),
        randomColor = require('randomcolor'),
        app = wsServer.app,
        registry = wsServer.users,
        channel = "memexit",
        log = (msg) => {
            //fs.appendFile(`${registry.config.appDir || __dirname}/memexit-logs.txt`, `${msg}\n`, () => {
            //})
        },
        testMode = process.argv[2] === "debug",
        PLAYERS_MIN = testMode ? 1 : 3;

    let moderatedDixit = {blockedImages: [], reportedImages: []};
    const
        moderatedDixitFile = `${registry.config.appDir}/moderated-dixit.json`,
        loadModeratedDixit = () => {
            registry.log(`memexit debug - moderation file updated`);
            fs.readFile(moderatedDixitFile, (err, data) => {
                moderatedDixit = JSON.parse(data);
            });
        };
    fs.watchFile(moderatedDixitFile, () => {
        loadModeratedDixit();
    });
    loadModeratedDixit();

    const vk = new VK({token: vkToken});

    app.use("/memexit", wsServer.static(`${__dirname}/public`));
    if (registry.config.appDir)
        app.use("/memexit", wsServer.static(`${registry.config.appDir}/public`));
    registry.handleAppPage(path, `${__dirname}/public/app.html`);
    app.get("/memexit/stats", function (req, res) {
        fs.readFile(`${registry.config.appDir || __dirname}/memexit-stats.txt`, {encoding: "utf-8"}, (err, data) => {
            if (err) res.send(err.message);
            res.send(`<style>img {max-width: 49%;} .section { border-bottom: 1px solid #aeaeae; padding: 10px 0; } .command {margin-bottom: 10px;}</style>`
                + `${data.split("\n").map((line) => {
                    const rowData = line && JSON.parse(line);
                    return rowData ? `<div class="section"><div class="command">${rowData.command}</div><div class="img"><img src="${rowData.img}"/>`
                        + `${rowData.winImg ? `<img class="win" src="${rowData.winImg}"/>` : ``}</div></div>` : "";
                }).join("")}`);
        });
    });

    class GameState extends wsServer.users.RoomState {
        constructor(hostId, hostData, userRegistry) {
            super(hostId, hostData, userRegistry);
            const
                room = {
                    ...this.room,
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
                    inactivePlayers: new JSONSet(),
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
                    timeUpdated: false,
                    goal: 30,
                    time: null,
                    paused: true,
                    loadingCards: false,
                    authRequired: false,
                    playerAvatars: {},
                    needNewCards: true,
                    managedVoice: true,
                    groupURI: "https://vk.com/mysticsofthelowersort"
                },
                state = {},
                player = {};
            let deck = [];
            this.room = room;
            this.room = room;
            this.state = state;
            this.player = player;
            this.lastInteraction = new Date();
            let interval;
            const
                send = (target, event, data) => userRegistry.send(target, event, data),
                update = () => {
                    if (room.voiceEnabled)
                        processUserVoice();
                    send(room.onlinePlayers, "state", room);
                },
                processUserVoice = () => {
                    room.userVoice = {};
                    room.onlinePlayers.forEach((user) => {
                        if (!room.managedVoice || !room.teamsLocked || room.phase === 0 || room.phase === 1)
                            room.userVoice[user] = true;
                        else if (room.currentPlayer !== user)
                            room.userVoice[user] = true;
                    });
                },
                updatePlayerState = () => {
                    [...room.activePlayers].forEach(playerId => {
                        if (room.onlinePlayers.has(playerId))
                            send(playerId, "player-state", player[playerId]);
                    });
                },
                buildDeck = () => {
                    deck = shuffleArray(Array.from(Array(room.groupCount), (_, x) => x));
                },
                getGroupInfo = () => new Promise((resolve, reject) => {
                    const match = room.groupURI.match(/\/([^/]+)$/);
                    if (match && match[1]) {
                        registry.log(`memexit debug - VK group loading started - ${room.roomId} - ${match[1]}`);
                        vk.api.groups.getById({
                            group_id: match[1]
                        }).then(res => {
                            registry.log(`memexit debug - VK group loaded - ${room.roomId}`);
                            if (room.groupId === res[0].id)
                                resolve();
                            else {
                                room.groupId = res[0].id;
                                vk.api.photos.get({
                                    owner_id: -room.groupId,
                                    album_id: "wall",
                                    count: 0
                                }).then(res => {
                                    room.groupCount = res.count;
                                    if (room.groupCount < 1)
                                        reject("Group has no images");
                                    else {
                                        buildDeck();
                                        resolve();
                                    }
                                }).catch(reject)
                            }
                        }).catch((err) => {
                            registry.log(`memexit debug - VK group loading rejected - ${room.roomId} - ${err}`);
                            reject(err);
                        });
                    } else
                        reject("Invalid group id");
                }),
                getCards = (count) => Promise.all(
                    Array.apply(null, new Array(count)).map(() => getCard())
                ),
                getCard = () => {
                    if (!deck.length) {
                        send(room.onlinePlayers, "deck-reshuffled");
                        buildDeck();
                    }
                    return vk.api.photos.get({
                        owner_id: -room.groupId,
                        album_id: "wall",
                        photo_sizes: 1,
                        count: 1,
                        offset: deck.pop()
                    }).then(data => {
                        const url = data.items[0].sizes[data.items[0].sizes.length - 1].url;
                        if (!isReported(url))
                            return data.items[0].sizes[data.items[0].sizes.length - 1].url;
                        else
                            return getCard();
                    });
                },
                isReported = (url) => {
                    const match = url.match(/\/([^/]+?.jpg)/);
                    return match && match[1] && moderatedDixit?.blockedImages
                        ?.[room.groupURI]?.some((reportedUrl) => reportedUrl.includes(match[1]));
                },
                getNextPlayer = () => {
                    const nextPlayerIndex = [...room.players].indexOf(room.currentPlayer) + 1;
                    return [...room.players][(room.players.size === nextPlayerIndex) ? 0 : nextPlayerIndex];
                },
                processInactivity = (playerId) => {
                    if (room.inactivePlayers.has(playerId))
                        removePlayer(playerId);
                    else {
                        room.activePlayers.delete(playerId);
                        room.inactivePlayers.add(playerId);
                    }
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
                                        processInactivity(room.currentPlayer);
                                        room.currentPlayer = getNextPlayer();
                                        startRound();
                                    } else if (room.phase === 2) {
                                        [...room.activePlayers].forEach(playerId => {
                                            if (room.currentPlayer !== playerId && !room.readyPlayers.has(playerId))
                                                processInactivity(playerId);
                                        });
                                        revealCards();
                                    } else if (room.phase === 3) {
                                        [...room.activePlayers].forEach(playerId => {
                                            if (room.phase === 3 && room.currentPlayer !== playerId && !room.readyPlayers.has(playerId))
                                                processInactivity(playerId);
                                        });
                                        endRound();
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
                        cardsRequired += 6 - player[playerId].cards.length - player[playerId].keepCards.size;
                    });
                    return getCards(cardsRequired).then((newCards) => {
                        [...room.activePlayers].forEach(playerId => {
                            if (player[playerId].keepCards.size)
                                player[playerId].cards = [...player[playerId].keepCards].map((index) => player[playerId].prevCards[index]);
                            player[playerId].keepCards.clear();
                            player[playerId].cards = player[playerId].cards.concat(newCards.splice(0, 6 - player[playerId].cards.length))
                        });
                        updatePlayerState();
                    });
                },
                startGame = () => {
                    if (room.players.size >= PLAYERS_MIN)
                        getGroupInfo()
                            .then(() => {
                                room.paused = false;
                                room.teamsLocked = true;
                                room.playerWin = null;
                                room.time = null;
                                room.playerScores = {};
                                room.deskCards = [];
                                if (room.needNewCards)
                                    [...room.players].forEach((id) => player[id].cards = []);
                                clearInterval(interval);
                                startRound();
                            })
                            .catch((error) => {
                                registry.log(`memexit - VK group info error - ${error.message}`);
                                stopGame();
                                send(room.hostId, "message", error.message || error);
                                update();
                            });
                    else {
                        room.paused = true;
                        room.teamsLocked = false;
                    }
                },
                endGame = () => {
                    room.paused = true;
                    room.loadingCards = false;
                    room.teamsLocked = false;
                    room.time = null;
                    room.needNewCards = true;
                    room.phase = 0;
                    clearInterval(interval);
                },
                endRound = () => {
                    revealVotes();
                    countPoints();
                    room.readyPlayers.clear();
                    room.currentPlayer = getNextPlayer();
                    if (!room.playerWin)
                        startRound();
                    else
                        endGame();
                },
                stopGame = () => {
                    room.readyPlayers.clear();
                    room.activePlayers.clear();
                    room.command = null;
                    room.paused = true;
                    room.teamsLocked = false;
                    room.phase = 0;
                    clearInterval(interval);
                    update();
                },
                startRound = () => {
                    log(`round started ${printState()}`);
                    room.readyPlayers.clear();
                    room.activePlayers.clear();
                    room.command = null;
                    const prevPausedState = room.paused;
                    room.paused = true;
                    if (room.players.size >= PLAYERS_MIN) {
                        room.phase = 1;
                        [...room.players].forEach(playerId => room.activePlayers.add(playerId));
                        [...room.players].forEach(playerId => {
                            player[playerId].cardOnDesk = null;
                            player[playerId].playedCard = null;
                            player[playerId].votedCard = null;
                        });
                        startTimer();
                        room.loadingCards = true;
                        dealCards().then(() => {
                            room.loadingCards = false;
                            room.needNewCards = false;
                            room.paused = prevPausedState;
                            update();
                        }).catch((error) => {
                            registry.log(`memexit - VK get cards error - ${error.message}`);
                            send(room.hostId, "message", error.message || error);
                            stopGame();
                            update();
                        });
                    } else {
                        room.phase = 0;
                        room.teamsLocked = false;
                    }
                    update();
                },
                addCommand = (user, command) => {
                    const cardId = player[room.currentPlayer].playedCard;
                    if (cardId !== null) {
                        if (room.activePlayers.size >= PLAYERS_MIN) {
                            room.inactivePlayers.delete(user);
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
                        } else stopGame();
                    }
                },
                playCard = (playerId, cardIndex) => {
                    room.inactivePlayers.delete(playerId);
                    if (player[playerId].playedCard !== cardIndex) {
                        player[playerId].playedCard = cardIndex;
                        room.readyPlayers.add(playerId);
                        if (room.phase === 2 && room.readyPlayers.size === room.activePlayers.size)
                            revealCards();
                    } else {
                        player[playerId].playedCard = null;
                        room.readyPlayers.delete(playerId);
                    }
                    updatePlayerState();
                },
                keepCard = (playerId, cardIndex) => {
                    player[playerId].prevCards = player[playerId].cards;
                    if (!player[playerId].keepCards.has(cardIndex)) {
                        if (player[playerId].keepCards.size < 3)
                            player[playerId].keepCards.add(cardIndex);
                    } else player[playerId].keepCards.delete(cardIndex);
                    updatePlayerState();
                },
                voteCard = (playerId, cardIndex) => {
                    room.inactivePlayers.delete(playerId);
                    if (player[playerId].votedCard !== cardIndex) {
                        player[playerId].votedCard = cardIndex;
                        room.readyPlayers.add(playerId);
                        if (room.phase === 3 && room.readyPlayers.size === room.activePlayers.size - 1)
                            endRound();
                    } else {
                        player[playerId].votedCard = null;
                        room.readyPlayers.delete(playerId);
                    }
                    updatePlayerState();
                },
                revealCards = () => {
                    if (room.activePlayers.size >= PLAYERS_MIN) {
                        room.readyPlayers.clear();
                        room.phase = 3;
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
                        startTimer();
                    } else stopGame();
                    updatePlayerState();
                    update();
                },
                revealVotes = () => {
                    [...new Set([...room.activePlayers, ...room.spectators, ...room.players])].forEach(playerId => {
                        const
                            playerPlayedCard = room.deskCards[player[playerId].cardOnDesk],
                            playerVotedCard = room.deskCards[player[playerId].votedCard];
                        if (playerPlayedCard) {
                            playerPlayedCard.owner = playerId;
                            if (playerId === room.currentPlayer)
                                playerPlayedCard.correct = true;
                        } else
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
                    const stats = {command: room.command};
                    room.deskCards.forEach(card => {
                        if (card.owner === room.currentPlayer && card.votes.length > 0) {
                            stats.img = card.img;
                            if (card.votes.length !== room.activePlayers.size - 1) {
                                addPoints(card.owner, 3);
                                addPoints(card.owner, card.votes.length);
                                card.votes.forEach(playerId => {
                                    addPoints(playerId, 3);
                                });
                            } else
                                addPoints(card.owner, -3);
                        } else
                            addPoints(card.owner, card.votes.length);
                    });
                    const mostVotedCard = [...room.deskCards].sort((a, b) => a.votes - b.votes).reverse()[0];
                    if (mostVotedCard && stats.img !== mostVotedCard.img)
                        stats.winImg = mostVotedCard.img;
                    fs.appendFile(`${registry.config.appDir || __dirname}/memexit-stats.txt`, `${JSON.stringify(stats)}\n`, () => {
                    });
                    const scores = [...room.activePlayers].map(playerId => room.playerScores[playerId] || 0).sort((a, b) => a - b).reverse();
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
                removePlayer = (playerId) => {
                    if (room.currentPlayer === playerId)
                        room.currentPlayer = getNextPlayer();
                    room.activePlayers.delete(playerId);
                    room.players.delete(playerId);
                    room.readyPlayers.delete(playerId);
                    if (player[playerId]) {
                        player[playerId].playedCard = null;
                        player[playerId].cardOnDesk = null;
                        player[playerId].votedCard = null;
                    }
                    if (room.spectators.has(playerId) || !room.onlinePlayers.has(playerId)) {
                        room.spectators.delete(playerId);
                        delete room.playerNames[playerId];
                        this.emit("user-kicked", playerId);
                    } else
                        room.spectators.add(playerId);
                    if (room.phase !== 0 && room.activePlayers.size < PLAYERS_MIN)
                        stopGame();
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
                            votedCard: null,
                            keepCards: new JSONSet(),
                            prevCards: null
                        };
                    }
                    room.playerColors[user] = room.playerColors[user] || randomColor();
                    room.onlinePlayers.add(user);
                    room.playerNames[user] = data.userName.substr && data.userName.substr(0, 60);
                    if (data.avatarId) {
                        fs.stat(`${registry.config.appDir || __dirname}/public/avatars/${user}/${data.avatarId}.png`, (err) => {
                            if (!err) {
                                room.playerAvatars[user] = data.avatarId;
                                update()
                            }
                        });
                    }
                    update();
                    updatePlayerState();
                },
                userLeft = (user) => {
                    room.onlinePlayers.delete(user);
                    if (room.spectators.has(user))
                        delete room.playerNames[user];
                    room.spectators.delete(user);
                    if (room.onlinePlayers.size === 0)
                        stopGame();
                    update();
                },
                userEvent = (user, event, data) => {
                    this.lastInteraction = new Date();
                    try {
                        if (this.eventHandlers[event])
                            this.eventHandlers[event](user, data[0], data[1], data[2]);
                    } catch (error) {
                        console.error(error);
                        registry.log(error.message);
                    }
                };
            this.updatePublicState = update;
            this.userJoin = userJoin;
            this.userLeft = userLeft;
            this.userEvent = userEvent;
            this.getGroupInfo = getGroupInfo;
            this.eventHandlers = {
                ...this.eventHandlers,
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
                    if (user === room.hostId && room.paused)
                        room.teamsLocked = !room.teamsLocked;
                    update();
                },
                "add-command": (user, command) => {
                    if (command != null && room.currentPlayer === user)
                        addCommand(user, command);
                    update();
                },
                "play-card": (user, cardIndex) => {
                    if (room.activePlayers.has(user) && cardIndex != null && cardIndex >= 0 && cardIndex < 6) {
                        if (room.currentPlayer === user ? room.phase === 1 : room.phase === 2)
                            playCard(user, cardIndex);
                        else if (room.playerWin)
                            keepCard(user, cardIndex);
                    }
                    update();
                },
                "vote-card": (user, cardIndex) => {
                    if (cardIndex != null && room.phase === 3 && room.activePlayers.has(user) && !isNaN(cardIndex)
                        && cardIndex >= 0 && cardIndex < room.deskCards.length
                        && room.currentPlayer !== user && player[user].cardOnDesk !== cardIndex)
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
                        if (!room.paused) {
                            room.teamsLocked = true;
                            if (room.phase !== 0 && room.activePlayers.size < PLAYERS_MIN)
                                stopGame();
                            else if (room.timeUpdated) {
                                room.timeUpdated = false;
                                startTimer();
                            }
                        }
                        if (room.phase === 0)
                            startGame();
                    }
                    update();
                },
                "restart": (user) => {
                    if (user === room.hostId) {
                        room.needNewCards = true;
                        startGame();
                    }
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
                    if (user === room.hostId && ~["masterTime", "teamTime", "votingTime"].indexOf(type) && !isNaN(parseInt(value))) {
                        room[type] = parseFloat(value);
                        room.timeUpdated = true;
                    }
                    update();
                },
                "set-goal": (user, value) => {
                    if (user === room.hostId && !isNaN(parseInt(value)))
                        room.goal = parseInt(value);
                    update();
                },
                "change-name": (user, value) => {
                    if (value)
                        room.playerNames[user] = value.substr && value.substr(0, 60);
                    update();
                },
                "remove-player": (user, playerId) => {
                    if (playerId && user === room.hostId)
                        removePlayer(playerId);
                    update();
                },
                "give-host": (user, playerId) => {
                    if (playerId && user === room.hostId) {
                        room.hostId = playerId;
                        this.emit("host-changed", user, playerId);
                    }
                    update();
                },
                "players-join": (user) => {
                    if (!room.teamsLocked) {
                        room.spectators.delete(user);
                        room.players.add(user);
                        room.inactivePlayers.delete(user);
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
                "report-card": (user, card) => {
                    const reports = new Set(moderatedDixit.reportedImages[room.groupURI] || []);
                    reports.add(card);
                    moderatedDixit.reportedImages[room.groupURI] = [...reports];
                    fs.writeFile(
                        moderatedDixitFile,
                        JSON.stringify(moderatedDixit, undefined, 4),
                        () => {
                        });
                    send(user, "message", "Жалоба принята");
                }
            };
        }

        getPlayerCount() {
            return Object.keys(this.room.playerNames).length;
        }

        getActivePlayerCount() {
            return this.room.onlinePlayers.size;
        }

        getLastInteraction() {
            return this.lastInteraction;
        }

        getSnapshot() {
            return {
                room: this.room,
                state: this.state,
                player: this.player
            };
        }

        setSnapshot(snapshot) {
            Object.assign(this.room, snapshot.room);
            Object.assign(this.state, snapshot.state);
            Object.assign(this.player, snapshot.player);
            Object.keys(this.player).forEach((id) => {
                this.player[id].keepCards = new JSONSet(this.player[id].keepCards);
            });
            this.room.paused = true;
            this.room.activePlayers = new JSONSet(this.room.activePlayers);
            this.room.inactivePlayers = new JSONSet(this.room.inactivePlayers);
            this.room.onlinePlayers = new JSONSet();
            this.room.spectators = new JSONSet();
            this.room.players = new JSONSet(this.room.players);
            this.room.readyPlayers = new JSONSet(this.room.readyPlayers);
            this.room.onlinePlayers.clear();
            this.getGroupInfo();
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
        let currentIndex = array.length, temporaryValue, randomIndex;
        while (0 !== currentIndex) {
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex -= 1;
            temporaryValue = array[currentIndex];
            array[currentIndex] = array[randomIndex];
            array[randomIndex] = temporaryValue;
        }
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

    registry.createRoomManager(path, channel, GameState);
}

module.exports = init;

