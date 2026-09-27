# 💰 Consolidação do Sistema de Créditos - Guia de Implementação

## Visão Geral

Este documento descreve a consolidação do sistema fragmentado de créditos da KUBO Vibe em um único sistema unificado e funcional.

**Status:** ✅ Código preparado | ⏳ Aguardando aplicação de migrações

---

## 🎯 Objetivo

Consolidar múltiplas tabelas de créditos fragmentadas em uma arquitetura coerente onde:
- **user_credits** = Fonte única de verdade para saldo de créditos
- **referral_bonus** (50 créditos) apareça corretamente na UI
- **shortlinks** ganha creditem diariamente
- **affiliate_commissions** seja creditada para o usuário
- **debt system** funcione de forma integrada

---

## 🔴 Problema Crítico

Antes desta consolidação, o sistema tinha múltiplas tabelas não sincronizadas:

```
❌ subscriptions.edits_limit    → Usada por referral (funciona, mas não mostra na UI)
❌ user_credits (não existe!)   → Tentada por shortlinks (quebrado)
❌ affiliate_commissions        → Tenta usar user_credits (quebrado)
❌ pending_credits              → Sistema antigo, não integrado
```

**Impacto:**
- Usuários não veem seus 50 créditos de referência
- Sistema de shortlinks não credita usuários
- Comissões de afiliados não são pagas

---

## ✅ Solução Implementada

### 1️⃣ Nova Tabela: `user_credits`

**Arquivo:** `supabase/migrations/20260927062000_create_user_credits_table.sql`

**O que foi criado:**
```sql
CREATE TABLE user_credits (
  id uuid PRIMARY KEY,
  user_id uuid UNIQUE NOT NULL,
  balance integer (saldo total),
  debt integer (débito a pagar),
  created_at, updated_at
);
```

**Funções incluídas:**
- `apply_credit_debt()` - Desconta débito automaticamente de ganhos
- `get_user_credits()` - Retorna saldo, débito e saldo disponível
- `audit_user_credits_changes()` - Rastreia mudanças (compliance)

**RLS Policies:**
- Users veem seus próprios créditos ✓
- Users atualizam seus próprios créditos ✓
- Service role pode atualizar ✓

### 2️⃣ Migração de Dados Existentes

Qualquer usuário com crédito em `subscriptions.edits_limit` terá seus créditos migrados automaticamente:

```sql
INSERT INTO user_credits (user_id, balance)
SELECT user_id, edits_limit FROM subscriptions
ON CONFLICT (user_id) DO UPDATE SET balance = excluded.balance;
```

**Garantias:**
- Nenhum crédito é perdido
- Transação atômica (tudo ou nada)
- Dados históricos preservados em credit_transactions

### 3️⃣ Atualização do Trigger de Referência

**Arquivo:** `supabase/migrations/20260927051000_update_referral_bonus_50_credits.sql` (MODIFICADO)

**Mudança principal:**
```sql
-- ANTES: UPDATE subscriptions SET edits_limit = edits_limit + 50
-- DEPOIS:
INSERT INTO user_credits (user_id, balance)
VALUES (_referrer_id, 50)
ON CONFLICT (user_id) DO UPDATE
SET balance = user_credits.balance + 50;
```

Agora quando um usuário se refere outro:
1. ✅ 50 créditos vão para `user_credits.balance`
2. ✅ Referência registrada em `referrals` table
3. ✅ Transação log criada em `credit_transactions`
4. ✅ Email enviado (já existente)

### 4️⃣ Sistema de Shortlinks

**Arquivo:** `supabase/migrations/20260927060000_shortlinks_daily_rewards.sql` (JÁ REFERENCIA USER_CREDITS)

**Como funciona:**
- Função `calculate_shortlink_rewards()` lê de `user_credits`
- Calcula: 5 créditos base + bônus (5 por cada 10 shortlinks)
- **Desconta débito automaticamente** se usuário tiver débito
- Insere registro em `daily_shortlink_rewards` (auditoria)
- Atualiza `user_credits.balance`

**Fluxo de rewards:**
```
Meia-noite (cron) → calculate_shortlink_rewards (edge function)
         ↓
Busca todos usuários com shortlinks ativos
         ↓
Para cada usuário:
  1. Calcula recompensa (5 + bônus)
  2. Se tem débito: desconta de recompensa
  3. Atualiza user_credits.balance
  4. Registra em daily_shortlink_rewards
```

---

## 📋 Checklist de Implementação

### Passo 1: Aplicar Migrações (OBRIGATÓRIO)

