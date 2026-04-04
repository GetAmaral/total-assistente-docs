# Passo 4 — Merge Fields (Financeiro)

**Onde:** Sub-workflow "Financeiro - Total"
**Resolve:** PF-F1 (UPDATE destrói campos vazios — defesa backend)

---

## O Que Fazer

Inserir um node **Code** chamado "Merge Fields" entre o **If4** (TRUE) e o **Update a row**.

Este node garante que campos não alterados pelo usuário mantenham o valor original do banco, mesmo que o Agent envie "" (string vazia).

---

## Como Fazer no N8N

1. Abra o sub-workflow "Financeiro - Total"
2. Encontre a conexão: **If4** (TRUE) → **Update a row**
3. Desconecte essa ligação
4. Adicione um novo node **Code** (JavaScript) entre eles
5. Nomeie como: `Merge Fields`
6. Cole o código abaixo
7. Conecte: **If4** (TRUE) → **Merge Fields** → **Update a row**

---

## Código do Merge Fields

Cole este código no node Code:

```javascript
// Merge Fields — Protege campos contra sobrescrita por string vazia
// Resolve: PF-F1 (UPDATE destrói campos vazios)

const body = $('entrada1').item.json.body;
const original = $('Get a row4').item.json;

// Para cada campo: se o body trouxe valor real (não vazio), usa o novo.
// Se trouxe "" ou null/undefined, preserva o valor original do banco.

function preservar(novoValor, valorOriginal) {
  if (novoValor !== null && novoValor !== undefined && String(novoValor).trim() !== "") {
    return String(novoValor);
  }
  return valorOriginal;
}

const resultado = {
  name_spent:       preservar(body.novo_nome, original.name_spent),
  value_spent:      preservar(body.novo_valor, original.value_spent),
  date_spent:       preservar(body.nova_data, original.date_spent),
  category_spent:   preservar(body.nova_categoria, original.category_spent),
  type_spent:       preservar(body.novo_tipo, original.type_spent),
  transaction_type: preservar(body.entra_sai, original.transaction_type)
};

return [{ json: resultado }];
```

---

## Ajuste no Update a row

Após inserir o Merge Fields, o **Update a row** precisa ler os campos do Merge Fields em vez de ler direto do body.

**Altere cada campo do Update a row:**

| Campo no Update a row | Expressão ANTIGA | Expressão NOVA |
|----------------------|------------------|----------------|
| `name_spent` | `{{ $('entrada1').item.json.body.novo_nome }}` | `{{ $json.name_spent }}` |
| `value_spent` | `{{ $('entrada1').item.json.body.novo_valor }}` | `{{ $json.value_spent }}` |
| `date_spent` | `{{ $('entrada1').item.json.body.nova_data }}` | `{{ $json.date_spent }}` |
| `category_spent` | `{{ $('entrada1').item.json.body.nova_categoria }}` | `{{ $json.category_spent }}` |
| `type_spent` | `{{ $('entrada1').item.json.body.novo_tipo }}` | `{{ $json.type_spent }}` |
| `transaction_type` | `{{ $('entrada1').item.json.body.entra_sai }}` | `{{ $json.transaction_type }}` |

---

## O Que Este Código Faz

| Cenário | Sem Merge Fields (antigo) | Com Merge Fields (novo) |
|---------|--------------------------|------------------------|
| Editar só valor (nome="") | name_spent = "" ❌ DESTRUÍDO | name_spent = "Uber" ✅ preservado |
| Editar só nome (data="") | date_spent = "" ❌ DESTRUÍDO | date_spent = "2026-04-03" ✅ preservado |
| Editar tudo (todos preenchidos) | Todos atualizados ✅ | Todos atualizados ✅ |
| Nenhum campo novo (tudo "") | Todos apagados ❌ | Todos preservados ✅ |

---

## Verificação após Passo 4

1. **"muda o gasto do uber pra 30 reais"**
   - Verifique no Supabase (tabela `spent`): name_spent, date_spent, category_spent, type_spent, transaction_type devem estar INTACTOS
   - Antes: todos seriam "" (apagados)

2. **"renomeia o almoço pra 'Almoço executivo'"**
   - Verifique: value_spent, date_spent, category_spent devem estar INTACTOS
   - Antes: todos seriam "" (apagados)
