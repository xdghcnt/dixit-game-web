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
                    {(data.hostId === data.userId && data.userId !== id) ? (
                        <div className="player-host-controls">
                            <i className="material-icons host-button"
                               title="Give host"
                               onClick={(evt) => this.props.handleGiveHost(id, evt)}>
                                vpn_key
                            </i>
                            <i className="material-icons host-button"
                               title="Remove"
                               onClick={(evt) => this.props.handleRemovePlayer(id, evt)}>
                                delete_forever
                            </i>
                        </div>
                    ) : ""}
                </div>
            </div>
        );
    }
}

class Avatar extends React.Component {
    render() {
        const avatarImg = this.props.data.avatars[this.props.player];
        return (
            <div className={
                "avatar"
                + (avatarImg ? " has-avatar" : "")}
                 style={{
                     "background-image": avatarImg
                         ? `url(${avatarImg})`
                         : `none`,
                     "background-color": avatarImg
                         ? `transparent`
                         : this.props.data.playerColors[this.props.player]
                 }}>
                {!avatarImg ? (
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
        return (
            <div className={
                "card"
                + (this.props.checked ? " checked" : "")}
                 onMouseUp={() => this.props.handleCardClick(this.props.id)}>
                <div className="card-face" style={{"background-image": `url(${this.props.card})`}}
                     onMouseDown={(evt) => this.props.handleCardPress(evt.target)}
                />
                {this.props.cardData && this.props.cardData.owner ? (<div className="card-info">
                    <div className="card-owner"><Avatar data={this.props.data} player={this.props.cardData.owner}/>
                    </div>
                    <div className="card-votes">{
                        this.props.cardData.votes.map(vote =>
                            <Avatar data={this.props.data} player={vote}/>)}</div>
                </div>) : ""}
            </div>
        );
    }
}

class Game extends React.Component {
    componentDidMount() {
        const initArgs = {};
        if (!parseInt(localStorage.darkTheme))
            document.body.classList.add("dark-theme");
        if (!localStorage.userId) {
            while (!localStorage.userName)
                localStorage.userName = prompt("Your name");
            localStorage.userId = makeId();
        }
        if (!location.hash)
            location.hash = makeId();
        initArgs.roomId = location.hash.substr(1);
        initArgs.userId = this.userId = localStorage.userId;
        initArgs.userName = localStorage.userName;
        this.socket = io();
        this.player = {cards: []};
        this.socket.on("state", state => {
            if (this.state.hasCommand === false && state.hasCommand === true && !parseInt(localStorage.muteSounds))
                this.chimeSound.play();
            this.setState(Object.assign({
                userId: this.userId,
                avatars: this.avatars,
                player: this.player
            }, state));
            if (!~state.onlinePlayers.indexOf(this.userId))
                this.socket.emit("ping");
        });
        this.socket.on("player-state", player => {
            this.player = Object.assign({}, this.player, player);
            this.setState(Object.assign(this.state, {player: this.player}));
        });
        this.socket.on("request-avatar", () => {
            if (localStorage.avatar)
                this.socket.emit("set-avatar", localStorage.avatar);
        });
        this.socket.on("update-avatars", avatars => {
            this.avatars = Object.assign({}, this.avatars, avatars);
            this.setState(this.state);
        });
        this.socket.on("message", text => {
            alert(text);
        });
        this.socket.on("disconnect", () => {
            this.setState({
                inited: false
            });
            window.location.reload();
        });
        this.socket.on("reload", () => {
            window.location.reload();
        });
        this.socket.on("highlight-card", (wordIndex) => {
            const node = document.querySelector(`[data-cardIndex='${wordIndex}']`);
            if (node) {
                if (!parseInt(localStorage.muteSounds))
                    this.tapSound.play();
                node.classList.add("highlight-anim");
                setTimeout(() => node.classList.remove("highlight-anim"), 0);
            }
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
        document.title = `Memxit - ${initArgs.roomId}`;
        this.socket.emit("init", initArgs);
        this.timerSound = new Audio("timer-beep.mp3");
        this.timerSound.volume = 0.5;
        this.tapSound = new Audio("tap.mp3");
        this.tapSound.volume = 0.6;
        this.chimeSound = new Audio("chime.mp3");
        this.chimeSound.volume = 0.25;
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
        if (input && input.value && this.state.player.playedCard)
            this.socket.emit("add-command", input.value, this.state.player.playedCard);
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
        this.socket.emit("set-time", type, value);
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
        if (input.files && input.files[0]) {
            const
                fileSize = ((input.files[0].size / 1024) / 1024).toFixed(4), // MB
                FR = new FileReader();
            if (fileSize <= 5) {
                FR.addEventListener("load", event => {
                    localStorage.avatar = event.target.result;
                    this.socket.emit("set-avatar", event.target.result);
                });
                FR.readAsDataURL(input.files[0]);
            } else alert("File shouldn't be larger than 5 MB")
        }
    }

    handleToggleTheme() {
        localStorage.darkTheme = !parseInt(localStorage.darkTheme) ? 1 : 0;
        document.body.classList.toggle("dark-theme");
        this.setState(Object.assign({
            userId: this.userId,
            activeWord: this.state.activeWord
        }, this.state));
    }

    handleToggleMuteSounds() {
        localStorage.muteSounds = !parseInt(localStorage.muteSounds) ? 1 : 0;
        this.setState(Object.assign({
            userId: this.userId,
            activeWord: this.state.activeWord
        }, this.state));
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
                this.zoomed = true;
            }
        }, 150);
    }

    handleCardRelease() {
        this.wasReleased = true;
        const zoomed = document.querySelector(".zoomed");
        zoomed && zoomed.classList.remove("zoomed");
        this.zoomed = false;
    }

    handleHandCardClick(index) {
        if (!this.zoomed)
            this.socket.emit("play-card", index);
    }

    handleDeskCardClick(index) {
        if (!this.zoomed)
            this.socket.emit("vote-card", index);
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
        if (!this.state.authRequired && this.state.inited && !this.state.playerNames[this.state.userId])
            return (<div className="kicked">You were kicked</div>);
        else if (this.state.inited) {
            document.body.classList.add("captcha-solved");
            const
                data = this.state,
                isHost = data.hostId === data.userId,
                inProcess = data.phase !== 0 && !data.paused || data.loadingCards,
                isMaster = data.currentPlayer === data.userId;
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
                            this.tapSound.play();
                    }
                    if (!this.state.timed)
                        this.updateTimer(0);
                }, 1000);
            }
            if (data.loadingCards) {
                status = "Dealing cards...";
            } else if (data.phase === 0) {
                if (data.players.length > 1)
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
                                    {data.command ? (<div className="command">«{data.command}»</div>) : ""}
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
                                            data.phase === 0 ? (
                                                <div className="status-bar-circle"><i className="material-icons">{
                                                    data.players.length > 1 ? "thumb_up" : "block"
                                                }</i></div>
                                            ) : (
                                                (data.phase === 1 || data.phase === 2) ? (
                                                    <Avatar data={data} player={data.currentPlayer}/>
                                                ) : <Avatar data={data} player={data.playerLeader}/>)
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
                                                handleRemovePlayer={(id) => this.handleRemovePlayer(id)}/>
                                    )))}
                                    {!~data.spectators.indexOf(data.userId) ? (
                                        <div className="join-button">Spectate</div>) : ""}
                                </div>
                            </div>
                            <div className="desk-cards-section">
                                {data.phase === 3
                                    ? data.deskCards.map(((card, id) => (
                                        <Card key={id} data={data} id={id} card={card.img} cardData={card}
                                              checked={data.player.votedCard === id}
                                              handleCardClick={(id) => this.handleDeskCardClick(id)}
                                              handleCardPress={(node) => this.handleCardPress(node)}/>
                                    )))
                                    : data.readyPlayers.map(() => (<div className="card flipped"/>))}
                            </div>
                            <div className="hand-cards-section">
                                {data.player.cards.map(((card, id) => (
                                    <Card key={id} data={data} id={id} card={card}
                                          checked={data.player.playedCard === id}
                                          handleCardClick={(id) => this.handleHandCardClick(id)}
                                          handleCardPress={(node) => this.handleCardPress(node)}/>
                                )))}
                            </div>
                        </div>
                        <div className="host-controls">
                            {isHost && data.timed ? (<div className="host-controls-menu">
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
                                    </div>
                                </div>
                            </div>) : ""}
                            <div className="side-buttons">
                                {isHost ? (!inProcess
                                    ? (<i onClick={() => this.handleClickTogglePause()}
                                          className="material-icons start-game settings-button">play_arrow</i>)
                                    : (<i onClick={() => this.handleClickTogglePause()}
                                          className="material-icons start-game settings-button">pause</i>)) : ""}
                                {(isHost && data.paused) ? (data.teamsLocked
                                    ? (<i onClick={() => this.handleToggleTeamLockClick()}
                                          className="material-icons start-game settings-button">lock_outline</i>)
                                    : (<i onClick={() => this.handleToggleTeamLockClick()}
                                          className="material-icons start-game settings-button">lock_open</i>)) : ""}
                                {(isHost && data.paused) ? (!data.timed
                                    ? (<i onClick={() => this.handleToggleTimed()}
                                          className="material-icons start-game settings-button">alarm_off</i>)
                                    : (<i onClick={() => this.handleToggleTimed()}
                                          className="material-icons start-game settings-button">alarm</i>)) : ""}
                                {(isHost && data.paused)
                                    ? (<i onClick={() => this.handleClickRestart()}
                                          className="toggle-theme material-icons settings-button">sync</i>) : ""}
                                <i onClick={() => this.handleClickChangeName()}
                                   className="toggle-theme material-icons settings-button">edit</i>
                                {!parseInt(localStorage.muteSounds)
                                    ? (<i onClick={() => this.handleToggleMuteSounds()}
                                          className="toggle-theme material-icons settings-button">volume_up</i>)
                                    : (<i onClick={() => this.handleToggleMuteSounds()}
                                          className="toggle-theme material-icons settings-button">volume_off</i>)}
                                {!parseInt(localStorage.darkTheme)
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
