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
            <div className={
                "player"
                + (~data.readyPlayers.indexOf(id) ? " ready" : "")
                + (!~data.onlinePlayers.indexOf(id) ? " offline" : "")
                + (id === data.userId ? " self" : "")
            }>
                <div className="player-avatar-section"
                     onClick={() => (id === data.userId) && this.props.handleAvatarClick()}>
                    <Avatar data={data} player={id}/>
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
            <div className={
                "avatar"
                + (hasAvatar ? " has-avatar" : "")}
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
        const data = this.props.data;
        return (
            <div className={
                "card"
                + (this.props.checked ? " checked" : "")
                + (this.props.cardData && this.props.cardData.correct
                    ? " correct" : "")}
                 onMouseUp={() => this.props.handleCardClick(this.props.id)}>
                <div className="card-face-wrap"
                     data-card-type={this.props.type}
                     data-card-index={this.props.id}
                     data-img-url={this.props.card}
                     onMouseDown={(evt) => this.props.handleCardPress(evt.currentTarget)}>
                    <div className="card-face" style={{"background-image": `url(${this.props.card})`}}/>
                </div>
                <div className="card-buttons" onMouseDown={(evt) => evt.stopPropagation()}
                     onMouseUp={(evt) => evt.stopPropagation()}>
                    <div className="card-button-zoom" onClick={(evt) => this.props.handleZoomClick(evt.currentTarget)}>
                        <i
                            className="material-icons">search</i></div>
                    <div className="card-button-open" onClick={() => this.props.handleOpenClick(this.props.card)}><i
                        className="material-icons">open_in_new</i></div>
                </div>
                {data.phase === 1 && data.userId === data.currentPlayer ? (
                    <div className="card-submit"
                         onMouseDown={(evt) => !evt.stopPropagation() && this.props.handleAddCommandClick()}>➜</div>) : ""}
                {this.props.cardData && this.props.cardData.owner ? (<div className="card-info">
                    <div className="card-owner"><Avatar data={data} player={this.props.cardData.owner}/></div>
                    <div className="card-votes">{
                        this.props.cardData.votes.map(vote =>
                            <Avatar data={data} player={vote}/>)}</div>
                </div>) : ""}
            </div>
        );
    }
}