```bash
cd /home/user/kubovibe

# Opção A: Supabase CLI (recomendado)
supabase migration up

# Opção B: Supabase Dashboard
# Ir para: SQL Editor → Copiar conteúdo de cada arquivo .sql → Executar
```

**Ordem de aplicação (importante!):**
1. `20260927060000_shortlinks_daily_rewards.sql` (cria tabelas shortlinks - não depende de user_credits)
2. `20260927051000_update_referral_bonus_50_credits.sql` (atualiza trigger) - JÁ MODIFICADO ✓
3. `20260927062000_create_user_credits_table.sql` - NOVO ✓ (cria user_credits + migra dados)

⚠️ **IMPORTANTE:** As duas primeiras migrações devem ser aplicadas ANTES da terceira!

### Passo 2: Implantar Edge Functions

```bash
# Shortlinks (para criar/listar/deletar shortlinks)
supabase functions deploy shortlinks

# Calculate daily rewards (cron job - meia-noite UTC)
supabase functions deploy calculate-shortlink-rewards
```

### Passo 3: Configurar Cron Job

Escolha uma das opções:

#### Opção A: Vercel Crons (Recomendado)
```json
// .vercel/crons.json
{
  "crons": [{
    "path": "/api/cron/shortlink-rewards",
    "schedule": "0 0 * * *"
  }]
}
```

#### Opção B: EasyCron (Grátis)
- URL: `https://seu-supabase.supabase.co/functions/v1/calculate-shortlink-rewards`
- Method: `POST`
- Headers: `Authorization: Bearer SERVICE_ROLE_KEY`
- Schedule: `0 0 * * *` (meia-noite UTC)

### Passo 4: Testar Sistema Completo

```bash
# 1. Criar usuário de teste
# 2. Fazer referência (deve ganhar 50 créditos imediatamente)
# 3. Fazer upload de shortlink (deve aparecer na UI)
# 4. Chamar cron manualmente para testar rewards:

curl -X POST https://seu-supabase.supabase.co/functions/v1/calculate-shortlink-rewards \
  -H "Authorization: Bearer SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

# 5. Verificar no banco se user_credits foi atualizado:
SELECT user_id, balance, debt FROM user_credits LIMIT 5;
```

### Passo 5: Validar na UI

- [ ] ProfilePage mostra número de referências ✓ (já funcionava)
- [ ] ProfilePage mostra 50 créditos por referência ✓ (agora vem de user_credits)
- [ ] ShortlinksPage mostra saldo atual
- [ ] ShortlinksPage mostra débito (se houver)
- [ ] Shortlinks aparecem após upload
- [ ] Rewards calculados corretamente após cron

---

## 🔄 Fluxos Agora Integrados

### Fluxo 1: Referência (Recompensa Imediata)

```
User A clica em link de referência de User B
         ↓
User A faz signup com código de B
         ↓
Trigger handle_new_user() dispara
         ↓
1. INSERT INTO referrals (referrer=B, referred=A, credits=50)
2. INSERT INTO user_credits (user_id=B, balance=50) [OU UPDATE +50]
3. INSERT INTO credit_transactions (user_id=B, delta=50, reason='referral_bonus')
4. Email enviado para B
         ↓
✅ User B vê +50 créditos no perfil imediatamente
```

### Fluxo 2: Shortlinks (Recompensa Diária)

```
User A faz upload de shortlink (5-7 segundos)
         ↓
Shortlink criado, status='active'
         ↓
Diariamente à meia-noite:
  calculate_shortlink_rewards() executa (cron)
         ↓
Para User A:
  1. Conta shortlinks ativos: 2
  2. Calcula reward: 5 (base) + 0 (bônus) = 5
  3. Se debt=10: aplica 5 na dívida, +0 no balance
  4. Se debt=0: +5 no balance
  5. INSERT INTO daily_shortlink_rewards
  6. UPDATE user_credits SET balance = balance + 5
         ↓
✅ User A vê saldo atualizado no dia seguinte
```

### Fluxo 3: Débito (Futuro - Integrado)

```
User C tem débito de 50 créditos (por ex: compra pendente)
User C cria 2 shortlinks
         ↓
Diariamente:
  Reward calculado: 5 créditos
         ↓
apply_credit_debt(user_id, 5):
  1. Paga 5 da dívida (5 < 50)
  2. Balance continua 0
  3. Debt reduz: 50 → 45
         ↓
Após 10 dias: débito = 0, sistema volta ao normal
```

