const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);

// সকেট ডট আইও (Socket.io) সেটআপ এবং ক্রস-অরিজিন পলিসি অনুমোদন
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // আপনার ফ্রন্টএন্ড ফাইলগুলোর ফোল্ডার নাম যদি public হয়

// গেমের রিয়েল-টাইম ভেরিয়েবল সমূহ
let currentMultiplier = 1.00;
let isCrashed = false;
let gameInterval = null;
let userBalance = 5000.00; // টেস্ট ব্যালেন্স (আপনার ডাটাবেস অনুযায়ী পরিবর্তন করে নিতে পারেন)

// নতুন রাউন্ড শুরু করার ফাংশন
function startNewRound() {
    currentMultiplier = 1.00;
    isCrashed = false;
    
    // প্রতি ৫০ মিলিসেকেন্ডে (১ সেকেন্ডে ২০ বার) ডাটা আপডেট হবে, যা গেমকে করবে সুপার ফাস্ট
    gameInterval = setInterval(() => {
        if (!isCrashed) {
            // মাল্টিপ্লায়ার বৃদ্ধির গতি (১.০০x থেকে আস্তে আস্তে স্পিড বাড়বে)
            if (currentMultiplier < 2.00) {
                currentMultiplier += 0.01;
            } else if (currentMultiplier < 10.00) {
                currentMultiplier += 0.05;
            } else {
                currentMultiplier += 0.20;
            }

            // সকেটের মাধ্যমে সব কানেক্টেড প্লেয়ারের ফোনে লাইভ ডাটা পাঠানো
            io.emit("gameUpdate", {
                multiplier: currentMultiplier.toFixed(2),
                is_crashed: 0,
                balance: userBalance
            });

            // টেস্ট লজিক: র‍্যান্ডমলি ৫০x এর ভেতর ক্রাশ ঘটানো (আপনার আসল লজিক এখানে বসবে)
            if (currentMultiplier >= (Math.random() * 15 + 1.5)) {
                triggerCrash();
            }
        }
    }, 50);
}

// ক্রাশ ঘটানোর বা গেম ওভার করার ফাংশন
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

// API রাউট সমূহ (বেট ধরা এবং ক্যাশআউটের জন্য)
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

// হোম পেজ রাউট
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// সকেট কানেকশন হ্যান্ডলার
io.on("connection", (socket) => {
    console.log("A user connected: " + socket.id);
    
    // নতুন ইউজার ঢুকলে তাকে বর্তমান গেমের অবস্থা জানানো
    socket.emit("gameUpdate", {
        multiplier: currentMultiplier.toFixed(2),
        is_crashed: isCrashed ? 1 : 0,
        balance: userBalance
    });
});

// Render হোস্টিংয়ের জন্য ডাইনামিক পোর্ট সেটআপ
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Aviator Engine Server is running on port ${PORT}`);
    startNewRound(); // সার্ভার চালুর সাথে সাথে প্রথম রাউন্ড শুরু
});
