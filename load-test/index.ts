import * as mqtt from 'mqtt';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const API_URL = process.env.API_URL ?? 'http://localhost:3000/api';
const MQTT_URL = `mqtt://${process.env.MQTT_HOST ?? 'localhost'}:${process.env.MQTT_PORT ?? '1883'}`;

const args = process.argv.slice(2);
const getArg = (name: string, def: number): number => {
  const arg = args.find((a) => a.startsWith(`--${name}=`));
  return arg ? parseInt(arg.split('=')[1], 10) : def;
};

const PROFESSOR_COUNT = getArg('professors', 100);
const STUDENT_COUNT = getArg('students', 500);
const DURATION_SEC = getArg('duration', 30);
const DRAIN_SEC = getArg('drain', 15);
const BATCH_SIZE = 20;

const FAKE_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

interface UserSession {
  id: string;
  token: string;
  role: 'professor' | 'aluno';
  pairedId: string;
  client?: mqtt.MqttClient;
}

const metrics = {
  msgSent: 0,
  msgDelivered: 0,
  msgLatencies: [] as number[],
  screenshotRequested: 0,
  screenshotReceived: 0,
  screenshotFailed: 0,
  screenshotLatencies: [] as number[],
  peakConnections: 0,
  activeConnections: 0,
};

const pendingScreenshots = new Map<string, number>();

async function post(endpoint: string, body: object, token?: string) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${endpoint} → ${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}

