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

// ১. RTP 90% লজিক
function generateCrashPoint() {
    const r = Math.random();
    if (r < 0.10) return 1.00; // ১০% ইনস্ট্যান্ট ক্রাশ
    let outcome = 0.90 / (1 - r); 
    return Math.min(Math.max(1.01, outcome), 30.00).toFixed(2);
}

let currentMult = 1.00;
let crashPoint = generateCrashPoint();
let isCrashed = false;

// গ্লোবাল পুল তৈরি
const pool = mysql.createPool(dbConfig);

async function startEngine() {
    setInterval(async () => {
        if (!isCrashed) {
            currentMult = parseFloat(currentMult) + 0.01;
            if (parseFloat(currentMult) >= parseFloat(crashPoint)) {
                isCrashed = true;
                await pool.execute('UPDATE aviator_game_state SET current_multiplier = ?, is_crashed = true WHERE id = 1', [currentMult.toFixed(2)]);
                setTimeout(() => {
                    currentMult = 1.00;
                    isCrashed = false;
                    crashPoint = generateCrashPoint();
                }, 5000);
            } else {
                await pool.execute('UPDATE aviator_game_state SET current_multiplier = ?, is_crashed = false WHERE id = 1', [currentMult.toFixed(2)]);
            }
        }
    }, 150);
}
startEngine();

app.get('/api/game-data', async (req, res) => {
    try {
        const [gameRows] = await pool.execute('SELECT current_multiplier, is_crashed FROM aviator_game_state WHERE id = 1');
        const [userRows] = await pool.execute('SELECT balance FROM aviator_users WHERE id = 1');
        res.json({ multiplier: gameRows[0].current_multiplier, is_crashed: gameRows[0].is_crashed, balance: userRows[0].balance });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/place-bet', async (req, res) => {
    const { amount } = req.body;
    try {
        const [user] = await pool.execute('SELECT balance FROM aviator_users WHERE id = 1');
        if (user[0].balance >= amount) {
            await pool.execute('UPDATE aviator_users SET balance = balance - ? WHERE id = 1', [amount]);
            res.json({ success: true });
        } else {
            res.status(400).json({ success: false, message: "Insufficient Balance!" });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/cashout', async (req, res) => {
    const { betAmount, multiplier } = req.body;
    try {
        const [game] = await pool.execute('SELECT current_multiplier, is_crashed FROM aviator_game_state WHERE id = 1');
        if (!game[0].is_crashed && multiplier <= game[0].current_multiplier) {
            const winAmount = betAmount * multiplier;
            await pool.execute('UPDATE aviator_users SET balance = balance + ? WHERE id = 1', [winAmount]);
            res.json({ success: true, win: winAmount.toFixed(2) });
        } else {
            res.status(400).json({ success: false, message: "Too late!" });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/setup-database', async (req, res) => {
    try {
        await pool.execute(`CREATE TABLE IF NOT EXISTS aviator_game_state (id INT PRIMARY KEY, current_multiplier DECIMAL(10,2), is_crashed BOOLEAN)`);
        await pool.execute(`CREATE TABLE IF NOT EXISTS aviator_users (id INT PRIMARY KEY, balance DECIMAL(10,2))`);
        await pool.execute('INSERT IGNORE INTO aviator_game_state VALUES (1, 1.00, false)');
        await pool.execute('INSERT IGNORE INTO aviator_users VALUES (1, 500.00)');
        res.send("Database Setup Success!");
    } catch (err) { res.status(500).send(err.message); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server Live on port ' + PORT));
