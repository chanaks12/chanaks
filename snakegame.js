const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreElem = document.getElementById("score");
const highScoreElem = document.getElementById("highScore");
const livesElem = document.getElementById("lives");
const levelElem = document.getElementById("level");
const restartBtn = document.getElementById("restartBtn");
const pauseBtn = document.getElementById("pauseBtn");
const soundBtn = document.getElementById("soundBtn");
const msgElem = document.getElementById("msg");

// Game settings
const brickRowBase = 4; // starting rows
const brickColumnBase = 7;
const brickWidth = 60;
const brickHeight = 20;
const brickPadding = 8;
const brickOffsetTop = 40;
const brickOffsetLeft = 28;
const paddleHeight = 10;
const paddleBaseWidth = 80;
const ballRadius = 8;
const maxLevel = 6;

// Sound assets (simple beep using oscillator)
let soundOn = true;
function playBeep(freq=400, duration=100, type='square') {
    if(!soundOn) return;
    try {
        let ctxAudio = new(window.AudioContext || window.webkitAudioContext)();
        let osc = ctxAudio.createOscillator();
        let gain = ctxAudio.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctxAudio.currentTime);
        gain.gain.setValueAtTime(0.12, ctxAudio.currentTime);
        osc.connect(gain);
        gain.connect(ctxAudio.destination);
        osc.start();
        osc.stop(ctxAudio.currentTime + duration/1000);
        osc.onended = () => ctxAudio.close();
    } catch {}
}

// Power-ups
const powerUps = [
    { type: "expand", color: "#2ecc40" },
    { type: "slow", color: "#00bcd4" },
    { type: "life", color: "#ffe066" }
];

// Special bricks
const specialBrickTypes = [
    { type: "normal", hits: 1, color: "#e67e22" },
    { type: "multi", hits: 3, color: "#8e44ad" }, // multi-hit brick
    { type: "indestructible", hits: Infinity, color: "#555" } // cannot be broken
];

// Particles system
const particles = [];
function spawnParticles(x, y, color) {
    for(let i=0; i<8; i++) {
        particles.push({
            x, y,
            dx: (Math.random()-0.5)*2,
            dy: (Math.random()-0.5)*2,
            alpha: 1,
            color
        });
    }
}
function drawParticles() {
    particles.forEach(p => {
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 4, 4);
        ctx.globalAlpha = 1;
        p.x += p.dx;
        p.y += p.dy;
        p.alpha -= 0.03;
    });
    // Remove faded particles
    for(let i=particles.length-1; i>=0; i--) {
        if(particles[i].alpha <= 0) particles.splice(i, 1);
    }
}

// Multiball system
let balls;
function addBall(x, y, dx, dy) {
    balls.push({ x, y, dx, dy });
}
function resetBalls() {
    balls = [{
        x: canvas.width / 2,
        y: canvas.height - 40,
        dx: ballSpeed * (Math.random() > 0.5 ? 1 : -1),
        dy: -ballSpeed
    }];
}

// Combo system
let comboCount = 0, comboTimer = 0;
function updateCombo() {
    if(comboTimer > 0) {
        comboTimer--;
        if(comboTimer === 0) comboCount = 0;
    }
}

// Game state variables
let paddle, bricks, score, highScore, lives, level, rightPressed = false, leftPressed = false, intervalId, paused, gameOver, powerUpObj, ballSpeedBase, ballSpeed, powerActive;

// High score persistence
if(localStorage.getItem('bb_highscore')) {
    highScore = parseInt(localStorage.getItem('bb_highscore'));
} else {
    highScore = 0;
}

function randomColor(level,r,c){
    const baseColors = ["#e67e22","#c0392b","#8e44ad","#2980b9","#27ae60","#f39c12"];
    return baseColors[(level+r+c)%baseColors.length];
}

