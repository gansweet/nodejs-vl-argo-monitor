#!/usr/bin/env node

const http = require("http");
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const crypto = require('crypto');
const { promisify } = require('util');
const { exec: execCommand, execSync } = require('child_process');
const exec = promisify(execCommand);

const UPLOAD_URL = process.env.UPLOAD_URL || '';      // 节点或订阅自动上传地址,需填写部署Merge-sub项目后的首页地址,例如：https://merge.xxx.com
const PROJECT_URL = process.env.PROJECT_URL || '';    // 需要上传订阅或保活时需填写项目分配的url,例如：https://google.com
const AUTO_ACCESS = process.env.AUTO_ACCESS || false; // false关闭自动保活，true开启,需同时填写PROJECT_URL变量
const FILE_PATH = process.env.FILE_PATH || '.npm';    // 运行目录,sub节点文件保存目录
const SUB_PATH = process.env.SUB_PATH || 'dcbio';  // 订阅路径
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;        // http服务订阅端口
const UUID = process.env.UUID || '90ce3ae1-5a6b-4583-a09e-e846759a710e'; // 节点UUID
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || 'dc.agsweet.de5.net';          // 固定隧道域名,留空即启用临时隧道
const ARGO_AUTH = process.env.ARGO_AUTH || 'eyJhIjoiMmY5OTY4YzJkODliNWMyZDU5YzM3ZDQzODk3MjUwYzYiLCJ0IjoiMDVkYzYzMjItMWJkNC00MWJkLTllOWQtMWNiZTgwZGZjZjYyIiwicyI6Ik1HUmhOVEE1TXpFdE16YzVOUzAwTlRFeExUbGlNak10WldRMU9ESm1ZV0V3T1RrMCJ9';              // 固定隧道密钥json或token
const ARGO_PORT = process.env.ARGO_PORT || 8001;            // 固定隧道端口
const S5_PORT = process.env.S5_PORT || '';                  // socks5端口
const HY2_PORT = process.env.HY2_PORT || '';                // hy2端口
const REALITY_PORT = process.env.REALITY_PORT || '';        // reality端口
const CFIP = process.env.CFIP || 'saas.sin.fan';            // 节点优选域名或优选ip
const CFPORT = process.env.CFPORT || 443;                   // 节点优选域名或优选ip对应的端口
const NAME = process.env.NAME || '';                        // 节点名称
const CHAT_ID = process.env.CHAT_ID || '7076649928';                  // Telegram chat_id 
const BOT_TOKEN = process.env.BOT_TOKEN || '7439627111:AAESekUyCCjghKJ3DeOOhp4Uh_koMp-JjLQ'; // Telegram bot_token 
const SHOW_LOG = !['false', 'disable', 'no'].includes((process.env.SHOW_LOG || 'true').toLowerCase()); // 是否显示日志输出

// VPS Agent 相关环境变量
const VPS_URL = process.env.VPS_URL || 'https://vpsmonitorcf.yahaibio.ccwu.cc/';
const VPS_ID = process.env.VPS_ID || 'Q6sxH3yWdAg';
const VPS_KEY = process.env.VPS_KEY || 'xDrvKFlrHn19ad3Rpsmf7negmpeMhxLz';

// 控制日志输出
if (!SHOW_LOG) {
  console.log = () => {};
  console.error = () => {};
}
function alwaysLog(msg) {
  process.stdout.write(msg + '\n');
}

// 创建运行文件夹
if (!fs.existsSync(FILE_PATH)) {
  fs.mkdirSync(FILE_PATH);
}

// 端口检查
function isValidPort(port) {
  try {
    if (port === null || port === undefined || port === '') return false;
    if (typeof port === 'string' && port.trim() === '') return false;
    const portNum = parseInt(port);
    if (isNaN(portNum)) return false;
    if (portNum < 1 || portNum > 65535) return false;
    return true;
  } catch (error) {
    return false;
  }
}

