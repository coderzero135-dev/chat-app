const { spawn } = require('child_process');
const os = require('os');

const ROOT = __dirname;
const isWin = process.platform === 'win32';

function getIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

function run(cmd, args, label) {
  const child = spawn(cmd, args, {
    cwd: ROOT,
    shell: isWin,
    stdio: 'pipe'
  });
  child.stdout.on('data', (d) => process.stdout.write(`[${label}] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[${label}] ${d}`));
  child.on('close', (code) => process.exit(code || 0));
  return child;
}

const ip = getIP();
console.log(`\n  Local:  \x1b[36m http://localhost:5173 \x1b[0m`);
console.log(`  LAN:    \x1b[36m http://${ip}:5173 \x1b[0m`);
console.log('');

run('node', ['server.js'], 'server');
setTimeout(() => {
  run('npx', ['vite', '--host', '0.0.0.0', '--open'], 'vite');
}, 1000);

process.on('SIGINT', () => process.exit());
