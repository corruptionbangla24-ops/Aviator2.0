const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const axios = require('axios');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname)); 

// 🔗 আপনার মূল পিএইচপি সাইটের ডোমেইন লিঙ্ক (শেষে / দেবেন না)
const MAIN_SITE_URL = "https://betlover247.onrender.com"; 

// অ্যাডমিন প্যানেল ভেরিয়েবল
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "mysecretpassword123";
let nextCrashPoint = null; 
let currentRTP = 0.90;     

// গেম কোর ভেরিয়েবল
let currentMultiplier = 1.00;
let isCrashed = false;
let gameInterval = null;
let userBalance = 5000.00; 
let totalHouseIncoming = 2000.00; 
let activeBets = {}; 
let crashHistory = ["1.50", "3.20", "1.12", "8.50"];

// লাইভ ফেক প্লেয়ার লিস্ট
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

            if (nextCrashPoint && currentMultiplier >= nextCrashPoint) {
                nextCrashPoint = null; 
                triggerCrash();
                return;
            }

            Object.keys(activeBets).forEach(uid => {
                if (activeBets[uid] && !activeBets[uid].cashedOut) {
                    let potentialPayout = activeBets[uid].amount * currentMultiplier;
                    if (potentialPayout >= (totalHouseIncoming * currentRTP)) {
                        triggerCrash();
                    }
                }
            });

            if (!nextCrashPoint && currentMultiplier >= (Math.random() * 19 + 1.05)) {
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
            Object.keys(activeBets).forEach(async (uid) => {
                if (activeBets[uid] && !activeBets[uid].cashedOut) {
                    totalHouseIncoming += activeBets[uid].amount;
                    
                    // 📝 বিমান ক্রাশ করার সাথে সাথে মূল পিএইচপি সাইটে LOSS স্ট্যাটাস পাঠানোর এপিআই কল
                    try {
                        await axios.post(MAIN_SITE_URL + '/api_callback.php', {
                            action: "loss",
                            username: uid,
                            amount: parseFloat(activeBets[uid].amount),
                            game_name: "Casino"
                        });
                    } catch(e) { console.log("Loss log failed"); }
                }
            });

    

    io.emit("gameUpdate", { multiplier: currentMultiplier.toFixed(2), is_crashed: 1, trigger_sound: true, history: crashHistory, players: livePlayersList });
    setTimeout(() => { startNewRound(); }, 8000);
}

// 🎰 ১. পিএইচপি এপিআই-এর সাথে বেট সিঙ্ক (Action: bet)
app.post('/api/place-bet', async (req, res) => {
    const { amount, userId } = req.body; 
    try {
     if (currentMultiplier > 1.02 && !isCrashed) {
            return res.json({ success: false, message: "Game already started! Wait for next round." });
        }   
       const response = await axios.post(MAIN_SITE_URL + '/api_callback.php', {
    action: "bet",
    username: userId, 
    amount: parseFloat(amount),
    game_name: "Aviator"
});

// এই লাইনটি যোগ করুন। এটি আপনার Termux স্ক্রিনে পিএইচপির আসল উত্তরটি প্রিন্ট করবে
console.log("PHP Response Data:", response.data); 
 

        if (response.data && response.data.status === "ok") {
            activeBets[userId] = { amount: parseFloat(amount), cashedOut: false };
            let returnBalance = response.data.balance || (userBalance - amount);
            userBalance = parseFloat(returnBalance); 
            res.json({ success: true, balance: userBalance });
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
            const response = await axios.post(MAIN_SITE_URL + '/api_callback.php', {
                action: "win",
                username: userId,
                amount: parseFloat(winAmount.toFixed(2)),
                game_name: "Casino"
            });

            if (response.data && response.data.status === "ok") {
                activeBets[userId].cashedOut = true;
                totalHouseIncoming -= winAmount;
                let returnBalance = response.data.balance || (userBalance + winAmount);
                userBalance = parseFloat(returnBalance);
                res.json({ success: true, winAmount: winAmount.toFixed(2), balance: userBalance });
            } else {
                res.json({ success: false, message: response.data.message || "Cashout Declined!" });
            }
        } catch (e) {
            res.json({ success: false, message: "PHP Wallet Credit Error!" });
        }
    } else {
        res.json({ success: false, message: "Game Over!" });
    }
});

// সিক্রেট অ্যাডমিন ড্যাশবোর্ড
app.get('/secret-admin', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Aviator Admin</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { background: #111; color: #fff; font-family: Arial; padding: 20px; text-align: center; }
                input, button { padding: 12px; margin: 10px; width: 85%; max-width: 300px; border-radius: 6px; border: none; font-size: 16px; }
                input { background: #222; color: #fff; border: 1px solid #444; }
                button { background: #ff0044; color: #fff; font-weight: bold; cursor: pointer; }
                .panel-box { background: #1a1a1a; padding: 20px; border-radius: 10px; border: 1px solid #333; display: inline-block; margin-top: 10px; width: 90%; max-width: 400px; }
            </style>
        </head>
        <body>
            <h2>🛡️ Aviator Engine Control</h2>
            <div class="panel-box">
                <form action="/api/admin/control" method="POST">
                    <input type="text" name="username" placeholder="Admin Username" required><br>
                    <input type="password" name="password" placeholder="Admin Password" required><br>
                    <input type="number" step="0.01" name="crashPoint" placeholder="Next Crash Point (e.g. 2.50)"><br>
                    <input type="number" step="0.01" name="rtp" placeholder="Set RTP (e.g. 0.85 for 85%)"><br>
                    <button type="submit">Execute Commands 🚀</button>
                </form>
                <div style="margin-top: 15px; font-size: 14px; color: #aaa;">
                    <p>💰 হাউসের ফান্ড: \${totalHouseIncoming.toFixed(2)} BDT</p>
                    <p>📈 সেট করা ক্রাশ পয়েন্ট: \${nextCrashPoint ? nextCrashPoint + 'x' : 'None (Random/RTP)'}</p>
                    <p>📊 বর্তমান RTP প্রোটেকশন: \${(currentRTP * 100)}%</p>
                </div>
            </div>
        </body>
        </html>
    `);
});

app.post('/api/admin/control', (req, res) => {
    const { username, password, crashPoint, rtp } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        if (crashPoint && parseFloat(crashPoint) >= 1.01) nextCrashPoint = parseFloat(crashPoint);
        if (rtp && parseFloat(rtp) > 0 && parseFloat(rtp) <= 1) currentRTP = parseFloat(rtp);
        res.send("<script>alert('Commands Executed Successfully!'); window.location.href='/secret-admin';</script>");
    } else {
        res.send("<script>alert('Invalid Admin Credentials!'); window.location.href='/secret-admin';</script>");
    }
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

io.on("connection", (socket) => {
    socket.emit("gameUpdate", { multiplier: currentMultiplier.toFixed(2), is_crashed: isCrashed ? 1 : 0, history: crashHistory, players: livePlayersList });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { startNewRound(); });
