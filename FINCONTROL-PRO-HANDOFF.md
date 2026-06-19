# FINCONTROL PRO — DOCUMENTO DE HANDOFF PARA CLAUDE CODE

---

## INSTRUÇÕES PARA CLAUDE

Você é o assistente de desenvolvimento do FinControl Pro, atuando agora diretamente no VS Code via Claude Code, com acesso de leitura/escrita ao repositório e capacidade de fazer commit e push para o GitHub.

Renzo é leigo em programação — sempre explique de forma simples o que está fazendo e por quê. Ao aplicar mudanças, faça commit e push automaticamente (a menos que ele peça para revisar antes). Após cada mudança no banco de dados (migrations), informe explicitamente o SQL que precisa ser executado manualmente no Supabase SQL Editor, pois migrations não são auto-aplicadas.

---

## IDENTIDADE DO PROJETO

- **Sistema**: FinControl Pro — sistema financeiro multi-tenant
- **Stack**: React + Vite + TypeScript + Express + Supabase (Postgres + RLS) + Vercel
- **URL produção**: sistema-financeiro-thjz.vercel.app
- **Supabase**: uiekbavvgvrcsmbvoqtt.supabase.co (projeto: FincontrolePRO New)
- **Owner**: renzo.braz@grupolider.com.br
- **Organização**: Grupo Líder (ID: 514c6483-24ac-44f5-82e2-eeeeb99eeccc)
- **Carteira principal**: Renzo Braz (wallet_id: 96f5dbcf-290c-421e-9c01-eca09352dfee)
- **Repositório local**: C:\Users\renzo\OneDrive\GitHub\SistemaFinanceiro
- **Ambiente de dev**: VS Code + Claude Code (Windows)

## WORKFLOW DE DESENVOLVIMENTO ATUAL

Renzo passou a usar Claude Code diretamente no VS Code (saiu do fluxo Claude Chat → AI Studio). O fluxo agora é:
1. Diagnostica e aplica mudanças diretamente no código
2. Faz commit e push para o GitHub
3. Vercel faz o deploy automático
4. Testa em produção e reporta resultados/erros com prints e logs do console do navegador
5. Para erros de servidor, usa o Vercel Dashboard → Logs (filtrar por path do endpoint)

---

## ARQUITETURA TÉCNICA

### Estrutura de arquivos relevante:
```
api/
  server.ts          ← endpoint principal (roda como serverless function no Vercel)
  prices.ts
services/
  geminiService.ts   ← parser regex de notas de corretagem E fatura PDF (legado)
  financeService.ts  ← camada de acesso a dados (Supabase), getRegistry, createManyTransactions, etc.
  cardStatementService.ts  ← extractStatementAnchors, extractStatementWithAI, reconcileStatement (fluxo PDF)
  reconciliationService.ts ← reconcileStatementWithPayables, resolveCanonicalName, findCandidates
components/
  CreditCardImport.tsx      ← tela de importação de fatura (PDF e CSV)
  ParticipantAutocomplete.tsx ← componente reutilizável de busca/cadastro de participante
  TransactionForm.tsx       ← modal de Novo Lançamento (autocomplete de participante original)
  Auth.tsx                  ← login/cadastro, mensagens de erro traduzidas
  AcceptInvite.tsx
types.ts              ← todas as interfaces TypeScript (Transaction, MerchantAlias, CardStatement, etc.)
package.json
vercel.json            ← rewrites: /api/(.*) → /api/server
supabase/migrations/    ← migrations versionadas (parcial — RLS não está versionado)
```

### ⚠️ ARMADILHA CRÍTICA DO VERCEL — NÃO REPETIR
O `api/server.ts` roda como **função serverless isolada**. Imports relativos para fora da pasta `api/` (ex: `../services/geminiService`) **falham em produção** com `ERR_MODULE_NOT_FOUND`, mesmo funcionando perfeitamente em dev local. 

**Regra**: qualquer função usada dentro de `api/server.ts` que precise rodar no servidor deve estar **definida inline no próprio arquivo**, não importada de `services/`. Isso já foi corrigido para o parser de fatura — o código do parser está fisicamente dentro de `api/server.ts`. Cuidado ao adicionar novas funcionalidades de servidor.

### Multi-tenant / RLS:
- Toda tabela tem `organization_id`
- Função `check_is_org_admin(uuid, uuid)` — SECURITY INVOKER, search_path fixo (corrigido em 18/06)
- Soft delete via `deleted_at`
- Migrations do schema **não estão versionadas no repo** — políticas RLS existem só no Supabase Dashboard. Se precisar auditar: 
  ```sql
  SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies WHERE tablename IN ('organizations', 'organization_members') ORDER BY tablename, policyname;
  ```

