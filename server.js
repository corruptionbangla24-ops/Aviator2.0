const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const axios = require('axios'); // পিএইচপি এপিআই কল করার জন্য

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.json());
app.use(express.static(__dirname)); 

// 🔗 আপনার মূল পিএইচপি সাইটের এই ফাইলটির লাইভ লিঙ্ক এখানে বসান (শেষে / দেবেন না)
const MAIN_SITE_URL = "https://betlover247.onrender.com"; 

let currentMultiplier = 1.00;
let isCrashed = false;
let gameInterval = null;
let crashHistory = ["1.50", "3.20", "1.12", "8.50"];

let activeBets = {}; 
let totalHouseIncoming = 2000.00; 
let currentRTP = 0.90;     

// লাইভ ফেক প্লেয়ার লিস্ট ভেরিয়েবল
let livePlayersList = [];
const fakeNames = ["Aviator_King", "Roni_BD", "SkyWalker", "Jackpot_77", "Pilot_Kamal", "BetMaster", "CryptoFly", "Nisha_01", "Boss_Rahat", "Sabbir_22"];

function generateFakePlayers() {
    livePlayersList = [];
    let playerCount = Math.floor(Math.random() * 5) + 5; 
    for (let i = 0; i < playerCount; i++) {
        let name = fakeNames[Math.floor(Math.random() * fakeNames.length)] + "_" + Math.floor(Math.random() * 900 + 100);
        let bet = (Math.floor(Math.random() * 10 + 1) * 50); 
        let cashoutAt = (Math.random() * 3 + 1.2).toFixed(2); 
        livePlayersList.push({ username: name, betAmount: bet.toFixed(2), targetMultiplier: parseFloat(cashoutAt), winAmount: "-", isCashedOut: false });
    }
}

function startNewRound() {
    currentMultiplier = 1.00;
    isCrashed = false;
    activeBets = {}; 
    generateFakePlayers();

    gameInterval = setInterval(() => {
        if (!isCrashed) {
            currentMultiplier += (currentMultiplier < 2.00) ? 0.01 : (currentMultiplier < 10.00) ? 0.05 : 0.18;

            livePlayersList.forEach(player => {
                if (!player.isCashedOut && currentMultiplier >= player.targetMultiplier) {
                    player.isCashedOut = true;
                    player.winAmount = (player.betAmount * player.targetMultiplier).toFixed(2);
                }
            });

            io.emit("gameUpdate", {
                multiplier: currentMultiplier.toFixed(2),
                is_crashed: 0,
                history: crashHistory,
                players: livePlayersList
            });

            // RTP চেক
            Object.keys(activeBets).forEach(uid => {
                if (activeBets[uid] && !activeBets[uid].cashedOut) {
                    let potentialPayout = activeBets[uid].amount * currentMultiplier;
                    if (potentialPayout >= (totalHouseIncoming * currentRTP)) {
                        triggerCrash();
                    }
                }
            });

            if (currentMultiplier >= (Math.random() * 19 + 1.05)) {
                triggerCrash();
            }
        }
    }, 50);
}

function triggerCrash() {
    clearInterval(gameInterval);
    isCrashed = true;
    crashHistory.unshift(currentMultiplier.toFixed(2));
    if (crashHistory.length > 12) crashHistory.pop(); 

    Object.keys(activeBets).forEach(uid => {
        if (activeBets[uid] && !activeBets[uid].cashedOut) {
            totalHouseIncoming += activeBets[uid].amount;
        }
    });

    io.emit("gameUpdate", { multiplier: currentMultiplier.toFixed(2), is_crashed: 1, trigger_sound: true, history: crashHistory, players: livePlayersList });
    setTimeout(() => { startNewRound(); }, 5000);
}

// 🎰 ১. পিএইচপি এপিআই-এর সাথে বেট সিঙ্ক (Action: bet)
app.post('/api/place-bet', async (req, res) => {
    const { amount, userId } = req.body; // userId হিসেবে 'Roky123' আসবে
    try {
        const response = await axios.post(`${MAIN_SITE_URL}/api_callback.php`, {
            action: "bet",
            username: userId,
            amount: parseFloat(amount),
            game_name: "Aviator"
        });

        if (response.data.status === "ok") {
            activeBets[userId] = { amount: parseFloat(amount), cashedOut: false };
            res.json({ success: true, balance: response.data.balance || 0 });
        } else {
            res.json({ success: false, message: response.data.message || "Bet Declined!" });
        }
    } catch (e) {
        res.json({ success: false, message: "PHP Wallet Timeout!" });
    }
});

// 💰 ২. পিএইচপি এপিআই-এর সাথে ক্যাশআউট সিঙ্ক (Action: win)
app.post('/api/cash-out', async (req, res) => {
    const { userId } = req.body;
    if (!isCrashed && activeBets[userId] && !activeBets[userId].cashedOut) {
        let winAmount = activeBets[userId].amount * currentMultiplier;
        try {
            const response = await axios.post(`${MAIN_SITE_URL}/api_callback.php`, {
                action: "win",
                username: userId,
                amount: parseFloat(winAmount.toFixed(2)),
                game_name: "Aviator"
            });

            if (response.data.status === "ok") {
                activeBets[userId].cashedOut = true;
                totalHouseIncoming -= winAmount;
                res.json({ success: true, winAmount: winAmount.toFixed(2), balance: response.data.balance || 0 });
            } else {
                res.json({ success: false, message: "Cashout Declined by Main Server" });
            }
        } catch (e) {
            res.json({ success: false, message: "PHP Wallet Credit Error!" });
        }
    } else {
        res.json({ success: false, message: "Game Over!" });
    }
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

io.on("connection", (socket) => {
    const uid = socket.handshake.query.userId || "Roky123";
    socket.emit("gameUpdate", { multiplier: currentMultiplier.toFixed(2), is_crashed: isCrashed ? 1 : 0, history: crashHistory, players: livePlayersList });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { startNewRound(); });
