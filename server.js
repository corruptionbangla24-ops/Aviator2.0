const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);

// ১. সকেট ডট আইও সেটআপ
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.json());
// মেইন ফোল্ডার থেকে সরাসরি ছবি এবং সাউন্ড ফাইল লোড করার অনুমতি
app.use(express.static(__dirname)); 

// গেমের রিয়েল-টাইম ভেরিয়েবল
let currentMultiplier = 1.00;
let isCrashed = false;
let gameInterval = null;
let userBalance = 5000.00; // প্রাথমিক ডেমো ব্যালেন্স

// নতুন রাউন্ড শুরু করার ফাংশন
function startNewRound() {
    currentMultiplier = 1.00;
    isCrashed = false;
    
    // প্রতি ৫০ms পর পর ডাটা পাঠানো (১ সেকেন্ডে ২০ বার), যা গেমকে সুপার ফাস্ট করবে
    gameInterval = setInterval(() => {
        if (!isCrashed) {
            // মাল্টিপ্লায়ার বৃদ্ধির গতি লজিক
            if (currentMultiplier < 2.00) {
                currentMultiplier += 0.01;
            } else if (currentMultiplier < 10.00) {
                currentMultiplier += 0.05;
            } else {
                currentMultiplier += 0.15;
            }

            // সকেটের মাধ্যমে সব প্লেয়ারের ফোনে ১ মিলিসেকেন্ডে লাইভ ডাটা পুশ
            io.emit("gameUpdate", {
                multiplier: currentMultiplier.toFixed(2),
                is_crashed: 0,
                balance: userBalance
            });

            // টেস্ট ক্রাশ লজিক (আপাতত র‍্যান্ডমলি ১৫x এর মধ্যে ক্রাশ করবে)
            if (currentMultiplier >= (Math.random() * 12 + 1.3)) {
                triggerCrash();
            }
        }
    }, 50);
}

// ক্রাশ বা গেম ওভার ঘটানোর ফাংশন
function triggerCrash() {
    clearInterval(gameInterval);
    isCrashed = true;
    
    // ক্রাশ সিগন্যাল পাঠানো
    io.emit("gameUpdate", {
        multiplier: currentMultiplier.toFixed(2),
        is_crashed: 1,
        trigger_sound: true
    });

    // ৫ সেকেন্ড পর আবার স্বয়ংক্রিয়ভাবে নতুন রাউন্ড শুরু হবে
    setTimeout(() => {
        startNewRound();
    }, 5000);
}

// বেট এবং ক্যাশআউট API রাউট
app.post('/api/place-bet', (req, res) => {
    const { amount } = req.body;
    if (userBalance >= amount) {
        userBalance -= amount;
        res.json({ success: true, balance: userBalance });
    } else {
        res.json({ success: false, message: "Insufficient Balance!" });
    }
});

app.post('/api/cash-out', (req, res) => {
    if (!isCrashed) {
        let winAmount = req.body.amount * currentMultiplier;
        userBalance += winAmount;
        res.json({ success: true, winAmount: winAmount.toFixed(2), balance: userBalance });
    } else {
        res.json({ success: false, message: "Already Flown Away!" });
    }
});

// সরাসরি মেইন ফোল্ডার থেকে index.html লোড করা
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// সকেট কানেকশন হ্যান্ডলার
io.on("connection", (socket) => {
    console.log("Player Connected: " + socket.id);
    
    // নতুন ইউজার প্রবেশ করলে তাকে বর্তমান অবস্থা জানানো
    socket.emit("gameUpdate", {
        multiplier: currentMultiplier.toFixed(2),
        is_crashed: isCrashed ? 1 : 0,
        balance: userBalance
    });
});

// Render হোস্টিং ফ্রেন্ডলি পোর্ট সেটআপ
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Aviator Server is running on port ${PORT}`);
    startNewRound();
});