// 生成随机6位字符
function generateRandomName() {
  const characters = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// 全局常量与路径
let subContent = null;
let privateKey = '';
let publicKey = '';
const webName = generateRandomName();
const botName = generateRandomName();
let webPath = path.join(FILE_PATH, webName);
let botPath = path.join(FILE_PATH, botName);
let subPath = path.join(FILE_PATH, 'sub.txt');
let listPath = path.join(FILE_PATH, 'list.txt');
let bootLogPath = path.join(FILE_PATH, 'boot.log');
let configPath = path.join(FILE_PATH, 'config.json');
let certPath = path.resolve(FILE_PATH, 'cert.pem');
let keyPath = path.resolve(FILE_PATH, 'private.key');

// ==================== 内嵌 VPS-Agent 监控逻辑 ====================
let prev = null, pn = null, vpsTimer = null;
const cpuT = () => { let i = 0, t = 0; for (const c of os.cpus()) { for (const k in c.times) t += c.times[k]; i += c.times.idle; } return { i, t }; };
function netStat() { try { let rx = 0, tx = 0; for (const l of fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2)) { const [n, r] = l.trim().split(':'); if (!r || n === 'lo') continue; const f = r.trim().split(/\s+/); rx += +f[0]; tx += +f[8]; } return { rx, tx }; } catch { return { rx: 0, tx: 0 }; } }
function diskStat() { try { const s = fs.statfsSync('/'), t = s.blocks * s.bsize, f = s.bfree * s.bsize; return { total: t, used: t - f, free: f, usage_percent: t ? +((t - f) * 100 / t).toFixed(1) : 0 }; } catch { return { total: 0, used: 0, free: 0, usage_percent: 0 }; } }
function snapshot() {
  const c = cpuT(), n = netStat(), now = Date.now(); let cpu = 0, up = 0, dn = 0;
  if (prev && c.t > prev.t) cpu = +(100 * (1 - (c.i - prev.i) / (c.t - prev.t))).toFixed(1);
  if (pn && now > pn.now) { up = Math.max(0, Math.round((n.tx - pn.tx) * 1000 / (now - pn.now))); dn = Math.max(0, Math.round((n.rx - pn.rx) * 1000 / (now - pn.now))); }
  prev = c; pn = { ...n, now };
  const mt = os.totalmem(), mf = os.freemem(), l = os.loadavg();
  return { timestamp: Math.floor(now / 1000), cpu: { usage_percent: cpu, load_avg: l.map(x => +x.toFixed(2)) }, memory: { total: mt, used: mt - mf, free: mf, usage_percent: +((mt - mf) * 100 / mt).toFixed(1) }, disk: diskStat(), network: { upload_speed: up, download_speed: dn, total_upload: n.tx, total_download: n.rx }, uptime: Math.floor(os.uptime()) };
}
function startVpsAgent(o = {}) {
  const url = (o.url || VPS_URL || '').replace(/\/+$/, ''), id = o.id || VPS_ID, key = o.key || VPS_KEY;
  if (!url || !id || !key) {
    console.warn('[vps-agent] 缺少 url/id/key，已跳过监控上报');
    return;
  }
  let iv = o.interval || 60; snapshot();
  const tick = async () => {
    try {
      const r = await fetch(url + '/api/report/' + id, { method: 'POST', headers: { 'content-type': 'application/json', 'X-API-Key': key }, body: JSON.stringify(snapshot()), signal: AbortSignal.timeout(15000) });
      const j = await r.json().catch(() => ({}));
      if (j.interval >= 5) iv = j.interval;
    } catch (e) {
      console.warn('[vps-agent]', e.message);
    }
    vpsTimer = setTimeout(tick, iv * 1000);
    vpsTimer.unref();
  };
  vpsTimer = setTimeout(tick, 2000);
  vpsTimer.unref();
}

