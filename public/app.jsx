//import React from "react";
//import ReactDOM from "react-dom"
//import io from "socket.io"
function makeId() {
    let text = "";
    const possible = "abcdefghijklmnopqrstuvwxyz0123456789";

    for (let i = 0; i < 5; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}

class Player extends React.Component {
    render() {
        const
            data = this.props.data,
            id = this.props.id;
        return (
            <div className={cs("player", {
                ready: ~data.readyPlayers.indexOf(id),
                offline: !~data.onlinePlayers.indexOf(id),
                self: id === data.userId
            })} onTouchStart={(e) => e.target.focus()}>
                <div className="player-avatar-section"
                     onTouchStart={(e) => e.target.focus()}
                     onClick={() => (id === data.userId) && this.props.handleAvatarClick()}>
                    <Avatar data={data} player={id} playerList={true}/>
                    {id === data.userId ? (<i className="change-avatar-icon material-icons" title="Change avatar">
                        edit
                    </i>) : ""}
                </div>
                <div className="player-name-section">
                    <span className="player-name">{data.currentPlayer === id ? "> " : ""}{data.playerNames[id]}</span>
                    &nbsp;({data.playerScores[id] || 0})
                    <div className="player-host-controls">
                        {(data.hostId === data.userId && data.userId !== id) ? (
                            <i className="material-icons host-button"
                               title="Give host"
                               onClick={(evt) => this.props.handleGiveHost(id, evt)}>
                                vpn_key
                            </i>) : ""}
                        {(data.hostId === data.userId && data.userId !== id) ? (
                            <i className="material-icons host-button"
                               title="Remove"
                               onClick={(evt) => this.props.handleRemovePlayer(id, evt)}>
                                delete_forever
                            </i>) : ""}
                        {(data.hostId === id) ? (
                            <i className="material-icons host-button inactive"
                               title="Game host">
                                stars
                            </i>
                        ) : ""}
                    </div>
                </div>
            </div>
        );
    }
}

class Avatar extends React.Component {
    render() {
        const
            hasAvatar = !!this.props.data.playerAvatars[this.props.player],
            avatarURI = `/memexit/avatars/${this.props.player}/${this.props.data.playerAvatars[this.props.player]}.png`;
        return (
            <div className={cs("avatar", {"has-avatar": hasAvatar},
                ...(this.props.playerList ?
                    UserAudioMarker.getAudioMarkerClasses(this.props.data, this.props.player)
                    : []))}
                 style={{
                     "background-image": hasAvatar
                         ? `url(${avatarURI})`
                         : `none`,
                     "background-color": hasAvatar
                         ? `transparent`
                         : this.props.data.playerColors[this.props.player]
                 }}>
                {!hasAvatar ? (
                    <i className="material-icons avatar-stub">
                        person
                    </i>
                ) : ""}
            </div>
        );
    }
}

class Card extends React.Component {
    render() {
        const
            data = this.props.data,
            props = this.props;
        return (
            <div className={
                cs("card", `card-type-${props.type}`, `card-id-${props.id}`, {
                    checked: props.checked,
                    correct: props.cardData && props.cardData.correct
                })}
                 onMouseUp={() => props.handleCardClick(props.type, props.id)}
                 data-img-url={props.card}>
                <div className="card-face-wrap"
                     onMouseDown={() => props.handleCardPress(props.type, props.id)}
                     onTouchStart={(evt) => !evt.stopPropagation() && props.handleCardPress(props.type, props.id)}>
                    <div className="card-face" style={{"background-image": `url(${props.card})`}}/>
                </div>
                <div className="card-buttons" onMouseDown={(evt) => evt.stopPropagation()}
                     onMouseUp={(evt) => evt.stopPropagation()}>
                    <div className="card-button-zoom"
                         onClick={() => props.handleZoomClick(props.type, props.id)}>
                        <i
                            className="material-icons">search</i></div>
                    <div className="card-button-open" onClick={() => props.handleOpenClick(props.card)}><i
                        className="material-icons">open_in_new</i></div>
                </div>
                {data.phase === 1 && data.userId === data.currentPlayer ? (
                    <div className="card-submit"
                         onMouseDown={(evt) => !evt.stopPropagation() && props.handleAddCommandClick()}>➜</div>) : ""}
                {props.cardData && props.cardData.owner ? (<div className="card-info">
                    <div className="card-owner"><Avatar data={data} player={props.cardData.owner}/></div>
                    <div className="card-votes">{
                        props.cardData.votes.map(vote =>
                            <Avatar data={data} player={vote}/>)}</div>
                </div>) : ""}
            </div>
        );
    }
}

class Game extends React.Component {
    componentDidMount() {
        this.gameName = "memexit";
        const initArgs = {};
        if (!parseInt(localStorage.darkThemeDixit))
            document.body.classList.add("dark-theme");
        if (!localStorage.dixitUserId || !localStorage.dixitUserToken) {
            while (!localStorage.userName)
                localStorage.userName = prompt("Your name");
            localStorage.dixitUserId = makeId();
            localStorage.dixitUserToken = makeId();
        }
        if (!location.hash)
            history.replaceState(undefined, undefined, location.origin + location.pathname + "#" + makeId());
        else
            history.replaceState(undefined, undefined, location.origin + location.pathname + location.hash);
        if (localStorage.acceptDelete) {
            initArgs.acceptDelete = localStorage.acceptDelete;
            delete localStorage.acceptDelete;
        }
        initArgs.avatarId = localStorage.avatarId;
        initArgs.roomId = this.roomId = location.hash.substr(1);
        initArgs.userId = this.userId = localStorage.dixitUserId;
        initArgs.token = this.userToken = localStorage.dixitUserToken;
        initArgs.userName = localStorage.userName;
        initArgs.wssToken = window.wssToken;
        this.socket = window.socket.of("memexit");
        this.player = {cards: []};
        this.socket.on("state", state => {
            CommonRoom.processCommonRoom(state, this.state);
            if (this.state.phase && state.phase !== 0 && !parseInt(localStorage.muteSounds)) {
                if (this.state.currentPlayer !== this.userId && state.currentPlayer === this.userId)
                    this.masterSound.play();
                else if (this.state.phase === 1 && state.phase === 2)
                    this.storySound.play();
                else if (this.state.phase === 2 && state.phase === 3)
                    this.revealSound.play();
                else if (state.phase === 2 && this.state.readyPlayers.length !== state.readyPlayers.length)
                    this.tapSound.play();
                else if (this.state.loadingCards && !state.loadingCards)
                    this.dealSound.play();
            }
            this.setState(Object.assign({
                userId: this.userId,
                player: this.player
            }, state));
        });
        this.socket.on("player-state", player => {
            this.player = Object.assign({}, this.player, player);
            this.setState(Object.assign(this.state, {player: this.player}));
        });
        this.socket.on("message", text => {
            popup.alert({content: text});
        });
        window.socket.on("disconnect", (event) => {
            this.setState({
                inited: false,
                disconnected: true,
                disconnectReason: event.reason
            });
        });
        this.socket.on("reload", () => {
            setTimeout(() => window.location.reload(), 3000);
        });
        this.socket.on("auth-required", () => {
            this.setState(Object.assign({}, this.state, {
                userId: this.userId,
                authRequired: true
            }));
            if (grecaptcha)
                grecaptcha.render("captcha-container", {
                    sitekey: "",
                    callback: (key) => this.socket.emit("auth", key)
                });
            else
                setTimeout(() => window.location.reload(), 3000)
        });
        this.socket.on("prompt-delete-prev-room", (roomList) => {
            if (localStorage.acceptDelete =
                prompt(`Limit for hosting rooms per IP was reached: ${roomList.join(", ")}. Delete one of rooms?`, roomList[0]))
                location.reload();
        });
        this.socket.on("ping", (id) => {
            this.socket.emit("pong", id);
        });
        document.title = `Memexit - ${initArgs.roomId}`;
        this.socket.emit("init", initArgs);
        this.timerSound = new Audio("/memexit/tick.mp3");
        this.timerSound.volume = 0.4;
        this.tapSound = new Audio("/memexit/tap.mp3");
        this.tapSound.volume = 0.3;
        this.storySound = new Audio("/memexit/start.mp3");
        this.storySound.volume = 0.4;
        this.revealSound = new Audio("/memexit/reveal.mp3");
        this.revealSound.volume = 0.3;
        this.masterSound = new Audio("/memexit/master.mp3");
        this.masterSound.volume = 0.7;
        this.dealSound = new Audio("/memexit/deal.mp3");
        this.dealSound.volume = 0.3;
        document.body.addEventListener("keydown", (evt) => this.keyDown(evt));
        if (/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|ipad|iris|kindle|Android|Silk|lge |maemo|midp|mmp|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows (ce|phone)|xda|xiino/i.test(navigator.userAgent)
            || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(navigator.userAgent.substr(0, 4))) {
            document.body.classList.add("is-mobile");
            this.isMobile = true;
        }
    }

    debouncedEmit() {
        clearTimeout(this.debouncedEmitTimer);
        this.debouncedEmitTimer = setTimeout(() => {
            this.socket.emit.apply(this.socket, arguments);
        }, 100);
    }

    toggleFullScreen() {
        const doc = window.document;
        const docEl = doc.documentElement;

        const requestFullScreen = docEl.requestFullscreen || docEl.mozRequestFullScreen || docEl.webkitRequestFullScreen || docEl.msRequestFullscreen;
        const cancelFullScreen = doc.exitFullscreen || doc.mozCancelFullScreen || doc.webkitExitFullscreen || doc.msExitFullscreen;

        if (!doc.fullscreenElement && !doc.mozFullScreenElement && !doc.webkitFullscreenElement && !doc.msFullscreenElement) {
            requestFullScreen.call(docEl);
        } else {
            cancelFullScreen.call(doc);
        }
    }

    constructor() {
        super();
        this.state = {
            inited: false
        };
    }

    handleJoinPlayersClick(evt) {
        evt.stopPropagation();
        if (!this.state.teamsLocked)
            this.socket.emit("players-join");
    }

    handleJoinSpectatorsClick(evt) {
        evt.stopPropagation();
        if (!this.state.teamsLocked)
            this.socket.emit("spectators-join");
    }

    handleAddCommandClick() {
        const input = document.getElementById("command-input");
        if (input && input.value)
            this.socket.emit("add-command", input.value);
    }

    handleRemovePlayer(id, evt) {
        evt.stopPropagation();
        popup.confirm({content: `Removing ${this.state.playerNames[id]}?`}, (evt) => evt.proceed && this.socket.emit("remove-player", id));
    }

    handleGiveHost(id, evt) {
        evt.stopPropagation();
        popup.confirm({content: `Give host ${this.state.playerNames[id]}?`}, (evt) => evt.proceed && this.socket.emit("give-host", id));
    }

    handleChangeTime(value, type) {
        this.debouncedEmit("set-time", type, value);
    }

    handleSetGoal(value) {
        this.debouncedEmit("set-goal", value);
    }

    handleChangeGroupURI(value) {
        this.socket.emit("set-group-uri", value);
    }

    handleClickChangeName() {
        popup.prompt({content: "New name", value: this.state.playerNames[this.state.userId] || ""}, (evt) => {
            if (evt.proceed && evt.input_value.trim()) {
                this.socket.emit("change-name", evt.input_value.trim());
                localStorage.userName = evt.input_value.trim();
            }
        });
    }

    handleClickSetAvatar() {
        document.getElementById("avatar-input").click();
    }

    handleSetAvatar(event) {
        const input = event.target;
        if (input.files && input.files[0])
            this.sendAvatar(input.files[0]);
    }

    sendAvatar(file) {
        const
            uri = "/common/upload-avatar",
            xhr = new XMLHttpRequest(),
            fd = new FormData(),
            fileSize = ((file.size / 1024) / 1024).toFixed(4); // MB
        if (fileSize <= 5) {

            xhr.open("POST", uri, true);
            xhr.onreadystatechange = () => {
                if (xhr.readyState === 4 && xhr.status === 200) {
                    localStorage.avatarId = xhr.responseText;
                    this.socket.emit("update-avatar", localStorage.avatarId);
                } else if (xhr.readyState === 4 && xhr.status !== 200) popup.alert({content: "File upload error"});
            };
            fd.append("avatar", file);
            fd.append("userId", this.userId);
            fd.append("userToken", this.userToken);
            xhr.send(fd);
        } else
            popup.alert({content: "File shouldn't be larger than 5 MB"});
    }

    handleToggleTheme() {
        localStorage.darkThemeDixit = !parseInt(localStorage.darkThemeDixit) ? 1 : 0;
        document.body.classList.toggle("dark-theme");
        this.setState(Object.assign({}, this.state));
    }

    handleToggleMuteSounds() {
        localStorage.muteSounds = !parseInt(localStorage.muteSounds) ? 1 : 0;
        this.setState(Object.assign({}, this.state));
    }

    handleClickTogglePause() {
        this.socket.emit("toggle-pause");
    }

    handleToggleTeamLockClick() {
        this.socket.emit("toggle-lock");
    }

    handleClickRestart() {
        if (!this.gameIsOver)
            popup.confirm({content: "Restart? Are you sure?"}, (evt) => evt.proceed && this.socket.emit("restart"));
        else
            this.socket.emit("restart")
    }

    handleToggleTimed() {
        this.socket.emit("toggle-timed");
    }

    handleCardPress(type, cardId) {
        this.wasReleased = false;
        clearTimeout(this.holdTimeout);
        this.holdTimeout = setTimeout(() => {
            if (!this.wasReleased)
                this.zoomCard(type, cardId, true);
        }, this.isMobile ? 650 : 150);
    }

    zoomCard(type, cardId, holdMode) {
        const cardNode = document.querySelector(`.card-type-${type}.card-id-${cardId}`);
        if (cardNode) {
            cardNode.classList.add("zoomed");
            if (!holdMode)
                document.body.classList.add("card-zoomed");
            this.zoomed = {node: cardNode, type: type, id: cardId, img: cardNode.getAttribute("data-img-url")};
        }
    }

    unZoomCard() {
        this.wasReleased = true;
        if (this.zoomed) {
            this.zoomed.node.classList.remove("zoomed");
            document.body.classList.remove("card-zoomed");
        }
        this.zoomed = false;
    }

    keyDown(evt) {
        if (!this.zoomed) {
            if ((evt.key === "ArrowUp") && this.state.player && this.state.player.cards.length
                && (this.state.phase === 1 || this.state.phase === 2))
                this.zoomCard("hand", 0);
            else if ((evt.key === "ArrowUp") && this.state.player && this.state.player.cards.length
                && (this.state.phase === 3))
                this.zoomCard("desk", 0);
        } else {
            if (evt.key === "Escape")
                this.unZoomCard();
            else if (evt.key === "ArrowLeft")
                this.handleNavImage();
            else if (evt.key === "ArrowRight")
                this.handleNavImage(true);
            else if (evt.key === "ArrowDown")
                this.unZoomCard();
            else if (evt.key === "ArrowUp") {
                this.selectZoomedCard();
                this.unZoomCard();
                if (this.state.currentPlayer === this.state.userId && this.state.phase === 1)
                    document.getElementById("command-input").focus();
            }
        }
    }

    selectZoomedCard() {
        const zoomed = this.zoomed;
        if (zoomed)
            this.chooseCard(zoomed.type, zoomed.id, true);
    }

    handleOpenImage() {
        const zoomed = this.zoomed;
        if (zoomed)
            window.open(this.zoomed.img, "_blank");
    }

    handleNavImage(next) {
        const zoomed = this.zoomed;
        if (zoomed) {
            let
                index = zoomed.id,
                length = (zoomed.type === "desk" ? this.state.deskCards : this.state.player.cards).length;
            index += next ? 1 : -1;
            if (index < 0)
                index = length - 1;
            else if (index === length)
                index = 0;
            this.unZoomCard();
            this.zoomCard(zoomed.type, index);
        }
    }

    chooseCard(type, cardId, ignoreZoomed) {
        if (!this.zoomed || ignoreZoomed)
            this.socket.emit(type === "desk" ? "vote-card" : "play-card", cardId);
    }

    handleCardOpenClick(img) {
        window.open(img, "_blank");
    }

    updateTimer(time) {
        const timeTotal = {
            1: this.state.masterTime,
            2: this.state.teamTime,
            3: this.state.votingTime,
        }[this.state.phase] * 1000;
        this.progressBarUpdate(timeTotal - time, timeTotal);
    }

    progressBarUpdate(x, outOf) {
        let firstHalfAngle = 180,
            secondHalfAngle = 0;

        // caluclate the angle
        let drawAngle = x / outOf * 360;

        // calculate the angle to be displayed if each half
        if (drawAngle <= 180) {
            firstHalfAngle = drawAngle;
        } else {
            secondHalfAngle = drawAngle - 180;
        }

        // set the transition
        if (document.querySelector(".rtb-slice1"))
            document.querySelector(".rtb-slice1").style.transform = `rotate(${firstHalfAngle}deg)`;
        if (document.querySelector(".rtb-slice2"))
            document.querySelector(".rtb-slice2").style.transform = `rotate(${secondHalfAngle}deg)`;
    }

    render() {
        clearTimeout(this.timerTimeout);
        if (this.state.disconnected)
            return (<div
                className="kicked">Disconnected{this.state.disconnectReason ? ` (${this.state.disconnectReason})` : ""}</div>);
        else if (this.state.inited) {
            document.body.classList.add("captcha-solved");
            const
                data = this.state,
                isHost = data.hostId === data.userId,
                inProcess = data.phase !== 0 && !data.paused || data.loadingCards,
                isMaster = data.currentPlayer === data.userId,
                parentDir = location.pathname.match(/(.+?)\//)[1];
            let status = "";
            if (data.phase !== 0 && data.timed) {
                let timeStart = new Date();
                this.timerTimeout = setTimeout(() => {
                    if (this.state.timed && !this.state.paused) {
                        let prevTime = this.state.time,
                            time = prevTime - (new Date - timeStart);
                        this.setState(Object.assign({}, this.state, {time: time}));
                        this.updateTimer(time);
                        if (this.state.timed && time < 6000 && ((Math.floor(prevTime / 1000) - Math.floor(time / 1000)) > 0) && !parseInt(localStorage.muteSounds))
                            this.timerSound.play();
                    }
                    if (!this.state.timed)
                        this.updateTimer(0);
                }, 1000);
            }
            if (data.loadingCards) {
                status = "Dealing cards...";
            } else if (data.playerWin) {
                status = `You can pick cards to keep for next game`;
            } else if (data.phase === 0) {
                if (data.players.length > 2)
                    status = "Host can start game";
                else
                    status = "Not enough players";
            } else if (!isMaster) {
                if (data.phase === 1)
                    status = `${data.playerNames[data.currentPlayer]} is making up a story...`;
                else if (data.phase === 2)
                    status = "Choose your card matching the story";
                else if (data.phase === 3)
                    status = "Now try to guess the initial card";
            } else {
                if (data.phase === 1)
                    status = "Choose your card and tell a story";
                else if (data.phase === 2)
                    status = "Wait for the rest to put their cards";
                else if (data.phase === 3)
                    status = "Now they will try to guess your card";
            }
            return (
                <div className={cs("game", {timed: this.state.timed})}
                     onMouseUp={() => this.unZoomCard()}>
                    <div className={
                        cs("game-board", {
                            active: this.state.inited,
                            isMaster,
                            teamsLocked: data.teamsLocked
                        })}>
                        <div className="status-bar-wrap">
                            <div className="status-bar">
                                <div className="title-section">
                                    {data.currentPlayer === data.userId && data.phase === 1 ? (
                                        <div className="add-command">
                                            <input className="add-command-input" id="command-input"
                                                   autoComplete="off"
                                                   onKeyDown={(evt) => !evt.stopPropagation()
                                                       && evt.key === "Enter" && this.handleAddCommandClick()}/>
                                            <div className="add-command-button"
                                                 onClick={() => this.handleAddCommandClick()}>➜
                                            </div>
                                        </div>) : ""}
                                    {!data.playerWin ? (data.command ? (<div
                                        className="command">«{data.command}»</div>) : "") : `The winner is ${data.playerNames[data.playerWin]}!`}
                                    <div className="status-text">{status}</div>
                                </div>
                                <div className="timer-section">
                                    <div className="round-track-bar">
                                        <div className="rtb-clip1">
                                            <div className="rtb-slice1"/>
                                        </div>
                                        <div className="rtb-clip2">
                                            <div className="rtb-slice2"/>
                                        </div>
                                        <div className="rtb-content">{
                                            !data.playerWin ?
                                                (data.phase === 0 ? (
                                                    <div className="status-bar-circle"><i className="material-icons">{
                                                        data.players.length > 2 ? "thumb_up" : "block"
                                                    }</i></div>
                                                ) : (
                                                    (data.phase === 1 || data.phase === 2 || data.phase === 3) ? (
                                                        <Avatar data={data} player={data.currentPlayer}/>
                                                    ) : <Avatar data={data} player={data.playerLeader}/>))
                                                : (<Avatar data={data} player={data.playerWin}/>)
                                        }

                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="main-row">
                            <div className="player-list-section"
                                 onClick={(evt) => this.handleJoinPlayersClick(evt)}>
                                <div className="player-list">
                                    {data.players.map((id => (
                                        <Player key={id} data={data} id={id}
                                                handleGiveHost={(id, evt) => this.handleGiveHost(id, evt)}
                                                handleAvatarClick={() => this.handleClickSetAvatar()}
                                                handleRemovePlayer={(id, evt) => this.handleRemovePlayer(id, evt)}/>
                                    )))}
                                    {!~data.players.indexOf(data.userId) ? (
                                        <div className="join-button">Play</div>) : ""}
                                </div>
                                <div className={cs("spectators", {empty: !data.spectators.length})}
                                     onClick={(evt) => this.handleJoinSpectatorsClick(evt)}>
                                    {data.spectators.map((id => (
                                        <Player key={id} data={data} id={id}
                                                handleGiveHost={(id) => this.handleGiveHost(id)}
                                                handleAvatarClick={() => this.handleClickSetAvatar()}
                                                handleRemovePlayer={(id, evt) => this.handleRemovePlayer(id, evt)}/>
                                    )))}
                                    {!~data.spectators.indexOf(data.userId) ? (
                                        <div className="join-button">Spectate</div>) : ""}
                                </div>
                            </div>
                            <div className="desk-cards-section">
                                {data.phase !== 2
                                    ? data.deskCards.map(((card, id) => (
                                        <Card key={id} data={data} id={id} card={card.img} cardData={card} type="desk"
                                              checked={data.player.votedCard === id}
                                              handleZoomClick={(type, id) => this.zoomCard(type, id)}
                                              handleOpenClick={(img) => this.handleCardOpenClick(img)}
                                              handleCardClick={(type, id) => this.chooseCard(type, id)}
                                              handleCardPress={(type, id) => this.handleCardPress(type, id)}/>
                                    )))
                                    : data.readyPlayers.map(() => (<div className="card flipped"/>))}
                            </div>
                            <div className="hand-cards-section">
                                {data.player.cards.map(((card, id) => (
                                    <Card key={id} data={data} id={id} card={card} type="hand"
                                          checked={data.player.playedCard === id || ~data.player.keepCards.indexOf(id)}
                                          handleAddCommandClick={() => this.handleAddCommandClick()}
                                          handleZoomClick={(type, id) => this.zoomCard(type, id)}
                                          handleOpenClick={(img) => this.handleCardOpenClick(img)}
                                          handleCardClick={(type, id) => this.chooseCard(type, id)}
                                          handleCardPress={(type, id) => this.handleCardPress(type, id)}/>
                                )))}
                            </div>
                        </div>
                        <div onMouseUp={(evt) => !evt.stopPropagation() && this.handleOpenImage()}
                             className="overlay-buttons card-open-button">
                            <i className="material-icons">open_in_new</i>
                        </div>
                        <div className="mobile-buttons">
                            <div onMouseUp={(evt) => !evt.stopPropagation() && this.selectZoomedCard()}
                                 className="overlay-buttons card-select-button">
                                <i className="material-icons">check</i>
                            </div>
                            <div onMouseUp={(evt) => !evt.stopPropagation() && this.toggleFullScreen()}
                                 className="overlay-buttons fullscreen-button">
                                <i className="material-icons">fullscreen</i>
                            </div>
                        </div>
                        <div onMouseUp={(evt) => !evt.stopPropagation() && this.handleNavImage()}
                             className="card-nav-button prev">
                            <i className="material-icons">keyboard_arrow_left</i>
                        </div>
                        <div onMouseUp={(evt) => !evt.stopPropagation() && this.handleNavImage(true)}
                             className="card-nav-button next">
                            <i className="material-icons">keyboard_arrow_right</i>
                        </div>
                        <div className="host-controls" onTouchStart={(e) => e.target.focus()}>
                            {data.timed ? (<div className="host-controls-menu">
                                <div className="little-controls">
                                    <div className="game-settings">
                                        <div className="set-master-time"><i title="master time"
                                                                            className="material-icons">alarm_add</i>
                                            {(isHost && !inProcess) ? (<input id="goal"
                                                                              type="number"
                                                                              defaultValue={this.state.masterTime}
                                                                              min="0"
                                                                              onChange={evt => !isNaN(evt.target.valueAsNumber)
                                                                                  && this.handleChangeTime(evt.target.valueAsNumber, "masterTime")}
                                            />) : (<span className="value">{this.state.masterTime}</span>)}
                                        </div>
                                        <div className="set-team-time"><i title="team time"
                                                                          className="material-icons">alarm</i>
                                            {(isHost && !inProcess) ? (<input id="round-time"
                                                                              type="number"
                                                                              defaultValue={this.state.teamTime} min="0"
                                                                              onChange={evt => !isNaN(evt.target.valueAsNumber)
                                                                                  && this.handleChangeTime(evt.target.valueAsNumber, "teamTime")}
                                            />) : (<span className="value">{this.state.teamTime}</span>)}
                                        </div>
                                        <div className="set-add-time"><i title="adding time"
                                                                         className="material-icons">alarm_on</i>
                                            {(isHost && !inProcess) ? (<input id="round-time"
                                                                              type="number"
                                                                              defaultValue={this.state.votingTime}
                                                                              min="0"
                                                                              onChange={evt => !isNaN(evt.target.valueAsNumber)
                                                                                  && this.handleChangeTime(evt.target.valueAsNumber, "votingTime")}
                                            />) : (<span className="value">{this.state.votingTime}</span>)}
                                        </div>
                                        <div className="set-goal"><i title="goal"
                                                                     className="material-icons">flag</i>
                                            {(isHost && !inProcess) ? (<input id="goal"
                                                                              type="number"
                                                                              defaultValue={this.state.goal}
                                                                              min="0"
                                                                              onChange={evt => !isNaN(evt.target.valueAsNumber)
                                                                                  && this.handleSetGoal(evt.target.valueAsNumber)}
                                            />) : (<span className="value">{this.state.goal}</span>)}
                                        </div>
                                    </div>
                                </div>
                                <div className="little-controls">
                                    <div className="game-settings group-uri-input">
                                        {(isHost && !inProcess) ? <input id="group-uri"
                                                                         defaultValue={this.state.groupURI}
                                                                         onChange={evt => this.handleChangeGroupURI(evt.target.value)}
                                            />
                                            : (<span className="value">{this.state.groupURI}</span>)}
                                    </div>
                                </div>
                            </div>) : ""}
                            <div className="side-buttons">
                                {this.state.userId === this.state.hostId ?
                                    <i onClick={() => this.socket.emit("set-room-mode", false)}
                                       className="material-icons exit settings-button">store</i> : ""}
                                {isHost && !data.loadingCards ? (!inProcess
                                    ? (<i onClick={() => this.handleClickTogglePause()}
                                          className="material-icons start-game settings-button">play_arrow</i>)
                                    : (<i onClick={() => this.handleClickTogglePause()}
                                          className="material-icons start-game settings-button">pause</i>)) : ""}
                                {(isHost && data.paused && !data.loadingCards) ? (data.teamsLocked
                                    ? (<i onClick={() => this.handleToggleTeamLockClick()}
                                          className="material-icons start-game settings-button">lock_outline</i>)
                                    : (<i onClick={() => this.handleToggleTeamLockClick()}
                                          className="material-icons start-game settings-button">lock_open</i>)) : ""}
                                {(isHost && data.paused && !data.loadingCards) ? (!data.timed
                                    ? (<i onClick={() => this.handleToggleTimed()}
                                          className="material-icons start-game settings-button">alarm_off</i>)
                                    : (<i onClick={() => this.handleToggleTimed()}
                                          className="material-icons start-game settings-button">alarm</i>)) : ""}
                                {(isHost && data.paused && !data.loadingCards)
                                    ? (<i onClick={() => this.handleClickRestart()}
                                          className="toggle-theme material-icons settings-button">sync</i>) : ""}
                                <i onClick={() => this.handleClickChangeName()}
                                   className="toggle-theme material-icons settings-button">edit</i>
                                {!parseInt(localStorage.muteSounds)
                                    ? (<i onClick={() => this.handleToggleMuteSounds()}
                                          className="toggle-theme material-icons settings-button">volume_up</i>)
                                    : (<i onClick={() => this.handleToggleMuteSounds()}
                                          className="toggle-theme material-icons settings-button">volume_off</i>)}
                                {!parseInt(localStorage.darkThemeDixit)
                                    ? (<i onClick={() => this.handleToggleTheme()}
                                          className="toggle-theme material-icons settings-button">brightness_2</i>)
                                    : (<i onClick={() => this.handleToggleTheme()}
                                          className="toggle-theme material-icons settings-button">wb_sunny</i>)}
                            </div>
                            <i className="settings-hover-button material-icons">settings</i>
                            <input id="avatar-input" type="file" onChange={evt => this.handleSetAvatar(evt)}/>
                        </div>
                        <CommonRoom state={this.state} app={this}/>
                    </div>
                </div>
            );
        } else return (<div/>);
    }
}

ReactDOM.render(<Game/>, document.getElementById('root'));