class Game extends React.Component {
    componentDidMount() {
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
            history.replaceState(undefined, undefined, "#" + makeId());
        if (localStorage.acceptDelete) {
            initArgs.acceptDelete = localStorage.acceptDelete;
            delete localStorage.acceptDelete;
        }
        initArgs.avatarId = localStorage.avatarId;
        initArgs.roomId = location.hash.substr(1);
        initArgs.userId = this.userId = localStorage.dixitUserId;
        initArgs.token = this.userToken = localStorage.dixitUserToken;
        initArgs.userName = localStorage.userName;
        this.socket = window.socket.of("memexit");
        this.player = {cards: []};
        this.socket.on("state", state => {
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
            alert(text);
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
    }

    debouncedEmit() {
        clearTimeout(this.debouncedEmitTimer);
        this.debouncedEmitTimer = setTimeout(() => {
            this.socket.emit.apply(this.socket, arguments);
        }, 100);
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
        if (confirm(`Removing ${this.state.playerNames[id]}?`))
            this.socket.emit("remove-player", id);
    }

    handleGiveHost(id, evt) {
        evt.stopPropagation();
        if (confirm(`Give host ${this.state.playerNames[id]}?`))
            this.socket.emit("give-host", id);
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
        const name = prompt("New name");
        this.socket.emit("change-name", name);
        localStorage.userName = name;
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
            uri = "/memexit/upload-avatar",
            xhr = new XMLHttpRequest(),
            fd = new FormData(),
            fileSize = ((file.size / 1024) / 1024).toFixed(4); // MB
        if (fileSize <= 5) {

            xhr.open("POST", uri, true);
            xhr.onreadystatechange = () => {
                if (xhr.readyState === 4 && xhr.status === 200) {
                    localStorage.avatarId = xhr.responseText;
                    this.socket.emit("update-avatar", localStorage.avatarId);
                }
            };
            fd.append("avatar", file);
            fd.append("userId", this.userId);
            fd.append("userToken", this.userToken);
            xhr.send(fd);
        }
        else
            alert("File shouldn't be larger than 5 MB");
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
        if (confirm("Restart? Are you sure?"))
            this.socket.emit("restart");
    }

    handleToggleTimed() {
        this.socket.emit("toggle-timed");
    }

    handleCardPress(wordNode) {
        this.wasReleased = false;
        setTimeout(() => {
            if (!this.wasReleased) {
                wordNode.classList.add("zoomed");
                document.body.classList.add("card-zoomed");
                this.zoomed = true;
            }
        }, 150);
    }

    handleCardRelease() {
        this.wasReleased = true;
        const zoomed = document.querySelector(".zoomed");
        zoomed && zoomed.classList.remove("zoomed");
        document.body.classList.remove("card-zoomed");
        this.zoomed = false;
    }

    keyDown(evt) {
        if (!this.zoomed) {
            if ((evt.key === " " || evt.key === "ArrowUp") && this.state.player && this.state.player.cards.length
                && (this.state.phase === 1 || this.state.phase === 2))
                document.querySelector(".hand-cards-section .card-button-zoom").click();
            else if ((evt.key === " " || evt.key === "ArrowUp") && this.state.player && this.state.player.cards.length
                && (this.state.phase === 3))
                document.querySelector(".desk-cards-section .card-button-zoom").click();
        } else {
            if (evt.key === "Escape" || evt.key === " ")
                this.handleCardRelease();
            else if (evt.key === "ArrowLeft")
                this.handleNavImage();
            else if (evt.key === "ArrowRight")
                this.handleNavImage(true);
            else if (evt.key === "ArrowDown")
                this.handleCardRelease();
            else if (evt.key === "ArrowUp") {
                const zoomedCard = document.getElementsByClassName("zoomed")[0];
                if (zoomedCard.getAttribute("data-card-type") === "desk")
                    this.handleDeskCardClick(parseInt(zoomedCard.getAttribute("data-card-index")), true);
                else
                    this.handleHandCardClick(parseInt(zoomedCard.getAttribute("data-card-index")), true);
                this.handleCardRelease();
                if (this.state.currentPlayer === this.state.userId && this.state.phase === 1)
                    document.getElementById("command-input").focus();
            }
        }
    }

    handleOpenImage() {
        const zoomed = document.querySelector(".zoomed");
        if (zoomed)
            window.open(zoomed.getAttribute("data-img-url"), "_blank");
    }

    handleNavImage(next) {
        const zoomed = document.querySelector(".zoomed");
        if (zoomed) {
            let
                cards = zoomed.parentNode.parentNode.childNodes,
                index = Array.prototype.indexOf.call(cards, zoomed.parentNode),
                length = cards.length;
            index += next ? 1 : -1;
            if (index < 0)
                index = length - 1;
            else if (index === length)
                index = 0;
            zoomed.classList.remove("zoomed");
            cards[index].getElementsByClassName("card-face-wrap")[0].classList.add("zoomed");
        }
    }

    handleHandCardClick(index, ignoreZoomed) {
        if (!this.zoomed || ignoreZoomed)
            this.socket.emit("play-card", index);
    }

    handleDeskCardClick(index, ignoreZoomed) {
        if (!this.zoomed || ignoreZoomed)
            this.socket.emit("vote-card", index);
    }

    handleCardZoomClick(node) {
        this.handleCardPress(node.parentNode.parentNode.getElementsByClassName("card-face-wrap")[0]);
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
        document.getElementsByClassName("rtb-slice1")[0].style.transform = `rotate(${firstHalfAngle}deg)`;
        document.getElementsByClassName("rtb-slice2")[0].style.transform = `rotate(${secondHalfAngle}deg)`;
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
                <div className={
                    "game"
                    + (this.state.timed ? " timed" : "")}
                     onMouseUp={() => this.handleCardRelease()}>
                    <div className={
                        "game-board"
                        + (this.state.inited ? " active" : "")
                        + (isMaster ? " isMaster" : "")
                        + (data.teamsLocked ? " teamsLocked" : "")
                    }>
                        <div className="status-bar-wrap">
                            <div className="status-bar">
                                <div className="title-section">
                                    {data.currentPlayer === data.userId && data.phase === 1 ? (
                                        <div className="add-command">
                                            <input className="add-command-input" id="command-input"
                                                   onKeyDown={(evt) => evt.key === "Enter" && this.handleAddCommandClick()}/>
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
                                <div className={
                                    "spectators"
                                    + (data.spectators.length ? "" : " empty")
                                }
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
                                              handleZoomClick={(node) => this.handleCardZoomClick(node)}
                                              handleOpenClick={(img) => this.handleCardOpenClick(img)}
                                              handleCardClick={(id) => this.handleDeskCardClick(id)}
                                              handleCardPress={(node) => this.handleCardPress(node)}/>
                                    )))
                                    : data.readyPlayers.map(() => (<div className="card flipped"/>))}
                            </div>
                            <div className="hand-cards-section">
                                {data.player.cards.map(((card, id) => (
                                    <Card key={id} data={data} id={id} card={card} type="hand"
                                          checked={data.player.playedCard === id || ~data.player.keepCards.indexOf(id)}
                                          handleAddCommandClick={() => this.handleAddCommandClick()}
                                          handleZoomClick={(node) => this.handleCardZoomClick(node)}
                                          handleOpenClick={(img) => this.handleCardOpenClick(img)}
                                          handleCardClick={(id) => this.handleHandCardClick(id)}
                                          handleCardPress={(node) => this.handleCardPress(node)}/>
                                )))}
                            </div>
                        </div>
                        <div onMouseUp={(evt) => !evt.stopPropagation() && this.handleOpenImage()}
                             className="card-open-button">
                            <i className="material-icons">open_in_new</i>
                        </div>
                        <div onMouseUp={(evt) => !evt.stopPropagation() && this.handleNavImage()}
                             className="card-nav-button prev">
                            <i className="material-icons">keyboard_arrow_left</i>
                        </div>
                        <div onMouseUp={(evt) => !evt.stopPropagation() && this.handleNavImage(true)}
                             className="card-nav-button next">
                            <i className="material-icons">keyboard_arrow_right</i>
                        </div>
                        <div className="host-controls">
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
                                <i onClick={() => window.location = parentDir}
                                   className="material-icons exit settings-button">exit_to_app</i>
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
                    </div>
                </div>
            );
        }
        else return (<div/>);
    }
}

ReactDOM.render(<Game/>, document.getElementById('root'));