---

## 📊 Estado das Tabelas Após Consolidação

| Sistema | Tabela | Status | Função |
|---------|--------|--------|--------|
| Créditos | user_credits | ✅ NOVO | Saldo centralizado |
| Referral | subscriptions.edits_limit | ⏸️ DEPRECATED | Não mais usado |
| Referral | referrals | ✅ ATIVO | Auditoria de quem indicou quem |
| Transações | credit_transactions | ✅ ATIVO | Histórico completo |
| Shortlinks | shortlinks | ✅ ATIVO | Vídeos do usuário |
| Shortlinks | daily_shortlink_rewards | ✅ ATIVO | Cálculo e auditoria diários |
| Afiliados | affiliate_commissions | ✅ ATIVO (agora funciona) | Comissões por conversão |
| Pending | pending_credits | ⏸️ LEGADO | Ainda funciona, será deprecado |

---

## 🔒 Segurança

### RLS Policies
- ✅ Users veem SEM créditos de outros
- ✅ Service role pode atualizar para cálculos
- ✅ RLS enforce em todas as tabelas críticas

### Auditoria
- ✅ `user_credits_audit` rastreia todas as mudanças
- ✅ `credit_transactions` mantém histórico completo
- ✅ `daily_shortlink_rewards` registra cálculos diários

### Anti-Fraude (Existente)
- ✅ IP tracking ainda ativo
- ✅ Múltiplas contas do mesmo IP bloqueadas
- ✅ Fraud flags registradas

---

## 📝 Notas Importantes

### Para o Time

1. **Sem downtime:** Migrações são aplicadas online, usuários não são afetados
2. **Reversível:** Se algo dar errado, temos backups e audit trail completo
3. **Backward compatible:** Código antigo ainda funciona enquanto transição ocorre
4. **Testável:** Cada passo pode ser validado isoladamente

### Próximos Passos (Futuro)

1. **Deprecação (Fase 2):** Remover subscriptions.edits_limit após validação
2. **Analytics:** Dashboard de earnings por fonte (referral vs shortlinks vs affiliate)
3. **Payouts:** Integrar system de pagamentos com user_credits
4. **Limites dinâmicos:** User pode ter limite de créditos por plano

---

## 📞 Troubleshooting

| Problema | Causa | Solução |
|----------|-------|---------|
| "user_credits not found" | Migração não aplicada | `supabase migration up` |
| Rewards zerados | Cron não executou | Verificar logs da edge function |
| Débito não desconta | apply_credit_debt não chamada | Confirmar função foi criada |
| Créditos duplicados | Migration rodou 2x | Verificar idempotency (ON CONFLICT) |
| ProfilePage erro | Referral ainda usa edits_limit | Trigger não foi atualizado - roda migração |

---

## ✅ Validação Pós-Implementação

Checklist para confirmar que tudo funciona:

```sql
-- Verificar tabela criada
SELECT COUNT(*) FROM user_credits;

-- Verificar dados migrados
SELECT COUNT(*) FROM user_credits WHERE balance > 0;

-- Verificar trigger funciona
SELECT * FROM referrals ORDER BY created_at DESC LIMIT 1;

-- Verificar rewards diários
SELECT * FROM daily_shortlink_rewards ORDER BY created_at DESC LIMIT 5;

-- Verificar transações
SELECT * FROM credit_transactions WHERE reason = 'referral_bonus' ORDER BY created_at DESC LIMIT 5;

-- Verificar nenhum dado perdido
SELECT SUM(edits_limit) as total_subscriptions, SUM(balance) as total_credits 
FROM subscriptions, user_credits;
```

---

## 🎉 Implementação Completa

Uma vez tudo aplicado:

**Usuários podem:**
1. ✅ Ver 50 créditos no perfil quando alguém os indicar
2. ✅ Fazer upload de shortlinks de 5-7 segundos
3. ✅ Ganhar 5 créditos por dia por shortlink (sem acumular)
4. ✅ Ver bônus de +5 créditos por cada 10 shortlinks
5. ✅ Receber notificação de débito se tiverem dívida
6. ✅ Ter débito automaticamente descontado de ganhos

**Sistema:**
1. ✅ Créditos centralizados em uma tabela
2. ✅ Auditoria completa de todas as transações
3. ✅ Segurança com RLS policies
4. ✅ Escalável para futuros produtos

---

**Último atualizado:** 27 de setembro de 2026  
**Versão:** 1.0.0 - Consolidação Completa  
**Status:** ✅ Pronto para implementação