// 如果订阅器上存在历史运行节点则先删除
function deleteNodes() {
  try {
    if (!UPLOAD_URL) return;
    if (!fs.existsSync(subPath)) return;

    let fileContent;
    try {
      fileContent = fs.readFileSync(subPath, 'utf-8');
    } catch {
      return null;
    }

    const decoded = Buffer.from(fileContent, 'base64').toString('utf-8');
    const nodes = decoded.split('\n').filter(line =>
      /(vless|vmess|trojan|hysteria2|socks):\/\//.test(line)
    );

    if (nodes.length === 0) return;

    axios.post(`${UPLOAD_URL}/api/delete-nodes`,
      JSON.stringify({ nodes }),
      { headers: { 'Content-Type': 'application/json' } }
    ).catch(() => {
      return null;
    });
    return null;
  } catch (err) {
    return null;
  }
}

// 清理历史文件
function cleanupOldFiles() {
  try {
    const files = fs.readdirSync(FILE_PATH);
    files.forEach(file => {
      const filePath = path.join(FILE_PATH, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {}
    });
  } catch (err) {}
}

// crypto 生成 X25519 密钥对
function generateX25519Keypair() {
  const { publicKey: pubKey, privateKey: privKey } = crypto.generateKeyPairSync('x25519');
  const privateKeyRaw = privKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32);
  const publicKeyRaw = pubKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  return {
    privateKey: privateKeyRaw.toString('base64url'),
    publicKey: publicKeyRaw.toString('base64url')
  };
}

// X25519 密钥对生成或加载
function generateOrLoadKeyPair() {
  const keyFilePath = path.join(FILE_PATH, 'key.txt');
  if (fs.existsSync(keyFilePath)) {
    const content = fs.readFileSync(keyFilePath, 'utf8');
    const privateKeyMatch = content.match(/PrivateKey:\s*(.*)/);
    const publicKeyMatch = content.match(/PublicKey:\s*(.*)/);
    if (privateKeyMatch && publicKeyMatch) {
      privateKey = privateKeyMatch[1].trim();
      publicKey = publicKeyMatch[1].trim();
      return;
    }
  }
  const keypair = generateX25519Keypair();
  privateKey = keypair.privateKey;
  publicKey = keypair.publicKey;
  fs.writeFileSync(keyFilePath, `PrivateKey: ${privateKey}\nPublicKey: ${publicKey}\n`, 'utf8');
}

// TLS 证书生成
const FALLBACK_EC_KEY =
  '-----BEGIN EC PARAMETERS-----\n' +
  'BggqhkjOPQMBBw==\n' +
  '-----END EC PARAMETERS-----\n' +
  '-----BEGIN EC PRIVATE KEY-----\n' +
  'MHcCAQEEIM4792SEtPqIt1ywqTd/0bYidBqpYV/++siNnfBYsdUYoAoGCCqGSM49\n' +
  'AwEHoUQDQgAE1kHafPj07rJG+HboH2ekAI4r+e6TL38GWASANnngZreoQDF16ARa\n' +
  '/TsyLyFoPkhLxSbehH/NBEjHtSZGaDhMqQ==\n' +
  '-----END EC PRIVATE KEY-----\n';