async function registerUser(role: 'professor' | 'aluno', index: number) {
  const suffix = `${index}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const email = `load.${role}.${suffix}@test.local`;
  const data = await post('/auth/register', {
    email,
    name: `${role} ${index}`,
    password: 'Load@1234',
    role,
  });
  return {
    id: (data.user as Record<string, string>).id,
    token: data.access_token as string,
    role,
  };
}

async function runBatched<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.allSettled(items.slice(i, i + size).map(fn));
  }
}

function connectMqtt(user: UserSession): Promise<mqtt.MqttClient> {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(MQTT_URL, {
      clientId: `load_${user.role}_${user.id.slice(0, 8)}_${Math.random().toString(16).slice(2)}`,
      username: user.id,
      password: user.token,
      clean: true,
      connectTimeout: 10000,
      reconnectPeriod: 0,
    });
    const timer = setTimeout(() => reject(new Error('connect timeout')), 10000);
    client.once('connect', () => {
      clearTimeout(timer);
      metrics.activeConnections++;
      if (metrics.activeConnections > metrics.peakConnections) {
        metrics.peakConnections = metrics.activeConnections;
      }
      resolve(client);
    });
    client.once('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

function setupAluno(user: UserSession, running: { value: boolean }) {
  const client = user.client!;
  client.subscribe(`screenshot/request/${user.id}`, { qos: 1 });

  client.on('message', (topic, payload) => {
    if (!running.value) return;
    if (topic !== `screenshot/request/${user.id}`) return;
    let data: { requestId: string; professorId: string };
    try { data = JSON.parse(payload.toString()); } catch { return; }
    post('/screenshots/upload', {
      requestId: data.requestId,
      professorId: data.professorId,
      imageBase64: FAKE_PNG,
    }, user.token).catch(() => {});
  });
}

function setupProfessor(user: UserSession) {
  const client = user.client!;
  client.subscribe(`screenshot/ready/${user.id}`, { qos: 1 });

  client.on('message', (topic, payload) => {
    if (topic !== `screenshot/ready/${user.id}`) return;
    let data: { requestId: string; error?: string };
    try { data = JSON.parse(payload.toString()); } catch { return; }
    const sentAt = pendingScreenshots.get(data.requestId);
    if (sentAt) {
      if (data.error) {
        metrics.screenshotFailed++;
      } else {
        metrics.screenshotReceived++;
        metrics.screenshotLatencies.push(Date.now() - sentAt);
      }
      pendingScreenshots.delete(data.requestId);
    }
  });
}

function avg(arr: number[]): number {
  return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
}

function p95(arr: number[]): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.95)] ?? 0;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function sleepInterruptible(ms: number, running: { value: boolean }): Promise<void> {
  return new Promise((resolve) => {
    const step = 100;
    let elapsed = 0;
    const tick = () => {
      if (!running.value || elapsed >= ms) return resolve();
      elapsed += step;
      setTimeout(tick, Math.max(0, Math.min(step, ms - elapsed)));
    };
    setTimeout(tick, Math.min(step, ms));
  });
}

function printReport(duration: number) {
  const msgLost = metrics.msgSent - metrics.msgDelivered;
  const deliveryPct = metrics.msgSent
    ? ((metrics.msgDelivered / metrics.msgSent) * 100).toFixed(1)
    : '0';
  const screenshotPct = metrics.screenshotRequested
    ? ((metrics.screenshotReceived / metrics.screenshotRequested) * 100).toFixed(1)
    : '0';

  console.log('\n=== LOAD TEST RESULTS ===');
  console.log(`Professores: ${PROFESSOR_COUNT} | Alunos: ${STUDENT_COUNT} | Duração: ${duration}s\n`);
  console.log('MENSAGENS');
  console.log(`  Enviadas:        ${metrics.msgSent}`);
  console.log(`  Entregues:       ${metrics.msgDelivered} (${deliveryPct}%)`);
  console.log(`  Perdidas:        ${msgLost}`);
  console.log(`  Latência média:  ${avg(metrics.msgLatencies)}ms`);
  console.log(`  Latência p95:    ${p95(metrics.msgLatencies)}ms\n`);
  console.log('SCREENSHOTS');
  console.log(`  Solicitados:     ${metrics.screenshotRequested}`);
  console.log(`  Recebidos:       ${metrics.screenshotReceived} (${screenshotPct}%)`);
  console.log(`  Falhos:          ${metrics.screenshotFailed}`);
  console.log(`  Tempo médio:     ${avg(metrics.screenshotLatencies)}ms\n`);
  console.log('CONEXÕES');
  console.log(`  Pico simultâneo: ${metrics.peakConnections}`);
  console.log('=========================\n');

  const report = {
    config: { professors: PROFESSOR_COUNT, students: STUDENT_COUNT, durationSec: duration },
    messages: {
      sent: metrics.msgSent,
      delivered: metrics.msgDelivered,
      lost: msgLost,
      deliveryRatePct: parseFloat(deliveryPct),
      avgLatencyMs: avg(metrics.msgLatencies),
      p95LatencyMs: p95(metrics.msgLatencies),
    },
    screenshots: {
      requested: metrics.screenshotRequested,
      received: metrics.screenshotReceived,
      failed: metrics.screenshotFailed,
      successRatePct: parseFloat(screenshotPct),
      avgLatencyMs: avg(metrics.screenshotLatencies),
    },
    connections: { peak: metrics.peakConnections },
  };

  const reportPath = path.resolve(__dirname, 'load-test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Relatório salvo em: ${reportPath}\n`);
}