---

## MÓDULO: IMPORTAÇÃO DE FATURA DE CARTÃO — STATUS ATUAL (CONCLUÍDO E FUNCIONAL)

### Dois fluxos de extração coexistem:

**Fluxo CSV (RECOMENDADO, robusto, em uso):**
- Usuário exporta CSV do app Itaú (3 colunas: `data,lançamento,valor`)
- Endpoint: `POST /api/parse-fatura-csv` (lógica inline em `api/server.ts`)
- Parser: extrai parcela do nome (`YDUQS 03/06` → parcela 3 de 6), trata estornos (valores negativos), ignora linha `PAGAMENTO EFETUADO` (pagamento da fatura anterior, não é lançamento)
- **Esse é o caminho confiável.** PDF tem problemas de extração não totalmente resolvidos (ver abaixo).

**Fluxo PDF (parcialmente funcional, fallback de IA DESATIVADO):**
- Testamos `pdf-parse 2.4.5` (quebra com `DOMMatrix is not defined` no Vercel), `pdf-parse 1.1.1` (só extrai 1ª página em alguns PDFs), `pdf2json` (fragmenta acentos), `pagerender` customizado (parcialmente funcional, extrai todas as páginas mas regex de âncoras às vezes falha)
- Endpoint: `POST /api/parse-fatura-cartao`
- **O fallback de IA foi DESATIVADO propositalmente** em `CreditCardImport.tsx` para forçar o diagnóstico do parser regex em vez de mascarar erros. Isso significa que **hoje, se o usuário envia um PDF e o regex falha, a importação simplesmente quebra com erro, sem fallback**. Isso precisa ser decidido: ou conserta-se definitivamente o parser de PDF, ou reativa-se o fallback de IA como rede de segurança (ver pendências).

### Algoritmo do parser CSV (`api/server.ts`, dentro de `/api/parse-fatura-csv`):
1. Pula cabeçalho, itera linhas
2. Ignora `PAGAMENTO EFETUADO`/`PAGAMENTO RECEBIDO`/`CREDITO DE PAGAMENTO`
3. Extrai parcela via regex `\s*(\d{2})\/(\d{2})\s*$` no nome do estabelecimento
4. `valor = Math.abs(l.valor)` sempre positivo; `e_estorno = valor < 0` (do valor original antes do abs)
5. Total da fatura = soma de `Math.abs()` de todos os itens (NÃO subtrai estornos — o total impresso da fatura já é bruto)

### Fluxo de reconciliação (`reconciliationService.ts` + `CreditCardImport.tsx`):
Status possíveis por item: `MATCHED`, `UNCERTAIN`, `NEW`
- **MATCHED**: candidato único e óbvio no Contas a Pagar
- **UNCERTAIN** (renomeado na UI para "LANÇAMENTOS CONTAS A PAGAR LOCALIZADOS"): múltiplos candidatos possíveis (ex: várias parcelas de uma compra parcelada) — usuário escolhe qual, ou "Nenhum — tratar como novo", ou "Não lançar (ignorar este item)"
- **NEW** (renomeado na UI para "GASTOS A SEREM LANÇADOS"): sem candidato no Contas a Pagar — checkbox "Criar lançamento" (default true)

### Confirmação (`handleConfirmImport` em `CreditCardImport.tsx`):
- **LOCALIZADOS com candidato selecionado** → dar baixa no lançamento existente (`status: 'PAID'`, `paymentDate: dueDate`, `bankId: selectedBankId`)
- **GASTOS marcados + LOCALIZADOS "Nenhum"** → criar novo lançamento como `PAID` na movimentação, com `date: dueDate` (data de **vencimento da fatura**, não a data de compra)
- **Parcelas futuras**: se item tem `installmentNumber`/`installmentTotal` e checkbox marcado, gera as parcelas restantes como `PENDING` no Contas a Pagar, com datas calculadas via `addMonths(purchaseDate, i)` a partir da **data de compra** (não da data de vencimento)
- Itens com "Não lançar" são pulados (`ignoredItems[index]`)
- `importBatchId` único é gerado e salvo em todos os lançamentos criados + no `localStorage` para permitir desfazer

### Campos obrigatórios na tela de upload:
1. Conta do Cartão (`selectedBankId`)
2. Carteira (`selectedWalletId`) — adicionado para resolver bug de lançamentos indo para carteira errada
3. Data de Vencimento da Fatura (`dueDate`) — usada como data de pagamento na baixa/criação

### Desfazer importação:
- Coluna `import_batch_id` (TEXT) na tabela `transactions` (migration: `supabase/migrations/add_import_batch_id.sql`)
- Endpoint `DELETE /api/import-batch/:batchId`
- Banner âmbar na tela de upload mostra última importação com botão "Desfazer" (lê do `localStorage`)
- **Limitação atual**: só guarda a ÚLTIMA importação no localStorage — não há histórico de múltiplas importações desfazíveis