function initBricks() {
    bricks = [];
    let brickRowCount = brickRowBase + Math.min(level-1, 2);
    let brickColumnCount = brickColumnBase + Math.min(level-1, 2);
    for (let c = 0; c < brickColumnCount; c++) {
        bricks[c] = [];
        for (let r = 0; r < brickRowCount; r++) {
            // Random special brick assignment
            let brickType = specialBrickTypes[
                Math.random()<0.1 ? 1 : (Math.random()<0.05 ? 2 : 0)
            ];
            bricks[c][r] = { 
                x: 0, y: 0, status: 1, color: brickType.color, 
                type: brickType.type, hits: brickType.hits
            };
        }
    }
}

function drawBricks() {
    for (let c = 0; c < bricks.length; c++) {
        for (let r = 0; r < bricks[c].length; r++) {
            if (bricks[c][r].status === 1) {
                const brickX = c * (brickWidth + brickPadding) + brickOffsetLeft;
                const brickY = r * (brickHeight + brickPadding) + brickOffsetTop;
                bricks[c][r].x = brickX;
                bricks[c][r].y = brickY;
                ctx.fillStyle = bricks[c][r].color;
                ctx.fillRect(brickX, brickY, brickWidth, brickHeight);
                ctx.strokeStyle = "#fff";
                ctx.strokeRect(brickX, brickY, brickWidth, brickHeight);
                // Multi-hit brick indicator
                if(bricks[c][r].type === "multi" && bricks[c][r].hits > 1){
                    ctx.fillStyle = "#fff";
                    ctx.font = "bold 14px Arial";
                    ctx.fillText(bricks[c][r].hits, brickX+brickWidth/2-6, brickY+brickHeight/2+6);
                }
                // Indestructible brick indicator
                if(bricks[c][r].type === "indestructible"){
                    ctx.fillStyle = "#fff";
                    ctx.font = "bold 14px Arial";
                    ctx.fillText("∞", brickX+brickWidth/2-8, brickY+brickHeight/2+6);
                }
            }
        }
    }
}

function drawPaddle() {
    ctx.fillStyle = "#3498db";
    ctx.fillRect(paddle.x, canvas.height - paddleHeight - 5, paddle.width, paddleHeight);
}

function drawBallObj(b) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, ballRadius, 0, Math.PI * 2);
    ctx.fillStyle = "#e74c3c";
    ctx.fill();
    ctx.closePath();
}

