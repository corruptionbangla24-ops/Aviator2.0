const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);

// ১. সকেট ডট আইও (Socket.io) হাই-স্পিড সেটআপ
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.json());
// মেইন ফোল্ডার থেকে ইমেজ ও সাউন্ড ফাইল সরাসরি এক্সেস করার পারমিশন
app.use(express.static(__dirname)); 

// ২. গেমের কোর ভেরিয়েবল এবং ৯০% RTP কন্ট্রোল ভেরিয়েবল সমূহ
let currentMultiplier = 1.00;
let isCrashed = false;
let gameInterval = null;
let userBalance = 5000.00; // প্লেয়ারের ডেমো লাইভ ব্যালেন্স

// --- প্রফেশনাল রিস্ক ম্যানেজমেন্ট ভেরিয়েবল ---
let totalHouseIncoming = 2000.00; // এডমিন/হাউসের মোট সেফটি ফান্ড ব্যাকআপ
let activeBetAmount = 0;          // চলতি রাউন্ডে প্লেয়ারের ধরা বেটের পরিমাণ
let hasCashedOut = false;         // প্লেয়ার চলতি রাউন্ডে টাকা তুলেছে কি না

// ৩. নতুন এভিয়েটর রাউন্ড শুরুর লজিক (রিয়েল-টাইম লুপ)
function startNewRound() {
    currentMultiplier = 1.00;
    isCrashed = false;
    hasCashedOut = false;

    // প্রতি ৫০ms পর পর ডাটা পুশ হবে (১ সেকেন্ডে ২০ বার ফ্রেমে আপডেট), যা ল্যাগ শূন্য করবে
    gameInterval = setInterval(() => {
        if (!isCrashed) {
            // মাল্টিপ্লায়ার বৃদ্ধির গতি রেশিও (আসল গেমের মতো যত উপরে যাবে তত স্পিড বাড়বে)
            if (currentMultiplier < 2.00) {
                currentMultiplier += 0.01;
            } else if (currentMultiplier < 10.00) {
                currentMultiplier += 0.05;
            } else {
                currentMultiplier += 0.18;
            }

            // সকেটের মাধ্যমে ১ মিলি-সেকেন্ডের ভেতর প্লেয়ারের ফোনে লাইভ ডাটা পাঠানো
            io.emit("gameUpdate", {
                multiplier: currentMultiplier.toFixed(2),
                is_crashed: 0,
                balance: userBalance
            });

            // --- ৯০% RTP ক্যালকুলেটর (এডমিন প্রোটেকশন লুপ) ---
            if (activeBetAmount > 0 && !hasCashedOut) {
                let potentialPayout = activeBetAmount * currentMultiplier; // প্লেয়ার এখন ক্লিক করলে যত টাকা পাবে
                let maxAllowedPayout = totalHouseIncoming * 0.90;          // হাউসের ফান্ডের সর্বোচ্চ ৯০% জেতার লিমিট

                // যদি প্লেয়ারের উইনিং অ্যামাউন্ট জমানো ফান্ডের ৯০% ক্রস করতে চায়, তবে সার্ভার তাকে ক্লিক করতে না দিয়ে ক্রাশ করে দেবে
                if (potentialPayout >= maxAllowedPayout) {
                    console.log("RTP Safety Triggered! Automated Crash Active.");
                    triggerCrash();
                }
            }

            // সাধারণ অবস্থায় ১.০৫ থেকে ২০.০০ এর মধ্যে অটোমেটিক র‍্যান্ডম ক্রাশ লজিক
            if (currentMultiplier >= (Math.random() * 19 + 1.05)) {
                triggerCrash();
            }
        }
    }, 50);
}

// ৪. ক্রাশ বা হেলিকপ্টার চলে যাওয়ার (Flew Away) ফাংশন
function triggerCrash() {
    clearInterval(gameInterval);
    isCrashed = true;

    // প্লেয়ার যদি ক্যাশআউট না করে ক্রাশ খেয়ে যায়, তবে তার লস হওয়া টাকা হাউসের প্রফিট ফান্ডে যোগ হবে
    if (activeBetAmount > 0 && !hasCashedOut) {
        totalHouseIncoming += activeBetAmount; 
    }
    activeBetAmount = 0; // রাউন্ড শেষে অ্যাক্টিভ বেট রিসেট

    // প্লেয়ারদের ক্রাশ অ্যালার্ট এবং সাউন্ড ট্রিগার পাঠানো
    io.emit("gameUpdate", {
        multiplier: currentMultiplier.toFixed(2),
        is_crashed: 1,
        trigger_sound: true
    });

    // ৫ সেকেন্ড পর স্বয়ংক্রিয়ভাবে পরবর্তী নতুন রাউন্ড চালু হবে
    setTimeout(() => {
        startNewRound();
    }, 5000);
}

// ৫. বেট ধরার API এন্ডপয়েন্ট
app.post('/api/place-bet', (req, res) => {
    const { amount } = req.body;
    
    if (userBalance >= amount && amount > 0) {
        userBalance -= amount;
        activeBetAmount = amount; // প্লেয়ারের বেট অ্যামাউন্ট মেমোরিতে লক করা হলো
        res.json({ success: true, balance: userBalance });
    } else {
        res.json({ success: false, message: "Insufficient Balance or Invalid Amount!" });
    }
});

// ৬. ক্যাশ আউট করার API এন্ডপয়েন্ট
app.post('/api/cash-out', (req, res) => {
    if (!isCrashed && activeBetAmount > 0 && !hasCashedOut) {
        let winAmount = activeBetAmount * currentMultiplier;
        
        userBalance += winAmount;          // উইনিং টাকা প্লেয়ারের মেইন অ্যাকাউন্টে যোগ হলো
        totalHouseIncoming -= winAmount; // প্লেয়ার জিতে যাওয়ায় হাউসের ক্যাশ থেকে টাকা মাইনাস হলো
        hasCashedOut = true;
        
        res.json({ success: true, winAmount: winAmount.toFixed(2), balance: userBalance });
    } else {
        res.json({ success: false, message: "Cannot Cashout! Game Already Over." });
    }
});

// ৭. হোম পেজ রাউটার (মেইন ফোল্ডারের index.html লোড করবে)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ৮. সকেট কানেকশন হ্যান্ডলিং (ইউজার ট্র্যাকিং)
io.on("connection", (socket) => {
    console.log("New Player Connected with ID: " + socket.id);
    
    // কোনো প্লেয়ার পেজ রিফ্রেশ দিলে বা নতুন ঢুকলে তাকে সাথে সাথে লাইভ ব্যালেন্স ও মাল্টিপ্লায়ার পাঠানো
    socket.emit("gameUpdate", {
        multiplier: currentMultiplier.toFixed(2),
        is_crashed: isCrashed ? 1 : 0,
        balance: userBalance
    });
});

// ৯. Render এবং Termux ফ্রেন্ডলি ডাইনামিক পোর্ট সেটআপ
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`🚀 Aviator Super-Fast Engine Running On Port ${PORT}`);
    console.log(`🛡️ 90% RTP Protection System Is Activated!`);
    console.log(`===================================================`);
    startNewRound(); // সার্ভার বুট হওয়ার সাথে সাথে প্রথম রাউন্ড চালু হবে
});
