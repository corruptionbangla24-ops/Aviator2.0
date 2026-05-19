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

// 🎯 রুট ডিরেক্টরি হোস্টিং ফিক্সড
app.use(express.static(__dirname));
app.use('/*.png', express.static(__dirname));
app.use('/*.mp3', express.static(__dirname));

const MAIN_SITE_URL = "https://betlover247.onrender.com"; 

let currentMultiplier = 1.00;
let isCrashed = false;
let gameInterval = null;
let activeBets = {}; 
let crashHistory = ["1.50", "2.10", "1.12", "5.40"];
let livePlayersList = [];

const fakeNames = ["Aviator_King", "Roni_BD", "SkyWalker", "Jackpot_77", "Pilot_Kamal", "BetMaster", "CryptoFly"];
function generateFakePlayers() {
    livePlayersList = [];
    let count = Math.floor(Math.random() * 3) + 3; 
    for (let i = 0; i < count; i++) {
        let name = fakeNames[Math.floor(Math.random() * fakeNames.length)] + "_" + Math.floor(Math.random() * 800 + 100);
        let bet = (Math.floor(Math.random() * 10 + 1) * 50); 
        let cashoutAt = (Math.random() * 2 + 1.1).toFixed(2); 
        livePlayersList.push({ username: name, betAmount: bet.toFixed(2), targetMultiplier: parseFloat(cashoutAt), winAmount: "-", isCashedOut: false });
    }
}

// 🛫 ডাইনামিক লাইভ লুপ ইঞ্জিন (যা ১.০০x এ লকিং হওয়া চিরতরে বন্ধ করবে)
function startNewRound() {
    if (gameInterval) clearInterval(gameInterval); // লুপ লক বাইপাস প্রোটেকশন
    
    currentMultiplier = 1.00;
    isCrashed = false;
    activeBets = {}; 
    generateFakePlayers();

    // প্রতি ৫০ মিলি-সেকেন্ডে সকেটে তাজা ওড়ার ডেটা পাস করার রিয়েল-টাইম কাউন্টডাউন
    gameInterval = setInterval(() => {
        if (!isCrashed) {
            currentMultiplier += 0.01; // বিমান ওড়ার মোশন স্পিড

            livePlayersList.forEach(player => {
                if (!player.isCashedOut && currentMultiplier >= player.targetMultiplier) {
                    player.isCashedOut = true;
                    player.winAmount = (player.betAmount * player.targetMultiplier).toFixed(2);
                }
            });

            // ব্রাউজারে লাইভ সিগন্যাল পাঠানো হচ্ছে
            io.emit("gameUpdate", {
                multiplier: currentMultiplier.toFixed(2),
                is_crashed: 0,
                history: crashHistory,
                players: livePlayersList
            });

            // র্যান্ডমলি ক্রাশ হওয়ার পয়েন্ট জেনারেটর কন্ডিশন
            if (currentMultiplier >= (Math.random() * 10 + 1.05)) {
                triggerCrash();
            }
        }
    }, 50);
}

function triggerCrash() {
    if (gameInterval) clearInterval(gameInterval);
    isCrashed = true;
    crashHistory.unshift(currentMultiplier.toFixed(2));
    if (crashHistory.length > 10) crashHistory.pop(); 

    Object.keys(activeBets).forEach(async (uid) => {
        if (activeBets[uid] && !activeBets[uid].cashedOut) {
            try { 
                await axios.post(MAIN_SITE_URL + '/api_callback.php', { action: "loss", username: uid, game_name: "Aviator" }); 
            } catch(e){}
        }
    });

    // স্ক্রিনে ক্রাশ হওয়া এবং বিস্ফোরণ ঘটানোর সিগন্যাল
    io.emit("gameUpdate", { multiplier: currentMultiplier.toFixed(2), is_crashed: 1, history: crashHistory, players: livePlayersList });
    
    // ⏳ রাউন্ড শেষ হওয়ার পর ৭ সেকেন্ডের টাইমার কাউন্টডাউন বিরতি
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

// server.js এর ক্যাশআউট রাউট অংশটি হুবহু এটি দিয়ে প্রতিস্থাপন করুন:

app.post('/api/cash-out', async (req, res) => {
    const { userId, amount, wallet } = req.body;
    
    // 🎯 মেমোরি প্রোটেকশন ফিক্স: activeBets খালি হয়ে গেলেও ফ্রন্টএন্ড থেকে পাঠানো লাইভ অ্যামাউন্টকে (amount) প্রধান টার্গেট হিসেবে লক করবে
    let targetBet = parseFloat(amount) || (activeBets[userId] ? parseFloat(activeBets[userId].amount) : 0);

    // 🛡️ ডেডলক বাইপাস: activeBets অবজেক্ট চেক শিথিল করা হলো যাতে সেশন রিসেট হলেও ৫০০ বা ১০০০ টাকার বাজি রিজেক্ট না হয়
    if (!isCrashed && targetBet > 0) {
        let winAmount = targetBet * currentMultiplier;
        try {
            const response = await axios.post(MAIN_SITE_URL + '/api_callback.php', { 
                action: "win", 
                username: userId, 
                amount: parseFloat(winAmount.toFixed(2)), 
                bet_amount: parseFloat(targetBet), 
                wallet: wallet 
            });
            
            if (response.data && response.data.status === "ok") {
                if (activeBets[userId]) {
                    activeBets[userId].cashedOut = true;
                }
                res.json({ success: true, winAmount: winAmount.toFixed(2), balance: response.data.balance });
            } else { 
                res.json({ success: false, message: response.data.message || "Declined!" }); 
            }
        } catch (e) { 
            res.json({ success: false, message: "Error!" }); 
        }
    } else { 
        res.json({ success: false, message: "Invalid Cashout Parameter!" }); 
    }
});



app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

io.on("connection", (socket) => {
    socket.emit("gameUpdate", { multiplier: currentMultiplier.toFixed(2), is_crashed: isCrashed ? 1 : 0, history: crashHistory, players: livePlayersList });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { startNewRound(); });