const FALLBACK_CERT =
  '-----BEGIN CERTIFICATE-----\n' +
  'MIIBejCCASGgAwIBAgIUfWeQL3556PNJLp/veCFxGNj9crkwCgYIKoZIzj0EAwIw\n' +
  'EzERMA8GA1UEAwwIYmluZy5jb20wHhcNMjUwOTE4MTgyMDIyWhcNMzUwOTE2MTgy\n' +
  'MDIyWjATMREwDwYDVQQDDAhiaW5nLmNvbTBZMBMGByqGSM49AgEGCCqGSM49AwEH\n' +
  'A0IABNZB2nz49O6yRvh26B9npACOK/nuky9/BlgEgDZ54Ga3qEAxdegEWv07Mi8h\n' +
  'aD5IS8Um3oR/zQRIx7UmRmg4TKmjUzBRMB0GA1UdDgQWBBTV1cFID7UISE7PLTBR\n' +
  'BfGbgkrMNzAfBgNVHSMEGDAWgBTV1cFID7UISE7PLTBRBfGbgkrMNzAPBgNVHRMB\n' +
  'Af8EBTADAQH/MAoGCCqGSM49BAMCA0cAMEQCIAIDAJvg0vd/ytrQVvEcSm6XTlB+\n' +
  'eQ6OFb9LbLYL9f+sAiAffoMbi4y/0YUSlTtz7as9S8/lciBF5VCUoVIKS+vX2g==\n' +
  '-----END CERTIFICATE-----\n';

function ensureTlsCertificates(certPath, keyPath) {
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) return;
  fs.mkdirSync(path.dirname(certPath), { recursive: true });
  try {
    execSync('openssl version', { stdio: 'ignore' });
    execSync(`openssl ecparam -genkey -name prime256v1 -out "${keyPath}"`, { stdio: 'ignore' });
    execSync(`openssl req -new -x509 -days 3650 -key "${keyPath}" -out "${certPath}" -subj "/CN=bing.com"`, { stdio: 'ignore' });
    return;
  } catch (e) {}
  fs.writeFileSync(keyPath, FALLBACK_EC_KEY);
  fs.writeFileSync(certPath, FALLBACK_CERT);
}

// 计算证书的 SHA-256 指纹
function getCertificateFingerprint(certPath) {
  try {
    const result = execSync(
      `openssl x509 -noout -fingerprint -sha256 -in "${certPath}"`,
      { encoding: 'utf8', timeout: 3000 }
    ).trim();
    const match = result.match(/=(.+)$/);
    if (match && match[1]) {
      return match[1].toUpperCase();
    }
  } catch (e) {}

  try {
    const certData = fs.readFileSync(certPath, 'utf8');
    const derMatch = certData.match(/-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/);
    if (!derMatch) return '';
    const derBase64 = derMatch[1].replace(/\s/g, '');
    const derBuffer = Buffer.from(derBase64, 'base64');
    const hash = crypto.createHash('sha256').update(derBuffer).digest('hex');
    return hash.match(/.{2}/g).join(':').toUpperCase();
  } catch (error) {
    return '';
  }
}

