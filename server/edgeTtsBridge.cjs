const { spawn } = require('child_process');
const readline = require('readline');
const crypto = require('crypto');
const path = require('path');

let workerProcess = null;
let rl = null;
const pendingRequests = new Map();

function ensureWorker() {
  if (workerProcess && !workerProcess.killed && workerProcess.exitCode === null) {
    return;
  }

  const scriptPath = path.resolve(__dirname, 'tts_worker.py');
  workerProcess = spawn('python', [scriptPath], {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
  });

  rl = readline.createInterface({
    input: workerProcess.stdout,
    terminal: false
  });

  rl.on('line', (line) => {
    try {
      const res = JSON.parse(line);
      const reqId = res.id;
      if (reqId && pendingRequests.has(reqId)) {
        const { resolve, reject, timeoutId } = pendingRequests.get(reqId);
        clearTimeout(timeoutId);
        pendingRequests.delete(reqId);

        if (res.success && res.audio) {
          const buffer = Buffer.from(res.audio, 'base64');
          resolve(buffer);
        } else {
          reject(new Error(res.error || 'Edge TTS error'));
        }
      }
    } catch (e) {
      console.warn('[EdgeTtsBridge] Error parsing worker output:', e);
    }
  });

  workerProcess.on('exit', (code) => {
    console.warn(`[EdgeTtsBridge] Worker exited with code ${code}`);
    for (const [id, req] of pendingRequests.entries()) {
      clearTimeout(req.timeoutId);
      req.reject(new Error('Worker process terminated unexpectedly'));
    }
    pendingRequests.clear();
    workerProcess = null;
    rl = null;
  });

  workerProcess.on('error', (err) => {
    console.error('[EdgeTtsBridge] Worker error:', err);
  });
}

function synthesizeEdgeTts(text, voice = 'es-ES-ElviraNeural', rate, pitch) {
  return new Promise((resolve, reject) => {
    try {
      ensureWorker();
      const id = crypto.randomUUID();
      const timeoutId = setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error('Edge TTS request timed out'));
        }
      }, 18000);

      pendingRequests.set(id, { resolve, reject, timeoutId });

      const payload = JSON.stringify({ id, text, voice, rate, pitch }) + '\n';
      workerProcess.stdin.write(payload, 'utf-8');
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  synthesizeEdgeTts,
  ensureWorker
};