### Merchant Alias Auto-Learning:
- Tabela `merchant_aliases`: `raw_pattern`, `canonical_name`, `default_category_id`, `default_cost_center_id`, `default_participant_id` (coluna nova, migration: `supabase/migrations/add_merchant_alias_participant.sql`)
- `financeService.saveMerchantAlias()` — upsert por `raw_pattern` + `organization_id`
- No `handleConfirmImport`, para cada item com categoria/CC/participante preenchidos, salva/atualiza o alias automaticamente
- Na importação seguinte, aliases pré-preenchem esses campos automaticamente
- **Ainda não testado em produção pelo Renzo** — primeira validação pendente

### Componente ParticipantAutocomplete (`components/ParticipantAutocomplete.tsx`):
- Extraído do padrão usado em `TransactionForm.tsx`
- Dropdown `position: fixed`, largura mínima 280px, virtualização via `react-window`
- Botão "+ Cadastrar Novo: 'nome'" quando não há match exato
- Lista local (`localParticipants`) atualizada via `setLocalParticipants(prev => [...prev, newP])` imediatamente após cadastro — sem precisar recarregar a página
- Usado em 2 lugares no `CreditCardImport.tsx`: itens NEW e itens UNCERTAIN com candidato = 'NEW'

### Layout da tela de revisão:
- Card "RESUMO DA FATURA": total da fatura, total localizados (baixa), total gastos a lançar, total conferido com ✅/⚠️
- Barra "Ações em massa" no topo: selecionar/desmarcar todos gastos, ignorar/restaurar todos localizados, gerar/remover parcelas futuras em todos
- Campos por item (NEW e UNCERTAIN-como-novo): Descrição (editável) → grid 2 colunas (Categoria | Centro de Custo) → linha própria (Participante, largura total) → checkbox parcelas futuras

---

## PENDÊNCIAS ABERTAS

### 🔴 Alta prioridade

**1. Decidir o destino do fluxo PDF**
Hoje, se o usuário tentar importar PDF, o parser regex pode falhar e NÃO há fallback de IA (foi desativado deliberadamente para diagnóstico, nunca reativado). Duas opções:
- (a) Reativar o fallback de IA em `CreditCardImport.tsx` como rede de segurança — trecho desativado estava em torno de `setProgressMsg('Analisando com IA (fallback)...')`, substituído por um `throw new Error` que expõe o erro do regex diretamente
- (b) Investir mais tempo para tornar o parser de PDF tão confiável quanto o de CSV (usar a mesma técnica de "âncoras de total por cartão" que funciona bem no CSV)
- **Recomendação**: reativar fallback de IA é mais rápido; o CSV já é o caminho preferencial e funcional

**2. Importação parcial / múltiplas importações da mesma fatura**
Hoje, importar o mesmo CSV duas vezes gera duplicatas. Não há checagem de "este item já foi importado antes". Necessário se Renzo quiser importar uma fatura em etapas (ex: revisar metade hoje, metade amanhã).

**3. Histórico de importações desfazíveis**
Atualmente só a última importação pode ser desfeita (via `localStorage`). Se for feita uma nova importação, a anterior se torna irreversível pela UI (ainda dá pra fazer DELETE manual no Supabase usando o `import_batch_id`, mas não há UI para isso).

### 🟡 Média prioridade

**4. Testar Merchant Alias Auto-Learning em produção**
Implementado mas não validado pelo usuário ainda. Validar: importar CSV, preencher categoria/CC/participante em alguns itens, confirmar, importar o MESMO CSV de novo, verificar se os campos vêm pré-preenchidos.

**5. Suporte a outros bancos além do Itaú**
Tanto o parser CSV quanto o de PDF são específicos do formato Itaú. Se Renzo quiser importar faturas Nubank, Bradesco, etc., será necessário um parser específico por banco (a arquitetura já prevê isso — "Parser regex específico por emissor" estava no planejamento original).

**6. ~~Diferença de centavos no total conferido~~** — ✅ Resolvido: estornos estão entrando como crédito corretamente, diferença não ocorre mais.

### 🟢 Concluído recentemente (18/06/2026) — não retrabalhar

