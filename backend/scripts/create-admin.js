require('dotenv').config();

const bcrypt = require('bcryptjs');
const readline = require('readline');
const { stdin, stdout } = require('process');
const { z } = require('zod');
const db = require('../db');

function askLine(question) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    return new Promise(resolve => rl.question(question, answer => {
        rl.close();
        resolve(answer);
    }));
}

function askHidden(question) {
    if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
        throw new Error('Run this command in an interactive terminal so the password can be entered privately.');
    }
    return new Promise((resolve, reject) => {
        stdout.write(question);
        readline.emitKeypressEvents(stdin);
        stdin.setRawMode(true);
        stdin.resume();
        let value = '';
        const cleanup = () => {
            stdin.setRawMode(false);
            stdin.removeListener('keypress', onKeypress);
            stdout.write('\n');
        };
        const onKeypress = (character, key = {}) => {
            if (key.ctrl && key.name === 'c') {
                cleanup();
                reject(new Error('Administrator setup cancelled.'));
                return;
            }
            if (key.name === 'return' || key.name === 'enter') {
                cleanup();
                resolve(value);
                return;
            }
            if (key.name === 'backspace') {
                value = value.slice(0, -1);
                stdout.write('\b \b');
                return;
            }
            if (!key.ctrl && !key.meta && character) {
                value += character;
                stdout.write('*');
            }
        };
        stdin.on('keypress', onKeypress);
    });
}

async function main() {
    const email = (await askLine('Administrator Gmail: ')).trim().toLowerCase();
    const validEmail = z.string().email().refine(value => value.endsWith('@gmail.com')).safeParse(email);
    if (!validEmail.success) throw new Error('Use a valid Gmail address.');

    const password = await askHidden('Password (input hidden): ');
    if (password.length < 12 || password.length > 128 ||
        !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
        throw new Error('Password must be 12–128 characters and include lowercase, uppercase, and numeric characters.');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = db.prepare('INSERT INTO ADMINS (email, password_hash) VALUES (?, ?)').run(email, passwordHash);
    db.prepare(`
        INSERT INTO AUDIT_LOGS (actor_id, actor_role, action, resource_type, resource_id)
        VALUES (?, 'admin', 'admin.provision', 'admin', ?)
    `).run(result.lastInsertRowid, String(result.lastInsertRowid));
    console.log('Administrator account created. Keep the credentials private.');
}

main()
    .catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(() => db.close());
