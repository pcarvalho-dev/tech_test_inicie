# OctoClass — Desafio Técnico Inicie

Sistema de comunicação em tempo real entre **Professor** e **Aluno**, composto por duas Chrome Extensions, um backend NestJS e infraestrutura completa via Docker Compose.

---

## Sumário

- [Visão geral](#visão-geral)
- [Stack](#stack)
- [Setup rápido](#setup-rápido)
- [Carregando as extensões no Chrome](#carregando-as-extensões-no-chrome)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Estrutura de tópicos MQTT](#estrutura-de-tópicos-mqtt)
- [Decisões arquiteturais](#decisões-arquiteturais)
- [Fluxos técnicos](#fluxos-técnicos)
- [Testes](#testes)
- [Teste de carga](#teste-de-carga)
- [API Docs](#api-docs)

---

## Visão geral

```
┌─────────────────────┐        MQTT (EMQX)        ┌─────────────────────┐
│  Extension Professor │ ◄────────────────────────► │   Extension Aluno   │
│  (popup + bg worker) │                            │  (popup + bg worker)│
└────────┬────────────┘                            └──────────┬──────────┘
         │ HTTP (REST)                                        │ HTTP (REST)
         ▼                                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Backend (NestJS)                               │
│   Auth · Users · Presence · Chat · Screenshot · MQTT Auth              │
└──────────┬──────────────────────┬──────────────────────────────────────┘
           │                      │
     ┌─────▼─────┐         ┌──────▼──────┐
     │ PostgreSQL │         │    Redis    │
     └───────────┘         └─────────────┘
```

**Fluxo de screenshot:**
1. Professor clica em "Solicitar Print"
2. Backend publica `screenshot/request/{alunoId}` via MQTT **e** abre evento SSE para o professor
3. Extension do Aluno recebe via SSE (service worker) ou polling Redis
4. Aluno captura com `chrome.tabs.captureVisibleTab`, envia via `POST /screenshots/upload`
5. Backend salva o arquivo, notifica o professor via SSE e MQTT `screenshot/ready/{professorId}`
6. Professor vê o print em tempo real

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | NestJS + TypeScript |
| Banco de dados | PostgreSQL 16 |
| Cache / Sessão | Redis 7 |
| Mensageria | MQTT via EMQX 5.6 |
| Chrome Extensions | Manifest V3 + Next.js 14 (Pages Router) + React 18 |
| Testes | Vitest + @vitest/coverage-v8 |
| Infraestrutura | Docker Compose |

---

## Setup rápido

### Pré-requisitos

- Docker e Docker Compose
- Node.js 20+

### 1. Clone e configure o ambiente

```bash
git clone <repo-url>
cd desafio_tech_octoclass
cp .env.example .env   # ajuste as variáveis se necessário
```

### 2. Suba toda a infraestrutura

```bash
docker compose up --build
```

Isso sobe em ordem: **PostgreSQL → Redis → EMQX → Backend**.

O backend já roda as migrations automaticamente na inicialização.

### 3. Acesse

| Serviço | URL |
|---------|-----|
| Backend API | http://localhost:3000/api |
| Swagger | http://localhost:3000/api/docs |
| EMQX Dashboard | http://localhost:18083 (admin / public) |

### Contas de teste

| Perfil | Email | Senha |
|--------|-------|-------|
| Professor | `professor@teste.com` | `123456` |
| Aluno | `aluno@teste.com` | `123456` |

> As contas são criadas automaticamente via seed no primeiro boot.

---

## Carregando as extensões no Chrome

As pastas `out/` de cada extensão já estão buildadas no repositório — não é necessário buildar para testar.

### Extension Aluno

1. Abra `chrome://extensions`
2. Ative **"Modo do desenvolvedor"** (canto superior direito)
3. Clique em **"Carregar sem compactação"**
4. Selecione a pasta: `extension-aluno/out/`

### Extension Professor

1. Repita os passos acima
2. Selecione a pasta: `extension-professor/out/`

### Rebuildar as extensões (opcional)

```bash
# Extension Aluno
cd extension-aluno
npm install
npm run build

# Extension Professor
cd extension-professor
npm install
npm run build
```

> **Por que Next.js Pages Router?** O App Router gera `<script>` inline que viola a CSP do Manifest V3. O Pages Router com `output: 'export'` gera bundles externos compatíveis.

> **Por que `_next/` → `next_static/`?** O Chrome bloqueia diretórios que começam com `_`. O script de build renomeia a pasta e atualiza as referências nos HTMLs gerados.

---

## Variáveis de ambiente

Crie um `.env` na raiz do projeto (ou use o `.env.example` como base):

```env
# PostgreSQL
POSTGRES_USER=octoclass
POSTGRES_PASSWORD=octoclass123
POSTGRES_DB=octoclass

# JWT
JWT_SECRET=supersecretkey
JWT_EXPIRES_IN=8h

# MQTT
MQTT_USERNAME=backend
MQTT_PASSWORD=backend123

# Backend
PORT=3000
NODE_ENV=development
CORS_ORIGIN=*
```

---

## Estrutura de tópicos MQTT

| Tópico | QoS | Direção | Uso |
|--------|-----|---------|-----|
| `presence/{userId}` | 0 | Aluno → Broker | Ping de presença a cada 15s |
| `chat/{messageId}` | 1 | Broker → Todos | Entrega de mensagens de chat |
| `screenshot/request/{alunoId}` | 1 | Backend → Aluno | Solicitação de print pelo professor |
| `screenshot/response/{alunoId}` | 1 | Aluno → Backend | Resposta com base64 (via popup MQTT) |
| `screenshot/ready/{professorId}` | 1 | Backend → Professor | Notificação de print disponível |

### Justificativa dos QoS

**QoS 0 — Presença (`presence/+`)**
Fire-and-forget. A presença é renovada a cada 15 segundos e controlada via TTL no Redis. Perder um ping ocasional não afeta a consistência — o próximo ping restaura o estado. O overhead de ACK para mensagens de alta frequência seria desnecessário.

**QoS 1 — Chat e Screenshot**
Garantia de entrega "pelo menos uma vez". Mensagens de chat e comandos de screenshot são críticos: perder uma mensagem impacta diretamente a experiência. A idempotência no backend (lock Redis por `requestId`) garante que reenvios não gerem duplicatas.

> **QoS 2 não foi utilizado** pois o overhead de 4 mensagens por entrega é desnecessário quando a idempotência já é tratada na camada de aplicação.

---

## Decisões arquiteturais

### Autenticação MQTT via HTTP Auth (EMQX)

As extensions conectam ao EMQX usando o JWT como `password` e o `userId` como `username`. O EMQX valida cada conexão chamando o endpoint `POST /api/mqtt/auth` no backend, que verifica o JWT e o `sub`. Isso centraliza a autenticação sem precisar de credenciais fixas no broker.

### Service Worker usa SSE + HTTP (não WebSocket)

O Chrome MV3 bloqueia WebSocket para `localhost` em service workers (restrição de `connect-src`). O service worker do aluno usa:
1. **SSE primário** (`/screenshots/stream`) — stream persistente, mantém o SW ativo
2. **Polling Redis** (`/screenshots/pending`) — fallback se o SSE cair

O popup conecta ao MQTT diretamente via WebSocket, pois o contexto `extension_pages` permite isso.

### Presença via Redis TTL

Cada ping define `SET presence:{userId} ... EX 30`. O aluno pinga a cada 15s via `chrome.alarms` (funciona mesmo com SW suspenso). Se o ping parar, o Redis expira a chave em 30s e o aluno aparece offline.

### Cache de sessão JWT no Redis

O JWT é validado e cacheado no Redis com TTL igual ao `exp` do token. Requisições subsequentes do mesmo usuário evitam decodificação do JWT e consulta ao banco.

### Idempotência em screenshots

Antes de processar uma solicitação de screenshot, o backend tenta `SET lock:screenshot:{requestId} 1 EX 60 NX`. Se outra instância já está processando, retorna 409. Isso evita uploads duplicados em caso de retry.

### Paginação por cursor no chat

O histórico usa `cursor=<ISO-timestamp>` em vez de offset. Com offset, novas mensagens durante a navegação deslocam as páginas. O cursor aponta para um ponto fixo no tempo, tornando a paginação consistente sob concorrência.

### Multi-stage Dockerfile

O backend usa build multi-stage: `builder` (compila TypeScript) e `production` (apenas `dist/` + `node_modules` de produção). A imagem final tem ~300MB a menos que uma imagem com devDependencies.

---

## Fluxos técnicos

O arquivo [`FLUXOS.md`](./FLUXOS.md) documenta o funcionamento interno de cada feature com diagramas de fluxo — do clique do usuário até o banco de dados.

**Fluxos cobertos:** Login · Presença online · Chat · Autenticação MQTT · Screenshot · Validação de token

### Como visualizar

**Opção 1 — VS Code**

Instale a extensão [Markdown Preview Mermaid Support](https://marketplace.visualstudio.com/items?itemName=bierner.markdown-mermaid), abra `FLUXOS.md` e pressione `Ctrl+Shift+V`.

**Opção 2 — Online**

Acesse [mermaid.live](https://mermaid.live), cole o conteúdo de cada bloco ` ```mermaid ``` ` e visualize interativamente.

**Opção 3 — GitHub**

O GitHub renderiza Mermaid nativamente em arquivos `.md` — basta abrir `FLUXOS.md` no repositório.

---

## Testes

### Backend

```bash
cd backend
npm install

# Unitários + E2E com cobertura
npm run test:cov
```

**Cobertura atual:**

| Métrica | Resultado |
|---------|-----------|
| Statements | 97.3% |
| Branches | 90.0% |
| Functions | 95.5% |
| Lines | 98.5% |

```
Test Files: 13 passed
Tests:      103 passed
```

### Extension Aluno

```bash
cd extension-aluno
npm install
npm run test:cov
```

| Métrica | Resultado |
|---------|-----------|
| Statements | 99.3% |
| Branches | 95.4% |
| Functions | 91.7% |
| Lines | 99.2% |

```
Test Files: 4 passed
Tests:      52 passed
```

### Extension Professor

```bash
cd extension-professor
npm install
npm run test:cov
```

| Métrica | Resultado |
|---------|-----------|
| Statements | 100% |
| Branches | 100% |
| Functions | 100% |
| Lines | 100% |

```
Test Files: 4 passed
Tests:      39 passed
```

---

## Teste de carga

Simula **100 professores + 500 alunos** com conexões MQTT simultâneas, troca de mensagens bidirecional e solicitações de screenshot em paralelo.

### Pré-requisito

A infraestrutura deve estar rodando (`docker compose up`).

### Executar

```bash
cd load-test
npm install

# 100 professores + 500 alunos (padrão)
npm start

# 10 professores + 50 alunos (versão mínima)
npm run start:min

# Personalizado
npx ts-node index.ts --professors=50 --students=200 --duration=30
```

### Exemplo de relatório gerado

```
============================================================
           RELATÓRIO DE TESTE DE CARGA
============================================================
Duração do teste:          30s + 15s drain
Professores simultâneos:   100
Alunos simultâneos:        500
Total de conexões MQTT:    600

MENSAGENS DE CHAT
  Enviadas:                2 847
  Entregues:               2 841  (99.8%)
  Taxa de sucesso:         99.79%
  Latência média:          18ms
  Latência p95:            47ms

SCREENSHOTS
  Solicitados:             98
  Respondidos (simulado):  98
  Taxa de sucesso:         100%
  Tempo médio de resposta: 124ms

CONEXÕES
  Máximo simultâneo:       600
  Desconexões inesperadas: 0
============================================================
```

O relatório completo é salvo em `load-test/load-test-report.json`.

---

## API Docs

Com o backend rodando, acesse a documentação Swagger completa em:

```
http://localhost:3000/api/docs
```

### Principais endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth/register` | Registra novo usuário |
| POST | `/api/auth/login` | Login, retorna JWT |
| GET | `/api/users/professors` | Lista professores |
| GET | `/api/presence/online` | Lista usuários online |
| POST | `/api/presence/ping` | Atualiza presença no Redis |
| POST | `/api/chat/send` | Envia mensagem |
| GET | `/api/chat/history/:userId` | Histórico paginado por cursor |
| POST | `/api/screenshots/request/:alunoId` | Solicita screenshot |
| POST | `/api/screenshots/upload` | Aluno envia screenshot |
| GET | `/api/screenshots/stream` | SSE stream de eventos |
| GET | `/api/screenshots/history` | Histórico de screenshots |
| GET | `/api/screenshots/:id/image` | Imagem do screenshot |
| POST | `/api/mqtt/auth` | Validação de credenciais MQTT (EMQX) |
