import dns from 'dns';
import net from 'net';
import tls from 'tls';

const HOST = 'd552.dimedns.com';
const SMTP_PORT = 465;
const IMAP_PORT = 993;

async function checkDNS() {
  return new Promise<string[]>((resolve, reject) => {
    dns.resolve4(HOST, (err, addresses) => {
      if (err) reject(err);
      else resolve(addresses);
    });
  });
}

async function checkTcp(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(3000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      resolve(false);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, HOST);
  });
}

async function checkTls(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = tls.connect({
      host: HOST,
      port: port,
      rejectUnauthorized: false,
      timeout: 3000
    }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      resolve(false);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function main() {
  console.log(`Checking connectivity to cPanel mail server: ${HOST}`);
  
  try {
    const ips = await checkDNS();
    console.log(`[DNS] Resolved successfully. IPs: ${ips.join(', ')}`);
  } catch (err: any) {
    console.error(`[DNS] Failed to resolve host: ${err.message}`);
    return;
  }

  const smtpTcp = await checkTcp(SMTP_PORT);
  console.log(`[SMTP TCP] Port ${SMTP_PORT} is ${smtpTcp ? 'OPEN' : 'CLOSED'}`);

  const smtpTls = await checkTls(SMTP_PORT);
  console.log(`[SMTP TLS] Secure handshake: ${smtpTls ? 'SUCCESS' : 'FAILED'}`);

  const imapTcp = await checkTcp(IMAP_PORT);
  console.log(`[IMAP TCP] Port ${IMAP_PORT} is ${imapTcp ? 'OPEN' : 'CLOSED'}`);

  const imapTls = await checkTls(IMAP_PORT);
  console.log(`[IMAP TLS] Secure handshake: ${imapTls ? 'SUCCESS' : 'FAILED'}`);
}

main().catch(console.error);
