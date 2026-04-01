# Guia de Conexoes — Debounce Nodes

## Como usar

1. Abrir o workflow Premium Main no N8N DEV
2. Copiar o conteudo de `debounce-nodes-only.json`
3. Clicar no canvas vazio e Ctrl+V — os 26 nodes aparecem
4. Seguir as conexoes abaixo

---

## PARTE 1 — Inicio do fluxo (registrar ownership)

### Desconectar

```
pushRedisMessage ──✂──→ firstGet       (cortar esse fio)
Code9            ──✂──→ mediumGet      (cortar esse fio)
mediumGet        ──✂──→ If19           (cortar esse fio)
If19 (TRUE)      ──✂──→ Escolher Branch (cortar esse fio)
If19 (FALSE)     ──✂──→ No Operation   (cortar esse fio)
```

### Conectar

```
pushRedisMessage → Gerar Debounce ID → Set Debounce Owner → firstGet
Code9 → Escolher Branch    (direto, sem mediumGet/If19)
```

Resumo visual:
```
ANTES:  pushRedis → firstGet → ... → Code9 → mediumGet → If19 → Escolher Branch
DEPOIS: pushRedis → Gerar Debounce ID → Set Debounce Owner → firstGet → ... → Code9 → Escolher Branch
```

---

## PARTE 2 — Final de cada branch (check antes de enviar)

Cada branch tem um Redis DELETE que apaga `_debounce` antes de enviar resposta.
Vamos inserir o check de ownership ANTES de cada um.

### Branch 1 — Padrao (Send message)

Fio atual:
```
If18 → Redis3 → Send message
```

Desconectar:
```
If18   ──✂──→ Redis3
Redis3 ──✂──→ Send message
```

Conectar:
```
If18 → Get Owner 1 → Check Owner 1
  TRUE  → Redis3 → Del Owner 1 → Send message
  FALSE → Debounce Skip 1
```

---

### Branch 2 — Criar Gasto (HTTP Create Tool1)

Fio atual:
```
If → Redis → HTTP - Create Tool1
```

Desconectar:
```
If    ──✂──→ Redis
Redis ──✂──→ HTTP - Create Tool1
```

Conectar:
```
If → Get Owner 2 → Check Owner 2
  TRUE  → Redis → Del Owner 2 → HTTP - Create Tool1
  FALSE → Debounce Skip 2
```

---

### Branch 3 — Buscar Eventos (Send message1)

Fio atual:
```
If5 → Redis6 → Send message1
```

Desconectar:
```
If5    ──✂──→ Redis6
Redis6 ──✂──→ Send message1
```

Conectar:
```
If5 → Get Owner 3 → Check Owner 3
  TRUE  → Redis6 → Del Owner 3 → Send message1
  FALSE → Debounce Skip 3
```

---

### Branch 4 — Criar Evento Recorrente (HTTP Create Calendar Tool3)

Fio atual:
```
If22 → Redis10 → HTTP - Create Calendar Tool3
```

Desconectar:
```
If22    ──✂──→ Redis10
Redis10 ──✂──→ HTTP - Create Calendar Tool3
```

Conectar:
```
If22 → Get Owner 4 → Check Owner 4
  TRUE  → Redis10 → Del Owner 4 → HTTP - Create Calendar Tool3
  FALSE → Debounce Skip 4
```

---

### Branch 5 — Editar Evento (Set Range Batch)

Fio atual:
```
If9 → Redis8 → Set Range (Batch)
```

Desconectar:
```
If9    ──✂──→ Redis8
Redis8 ──✂──→ Set Range (Batch)
```

Conectar:
```
If9 → Get Owner 5 → Check Owner 5
  TRUE  → Redis8 → Del Owner 5 → Set Range (Batch)
  FALSE → Debounce Skip 5
```

---

### Branch 6 — Criar Evento Unico (Buscar Conflitos)

Fio atual:
```
If2 → Redis2 → Buscar Conflitos (Unico)
```

Desconectar:
```
If2    ──✂──→ Redis2
Redis2 ──✂──→ Buscar Conflitos (Unico)
```

Conectar:
```
If2 → Get Owner 6 → Check Owner 6
  TRUE  → Redis2 → Del Owner 6 → Buscar Conflitos (Unico)
  FALSE → Debounce Skip 6
```

---

## Checklist final

- [ ] pushRedisMessage → Gerar Debounce ID → Set Debounce Owner → firstGet
- [ ] Code9 → Escolher Branch (direto)
- [ ] mediumGet desconectado
- [ ] If19 desconectado
- [ ] Branch 1: If18 → Get Owner 1 → Check Owner 1 → Redis3 → Del Owner 1 → Send message
- [ ] Branch 2: If → Get Owner 2 → Check Owner 2 → Redis → Del Owner 2 → HTTP Create Tool1
- [ ] Branch 3: If5 → Get Owner 3 → Check Owner 3 → Redis6 → Del Owner 3 → Send message1
- [ ] Branch 4: If22 → Get Owner 4 → Check Owner 4 → Redis10 → Del Owner 4 → HTTP Create Calendar3
- [ ] Branch 5: If9 → Get Owner 5 → Check Owner 5 → Redis8 → Del Owner 5 → Set Range Batch
- [ ] Branch 6: If2 → Get Owner 6 → Check Owner 6 → Redis2 → Del Owner 6 → Buscar Conflitos
- [ ] Todos os nodes Redis novos usam credential "Redis Germany"
- [ ] Salvar workflow