// 生成 x-ray 配置文件
async function generateConfig() {
  const config = {
    log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
    inbounds: [
      { tag: 'vless-fallback-in', port: ARGO_PORT, listen: '::', protocol: 'vless', settings: { clients: [{ id: UUID, flow: 'xtls-rprx-vision' }], decryption: 'none', fallbacks: [{ dest: 3001 }, { path: "/vless-argo", dest: 3002 }, { path: "/vmess-argo", dest: 3003 }, { path: "/trojan-argo", dest: 3004 }] }, streamSettings: { network: 'tcp' } },
      { tag: 'vless-tcp-in', port: 3001, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID }], decryption: "none" }, streamSettings: { network: "tcp", security: "none" } },
      { tag: 'vless-ws-in', port: 3002, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID, level: 0 }], decryption: "none" }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/vless-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
      { tag: 'vmess-ws-in', port: 3003, listen: "127.0.0.1", protocol: "vmess", settings: { clients: [{ id: UUID, alterId: 0 }] }, streamSettings: { network: "ws", wsSettings: { path: "/vmess-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
      { tag: 'trojan-ws-in', port: 3004, listen: "127.0.0.1", protocol: "trojan", settings: { clients: [{ password: UUID }] }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/trojan-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
    ],
    dns: { servers: ["https+local://8.8.8.8/dns-query"] },
    outbounds: [{ protocol: "freedom", tag: "direct" }, { protocol: "blackhole", tag: "block" }]
  };

  // VLESS Reality 配置
  if (isValidPort(REALITY_PORT)) {
    config.inbounds.push({
      tag: "vless-in",
      listen: "::",
      port: parseInt(REALITY_PORT),
      protocol: "vless",
      settings: {
        clients: [{ id: UUID, flow: "xtls-rprx-vision" }],
        decryption: "none"
      },
      streamSettings: {
        network: "raw",
        security: "reality",
        realitySettings: {
          show: false,
          dest: "www.iij.ad.jp:443",
          xver: 0,
          serverNames: ["www.iij.ad.jp"],
          privateKey: privateKey,
          shortIds: [""]
        }
      }
    });
  }

  // Hysteria2 配置
  if (isValidPort(HY2_PORT)) {
    config.inbounds.push({
      tag: "hysteria-in",
      listen: "::",
      port: parseInt(HY2_PORT),
      protocol: "hysteria",
      settings: {
        version: 2,
        clients: [{ auth: UUID }]
      },
      streamSettings: {
        network: "hysteria",
        hysteriaSettings: {
          version: 2,
          masquerade: {
            type: "proxy",
            url: "https://bing.com"
          }
        },
        security: "tls",
        tlsSettings: {
          alpn: ["h3"],
          certificates: [
            {
              certificateFile: certPath,
              keyFile: keyPath
            }
          ]
        }
      }
    });
  }

  // S5 配置
  if (isValidPort(S5_PORT)) {
    config.inbounds.push({
      tag: "s5-in",
      listen: "::",
      port: parseInt(S5_PORT),
      protocol: "socks",
      settings: {
        auth: "password",
        accounts: [
          {
            user: UUID.substring(0, 8),
            pass: UUID.slice(-12)
          }
        ],
        udp: true
      }
    });
  }

  fs.writeFileSync(path.join(FILE_PATH, 'config.json'), JSON.stringify(config, null, 2));
}

// 判断系统架构
function getSystemArchitecture() {
  const arch = os.arch();
  if (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') {
    return 'arm';
  } else {
    return 'amd';
  }
}

// 下载对应系统架构的依赖文件
function downloadFile(fileName, fileUrl, callback) {
  const filePath = fileName;
  const tempFilePath = `${filePath}.download`;

  if (!fs.existsSync(FILE_PATH)) {
    fs.mkdirSync(FILE_PATH, { recursive: true });
  }

  const writer = fs.createWriteStream(tempFilePath);

  axios({
    method: 'get',
    url: fileUrl,
    responseType: 'stream',
  })
    .then(response => {
      response.data.pipe(writer);

      writer.on('finish', () => {
        writer.close((closeError) => {
          if (closeError) {
            const errorMessage = `Download ${path.basename(filePath)} failed: ${closeError.message}`;
            fs.unlink(tempFilePath, () => { });
            console.error(errorMessage);
            callback(errorMessage);
            return;
          }
          try {
            fs.renameSync(tempFilePath, filePath);
          } catch (renameError) {
            const errorMessage = `Download ${path.basename(filePath)} failed: ${renameError.message}`;
            fs.unlink(tempFilePath, () => { });
            console.error(errorMessage);
            callback(errorMessage);
            return;
          }
          console.log(`Download ${path.basename(filePath)} successfully`);
          callback(null, filePath);
        });
      });

      writer.on('error', err => {
        fs.unlink(tempFilePath, () => { });
        const errorMessage = `Download ${path.basename(filePath)} failed: ${err.message}`;
        console.error(errorMessage);
        callback(errorMessage);
      });
    })
    .catch(err => {
      fs.unlink(tempFilePath, () => { });
      const errorMessage = `Download ${path.basename(filePath)} failed: ${err.message}`;
      console.error(errorMessage);
      callback(errorMessage);
    });
}

// 下载并运行依赖文件 (仅下载 web 和 bot)
async function downloadFilesAnd