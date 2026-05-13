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

                        // কন্ডিশন ক: যদি অ্যাডমিন নিজে কোনো পয়েন্ট ফিক্স করে দেয়
            if (nextCrashPoint && currentMultiplier >= nextCrashPoint) {
                console.log("Admin fixed crash point hit!");
                nextCrashPoint = null; 
                triggerCrash();
                return;
            }

            // কন্ডিশন খ: RTP প্রোটেকশন চেক
            if (activeBetAmount > 0 && !hasCashedOut) {
                let potentialPayout = activeBetAmount * currentMultiplier; 
                let maxAllowedPayout = totalHouseIncoming * currentRTP; 

                if (potentialPayout >= maxAllowedPayout) {
                    triggerCrash();
                    return;
                }
            }

            // কন্ডিশন গ: স্বাভাবিক অবস্থায় র‍্যান্ডম ক্রাশ
            if (!nextCrashPoint && currentMultiplier >= (Math.random() * 19 + 1.05)) {
                triggerCrash();
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

// --- ২ নম্বর অংশের অ্যাডমিন প্যানেল ভেরিয়েবল সমূহ ---
let nextCrashPoint = null; 
let currentRTP = 0.90;     

// অ্যাডমিন পেজ ভিউ রাউট
app.get('/secret-admin', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Aviator Admin Control</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { background: #111; color: #fff; font-family: Arial; padding: 20px; text-align: center; }
                input, button { padding: 10px; margin: 10px; width: 80%; max-width: 300px; border-radius: 5px; border: none; font-size: 16px; }
                input { background: #222; color: #fff; border: 1px solid #444; }
                button { background: #ff0044; color: #fff; font-weight: bold; cursor: pointer; }
                .status { background: #222; padding: 15px; border-radius: 8px; display: inline-block; margin-top: 20px; }
            </style>
        </head>
        <body>
            <h2>🛡️ Aviator Engine Admin</h2>
            <form action="/api/admin/set-crash" method="POST">
                <input type="number" step="0.01" name="crashPoint" placeholder="Next Crash Point (e.g. 1.50)" required><br>
                <button type="submit">Set Next Crash</button>
            </form>
            <form action="/api/admin/set-rtp" method="POST">
                <input type="number" step="0.01" name="rtp" placeholder="Set RTP (e.g. 0.80 for 80%)" required><br>
                <button type="submit" style="background: #28a745;">Update RTP</button>
            </form>
            <div class="status">
                <p>💰 বর্তমান সেফটি ফান্ড: \${totalHouseIncoming.toFixed(2)} BDT</p>
                <p>📈 পরবর্তী ফিক্সড ক্রাশ: \${nextCrashPoint ? nextCrashPoint + 'x' : 'None (Random/RTP)'}</p>
            </div>
        </body>
        </html>
    `);
});

// অ্যাডমিন অ্যাকশন API সমূহ
app.use(express.urlencoded({ extended: true }));

app.post('/api/admin/set-crash', (req, res) => {
    const point = parseFloat(req.body.crashPoint);
    if (point >= 1.01) {
        nextCrashPoint = point;
    }
    res.redirect('/secret-admin');
});

app.post('/api/admin/set-rtp', (req, res) => {
    const rtpVal = parseFloat(req.body.rtp);
    if (rtpVal > 0 && rtpVal <= 1) {
        currentRTP = rtpVal;
    }
    res.redirect('/secret-admin');
});

// আপনার হোম পেজ রাউট (আগে ১৫৪ লাইনে ছিল)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// সকেট কানেকশন হ্যান্ডলার (আগে ১৫৮ লাইনে ছিল)
io.on("connection", (socket) => {
    socket.emit("gameUpdate", {
        multiplier: currentMultiplier.toFixed(2),
        is_crashed: isCrashed ? 1 : 0,
        balance: userBalance,
        history: crashHistory,
        players: livePlayersList
    });
});

// পোর্ট ও সার্ভার লিসেনার (আগে ১৬৮ লাইনে ছিল)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Aviator Server Running On Port \${PORT}`);
    startNewRound();
});
