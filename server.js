const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.json());
app.use(express.static(__dirname)); 

// গেম ও ৯০% RTP ভেরিয়েবল
let currentMultiplier = 1.00;
let isCrashed = false;
let gameInterval = null;
let userBalance = 5000.00; 

let totalHouseIncoming = 2000.00; 
let activeBetAmount = 0;          
let hasCashedOut = false;         
let crashHistory = ["1.50", "3.20", "1.12", "8.50", "1.95", "2.10"];

// --- লাইভ ফেক প্লেয়ার লিস্ট ভেরিয়েবল ---
let livePlayersList = [];
const fakeNames = ["Aviator_King", "Roni_BD", "SkyWalker", "Jackpot_77", "Pilot_Kamal", "BetMaster", "CryptoFly", "Nisha_01", "Boss_Rahat", "Sabbir_22", "Turbo_Jet", "WinLover", "Aiman_Pro", "Zayan_X"];

// ফেক প্লেয়ার জেনারেট করার ফাংশন
function generateFakePlayers() {
    livePlayersList = [];
    // প্রতি রাউন্ডে র‍্যান্ডমলি ৭ থেকে ১২ জন প্লেয়ার অংশ নেবে
    let playerCount = Math.floor(Math.random() * 6) + 7; 
    
    for (let i = 0; i < playerCount; i++) {
        let name = fakeNames[Math.floor(Math.random() * fakeNames.length)] + "_" + Math.floor(Math.random() * 900 + 100);
        let bet = (Math.floor(Math.random() * 18 + 1) * 50); // ৫০ থেকে ১০০০ টাকার ভেতর বেট
        let cashoutAt = (Math.random() * 4 + 1.2).toFixed(2); // ১.২০x থেকে ৫.২০x এর ভেতর ক্যাশআউট টার্গেট
        
        livePlayersList.push({
            username: name,
            betAmount: bet.toFixed(2),
            targetMultiplier: parseFloat(cashoutAt),
            winAmount: "-",
            isCashedOut: false
        });
    }
}

function startNewRound() {
    currentMultiplier = 1.00;
    isCrashed = false;
    hasCashedOut = false;
    
    // রাউন্ডের শুরুতে নতুন ফেক প্লেয়ার তৈরি
    generateFakePlayers();

    gameInterval = setInterval(() => {
        if (!isCrashed) {
            if (currentMultiplier < 2.00) {
                currentMultiplier += 0.01;
            } else if (currentMultiplier < 10.00) {
                currentMultiplier += 0.05;
            } else {
                currentMultiplier += 0.18;
            }

            // --- ফেক প্লেয়ারদের রিয়েল-টাইম ক্যাশআউট লজিক ---
            livePlayersList.forEach(player => {
                if (!player.isCashedOut && currentMultiplier >= player.targetMultiplier) {
                    player.isCashedOut = true;
                    player.winAmount = (player.betAmount * player.targetMultiplier).toFixed(2);
                }
            });

            io.emit("gameUpdate", {
                multiplier: currentMultiplier.toFixed(2),
                is_crashed: 0,
                balance: userBalance,
                history: crashHistory,
                players: livePlayersList // প্লেয়ার লিস্ট ফ্রন্টএন্ডে পুশ
            });

            if (activeBetAmount > 0 && !hasCashedOut) {
                let potentialPayout = activeBetAmount * currentMultiplier; 
                let maxAllowedPayout = totalHouseIncoming * 0.90;          

                if (potentialPayout >= maxAllowedPayout) {
                    triggerCrash();
                }
            }

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

    if (activeBetAmount > 0 && !hasCashedOut) {
        totalHouseIncoming += activeBetAmount; 
    }
    activeBetAmount = 0; 

    io.emit("gameUpdate", {
        multiplier: currentMultiplier.toFixed(2),
        is_crashed: 1,
        trigger_sound: true,
        history: crashHistory,
        players: livePlayersList
    });

    setTimeout(() => {
        startNewRound();
    }, 5000);
}

app.post('/api/place-bet', (req, res) => {
    const { amount } = req.body;
    if (userBalance >= amount && amount > 0) {
        userBalance -= amount;
        activeBetAmount = amount; 
        res.json({ success: true, balance: userBalance });
    } else {
        res.json({ success: false, message: "Insufficient Balance!" });
    }
});

app.post('/api/cash-out', (req, res) => {
    const { amount } = req.body;
    let targetBet = amount || activeBetAmount;

    if (!isCrashed && targetBet > 0 && !hasCashedOut) {
        let winAmount = targetBet * currentMultiplier;
        userBalance += winAmount;          
        totalHouseIncoming -= winAmount; 
        hasCashedOut = true;
        activeBetAmount = 0;
        res.json({ success: true, winAmount: winAmount.toFixed(2), balance: userBalance });
    } else {
        res.json({ success: false, message: "Cannot Cashout! Game Already Over." });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

io.on("connection", (socket) => {
    socket.emit("gameUpdate", {
        multiplier: currentMultiplier.toFixed(2),
        is_crashed: isCrashed ? 1 : 0,
        balance: userBalance,
        history: crashHistory,
        players: livePlayersList
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Aviator Server Running On Port ${PORT}`);
    startNewRound();
});
