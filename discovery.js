const dgram = require('dgram');
const os = require('os');

const MULTICAST_ADDR = '239.255.0.77';
const MULTICAST_PORT = 9877;

function start(server, port) {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });

  sock.on('listening', () => {
    sock.addMembership(MULTICAST_ADDR);
    sock.setBroadcast(true);
    sock.setMulticastTTL(128);
  });

  sock.on('message', (msg, rinfo) => {
    const text = msg.toString().trim();
    if (!text.startsWith('CHAT|')) return;
    const remotePort = parseInt(text.split('|')[1], 10);
    if (!remotePort || remotePort === port) return;
    const localIPs = getLocalIPs();
    if (localIPs.has(rinfo.address)) return;
    console.log(`  Found another chat at http://${rinfo.address}:${remotePort}`);
  });

  sock.bind(MULTICAST_PORT, () => {
    const broadcast = () => {
      const buf = Buffer.from(`CHAT|${port}`);
      sock.send(buf, 0, buf.length, MULTICAST_PORT, MULTICAST_ADDR);
    };
    broadcast();
    setInterval(broadcast, 2000);
  });
}

function getLocalIPs() {
  const ips = new Set();
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4') ips.add(net.address);
    }
  }
  return ips;
}

module.exports = { start };
