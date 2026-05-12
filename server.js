const express = require('express');
const mysql = require('mysql2/promise');
const app = express();

app.use(express.static('./'));
app.use(express.json());

const dbConfig = {
    host: 'mysql-8138310-corruptionbangla24-843b.l.aivencloud.com',
    user: 'avnadmin',
    password: 'AVNS_PsYa4FE9fJvITOf4u0Z',
    database: 'defaultdb',
    port: 15225,
    ssl: { rejectUnauthorized: false }
};

function generateCrashPoint() {
    const r = Math.random();

    // ১. 'ইনস্ট্যান্ট ক্রাশ' লজিক (RTP 90% এর জন্য ১০% রাউন্ড ১.০০x এ ক্রাশ করবে)
    if (r < 0.10) return 1.00;

    // ২. ম্যাথমেটিক্যাল কার্ভ (RTP 90 মেনে বড় নাম্বার আসার সম্ভাবনা কমাবে)
    // সূত্র: (100 - HouseEdge) / (100 - r*100)
    let outcome = 0.90 / (1 - r); 

    // ৩. সেফটি লিমিট: অ্যাডমিন ছাড়াই গেমটি সর্বোচ্চ ৩০.০০x এর বেশি যাবে না
    let finalVal = Math.min(Math.max(1.01, outcome), 30.00);

    return parseFloat(finalVal).toFixed(2);
}


// ২. গেম ইঞ্জিন (অটোমেটিক মাল্টিপ্লায়ার বাড়বে)
let currentMult = 1.00;
let crashPoint = generateCrashPoint();
let isCrashed = false;

async function runGameEngine() {
    try {
        const pool = await mysql.createPool(dbConfig); // পুল ব্যবহার করা নিরাপদ
        
        setInterval(async () => {
            if (!isCrashed) {
                // ১. মাল্টিপ্লায়ার বাড়ার হার (এখানে ০.০১ করে বাড়বে)
                currentMult += 0.01;
                
                // ২. চেক করা হচ্ছে এটি কি ক্রাশ পয়েন্টে পৌঁছেছে?
                if (parseFloat(currentMult) >= parseFloat(crashPoint)) {
                    isCrashed = true;
                    
                    // ডাটাবেসে ক্রাশ স্ট্যাটাস সেভ
                    await pool.execute('UPDATE aviator_game_state SET current_multiplier = ?, is_crashed = true WHERE id = 1', [currentMult]);
                    
                    console.log(`Crashed at: ${currentMult}. Next round in 5s...`);

                    // ৩. ৫ সেকেন্ড বিরতি দিয়ে নতুন রাউন্ড শুরু
                    setTimeout(() => {
                        currentMult = 1.00;
                        isCrashed = false;
                        crashPoint = generateCrashPoint(); // এখানে নতুন র‍্যান্ডম ক্রাশ পয়েন্ট তৈরি হবে
                    }, 5000);
                } else {
                    // গেম সচল থাকলে ডাটাবেস আপডেট
                    await pool.execute('UPDATE aviator_game_state SET current_multiplier = ?, is_crashed = false WHERE id = 1', [currentMult]);
                }
            }
        }, 100); // প্রতি ১০০ মিলিসেকেন্ডে ইঞ্জিনটি চেক করবে
    } catch (err) {
        console.error("Engine Error:", err.message);
    }
}


runGameEngine();

// ৩. ডাটা API
app.get('/api/game-data', async (req, res) => {
    try {
        const conn = await mysql.createConnection(dbConfig);
        const [gameRows] = await conn.execute('SELECT current_multiplier, is_crashed FROM aviator_game_state WHERE id = 1');
        const [userRows] = await conn.execute('SELECT balance FROM aviator_users WHERE id = 1');
        await conn.end();
        res.json({ 
            multiplier: gameRows[0].current_multiplier, 
            is_crashed: gameRows[0].is_crashed, 
            balance: userRows[0].balance 
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ৪. টেবিল সেটআপ রুট
app.get('/setup-database', async (req, res) => {
    try {
        const conn = await mysql.createConnection(dbConfig);
        await conn.execute(`CREATE TABLE IF NOT EXISTS aviator_game_state (id INT PRIMARY KEY, current_multiplier DECIMAL(10,2), is_crashed BOOLEAN)`);
        await conn.execute(`CREATE TABLE IF NOT EXISTS aviator_users (id INT PRIMARY KEY, balance DECIMAL(10,2))`);
        await conn.execute('INSERT IGNORE INTO aviator_game_state VALUES (1, 1.00, false)');
        await conn.execute('INSERT IGNORE INTO aviator_users VALUES (1, 500.00)');
        await conn.end();
        res.send("<h1>সফলভাবে এভিয়েটর টেবিলগুলো তৈরি হয়েছে!</h1>");
    } catch (err) { res.status(500).send(err.message); }
});


app.post('/api/place-bet', async (req, res) => {
    const { amount } = req.body;
    try {
        const conn = await mysql.createConnection(dbConfig);
        // ইউজারের বর্তমান ব্যালেন্স চেক করা
        const [user] = await conn.execute('SELECT balance FROM aviator_users WHERE id = 1');
        
        if (user[0].balance >= amount) {
            // ব্যালেন্স থেকে টাকা কেটে নেওয়া
            await conn.execute('UPDATE aviator_users SET balance = balance - ? WHERE id = 1', [amount]);
            await conn.end();
            res.json({ success: true, message: "Bet Placed!" });
        } else {
            await conn.end();
            res.status(400).json({ success: false, message: "ইন্সফিসিয়েন্ট ব্যালেন্স!" });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/cashout', async (req, res) => {
    const { betAmount, multiplier } = req.body;
    
    try {
        const conn = await mysql.createConnection(dbConfig);
        
        // ১. সার্ভার সাইড ভেরিফিকেশন
        const [game] = await conn.execute('SELECT current_multiplier, is_crashed FROM aviator_game_state WHERE id = 1');
        
        // game[0] ব্যবহার করা হয়েছে কারণ execute রেজাল্ট অ্যারে দেয়
        if (!game[0].is_crashed && multiplier <= game[0].current_multiplier) {
            const winAmount = betAmount * multiplier;
            
            // ২. ব্যালেন্স আপডেট (ইউজার আইডি ১ ধরে)
            await conn.execute('UPDATE aviator_users SET balance = balance + ? WHERE id = 1', [winAmount]);
            
            await conn.end();
            res.json({ success: true, win: winAmount.toFixed(2) });
        } else {
            await conn.end();
            res.status(400).json({ success: false, message: "Too late! Bursting" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ৩. একদম শেষে থাকবে লিসেন পোর্ট
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server Running...'));
