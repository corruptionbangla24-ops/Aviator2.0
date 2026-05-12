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
    if (r < 0.10) return 1.00; 
    let outcome = 0.90 / (1 - r); 
    return Math.min(Math.max(1.01, outcome), 30.00).toFixed(2);
}

let currentMult = 1.00;
let crashPoint = generateCrashPoint();
let isCrashed = false;

async function startEngine() {
    try {
        const conn = await mysql.createConnection(dbConfig);
        setInterval(async () => {
            if (!isCrashed) {
                currentMult = parseFloat(currentMult) + 0.01;
                if (parseFloat(currentMult) >= parseFloat(crashPoint)) {
                    isCrashed = true;
                    await conn.execute('UPDATE aviator_game_state SET current_multiplier = ?, is_crashed = true WHERE id = 1', [currentMult.toFixed(2)]);
                    setTimeout(() => {
                        currentMult = 1.00; isCrashed = false;
                        crashPoint = generateCrashPoint();
                    }, 5000);
                } else {
                    await conn.execute('UPDATE aviator_game_state SET current_multiplier = ?, is_crashed = false WHERE id = 1', [currentMult.toFixed(2)]);
                }
            }
        }, 150);
    } catch (err) { console.log("Engine Error: " + err.message); }
}
startEngine();

app.get('/api/game-data', async (req, res) => {
    try {
        const conn = await mysql.createConnection(dbConfig);
        const [gameRows] = await conn.execute('SELECT current_multiplier, is_crashed FROM aviator_game_state WHERE id = 1');
        const [userRows] = await conn.execute('SELECT balance FROM aviator_users WHERE id = 1');
        await conn.end();
        res.json({ multiplier: gameRows[0].current_multiplier, is_crashed: gameRows[0].is_crashed, balance: userRows[0].balance });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/place-bet', async (req, res) => {
    const { amount } = req.body;
    try {
        const conn = await mysql.createConnection(dbConfig);
        const [user] = await conn.execute('SELECT balance FROM aviator_users WHERE id = 1');
        if (user[0].balance >= amount) {
            await conn.execute('UPDATE aviator_users SET balance = balance - ? WHERE id = 1', [amount]);
            await conn.end(); res.json({ success: true });
        } else { await conn.end(); res.status(400).json({ success: false, message: "ইন্সফিসিয়েন্ট ব্যালেন্স!" }); }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/cashout', async (req, res) => {
    const { betAmount, multiplier } = req.body;
    try {
        const conn = await mysql.createConnection(dbConfig);
        const [game] = await conn.execute('SELECT current_multiplier, is_crashed FROM aviator_game_state WHERE id = 1');
        if (!game[0].is_crashed && multiplier <= game[0].current_multiplier) {
            const winAmount = betAmount * multiplier;
            await conn.execute('UPDATE aviator_users SET balance = balance + ? WHERE id = 1', [winAmount]);
            await conn.end(); res.json({ success: true, win: winAmount.toFixed(2) });
        } else { await conn.end(); res.status(400).json({ success: false, message: "Too late!" }); }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/setup-database', async (req, res) => {
    try {
        const conn = await mysql.createConnection(dbConfig);
        await conn.execute(`CREATE TABLE IF NOT EXISTS aviator_game_state (id INT PRIMARY KEY, current_multiplier DECIMAL(10,2), is_crashed BOOLEAN)`);
        await conn.execute(`CREATE TABLE IF NOT EXISTS aviator_users (id INT PRIMARY KEY, balance DECIMAL(10,2))`);
        await conn.execute('INSERT IGNORE INTO aviator_game_state VALUES (1, 1.00, false)');
        await conn.execute('INSERT IGNORE INTO aviator_users VALUES (1, 500.00)');
        await conn.end(); res.send("Success!");
    } catch (err) { res.status(500).send(err.message); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Live...'));
