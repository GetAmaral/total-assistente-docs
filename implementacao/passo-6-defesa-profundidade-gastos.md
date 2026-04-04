# Passo 6 — Defesa em Profundidade (Financeiro)

**Onde:** Sub-workflow "Financeiro - Total"
**Resolve:** PF-F3 (If4 false = dead end), PF-F2 (busca sem user_id)

---

## 6.1 — Dead End do If4 FALSE

### O Que Fazer

Conectar o output FALSE do If4 a um node Set que retorna erro.

### Como Fazer no N8N

1. Encontre o node **If4** no sub-workflow Financeiro
2. O output TRUE já está conectado ao Merge Fields (Passo 4)
3. O output FALSE está **desconectado** (dead end)
4. Adicione um novo node **Set** 
5. Nomeie como: `Erro Sem Permissao`
6. Conecte: **If4** (FALSE) → **Erro Sem Permissao**

### Campos do Set node

| Campo | Tipo | Valor |
|-------|------|-------|
| `erro` | String | `sem_permissao` |
| `mensagem` | String | `Registro não pertence a este usuário` |

---

## 6.2 — Filtro user_id no Get a row4

### O Que Fazer

Adicionar filtro de `fk_user` no node Get a row4 para buscar com escopo restrito ao usuário.

### Como Fazer no N8N

1. Encontre o node **Get a row4** (é o primeiro após o webhook entrada1)
2. Atualmente busca APENAS por `id_spent`
3. Adicione um filtro extra:

| Filtro | Campo | Condição | Valor |
|--------|-------|----------|-------|
| Existente | `id_spent` | equals | `{{ $('entrada1').item.json.body.id_gasto }}` |
| **NOVO** | `fk_user` | equals | `{{ $('entrada1').item.json.body.id_user }}` |

### Nota

Isso é defesa em profundidade. O If4 já valida propriedade, mas buscar com escopo reduzido é mais seguro — evita que o sistema sequer carregue um registro de outro usuário.

---

## Resultado Visual

```
entrada1 → Get a row4 (agora com filtro fk_user) → Get a row14 → If4
                                                                   ├─ TRUE:  → Merge Fields → Update a row → Resposta Detalhada
                                                                   └─ FALSE: → [Erro Sem Permissao] ✅ (antes: dead end)
```

---

## Verificação após Passo 6

1. Tente editar um gasto passando um id_user diferente do dono do registro
   - Esperado: resposta `{"erro":"sem_permissao","mensagem":"..."}`
   - Antes: webhook travava silenciosamente

2. Verifique nos logs que Get a row4 agora filtra por 2 campos (id_spent + fk_user)