async function simulate(
  professors: UserSession[],
  alunos: UserSession[],
  running: { value: boolean },
) {
  const tasks: Promise<void>[] = [];
  const startedAt = Date.now();

  for (const aluno of alunos) {
    if (!aluno.client) continue;
    tasks.push(
      (async () => {
        while (running.value) {
          await sleepInterruptible(randInt(3000, 8000), running);
          if (!running.value) break;
          const sentAt = Date.now();
          metrics.msgSent++;
          post('/chat/send', { receiverId: aluno.pairedId, content: `ping ${Date.now()}` }, aluno.token)
            .then(() => {
              metrics.msgDelivered++;
              metrics.msgLatencies.push(Date.now() - sentAt);
            })
            .catch(() => {});
        }
      })(),
    );

    tasks.push(
      (async () => {
        while (running.value) {
          await sleepInterruptible(5000, running);
          if (!running.value) break;
          fetch(`${API_URL}/presence/ping`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${aluno.token}` },
          }).catch(() => {});
        }
      })(),
    );
  }

  for (const prof of professors) {
    if (!prof.client) continue;
    tasks.push(
      (async () => {
        while (running.value) {
          await sleepInterruptible(randInt(5000, 10000), running);
          if (!running.value) break;
          const sentAt = Date.now();
          metrics.msgSent++;
          post('/chat/send', { receiverId: prof.pairedId, content: `msg ${Date.now()}` }, prof.token)
            .then(() => {
              metrics.msgDelivered++;
              metrics.msgLatencies.push(Date.now() - sentAt);
            })
            .catch(() => {});
        }
      })(),
    );

    tasks.push(
      (async () => {
        await sleepInterruptible(randInt(1000, 5000), running);
        while (running.value) {
          post(`/screenshots/request/${prof.pairedId}`, {}, prof.token)
            .then((data) => {
              metrics.screenshotRequested++;
              pendingScreenshots.set(data.requestId as string, Date.now());
            })
            .catch(() => {});
          await sleepInterruptible(randInt(8000, 12000), running);
        }
      })(),
    );
  }

  const progressInterval = setInterval(() => {
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    process.stdout.write(
      `\r  ${elapsed}s | msgs: ${metrics.msgSent} enviadas / ${metrics.msgDelivered} entregues | screenshots: ${metrics.screenshotReceived}/${metrics.screenshotRequested}  `,
    );
  }, 1000);

  await sleep(DURATION_SEC * 1000);
  running.value = false;
  await Promise.allSettled(tasks);
  clearInterval(progressInterval);
  process.stdout.write('\n');
}

async function main() {
  console.log(`\nIniciando load test: ${PROFESSOR_COUNT} professores, ${STUDENT_COUNT} alunos, ${DURATION_SEC}s\n`);

  console.log('Registrando usuários...');
  const rawProfessors: Omit<UserSession, 'pairedId'>[] = [];
  const rawAlunos: Omit<UserSession, 'pairedId'>[] = [];

  await runBatched(
    Array.from({ length: PROFESSOR_COUNT }, (_, i) => i),
    BATCH_SIZE,
    async (i) => { rawProfessors.push(await registerUser('professor', i)); },
  );
  await runBatched(
    Array.from({ length: STUDENT_COUNT }, (_, i) => i),
    BATCH_SIZE,
    async (i) => { rawAlunos.push(await registerUser('aluno', i)); },
  );
  console.log(`  ${rawProfessors.length} professores, ${rawAlunos.length} alunos registrados`);

  const professors: UserSession[] = rawProfessors.map((p, i) => ({
    ...p,
    pairedId: rawAlunos[i % rawAlunos.length].id,
  }));
  const alunos: UserSession[] = rawAlunos.map((a, i) => ({
    ...a,
    pairedId: rawProfessors[i % rawProfessors.length].id,
  }));

  console.log('Conectando ao MQTT...');
  await runBatched([...professors, ...alunos], BATCH_SIZE, async (user) => {
    try { user.client = await connectMqtt(user); } catch { }
  });
  console.log(`  ${metrics.activeConnections} conexões ativas\n`);

  const running = { value: true };
  for (const p of professors) { if (p.client) setupProfessor(p); }
  for (const a of alunos) { if (a.client) setupAluno(a, running); }

  console.log(`Simulando por ${DURATION_SEC}s...`);
  await simulate(professors, alunos, running);

  console.log(`Aguardando mensagens in-flight (${DRAIN_SEC}s)...`);
  await sleep(DRAIN_SEC * 1000);

  for (const user of [...professors, ...alunos]) {
    if (user.client) {
      user.client.end();
      metrics.activeConnections--;
    }
  }

  printReport(DURATION_SEC);
}

main().catch((err) => {
  console.error('Load test failed:', err);
  process.exit(1);
});
