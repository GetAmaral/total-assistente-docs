# Passo 4 — Branches de Erro (Dead Ends)

**Onde:** Sub-workflows "Calendar WebHooks" e "Financeiro - Total"
**Resolve:** ALTA-3 (falha silenciosa quando registro nao existe)

---

## O Que Fazer

Adicionar nodes Set nos branches FALSE dos IFs que hoje nao tem saida. Quando algo nao e encontrado, o webhook deve responder com erro em vez de travar.

---

## 4.1 — Financeiro: branch FALSE do If7

**Contexto:** `If7` verifica se `name_spent` existe. Se NAO existe (registro nao encontrado), hoje o webhook trava sem resposta.

**Como encontrar:** Node If na posicao [-1520, 1168].

**Acao:**
1. Adicione um novo node **Set** ao lado do `If7`
2. Nomeie como: `erro_nao_encontrado`
3. Posicao sugerida: [-1520, 1368] (200px abaixo do If7)
4. Conecte: **If7 output FALSE** (saida inferior) → `erro_nao_encontrado`

**Campos do Set node:**

| Campo | Tipo | Valor |
|-------|------|-------|
| `status` | String | `erro` |
| `mensagem` | String | `registro nao encontrado ou nao pertence ao usuario` |

5. Salve

Como `responseMode` do webhook `excluir` e `lastNode`, essa resposta volta automaticamente.

---

## 4.2 — Financeiro: branch FALSE do If

**Contexto:** O node `If` (posicao [-1120, 1104]) compara `profile.id` com `fk_user`. Se nao bater, hoje o fluxo para.

**Acao:**
1. Adicione um novo node **Set** ao lado do `If`
2. Nomeie como: `erro_permissao`
3. Posicao sugerida: [-1120, 1304] (200px abaixo do If)
4. Conecte: **If output FALSE** → `erro_permissao`

**Campos do Set node:**

| Campo | Tipo | Valor |
|-------|------|-------|
| `status` | String | `erro` |
| `mensagem` | String | `permissao negada: usuario nao e dono deste registro` |

---

## 4.3 — Calendar WebHooks: validar evento apos Get a row

**Contexto:** O node `Get a row` (posicao [352, 1456]) busca o evento com `id + user_id`. Se nao encontrar, o fluxo continua com dados vazios.

**Acao:**
1. Desconecte `Get a row` de `buscar_conexao_user2`
2. Adicione um novo node **If** entre eles
3. Nomeie como: `validar_evento_existe`
4. Posicao sugerida: [460, 1456]
5. Conecte: `Get a row` → `validar_evento_existe`

**Condicao do If:**

| Campo | Valor |
|-------|-------|
| Left Value | `={{ $json.event_name }}` |
| Operation | `exists` |

6. Conecte **output TRUE** → `buscar_conexao_user2`
7. Adicione um novo node **Set** para o erro
8. Nomeie como: `erro_evento_nao_encontrado`
9. Posicao sugerida: [460, 1656] (200px abaixo)
10. Conecte **output FALSE** → `erro_evento_nao_encontrado`

**Campos do Set node (erro):**

| Campo | Tipo | Valor |
|-------|------|-------|
| `status` | String | `erro` |
| `mensagem` | String | `evento nao encontrado ou nao pertence ao usuario` |

**NOTA:** Pode ser necessario mover `buscar_conexao_user2` 100px pra direita para encaixar o novo If.

---

## Resultado Visual

**Financeiro:**
```
excluir → Get a row6 → If7
                         ├─ TRUE → Get a row → If
                         |                      ├─ TRUE → Delete a row → Redis7
                         |                      └─ FALSE → [erro_permissao] ✅
                         └─ FALSE → [erro_nao_encontrado] ✅
```

**Calendar WebHooks:**
```
Webhook → Edit Fields4 → Get a row → [validar_evento_existe] ✅
                                        ├─ TRUE → buscar_conexao_user2 → ...
                                        └─ FALSE → [erro_evento_nao_encontrado] ✅
```

---

## Verificacao apos Passo 4

1. Chamar `/excluir-supabase` com `id_gasto` inexistente → deve retornar `{"status":"erro","mensagem":"registro nao encontrado..."}`
2. Chamar `/excluir-evento-total` com `event_id` inexistente → deve retornar `{"status":"erro","mensagem":"evento nao encontrado..."}`
3. Exclusoes normais continuam funcionando sem mudanca
