const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.json());
app.use(express.static(__dirname)); 

// গেম এবং ৯০% RTP ভেরিয়েবল
let currentMultiplier = 1.00;
let isCrashed = false;
let gameInterval = null;
let userBalance = 5000.00; 

let totalHouseIncoming = 2000.00; 
let activeBetAmount = 0;          
let hasCashedOut = false;         

// সার্ভার সাইড ক্রাশ হিস্টোরি মেমোরি (সর্বোচ্চ ১২টি রেকর্ড রাখবে)
let crashHistory = ["1.50", "3.20", "1.12", "8.50", "1.95", "2.10"];

function startNewRound() {
    currentMultiplier = 1.00;
    isCrashed = false;
    hasCashedOut = false;

    gameInterval = setInterval(() => {
        if (!isCrashed) {
            if (currentMultiplier < 2.00) {
                currentMultiplier += 0.01;
            } else if (currentMultiplier < 10.00) {
                currentMultiplier += 0.05;
            } else {
                currentMultiplier += 0.18;
            }

            io.emit("gameUpdate", {
                multiplier: currentMultiplier.toFixed(2),
                is_crashed: 0,
                balance: userBalance,
                history: crashHistory // প্রতি ফ্রেমে ডাটা সিঙ্ক
            });

            if (activeBetAmount > 0 && !hasCashedOut) {
                let potentialPayout = activeBetAmount * currentMultiplier; 
                let maxAllowedPayout = totalHouseIncoming * 0.90;          

                if (potentialPayout >= maxAllowedPayout) {
                    console.log("RTP Safety Triggered!");
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

    // হিস্টোরি তালিকার একদম শুরুতে নতুন ক্রাশ ভ্যালু পুশ করা
    crashHistory.unshift(currentMultiplier.toFixed(2));
    if (crashHistory.length > 12) crashHistory.pop(); // ১২টার বেশি হলে পুরানোটি ডিলিট

    if (activeBetAmount > 0 && !hasCashedOut) {
        totalHouseIncoming += activeBetAmount; 
    }
    activeBetAmount = 0; 

    io.emit("gameUpdate", {
        multiplier: currentMultiplier.toFixed(2),
        is_crashed: 1,
        trigger_sound: true,
        history: crashHistory // ক্রাশের সময় আপডেট হিস্টোরি পাঠানো
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
    console.log("New Player: " + socket.id);
    socket.emit("gameUpdate", {
        multiplier: currentMultiplier.toFixed(2),
        is_crashed: isCrashed ? 1 : 0,
        balance: userBalance,
        history: crashHistory
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Aviator Server Engine Running On Port ${PORT}`);
    startNewRound();
});
