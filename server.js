const express = require('express');
const mysql = require('mysql2/promise');
const app = express();

app.use(express.static('./'));
app.use(express.json());

const dbConfig = {
    host: '://aivencloud.com',
    user: 'avnadmin',
    password: 'AVNS_PsYa4FE9fJvITOf4u0Z',
    database: 'defaultdb',
    port: 15225,
    ssl: { rejectUnauthorized: false }
};

// ১. প্রফেশনাল ক্রাশ পয়েন্ট জেনারেটর
function generateCrashPoint() {
    const e = Math.random();
    const outcome = Math.floor(100 / (1 - e)) / 100;
    return Math.max(1.10, outcome); // সর্বনিম্ন ১.১০ এ ক্রাশ করবে
}

// ২. গেম ইঞ্জিন (অটোমেটিক মাল্টিপ্লায়ার বাড়বে)
let currentMult = 1.00;
let crashPoint = generateCrashPoint();
let isCrashed = false;

async function runGameEngine() {
    const conn = await mysql.createConnection(dbConfig);
    
    setInterval(async () => {
        if (!isCrashed) {
            currentMult += 0.01;
            
            if (currentMult >= crashPoint) {
                isCrashed = true;
                await conn.execute('UPDATE aviator_game_state SET current_multiplier = ?, is_crashed = true WHERE id = 1', [currentMult]);
                
                // ৫ সেকেন্ড পর নতুন রাউন্ড শুরু
                setTimeout(() => {
                    currentMult = 1.00;
                    isCrashed = false;
                    crashPoint = generateCrashPoint();
                }, 5000);
            } else {
                await conn.execute('UPDATE aviator_game_state SET current_multiplier = ?, is_crashed = false WHERE id = 1', [currentMult]);
            }
        }
    }, 150); // গেমের গতি ঠিক রাখতে ১৫০ms ব্যবহার করা হয়েছে
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server Running...'));
