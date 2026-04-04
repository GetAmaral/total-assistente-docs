# Passo 6 — Verificacao Pos-DELETE

**Onde:** Sub-workflow "Calendar WebHooks - Total Assistente"
**Resolve:** ALTA-1 (sucesso retornado sem verificar se funcionou)

---

## O Que Fazer

Adicionar nodes If ENTRE o UPDATE (soft delete) e a resposta de sucesso. Verificar se a operacao realmente afetou registros.

**NOTA:** Apos o Passo 5, os nodes `delete_supabase` e `delete_supabase1` agora fazem UPDATE. Se o UPDATE nao afetou nenhum registro, o Supabase retorna array vazio `[]`. Vamos verificar isso.

---

## 6.1 — If apos delete_supabase (caminho Google)

**Acao:**
1. Desconecte `delete_supabase` de `sucesso_google2`
2. Adicione um novo node **If** entre eles
3. Nomeie como: `verificar_delete_google`
4. Posicao sugerida: [2760, 1440]
5. Conecte: `delete_supabase` → `verificar_delete_google`

**Condicao do If:**

| Campo | Valor |
|-------|-------|
| Left Value | `={{ $json.id }}` |
| Operation | `exists` |

(Se o UPDATE funcionou, o Supabase retorna o registro atualizado com `id`. Se nao afetou nada, `id` nao existe.)

6. Conecte **output TRUE** → `sucesso_google2`
7. Adicione um node **Set** para erro:
   - Nome: `erro_delete_google`
   - Posicao: [2760, 1640]
8. Conecte **output FALSE** → `erro_delete_google`

**Campos do Set node (erro):**

| Campo | Tipo | Valor |
|-------|------|-------|
| `status` | String | `erro` |
| `mensagem` | String | `falha ao excluir evento do banco de dados` |

---

## 6.2 — If apos delete_supabase1 (caminho sem Google)

**Acao:**
1. Desconecte `delete_supabase1` de `sucesso_padrao2`
2. Adicione um novo node **If** entre eles
3. Nomeie como: `verificar_delete_padrao`
4. Posicao sugerida: [1544, 1632]
5. Conecte: `delete_supabase1` → `verificar_delete_padrao`

**Condicao do If:**

| Campo | Valor |
|-------|-------|
| Left Value | `={{ $json.id }}` |
| Operation | `exists` |

6. Conecte **output TRUE** → `sucesso_padrao2`
7. Adicione um node **Set** para erro:
   - Nome: `erro_delete_padrao`
   - Posicao: [1544, 1832]
8. Conecte **output FALSE** → `erro_delete_padrao`

**Campos do Set node (erro):**

| Campo | Tipo | Valor |
|-------|------|-------|
| `status` | String | `erro` |
| `mensagem` | String | `falha ao excluir evento do banco de dados` |

---

## Resultado Visual

```
ANTES:
delete_supabase → sucesso_google2 (sempre "sucesso", mesmo se falhou)
delete_supabase1 → sucesso_padrao2 (sempre "sucesso", mesmo se falhou)

DEPOIS:
delete_supabase → verificar_delete_google
                    ├─ TRUE → sucesso_google2 ✅
                    └─ FALSE → erro_delete_google ✅

delete_supabase1 → verificar_delete_padrao
                     ├─ TRUE → sucesso_padrao2 ✅
                     └─ FALSE → erro_delete_padrao ✅
```

---

## Verificacao apos Passo 6

1. Excluir evento normalmente → deve chegar em `sucesso_google2` com dados
2. Chamar webhook com `event_id` invalido → deve chegar em `erro_delete_google`
3. AI Agent recebe `"status":"erro"` e NAO diz "Excluido com sucesso"
