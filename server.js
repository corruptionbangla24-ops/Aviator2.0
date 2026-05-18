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

// 🎯 ইমেজ ও অডিও ফাইল সরাসরি রুট ফোল্ডার থেকে ব্রাউজারে লাইভ শো করানোর গেটওয়ে
app.use(express.static(__dirname));
app.use('/*.png', express.static(__dirname));
app.use('/*.mp3', express.static(__dirname));

// 🔗 আপনার মূল পিএইচপি সাইটের একদম লাইভ এবং একুরেট ডোমেইন লিঙ্ক
const MAIN_SITE_URL = "https://betlover247.onrender.com"; 

// গেম কোর ভেরিয়েবল
let currentMultiplier = 1.00;
let isCrashed = false;
let gameInterval = null;
let activeBets = {}; 
let crashHistory = ["1.50", "2.80", "1.05", "4.20", "1.90"];
let livePlayersList = [];

// লাইভ ডাইনামিক বোট প্লেয়ার জেনারেটর (গেম স্ক্রিন সচল রাখার জন্য)
const fakeNames = ["Raza_Aviator", "Pilot_BD", "SkyBet", "King_77", "Roni_Boss", "Sabbir_01", "Nisha_Fly", "BetMaster"];
function generateFakePlayers() {
    livePlayersList = [];
    let count = Math.floor(Math.random() * 4) + 3; 
    for (let i = 0; i < count; i++) {
        let name = fakeNames[Math.floor(Math.random() * fakeNames.length)] + "_" + Math.floor(Math.random() * 800 + 100);
        let bet = (Math.floor(Math.random() * 10 + 1) * 50); 
        let cashoutAt = (Math.random() * 2 + 1.1).toFixed(2); 
        livePlayersList.push({ username: name, betAmount: bet.toFixed(2), targetMultiplier: parseFloat(cashoutAt), winAmount: "-", isCashedOut: false });
    }
}

// 🚀 মূল গেম লুপ ইঞ্জিন (যা ১.০০x লকিং সমস্যা চিরতরে দূর করবে)
function startNewRound() {
    clearInterval(gameInterval); // পুরানো ইন্টারভাল মেমোরি সম্পূর্ণ ক্লিয়ার
    currentMultiplier = 1.00;
    isCrashed = false;
    activeBets = {}; 
    generateFakePlayers();

    // প্রতি ৫০ মিলি-সেকেন্ডে বিমান ওড়ার গতি হিসাব করার টাইমার লুপ
    gameInterval = setInterval(() => {
        if (!isCrashed) {
            currentMultiplier += (currentMultiplier < 2.00) ? 0.01 : 0.05;

            // বোট প্লেয়ারদের অটো-ক্যাশআউট ট্র্যাকিং
            livePlayersList.forEach(player => {
                if (!player.isCashedOut && currentMultiplier >= player.targetMultiplier) {
                    player.isCashedOut = true;
                    player.winAmount = (player.betAmount * player.targetMultiplier).toFixed(2);
                }
            });

            // ব্রাউজারে লাইভ ওড়ার সিগন্যাল ফরোয়ার্ড
            io.emit("gameUpdate", {
                multiplier: currentMultiplier.toFixed(2),
                is_crashed: 0,
                history: crashHistory,
                players: livePlayersList
            });

            // ডাইনামিক র্যান্ডম ক্রাশ পয়েন্ট কন্ডিশন (১.০৫x থেকে শুরু করে র্যান্ডমলি ক্রাশ খাবে)
            if (currentMultiplier >= (Math.random() * 12 + 1.05)) {
                triggerCrash();
            }
        }
    }, 50);
}

// 💥 ক্রাশ বা হেলিকপ্টার বিস্ফোরণ লজিক
function triggerCrash() {
    clearInterval(gameInterval);
    isCrashed = true;
    crashHistory.unshift(currentMultiplier.toFixed(2));
    if (crashHistory.length > 8) crashHistory.pop(); 

    // যারা ক্যাশআউট করতে পারেনি তাদের লস সিগন্যাল পিএইচপিতে পাঠানো
    Object.keys(activeBets).forEach(async (uid) => {
        if (activeBets[uid] && !activeBets[uid].cashedOut) {
            try { 
                await axios.post(MAIN_SITE_URL + '/api_callback.php', { 
                    action: "loss", 
                    username: uid, 
                    game_name: "Aviator" 
                }); 
            } catch(e){ console.log("PHP connection sleep"); }
        }
    });

    // ব্রাউজার স্ক্রিনে ক্রাশ সিগন্যাল পাঠানো
    io.emit("gameUpdate", { 
        multiplier: currentMultiplier.toFixed(2), 
        is_crashed: 1, 
        history: crashHistory, 
        players: livePlayersList 
    });

    // ⏳ পরবর্তী রাউন্ড শুরু হতে ঠিক ৭ সেকেন্ড বিরতি (টাইমার কাউন্টডাউন)
    setTimeout(() => { startNewRound(); }, 7000);
}

// 🎰 ১. বাজি ধরার রাউট গেটওয়ে
app.post('/api/place-bet', async (req, res) => {
    const { amount, userId, wallet } = req.body;
    if (currentMultiplier > 1.02 && !isCrashed) { 
        return res.json({ success: false, message: "Started" }); 
    }

    try {
        const response = await axios.post(MAIN_SITE_URL + '/api_callback.php', { 
            action: "bet", 
            username: userId, 
            amount: parseFloat(amount), 
            wallet: wallet 
        });
        
        if (response.data && response.data.status === "ok") {
            activeBets[userId] = { amount: parseFloat(amount), cashedOut: false };
            res.json({ success: true, balance: response.data.balance });
        } else { 
            res.json({ success: false, message: response.data.message || "Declined!" }); 
        }
    } catch (e) { 
        res.json({ success: false, message: "Timeout!" }); 
    }
});

// 💰 ২. ক্যাশআউট বা জেতার রাউট গেটওয়ে
app.post('/api/cash-out', async (req, res) => {
    const { userId, amount, wallet } = req.body;
    let targetBet = amount || (activeBets[userId] ? activeBets[userId].amount : 0);

    if (!isCrashed && targetBet > 0 && activeBets[userId] && !activeBets[userId].cashedOut) {
        let winAmount = targetBet * currentMultiplier;
        try {
            const response = await axios.post(MAIN_SITE_URL + '/api_callback.php', { 
                action: "win", 
                username: userId, 
                amount: parseFloat(winAmount.toFixed(2)), 
                wallet: wallet 
            });
            
            if (response.data && response.data.status === "ok") {
                activeBets[userId].cashedOut = true;
                res.json({ success: true, winAmount: winAmount.toFixed(2), balance: response.data.balance });
            } else { 
                res.json({ success: false, message: "Declined!" }); 
            }
        } catch (e) { 
            res.json({ success: false, message: "Error!" }); 
        }
    } else { 
        res.json({ success: false, message: "Invalid Cashout!" }); 
    }
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

// সকেট আইও কানেকশন ইভেন্ট লিসেনার
io.on("connection", (socket) => {
    socket.emit("gameUpdate", { multiplier: currentMultiplier.toFixed(2), is_crashed: isCrashed ? 1 : 0, history: crashHistory, players: livePlayersList });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { startNewRound(); });
