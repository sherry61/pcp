'use strict';

// 通过 SSH 登录海光主机，以 sudo 调用 stable_scripts/v2 的 stop_vm.sh / delete_vm.sh。
// 海光主机只暴露建/启虚机的 HTTP 接口，没有 stop/delete 接口，清理必须走脚本。
//
// 环境变量：
//   TEE_HOST_SSH_ENABLED    默认 true，设为 false 可完全跳过清理
//   TEE_HOST_SSH_HOST       默认 10.112.14.6
//   TEE_HOST_SSH_USER       默认 super
//   TEE_HOST_SSH_PASSWORD   必填（缺失则清理失败并报明确错误）
//   TEE_HOST_SCRIPTS_DIR    默认 /opt/vm-api-service/stable_scripts/v2
//   TEE_HOST_SSH_TIMEOUT_MS 默认 120000

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const VM_ID_RE = /^[0-9a-f]{16}$/;
const INSTANCE_DIR = '/var/lib/vm-api/instances';
const SECRET_FILE = process.env.TEE_HOST_SSH_SECRET_FILE || path.join(__dirname, '..', '.tee-host-ssh-secret');

// 密码优先取环境变量，其次取本地 gitignore 的密钥文件（便于重启时无需手动 export）。
function readSecretFile() {
  try { return fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch (_) { return ''; }
}

function getConfig() {
  return {
    enabled: String(process.env.TEE_HOST_SSH_ENABLED || 'true').toLowerCase() !== 'false',
    host: process.env.TEE_HOST_SSH_HOST || '10.112.14.6',
    user: process.env.TEE_HOST_SSH_USER || 'super',
    password: process.env.TEE_HOST_SSH_PASSWORD || readSecretFile(),
    scriptsDir: process.env.TEE_HOST_SCRIPTS_DIR || '/opt/vm-api-service/stable_scripts/v2',
    timeoutMs: Math.max(10000, Number(process.env.TEE_HOST_SSH_TIMEOUT_MS || 120000))
  };
}

// 通过 SSH_ASKPASS + setsid(无 tty) 实现免交互密码登录，避免引入额外 npm 依赖。
// sudo 的密码通过 stdin 传入远端，不出现在命令行参数里。
function runRemote(remoteCommand) {
  const cfg = getConfig();
  return new Promise((resolve, reject) => {
    const askpass = path.join(os.tmpdir(), `tee-askpass-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.sh`);
    fs.writeFileSync(askpass, '#!/bin/sh\nprintf \'%s\\n\' "$TEE_HOST_SSH_PASSWORD"\n', { mode: 0o700 });

    const args = [
      '-w', 'ssh',
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'LogLevel=ERROR',
      '-o', 'PreferredAuthentications=password',
      '-o', 'PubkeyAuthentication=no',
      '-o', 'NumberOfPasswordPrompts=1',
      '-o', 'ConnectTimeout=10',
      `${cfg.user}@${cfg.host}`,
      remoteCommand
    ];

    const child = spawn('setsid', args, {
      env: {
        ...process.env,
        DISPLAY: process.env.DISPLAY || ':0',
        SSH_ASKPASS: askpass,
        SSH_ASKPASS_REQUIRE: 'force',
        TEE_HOST_SSH_PASSWORD: cfg.password
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const cleanup = () => { try { fs.unlinkSync(askpass); } catch (_) { /* ignore */ } };
    const done = (fn, value) => { if (settled) return; settled = true; clearTimeout(timer); cleanup(); fn(value); };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      done(reject, new Error(`SSH 执行超时（${cfg.timeoutMs}ms）`));
    }, cfg.timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => done(reject, error));
    child.on('close', (code) => done(resolve, { code, stdout, stderr }));

    try {
      child.stdin.write(`${cfg.password}\n`);
      child.stdin.end();
    } catch (_) { /* stdin 可能已关闭，忽略 */ }
  });
}

async function listRemoteVms() {
  const cfg = getConfig();
  if (!cfg.enabled) return [];
  if (!cfg.password) throw new Error('未配置 TEE_HOST_SSH_PASSWORD，无法读取海光主机虚机列表');
  const result = await runRemote(`sudo -S -p "" ls -1 ${INSTANCE_DIR} 2>/dev/null`);
  return String(result.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((name) => VM_ID_RE.test(name));
}

// 清理海光主机上所有虚机（每次交付前调用），并额外清理本订单历史 vm_id。
// 返回 { cleaned: [vmId], failed: [{ vmId, error }] }。
async function cleanupRemoteVms(options = {}) {
  const cfg = getConfig();
  if (!cfg.enabled) return { cleaned: [], failed: [], skipped: true, reason: 'TEE_HOST_SSH_ENABLED=false' };
  if (!cfg.password) throw new Error('未配置 TEE_HOST_SSH_PASSWORD，无法清理海光主机虚机');

  const ids = new Set(await listRemoteVms());
  for (const extra of options.extraVmIds || []) {
    const value = String(extra || '').trim();
    if (VM_ID_RE.test(value)) ids.add(value);
  }

  const cleaned = [];
  const failed = [];
  for (const vmId of ids) {
    // stop 失败（例如虚机已停止）不阻断 delete；delete 失败才算清理失败。
    const remote = [
      `sudo -S -p "" bash -c 'cd ${cfg.scriptsDir}`,
      `&& ( ./stop_vm.sh ${vmId} || true )`,
      `&& ./delete_vm.sh ${vmId} '`
    ].join(' ');
    let result;
    try {
      result = await runRemote(remote);
    } catch (error) {
      failed.push({ vmId, error: error.message });
      continue;
    }
    const output = `${result.stdout}\n${result.stderr}`;
    if (result.code === 0 || /vm not found/i.test(output)) {
      cleaned.push(vmId);
    } else {
      failed.push({ vmId, error: (result.stderr || result.stdout || `exit=${result.code}`).trim().slice(-800) });
    }
  }

  return { cleaned, failed };
}

module.exports = { listRemoteVms, cleanupRemoteVms, VM_ID_RE };