function drawPowerUp() {
    if (powerUpObj) {
        ctx.beginPath();
        ctx.arc(powerUpObj.x, powerUpObj.y, 12, 0, Math.PI * 2);
        ctx.fillStyle = powerUpObj.color;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.stroke();
        ctx.closePath();
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // FIX: Move paddle based on arrow keys
    if (rightPressed && paddle.x < canvas.width - paddle.width) {
        paddle.x += 7;
    }
    if (leftPressed && paddle.x > 0) {
        paddle.x -= 7;
    }

    drawBricks();
    drawPaddle();
    balls.forEach(drawBallObj);
    drawPowerUp();
    drawParticles();
    updateCombo();

    if (paused || gameOver) return;

    balls.forEach((ballObj, index) => {
        collisionDetection(ballObj, index);

        // Ball movement
        ballObj.x += ballObj.dx;
        ballObj.y += ballObj.dy;

        // Ball-wall collisions
        if (ballObj.x + ballRadius > canvas.width || ballObj.x - ballRadius < 0) {
            ballObj.dx = -ballObj.dx;
            playBeep(600,80);
        }
        if (ballObj.y - ballRadius < 0) {
            ballObj.dy = -ballObj.dy;
            playBeep(800,70);
        }
        // Ball-paddle collision
        if (
            ballObj.y + ballRadius >= canvas.height - paddleHeight - 5 &&
            ballObj.x > paddle.x && ballObj.x < paddle.x + paddle.width
        ) {
            ballObj.dy = -Math.abs(ballObj.dy);
            playBeep(440,60);
            let hitPoint = (ballObj.x - (paddle.x + paddle.width/2)) / (paddle.width/2);
            ballObj.dx = ballSpeed * hitPoint;
            if(powerActive === 'slow') ballObj.dy *= 0.6;
        }
        // Ball-bottom
        if (ballObj.y + ballRadius > canvas.height) {
            balls.splice(index,1);
            if(balls.length === 0) {
                lives--;
                livesElem.textContent = "Lives: " + lives;
                playBeep(220,120,"triangle");
                if (lives <= 0) {
                    gameOver = true;
                    clearInterval(intervalId);
                    msgElem.textContent = `Game Over! Final Score: ${score}`;
                    if(score > highScore){
                        highScore = score;
                        localStorage.setItem('bb_highscore', highScore);
                        highScoreElem.textContent = "High Score: " + highScore;
                    }
                    return;
                } else {
                    resetBalls();
                    paused = true;
                    msgElem.textContent = "Press Pause/Resume or Arrow Key to continue!";
                    return;
                }
            }
        }
    });

    // Power-up drop and collision
    if (powerUpObj) {
        powerUpObj.y += 3;
        // If paddle catches power-up
        if (
            powerUpObj.y + 12 >= canvas.height - paddleHeight - 5 &&
            powerUpObj.x > paddle.x && powerUpObj.x < paddle.x + paddle.width
        ) {
            activatePower(powerUpObj.type);
            playBeep(1200,120,"sine");
            powerUpObj = null;
        }
        // If missed
        if (powerUpObj.y > canvas.height) powerUpObj = null;
    }

    // Win condition
    if (checkWin()) {
        playBeep(1000,200,"triangle");
        level++;
        if(level>maxLevel){
            gameOver = true;
            clearInterval(intervalId);
            msgElem.textContent = `Congratulations! You finished all levels! Final Score: ${score}`;
            if(score > highScore){
                highScore = score;
                localStorage.setItem('bb_highscore', highScore);
                highScoreElem.textContent = "High Score: " + highScore;
            }
        }else{
            msgElem.textContent = `Level Up! Starting Level ${level}...`;
            setTimeout(()=>{
                msgElem.textContent = "";
                initGame(false);
            }, 1800);
        }
    }
}

// Update collisionDetection() for multi-hit and indestructible bricks, combo, multiball
function collisionDetection(ballObj, ballIndex) {
    for (let c = 0; c < bricks.length; c++) {
        for (let r = 0; r < bricks[c].length; r++) {
            const b = bricks[c][r];
            if (b.status === 1) {
                if (
                    ballObj.x > b.x &&
                    ballObj.x < b.x + brickWidth &&
                    ballObj.y > b.y &&
                    ballObj.y < b.y + brickHeight
                ) {
                    // Indestructible
                    if(b.type === "indestructible") {
                        ballObj.dy = -ballObj.dy;
                        playBeep(100,90,"square");
                        spawnParticles(b.x+brickWidth/2, b.y+brickHeight/2, b.color);
                        return;
                    }
                    // Multi-hit
                    b.hits--;
                    spawnParticles(ballObj.x, ballObj.y, b.color);
                    if(b.hits <= 0) {
                        b.status = 0;
                        score++;
                        scoreElem.textContent = "Score: " + score;
                        playBeep(900,60,"square");
                        // Multiball power-up random drop
                        if(Math.random()<0.06 && balls.length<4) {
                            addBall(ballObj.x, ballObj.y, ballSpeed*(Math.random()>0.5?1:-1), -ballSpeed);
                            msgElem.textContent = "Multiball!";
                            playBeep(1200,120,"sine");
                        }
                        // Power-up drop chance
                        if(Math.random()<0.12 && !powerUpObj){
                            let p = powerUps[Math.floor(Math.random()*powerUps.length)];
                            powerUpObj = {
                                x: b.x + brickWidth/2,
                                y: b.y + brickHeight/2,
                                type: p.type,
                                color: p.color
                            };
                        }
                        // Combo
                        comboCount++;
                        comboTimer = 50;
                        if(comboCount>4){
                            let bonus = comboCount*5;
                            score += bonus;
                            scoreElem.textContent = "Score: " + score + " (+Combo!)";
                            msgElem.textContent = `Combo Bonus: +${bonus}`;
                            playBeep(1500,180,"triangle");
                        }
                    } else {
                        // Change brick color for damage
                        b.color = "#ddd";
                        playBeep(700,50,"square");
                    }
                    ballObj.dy = -ballObj.dy;
                    return;
                }
            }
        }
    }
}

// Ball resets after loss
function resetBalls() {
    balls = [{
        x: canvas.width / 2,
        y: canvas.height - 40,
        dx: ballSpeed * (Math.random() > 0.5 ? 1 : -1),
        dy: -ballSpeed
    }];
}

// Win check
function checkWin() {
    for (let c = 0; c < bricks.length; c++) {
        for (let r = 0; r < bricks[c].length; r++) {
            if (bricks[c][r].status === 1) {
                return false;
            }
        }
    }
    return true;
}

// Power-up activation
function activatePower(type){
    powerActive = type;
    if(type==="expand"){
        paddle.width = paddleBaseWidth*1.5;
        msgElem.textContent = "Power-Up: Expanded Paddle!";
        setTimeout(()=>{
            paddle.width = paddleBaseWidth;
            powerActive = null;
            msgElem.textContent = "";
        }, 8000);
    } else if(type==="slow"){
        balls.forEach(b => { b.dx *= 0.6; b.dy *= 0.6; });
        msgElem.textContent = "Power-Up: Slow Ball!";
        setTimeout(()=>{
            balls.forEach(b => { b.dx /= 0.6; b.dy /= 0.6; });
            powerActive = null;
            msgElem.textContent = "";
        }, 7000);
    } else if(type==="life"){
        lives++;
        livesElem.textContent = "Lives: " + lives;
        msgElem.textContent = "Power-Up: Extra Life!";
        setTimeout(()=>msgElem.textContent="", 2000);
        powerActive = null;
    }
}

// Controls
document.addEventListener("keydown", function(e) {
    if (e.key === "ArrowRight") {
        rightPressed = true;
        if (paused && !gameOver) { paused = false; msgElem.textContent=""; pauseBtn.textContent = "Pause"; }
    }
    if (e.key === "ArrowLeft") {
        leftPressed = true;
        if (paused && !gameOver) { paused = false; msgElem.textContent=""; pauseBtn.textContent = "Pause"; }
    }
    if (e.key.toLowerCase() === "p") togglePause();
});
document.addEventListener("keyup", function(e) {
    if (e.key === "ArrowRight") {
        rightPressed = false;
    }
    if (e.key === "ArrowLeft") {
        leftPressed = false;
    }
});

pauseBtn.onclick = togglePause;
function togglePause(){
    if (gameOver) return;
    paused = !paused;
    if(paused){
        msgElem.textContent = "Game Paused";
        pauseBtn.textContent = "Resume";
    }else{
        msgElem.textContent = "";
        pauseBtn.textContent = "Pause";
    }
}

restartBtn.onclick = ()=>{level=1;initGame(true);};

soundBtn.onclick = ()=>{
    soundOn = !soundOn;
    soundBtn.textContent = "Sound: " + (soundOn?"On":"Off");
};

canvas.onclick = ()=>{if(paused){togglePause();}};

function initGame(newGame=true) {
    ballSpeedBase = 3;
    ballSpeed = ballSpeedBase + (level-1)*0.4;
    resetBalls();
    paddle = {
        x: (canvas.width - paddleBaseWidth) / 2,
        width: paddleBaseWidth
    };
    initBricks();
    score = newGame ? 0 : score;
    lives = newGame ? 3 : lives;
    paused = false;
    gameOver = false;
    rightPressed = false;
    leftPressed = false;
    powerUpObj = null;
    powerActive = null;
    comboCount = 0;
    comboTimer = 0;
    scoreElem.textContent = "Score: " + score;
    highScoreElem.textContent = "High Score: " + highScore;
    livesElem.textContent = "Lives: " + lives;
    levelElem.textContent = "Level: " + level;
    msgElem.textContent = "";
    clearInterval(intervalId);
    intervalId = setInterval(draw, 16);
}

level = 1;
initGame(true);