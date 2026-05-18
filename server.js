const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🎯 ইমেজ ও অডিও ফাইল সরাসরি রুট ফোল্ডার থেকে ব্রাউজারে লাইভ শো করানোর ফিক্সড রুট
app.use(express.static(__dirname));
app.use('/*.png', express.static(__dirname));
app.use('/*.mp3', express.static(__dirname));

const MAIN_SITE_URL = "https://onrender.com"; 

let currentMultiplier = 1.00;
let isCrashed = false;
let gameInterval = null;
let activeBets = {}; 
let crashHistory = ["1.50", "2.10", "1.12", "5.40"];
let livePlayersList = [];

function startNewRound() {
    currentMultiplier = 1.00;
    isCrashed = false;
    activeBets = {}; 
    livePlayersList = [{ username: "Bot_Pilot", betAmount: "200.00", targetMultiplier: 1.50, winAmount: "-", isCashedOut: false }];

    gameInterval = setInterval(() => {
        if (!isCrashed) {
            currentMultiplier += (currentMultiplier < 2.00) ? 0.01 : 0.06;
            io.emit("gameUpdate", { multiplier: currentMultiplier.toFixed(2), is_crashed: 0, history: crashHistory, players: livePlayersList });

            if (currentMultiplier >= (Math.random() * 15 + 1.05)) { triggerCrash(); }
        }
    }, 50);
}

function triggerCrash() {
    clearInterval(gameInterval);
    isCrashed = true;
    crashHistory.unshift(currentMultiplier.toFixed(2));
    if (crashHistory.length > 10) crashHistory.pop(); 

    Object.keys(activeBets).forEach(async (uid) => {
        if (activeBets[uid] && !activeBets[uid].cashedOut) {
            try { await axios.post(MAIN_SITE_URL + '/api_callback.php', { action: "loss", username: uid, game_name: "Aviator" }); } catch(e){}
        }
    });

    io.emit("gameUpdate", { multiplier: currentMultiplier.toFixed(2), is_crashed: 1, history: crashHistory, players: livePlayersList });
    setTimeout(() => { startNewRound(); }, 7000);
}

app.post('/api/place-bet', async (req, res) => {
    const { amount, userId, wallet } = req.body;
    if (currentMultiplier > 1.02 && !isCrashed) { return res.json({ success: false, message: "Started" }); }

    try {
        const response = await axios.post(MAIN_SITE_URL + '/api_callback.php', { action: "bet", username: userId, amount: parseFloat(amount), wallet: wallet });
        if (response.data && response.data.status === "ok") {
            activeBets[userId] = { amount: parseFloat(amount), cashedOut: false };
            res.json({ success: true, balance: response.data.balance });
        } else { res.json({ success: false, message: response.data.message || "Declined!" }); }
    } catch (e) { res.json({ success: false, message: "Timeout!" }); }
});

app.post('/api/cash-out', async (req, res) => {
    const { userId, amount, wallet } = req.body;
    let targetBet = amount || (activeBets[userId] ? activeBets[userId].amount : 0);

    if (!isCrashed && targetBet > 0 && activeBets[userId] && !activeBets[userId].cashedOut) {
        let winAmount = targetBet * currentMultiplier;
        try {
            const response = await axios.post(MAIN_SITE_URL + '/api_callback.php', { action: "win", username: userId, amount: parseFloat(winAmount.toFixed(2)), wallet: wallet });
            if (response.data && response.data.status === "ok") {
                activeBets[userId].cashedOut = true;
                res.json({ success: true, winAmount: winAmount.toFixed(2), balance: response.data.balance });
            } else { res.json({ success: false, message: "Declined!" }); }
        } catch (e) { res.json({ success: false, message: "Error!" }); }
    } else { res.json({ success: false, message: "Invalid Cashout!" }); }
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { startNewRound(); });
