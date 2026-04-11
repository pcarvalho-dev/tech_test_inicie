# Decisões Técnicas — Desafio OctoClass / Inicie

Registro das decisões arquiteturais e de infraestrutura tomadas durante o desenvolvimento.

---

## Vite + React nas extensões (não Next.js)

**Decisão:** usar Vite + React em vez de Next.js para as Chrome Extensions.

**Motivo:** O App Router do Next.js gera inline scripts (`<script>unsafe-inline`) que violam a Content Security Policy do Manifest V3. Vite gera bundles externos compatíveis com a CSP.

---

## Service worker usa HTTP → backend → MQTT (não WebSocket direto)

**Decisão:** o service worker da extensão do aluno envia pings de presença e screenshots via HTTP para o backend, que então publica no MQTT.

**Motivo:** Chrome MV3 bloqueia conexões WebSocket para `localhost` em service workers (restrição de `connect-src` no contexto de background). A solução é usar fetch HTTP, que funciona normalmente.

---

## Popup conecta MQTT diretamente via WebSocket

**Decisão:** o popup da extensão conecta ao broker EMQX diretamente via WebSocket (`ws://localhost:8083/mqtt`).

**Motivo:** O contexto de popup (`extension_pages`) permite WebSocket via `content_security_policy.extension_pages`. Apenas o service worker tem a restrição.

---

## Redis TTL 30s para presença

**Decisão:** cada ping de presença define um TTL de 30 segundos no Redis. O aluno pinga a cada 15 segundos.

**Motivo:** o service worker pode ser suspenso pelo Chrome, tornando WebSocket não confiável no background. Com TTL curto e ping periódico via HTTP + `chrome.alarms`, a presença é consistente mesmo com o service worker dormindo.

---

## Base64 via HTTP para screenshots

**Decisão:** a extensão do aluno captura o screenshot com `chrome.tabs.captureVisibleTab`, converte para base64 e envia via HTTP POST para o backend, que salva o arquivo e notifica o professor via MQTT.

**Motivo:** o service worker não pode enviar dados grandes via WebSocket (mesma restrição de CSP). HTTP é confiável e permite payload grande.

---

## Cursor-based pagination no histórico de chat

**Decisão:** o histórico de mensagens usa paginação por cursor (`cursor=<messageId>`) em vez de offset.

**Motivo:** paginação por offset sofre deslocamento quando novas mensagens chegam durante a navegação. O cursor aponta para um item específico, tornando a paginação imune a inserções concorrentes.

---

## out/ das extensões commitado no repositório

**Decisão:** as pastas `out/` das extensões (build de produção) são versionadas no git.

**Motivo:** as Chrome Extensions são carregadas manualmente no navegador (`chrome://extensions → Load unpacked`). Para o avaliador conseguir testar sem precisar buildar, o `out/` pronto é um entregável necessário. Em projetos normais, artefatos de build seriam ignorados no `.gitignore`.

---

## QoS por tipo de mensagem MQTT

| Tópico | QoS | Justificativa |
|--------|-----|---------------|
| `presence/{userId}` | 0 | Pings frequentes (15s); perda de um ping é tolerável — o próximo corrige |
| `chat/{messageId}` | 1 | Mensagens devem ser entregues ao menos uma vez; deduplicação feita por ID |
| `screenshot/request/{alunoId}` | 1 | Comando crítico; reenvio automático garante que o aluno receba |
| `screenshot/response/{alunoId}` | 1 | Imagem deve chegar ao backend; perda exigiria nova solicitação manual |
| `screenshot/ready/{professorId}` | 1 | Notificação ao professor de que a imagem está disponível |
