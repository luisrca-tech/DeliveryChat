# Apresentação Técnica — DeliveryChat

> Roteiro completo para apresentação interna (30–45 min + 10–15 min Q&A).
> Audiência: devs juniores + pares técnicos. Foco: 70% técnico, 30% produto.
> Produto demonstrado ao vivo via stream da tela.

---

## Sumário

1. [Visão Geral da Apresentação](#1-visão-geral-da-apresentação)
2. [Bloco 1 — Abertura de Produto (5 min)](#2-bloco-1--abertura-de-produto-5-min)
3. [Bloco 2 — Tour de uma Mensagem (20 min)](#3-bloco-2--tour-de-uma-mensagem-20-min)
4. [Bloco 3 — Decisões Arquiteturais (15 min)](#4-bloco-3--decisões-arquiteturais-15-min)
5. [Bloco 4 — Roadmap: LLM/RAG (5 min)](#5-bloco-4--roadmap-llmrag-5-min)
6. [Q&A Cheatsheet — Perguntas Previsíveis](#6-qa-cheatsheet--perguntas-previsíveis)
7. [Diagramas Sugeridos](#7-diagramas-sugeridos)

---

## 1. Visão Geral da Apresentação

| Bloco                          | Duração | Objetivo                                                |
| ------------------------------ | ------- | ------------------------------------------------------- |
| 1. Abertura de produto         | 5 min   | "O que é DeliveryChat" — framing + atores + apps        |
| 2. Tour de uma mensagem        | 20 min  | Fluxo de um visitante anônimo (fluido, sem pausas)      |
| 3. Decisões arquiteturais      | 15 min  | 5 decisões não-óbvias destacadas                        |
| 4. Roadmap (LLM/RAG)           | 5 min   | Visão de produto: IA interna → IA tenant-grounded (MCP) |
| **Total**                      | **45 min** |                                                     |
| Demo ao vivo                   | —       | Streamada à parte, cobre o lado "produto"               |
| Q&A                            | 10–15 min | Cheatsheet preparado abaixo                           |

**Princípio narrativo:** "de fora para dentro" — começa pelo produto, desce pelo caminho de uma requisição real, depois agrupa as decisões mais ricas, e fecha com a visão de IA.

---

## 2. Bloco 1 — Abertura de Produto (5 min)

### Framing

> **DeliveryChat é um SaaS multi-tenant de chat de atendimento em tempo real, embedável. Empresas colam um `<script>` no site delas e ganham um widget conectado a um painel onde operadores atendem visitantes ao vivo. Categoria: Intercom, Crisp, Tawk.to — produto comercial, com uma arquitetura desenhada para evoluir.**

Pontos de ancoragem:

- **Multi-tenant**: cada empresa é uma "organização" isolada por subdomain.
- **Real-time**: mensagens entregues via WebSocket, queue de atendimento atualiza instantaneamente para a equipe.
- **Embedável**: widget é um único `<script>` que não polui o site do cliente (Shadow DOM, IIFE).

### Os 3 atores

| Ator               | Como entra                    | Autenticação            |
| ------------------ | ----------------------------- | ----------------------- |
| **Visitante**      | Widget no site do tenant      | Anonymous (Better Auth) |
| **Operador**       | Painel admin (subdomain.app)  | Email OTP + session     |
| **Admin/super_admin** | Painel admin               | Email OTP + role        |

### Os 5 apps + 5 packages

| App/Package          | Stack                           | Porta | Papel                                            |
| -------------------- | ------------------------------- | ----- | ------------------------------------------------ |
| `apps/hono-api`      | Hono v4 + Drizzle + Postgres    | 8000  | Backend único (REST + WebSocket)                 |
| `apps/admin`         | TanStack Router + React 19      | 3000  | Painel do operador/admin                         |
| `apps/widget`        | React Router v7 + IIFE          | 3001  | Widget embedável                                 |
| `apps/web`           | Astro v5                        | 3002  | Landing page + signup                            |
| `apps/docs`          | Next.js                         | 3003  | Documentação pública                             |
| `packages/types`     | Zod + TS                        | —     | Contratos compartilhados (incl. `APIType` do RPC)|
| `packages/ui`        | shadcn                          | —     | Componentes compartilhados                       |
| `packages/emails`    | React Email                     | —     | Templates transacionais                          |
| `packages/infisical` | TS                              | —     | Wrapper do SDK de secrets                        |
| `packages/docs`      | Markdown                        | —     | Docs de features (fonte da verdade técnica)      |

### Frase de transição para o Bloco 2

> "Agora vamos seguir o caminho de uma mensagem desde o momento em que um visitante anônimo abre o widget até o operador respondê-lo no painel. Cada parada nesse caminho é uma decisão arquitetural — e vamos fechar todos os loops no bloco seguinte."

---

## 3. Bloco 2 — Tour de uma Mensagem (20 min)

**Cenário-âncora:** primeiro contato de um visitante anônimo.
**Narrativa:** fluida — quando uma decisão merecer aprofundamento, marcar como *"vamos voltar nisso"* e seguir.

### 3.1. Camada 1 — Widget Boot (1 min, menção rápida)

- Cliente cola `<script src=".../widget.iife.js" data-app-id="...">` no HTML.
- Build dual: dev rodando React Router v7 + build de produção via `vite.embed.config.ts` que gera **IIFE single-file**.
- **Command queue pattern**: chamadas a `window.DeliveryChat.init(...)` feitas *antes* do script carregar ficam numa fila e são replay quando carrega. Mesmo padrão do Segment/Intercom.
- **Shadow DOM**: widget renderiza dentro de um Shadow DOM — CSS do site do cliente não vaza para dentro, CSS do widget não vaza para fora.

> *Marcar para callback:* "Por que Shadow DOM? Loop fechado no Bloco 3."

### 3.2. Camada 2 — Tenant Resolution ⭐ (4–5 min — ESTRELA)

Primeira pergunta que o backend faz quando uma requisição chega: **"de qual tenant é isso?"**

#### Cascata de resolução (em `src/lib/requestContext.ts` + `tenant.ts`)

```
1. X-Tenant-Slug header (explícito — usado pelo widget)
2. Origin                ─┐
3. Referer                │  derivados, em ordem
4. X-Forwarded-Host       │
5. Host                  ─┘
```

**Por que essa ordem?**
- `X-Tenant-Slug` é o caminho rápido e explícito (widget já sabe quem é).
- Os demais são fallbacks para fluxos onde o header não foi enviado (ex: chamada direta do browser).
- Cada camada tenta extrair o subdomain do host.

#### Casos especiais (vendem maturidade)

| Host                         | Tratamento                                          |
| ---------------------------- | --------------------------------------------------- |
| `localhost`                  | Sem tenant (modo dev)                               |
| `*.localhost`                | Strip sufixo → subdomain é o tenant                 |
| `*.vercel.app`               | Parse formato `[tenant]---[hash]` (preview URLs!)   |
| `api`, `api-dev`, `www`      | Subdomínios reservados → sem tenant                 |

#### Estratégia de isolamento: **row-level, schema-shared**

- Todas as tenants compartilham as mesmas tabelas.
- Cada tabela tem `organizationId`.
- Todas as tabelas prefixadas com `delivery_chat_` via `createTable()` em `db/table.ts` — separação por convenção (não por DB físico).
- **Linha de defesa**: middleware `requireTenantAuth()` valida session, resolve tenant, verifica membership ativa, e **sempre** popula `c.set("auth", ...)` antes da query.

#### Alternativas descartadas

| Estratégia              | Por que não                                               |
| ----------------------- | --------------------------------------------------------- |
| Database-per-tenant     | Custo operacional alto, migrations complicadas, overkill  |
| Schema-per-tenant       | Mesmos problemas com menos benefício                      |
| Row-level **+ RLS PG**  | Plano futuro — segunda camada de defesa                   |

> **Frase forte:** "Multi-tenant é simples até o dia em que esquece um `WHERE`. Por isso, o middleware é obrigatório, e as queries vão para um service que recebe `organizationId` como argumento — não opcional."

### 3.3. Camada 3+4 — Auth Dual ⭐ (5 min — ESTRELA)

> **Diagrama de abertura (mostrar)**: dois caminhos coexistindo no mesmo backend.

```
VISITANTE (widget)                  OPERADOR (admin)
       │                                   │
       │ Bearer dk_live_xxx                │ Cookie session
       │ + X-App-Id                        │ (Better Auth)
       │                                   │
       ▼                                   ▼
  requireApiKeyAuth()              requireTenantAuth()
       │                                   │
       │  cria/recupera                    │  valida session
       │  anonymous session                │  + org membership
       │  (Better Auth plugin)             │  + role
       │                                   │
       └────────────► c.set("auth", ...) ◄──┘
                       (contrato uniforme)
```

#### Por que Better Auth (em vez de NextAuth/Clerk/Auth0)?

Em **uma frase**: "Better Auth tem todos os plugins que eu preciso nativos."

| Plugin         | Para quê                                                |
| -------------- | ------------------------------------------------------- |
| `anonymous`    | Sessão para visitante sem signup (widget)               |
| `organization` | Multi-tenant + roles + membership                       |
| `bearer`       | Token API key style para widget                         |
| `emailOTP`     | Login passwordless do operador                          |

#### (b) Plugin `anonymous` — a decisão mais não-óbvia

- Visitante abre o site → widget chama `POST /v1/widget/session` → Better Auth cria um `user` flagado anônimo + session.
- **A partir daí, o visitante anônimo é tratado pelo sistema igual a qualquer outro usuário** — mesmas queries, mesma tabela, mesma relação com `messages.senderId`.
- Se o visitante deixar email depois, a sessão "promove" para identificada sem perder histórico.

> **Frase forte:** "Anonymous plugin elimina o caso especial 'usuário sem login' do código inteiro. Visitante anônimo é só um user com uma flag."

#### (c) API Key flow — `dk_(live|test)_[32 chars]` + `X-App-Id`

- Formato `dk_live_...` / `dk_test_...` — facilita reconhecer ambiente.
- `X-App-Id` separa **qual aplicação dentro do tenant** está chamando — um tenant pode ter múltiplas apps (ex: site principal, app mobile, landing de campanha).
- Validação opcional de `Origin` contra domínio registrado da app — defesa contra key vazada sendo usada em outro site.

#### (f) Account Lifecycle State Machine ⭐

> **Regra de ouro do projeto:** *"Toda condicional baseada em status de usuário/org vive em `src/lib/accountLifecycle.ts`. Status check fora desse arquivo é bug."*

Estados: `ACTIVE`, `PENDING_VERIFICATION`, `EXPIRED`, `DELETED`.

Decisões controladas por essa máquina:
- O que acontece no login para cada combinação user.status × org.status.
- O que acontece no signup quando o slug já existe (org `DELETED` permite reuso; `EXPIRED` não).
- Que ações o usuário pode tomar quando trial expirou.

> **Frase forte:** "Centralizar a state machine é defesa contra o bug clássico: alguém adiciona `if (user.status === 'expired')` em três lugares e esquece o quarto. Aqui só tem um lugar."

### 3.4. Camada 5 — POST /conversations + Middleware Chain (2 min)

Quando o visitante manda a primeira mensagem, vira:

```
POST /v1/conversations
  ├─► requireApiKeyAuth()           (já passou)
  ├─► requireTenantAuth()           (resolve tenant)
  ├─► checkBillingStatus()          (Stripe status gating)
  ├─► createTenantRateLimitMiddleware()  (per-sec / per-min / per-hour)
  └─► handler → cria conversation status=pending
```

- **`checkBillingStatus()`**: gating fino — alguns status (`past_due`) permitem leitura mas bloqueiam escrita; trial expirado só libera endpoints de billing para `super_admin`.
- **Rate limit**: três janelas encadeadas (segundo / minuto / hora), in-memory hoje, com override por tenant via tabela `tenantRateLimits`.
- **`jsonError()`**: contrato uniforme de erro — nunca `c.json({ error: ... })` direto.

### 3.5. Camada 6 — WebSocket Broadcast ⭐ (4 min — ESTRELA)

Conversation criada → broadcast `conversation:new` para a organização inteira → cada operador conectado vê aparecer na fila em tempo real.

#### Stack

| Layer            | Tecnologia                |
| ---------------- | ------------------------- |
| Server framework | Hono v4                   |
| WS adapter       | `@hono/node-ws`           |
| Endpoint         | `GET /v1/ws` (upgrade)    |
| Shared types     | `packages/types/src/ws-events.ts` |

#### Dual auth no upgrade (`wsAuth.ts`)

- **Operador**: cookie de session é validado, identifica org.
- **Visitante (widget)**: query params `?apiKey=dk_...&appId=...` validados igual à API key REST.
- Mesma função, dois caminhos — espelho do REST.

#### Dual broadcast channels — decisão arquitetural

| Escopo                     | Eventos                                     | Para quem                                  |
| -------------------------- | ------------------------------------------- | ------------------------------------------ |
| **Room** (conversa)        | `message:new`, `message:ack`, `messages:sync`, `typing:start/stop` | Quem está olhando a conversa |
| **Organization** (org-wide)| `conversation:new`, `:accepted`, `:released`, `:resolved` | Todos os operadores da org |

> **Frase forte:** "Tem coisa que só interessa pra quem está olhando a conversa. Tem coisa que interessa pra fila inteira. Por isso dois canais — não um."

#### Hybrid REST + WebSocket

> **Frase forte:** "REST é a verdade. WebSocket é a entrega."

| Concern                | REST                                          | WebSocket                             |
| ---------------------- | --------------------------------------------- | ------------------------------------- |
| Persistência           | Cria/atualiza DB                              | Não escreve lifecycle                 |
| Tempo real             | Não                                           | Sim, fire-and-forget                  |
| Lifecycle              | `POST /:id/accept`, `/leave`, `/resolve`      | Broadcasta o evento resultante        |
| Mensagem               | (não usa)                                     | `message:send` → persiste → broadcast |
| Recovery se WS cair    | —                                             | `messages:sync` no reconnect          |

#### InMemoryRoomManager — trade-off honesto

- Estrutura em memória: Rooms / Users / Org maps.
- **Single instance hoje.** Múltiplas instâncias ainda não funcionam — broadcasts não cruzariam.
- **Plano:** Redis pub/sub. Faz parte do roadmap (callback no Bloco 4).

### 3.6. Camadas 7+8 — Operador aceita + Race Condition ⭐ (3 min — ESTRELA)

#### Operador vê fila

- Admin app carrega → conecta WS → `room:join` no canal da org → broadcast `conversation:new` aparece na fila.
- **Sem polling.** Sem `useEffect` para refetch. Estado vivo via subscription.

#### Accept — race-condition safe

Dois operadores clicam "Aceitar" ao mesmo tempo. O que acontece?

```sql
UPDATE conversations
SET assignedTo = ?, status = 'active'
WHERE id = ? AND assignedTo IS NULL
```

- Só **um** UPDATE encontra `assignedTo IS NULL` — o segundo retorna 0 linhas afetadas.
- O segundo operador recebe erro "já atribuída" sem corrupção.
- **Decisão:** concorrência tratada **onde ela existe — no banco**, não em JS.

> **Frase forte:** "Mutex em JavaScript não protege contra duas instâncias. Constraint no UPDATE protege."

### 3.7. Camada 9 — Mensagens via WS (1 min, menção rápida)

- Operador digita → `message:send` no WS → handler valida com Zod schema (`chat.schemas.ts`) → persiste em `messages` → broadcast `message:new` para o room.
- `message:ack` confirma ao remetente.
- Read receipts: `conversationParticipants.lastReadMessageId` atualiza ao visualizar.

### Frase de transição para o Bloco 3

> "Esse foi o tour. Agora vamos voltar e olhar com lupa as 5 decisões que mais moldam esse projeto."

---

## 4. Bloco 3 — Decisões Arquiteturais (15 min)

### 4.1. Turborepo + Hono RPC type-safe (3 min)

> **Pitch:** "Mudei uma rota no backend → o frontend não compila. Esse é o tipo de erro que eu quero ter."

- Monorepo Turborepo unifica build, test, lint, dev.
- `apps/hono-api/src/lib/api.ts` exporta `APIType` — tipo da árvore de rotas.
- `apps/admin/src/lib/api.ts` faz `hc<APIType>(baseUrl)` — cliente RPC tipado.
- Toda chamada do admin tem inference de body, query, response, status code.

**Bonus**: fetch wrapper injeta automaticamente `Authorization: Bearer <token>` e `X-Tenant-Slug: <subdomain>`. Frontend nunca esquece.

### 4.2. Account Lifecycle State Machine (3 min)

> Callback do Bloco 2. Frase-âncora: *"status check fora desse arquivo é bug"*.

- Centraliza ~20 condicionais espalhadas pelo código numa máquina de estados única.
- Cobre: login, signup, slug reuse, trial expirado, conta deletada.
- Vantagem: para mudar uma regra de negócio sobre conta expirada, mexe em **um arquivo**.
- Testes cobrem cada transição.

### 4.3. Hybrid REST + WebSocket (3 min)

> Callback do Bloco 2. Frase-âncora: *"REST é a verdade. WS é a entrega."*

- WebSocket nunca escreve lifecycle.
- Se WS cai no meio: mensagem está salva no DB, reconnect dispara `messages:sync`.
- Permite testar lifecycle com Playwright HTTP comum, sem precisar de cliente WS nos E2E críticos.
- Reduz superfície de bug: lifecycle bugs ficam no REST (debugável com curl), real-time bugs ficam no WS.

### 4.4. Infisical para Secrets Multi-Tenant (2 min)

- **Não tem `.env`.** Nenhum.
- Organização por app: `/hono-api`, `/admin`, `/web`, `/widget`.
- Scripts de dev: `infisical run --path=/hono-api -- bun run dev`.
- Dev novo entra: `infisical login` e roda — sem caçar quem tem qual key.
- Validação: `@t3-oss/env-core` + Zod em `apps/hono-api/src/env.ts`. `SKIP_ENV_VALIDATION=true` só para CI.

### 4.5. Cultura: docs por feature + folder-based routes (2 min)

> Não é decisão técnica isolada — é **convenção que sustenta o resto**.

- Toda feature em `src/features/<name>/` tem `docs/` com `.md` por regra de negócio ou decisão.
- Toda Factory tem `factory.md`.
- Rotas com >200 linhas viram folder: `routes/<name>/index.ts` + sub-módulos por concern.
- Exemplos vivos: `routes/conversations/`, `routes/webhooks/`.

> **Frase forte:** "Convenção forte é menos PR review. Quem entra no projeto sabe onde achar a regra de negócio antes de ler o código."

### Frase de transição para o Bloco 4

> "Onde isso tudo vai chegar? A visão é IA — mas não IA genérica. IA com contexto."

---

## 5. Bloco 4 — Roadmap: LLM/RAG (5 min)

### Posicionamento

> **"DeliveryChat não vai virar 'chat com bot'. Vai virar o agente conversacional da aplicação do tenant."**

### Duas fases

#### Fase LLM-1 — IA interna ao painel (operadores/admins)

Foco: **produtividade da equipe de atendimento**.

| Feature                         | Valor                                            |
| ------------------------------- | ------------------------------------------------ |
| Sugestões de resposta           | Operador vê 3 sugestões com base na conversa     |
| Resumo de conversa longa        | 50 mensagens → 3 linhas no topo (handoff rápido) |
| Busca semântica em histórico    | "Conversas sobre cancelamento esse mês"          |
| Analytics conversacional        | "Quais foram as principais reclamações?"         |

Escopo: dados **já dentro** do DeliveryChat (conversations, messages, users).

#### Fase LLM-2 — IA tenant-grounded via MCP

> **MCP (Model Context Protocol)**: protocolo emergente que permite LLMs acessarem fontes externas de forma estruturada. Cada tenant expõe suas próprias fontes — DeliveryChat consome.

**Cenário:**

> Um e-commerce usa DeliveryChat. O cliente abre o chat e pergunta: *"onde está meu pedido #12345?"* — a LLM consulta a fonte exposta pelo tenant (API de pedidos), retorna o dado **real**, formata a resposta.

**Princípios de segurança (3 slides curtos):**

1. **Tenant controla o que expõe** — read-only por padrão, granularidade nas mãos do admin do tenant. Não é "DeliveryChat lê seu banco"; é "tenant publica endpoints específicos".
2. **Contexto isolado por tenant** — credenciais por tenant, vector stores por tenant, audit por tenant. LLM nunca cruza contextos.
3. **Audit log de queries da LLM** — toda consulta feita pela IA é logada. Tenant vê tudo que foi pedido.

### Fechamento honesto

> "Para chegar lá, tem infraestrutura no caminho: **Redis** (cache + pub/sub para escalar WS horizontalmente) e **BullMQ** (filas para gerar embeddings e processar webhooks sem travar request). Não vou entrar nessas peças hoje, mas são pré-requisitos técnicos da fase LLM. O foco da visão é o **valor para o cliente** — IA que conhece a aplicação dele."

---

## 6. Q&A Cheatsheet — Perguntas Previsíveis

> Esse é seu cheatsheet pessoal. Não vai pro slide. Decora as respostas.

### Q1. "Por que WebSocket nativo e não Socket.IO?"

**R:** Socket.IO adiciona overhead — cliente próprio, polling fallback, protocolo maior. Como o widget precisa ser **embedável e leve**, optei por WS nativo com protocolo JSON simples. Reconnect é tratado manualmente, mas o código é pequeno e auditável. Trade-off: perdi compat com browsers antigos, ganhei controle total e bundle menor.

### Q2. "InMemoryRoomManager não escala — como roda em produção com múltiplas instâncias?"

**R:** Hoje é single-instance, e isso é uma decisão consciente — entregar valor primeiro com arquitetura simples e migrar quando o problema for real. O roadmap inclui Redis pub/sub: broadcasts publicam em canal Redis, todas as instâncias consomem, cada uma propaga para suas conexões locais. Migração é localizada no `RoomManager` — interface fica igual.

### Q3. "Multi-tenant em row-level é seguro? E se esquecerem um WHERE?"

**R:** Três camadas de defesa: **(1)** middleware `requireTenantAuth()` obrigatório, **(2)** services centralizam queries e recebem `organizationId` como argumento obrigatório — não opcional, **(3)** testes integrados validam isolamento. No roadmap está Row-Level Security do Postgres como quarta camada — `CREATE POLICY tenant_isolation ON ... USING (organization_id = current_setting('app.org_id'))`.

### Q4. "Por que Better Auth e não NextAuth/Clerk?"

**R:** Better Auth tem os plugins que preciso nativos: `anonymous`, `organization`, `bearer`, `emailOTP`. NextAuth amarra ao Next.js — meu backend é Hono. Clerk é fechado, paga por MAU e tem opinião forte sobre fluxo. Auth0 é overkill e caro. Better Auth é open-source, plugins compõem, e tenho controle do schema.

### Q5. "Como testa WebSocket?"

**R:** Três camadas: **(1)** unit nos handlers em `chat.handlers.ts` mockando o RoomManager, **(2)** validação de payload via Zod em `chat.schemas.ts` — payload mal formado nunca chega ao handler, **(3)** E2E Playwright real conectando no servidor `localhost:8000` para fluxos críticos. Mensagens são deterministas por contrato (`packages/types/ws-events.ts`).

### Q6. "Stripe webhooks falham — como tratam idempotência?"

**R:** Webhooks são folder-based em `routes/webhooks/`, cada event type tem handler próprio. Stripe envia `event.id` único — persistimos antes de processar, e duplicata é dropada. Pior caso (handler explode no meio): retry do Stripe encontra o evento já marcado e ignora.

### Q7. "E se o widget travar ou quebrar o site do cliente?"

**R:** Três isolamentos: **(1)** Shadow DOM — CSS não vaza bidirecional, **(2)** IIFE — só `window.DeliveryChat` é exposto, sem poluir o escopo global, **(3)** try/catch global no widget — erros são silenciados em produção, logados em dev. Pior caso: widget some, o site do cliente continua intacto.

### Q8. "Como funciona o tenant Vercel preview `[tenant]---[hash].vercel.app`?"

**R:** Lógica especial em `tenant.ts` parseia o formato — split em `---`, primeira parte é o tenant slug, segunda é o hash do deploy. Permite cada PR ter sua própria URL de preview por tenant, sem conflito.

### Q9. "Operador desconectou no meio da conversa — o que acontece?"

**R:** Hoje `assignedTo` permanece — a conversa fica "presa" com ele até voltar e clicar em "Leave" (endpoint `/leave`, devolve para fila). No roadmap, dois mecanismos: heartbeat WS detecta desconexão > N minutos e libera automaticamente, + ainda dá opção para admin reatribuir manualmente.

### Q10. "Como o Hono RPC garante type safety se backend e frontend são apps separados?"

**R:** Eles **não são separados** dentro do monorepo. `apps/hono-api/types.ts` exporta `APIType` — o admin importa esse tipo via path alias do `tsconfig.json` raiz. Como Turborepo orquestra builds, qualquer mudança na assinatura de uma rota gera erro de TypeScript no admin **antes** de qualquer deploy.

### Q11. "Anonymous plugin do Better Auth — não é problema de privacidade criar user para cada visitante?"

**R:** Sessão anônima tem TTL, e o user fica flagado `isAnonymous: true`. Pode rodar cron de cleanup periódico que remove anônimos sem atividade. Tradeoff: ganho enorme em simplicidade de código (tratamos visitante igual qualquer user) vs custo baixo em storage (registros leves, com cleanup).

### Q12. "Por que não fazer billing direto no Hono, em vez de webhooks do Stripe?"

**R:** Stripe é fonte de verdade do estado da assinatura — não dá pra calcular `trial_end` no nosso código, é o Stripe que sabe. Webhooks garantem que mudanças (cancelamento, falha de cobrança, upgrade) cheguem aqui em real-time. Side benefit: se nosso backend cair, Stripe retenta — não perdemos eventos.

---

## 7. Diagramas Sugeridos

Sugestão de 5 diagramas para os slides (Excalidraw, Mermaid, ou Figma):

### Diagrama 1 — Visão de blocos (abertura)

```
                  ┌──────────────┐
                  │   apps/web   │  Landing (Astro)
                  │   :3002      │
                  └──────────────┘

  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
  │ apps/widget  │    │ apps/admin   │    │  apps/docs   │
  │ :3001 (IIFE) │    │ :3000        │    │  :3003       │
  └──────┬───────┘    └──────┬───────┘    └──────────────┘
         │                   │
         │ Bearer + appId    │ Cookie session
         │ + WS              │ + WS + RPC
         │                   │
         └────────┬──────────┘
                  ▼
         ┌──────────────────┐
         │  apps/hono-api   │  Backend único
         │  :8000           │  REST + WS
         └────────┬─────────┘
                  │
                  ▼
          ┌───────────────┐
          │  PostgreSQL   │  Multi-tenant
          │  (Drizzle)    │  row-level
          └───────────────┘
```

### Diagrama 2 — Cascata de tenant resolution

Fluxograma vertical: `X-Tenant-Slug` → encontrou? sim → done. não → `Origin` → ... até `Host`. Caixas de "casos especiais" laterais (`localhost`, `*.vercel.app`, reservados).

### Diagrama 3 — Auth dual

(Já desenhado no Bloco 2.3) — dois caminhos coexistindo, convergindo no `c.set("auth", ...)`.

### Diagrama 4 — Lifecycle de conversation

```
   visitante envia 1ª msg
            │
            ▼
       ┌─────────┐  operador aceita  ┌─────────┐
       │ pending │ ────────────────► │ active  │
       └─────────┘                   └────┬────┘
            ▲                             │
            │ operador "leave"            │ operador "resolve"
            └─────────────────────────────┤
                                          ▼
                                     ┌─────────┐
                                     │ closed  │
                                     └─────────┘
```

### Diagrama 5 — Roadmap LLM em dependência encadeada

```
        [MVP atual]
            │
            ▼
   [Redis: cache+pubsub]──────────┐
            │                     │
            ▼                     │
   [BullMQ: filas assíncronas]    │
            │                     │
            ▼                     ▼
   ┌─────────────────────────────────┐
   │ Fase LLM-1: IA no dashboard      │
   │ (operadores/admins)              │
   └────────────┬─────────────────────┘
                ▼
   ┌─────────────────────────────────┐
   │ Fase LLM-2: IA tenant-grounded  │
   │ via MCP                          │
   └─────────────────────────────────┘
```

---

## Checklist final de preparação

- [ ] Construir os 5 diagramas (Excalidraw recomendado).
- [ ] Decorar as **frases-âncora** (estão em blockquotes ao longo do doc).
- [ ] Praticar o tour da mensagem em voz alta — cronometrar (alvo: ≤ 20 min).
- [ ] Revisar o Q&A cheatsheet — escolher 3 perguntas e treinar a resposta sem olhar.
- [ ] Preparar a demo ao vivo: signup novo tenant → embed widget → mensagem como visitante → aceitar como operador → resolver.
- [ ] Ter `apps/hono-api/src/lib/accountLifecycle.ts` aberto numa aba (se alguém pedir para ver).
- [ ] Ter `packages/docs/websocket/architecture.md` aberto (referência rápida).

---

## Listening

- **O que foi feito:** consolidação do roteiro completo em pt-br, estruturado em 4 blocos (5 + 20 + 15 + 5 min) com transições, frases-âncora, Q&A cheatsheet de 12 perguntas previsíveis e sugestão de 5 diagramas.
- **Decisões-chave:**
  - Narrativa híbrida: produto → tour de uma mensagem → decisões → roadmap.
  - Tour usa "primeiro contato anônimo" como cenário-âncora — toca ~80% das camadas críticas.
  - Estrelas do tour: Multi-tenant + Auth dual + WebSocket (com 4–5 min cada).
  - Bloco de decisões prioriza Turborepo+Hono RPC, Account Lifecycle, Hybrid REST+WS, Infisical, Cultura — equilíbrio macro/defensivo/ops/cultural.
  - Roadmap focado em LLM/RAG (2 fases) com Redis/BullMQ mencionados como pré-requisitos honestos no fechamento.
- **Alternativas consideradas:**
  - Narrativa bottom-up (foundations first) — descartada por ser ruim para juniores.
  - Cenário "onboarding completo" no tour — descartado porque pula real-time.
  - Roadmap detalhando Redis/BullMQ — descartado pelo usuário (foco em LLM como visão de produto).
- **Riscos e follow-ups:**
  - Cronometrar o tour: existe risco real de estourar 20 min se cada estrela puxar discussão.
  - Q&A pode revelar buracos sobre Redis/BullMQ — o cheatsheet cobre, mas treinar Q2/Q3 em voz alta é essencial.
  - Diagramas ainda precisam ser desenhados — recomendo Excalidraw pela rapidez.
  - Demo ao vivo é o ponto único de falha "produto" — ter um plano B (vídeo gravado) é prudente.