- ✅ Parser CSV Itaú funcional, total bate corretamente
- ✅ Fluxo completo de baixa no Contas a Pagar + criação na movimentação bancária
- ✅ Geração automática de parcelas futuras
- ✅ Campo Carteira e Data de Vencimento adicionados à tela de importação
- ✅ Desfazer importação (último batch)
- ✅ Opção "Não lançar" para ignorar itens
- ✅ Merchant alias auto-learning (implementado, aguardando teste)
- ✅ ParticipantAutocomplete extraído como componente reutilizável, com largura/exibição corrigidas
- ✅ Card de Resumo da Fatura com totais
- ✅ Renomeação de seções: "INCERTOS" → "LANÇAMENTOS CONTAS A PAGAR LOCALIZADOS", "NOVOS" → "GASTOS A SEREM LANÇADOS"
- ✅ Logs de debug removidos de `api/server.ts`
- ✅ Parser de nota de corretagem (`parseItauNoteWithRegex`) corrigido para formato compacto do pdf-parse (19/06)
- ✅ Fallback de IA reativado para importação de fatura PDF: regex → Claude → Gemini → erro (19/06)
- ✅ Detecção de reimportação acidental do mesmo CSV (hash FNV-1a + aviso âmbar) (19/06)
- ✅ Histórico de importações desfazíveis expandido para últimas 5 (19/06)
- ✅ Merchant Alias Auto-Learning validado em produção; bug de regex escaping corrigido (19/06)
- ✅ Arquivo órfão `Auth-SurfaceRenzo.tsx` removido (19/06)
- ✅ Alertas de segurança do Supabase corrigidos (`search_path` mutável e `SECURITY DEFINER` exposto publicamente em `check_is_org_admin`)
- ✅ Mensagens de erro de autenticação traduzidas para PT-BR em `Auth.tsx`

### ⚪ Pendências antigas (do handoff anterior, ainda não confirmadas)

**7. Bug RLS organizations/organization_members**
O bug original suspeitado (`om.organization_id = om.id`) **NÃO foi encontrado** na auditoria de 18/06 — as políticas atuais parecem corretas. Considerar resolvido, mas reabrir se houver sintomas de cross-tenant leakage.

**8. Bug da data -1 dia no cabeçalho (importação de notas de corretagem)**
Não relacionado à fatura de cartão — é do módulo de notas SINACOR. Prioridade baixa, não afeta dados salvos.

**9. PDF parsing do módulo de notas de corretagem (parser separado, não confundir com fatura)**
`parseItauNoteWithRegex()` em `services/geminiService.ts` — **corrigido em 19/06**. O `pdf-parse` colapsa espaços entre colunas da tabela SINACOR, então o regex antigo (que esperava `\s+` entre campos) nunca batia. O novo parser suporta dois formatos: legado (com espaços) e compacto (sem espaços, campos colados). Para o formato compacto, separa no char de obs (`@#*`) e decompõe os números de trás pra frente: total → preço → quantidade. Testado e funcionando em produção.

---

## CONTEXTO TÉCNICO IMPORTANTE

### Supabase:
- Multi-tenant via `organization_id` em todas as tabelas
- RLS com função `current_tenant_id()` (módulo de portfólio) e `check_is_org_admin()` (módulo de organização)
- Soft delete via `deleted_at`
- **Migrations não são auto-aplicadas** — sempre executar manualmente no SQL Editor após o Claude Code criar um arquivo de migration

### Frontend:
- `financeService.getRegistry<T>(type)` → busca qualquer tabela com cache localStorage
- Mapeamento automático snake_case (banco) ↔ camelCase (TS) via funções `mapXFromDb`/`mapXToDb` em `financeService.ts`
- Permissões granulares por módulo e por carteira

### Variáveis de ambiente relevantes (Vercel):
- `ANTHROPIC_API_KEY` — usada para o fallback de IA (Claude) na extração de PDF. **Atenção: histórico de créditos esgotados nesta API durante a sessão** — verificar saldo em console.anthropic.com antes de reativar qualquer fluxo que dependa dela
- `SUPABASE_SERVICE_ROLE_KEY` — usada para convites (`generateLink`)
- Variáveis do Gemini — usadas no parser de notas de corretagem (não relacionado à fatura)

---

## COMO COLABORAR DAQUI PRA FRENTE

1. Ao identificar um problema, **diagnostique antes de propor código** — Renzo vai querer entender o "porquê"
2. Para mudanças de banco, **gere o SQL e peça para ele rodar manualmente** no Supabase SQL Editor — nunca assuma que foi aplicado automaticamente
3. Ao testar, peça **prints de tela + console do navegador (F12)** ou **logs do Vercel** filtrados pelo endpoint relevante
4. Cuidado redobrado com imports em `api/server.ts` — tudo que precisa rodar no servidor deve estar inline nesse arquivo, não importado de `services/`
5. Sempre que mexer no fluxo de importação de fatura, teste mentalmente os três caminhos: MATCHED, UNCERTAIN (com e sem candidato) e NEW — e lembre que parcelas futuras têm lógica de data diferente da baixa imediata
