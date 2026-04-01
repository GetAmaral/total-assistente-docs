# Guia Simplificado — 4 Nodes de Debounce

**Arquivo:** `debounce-4nodes.json`
**Total de mudancas:** 4 nodes novos, 5 fios cortados, 5 fios conectados

---

## Passo 1 — Colar os 4 nodes

1. Copiar o conteudo de `debounce-4nodes.json`
2. Clicar num espaco vazio do canvas
3. Ctrl+V — os 4 nodes aparecem ja conectados entre si

Os nodes:
```
Gerar Debounce ID → Set Debounce Owner → (saida livre)
Get Debounce Owner → Sou o Ultimo? → (saidas TRUE/FALSE livres)
```

---

## Passo 2 — Cortar 5 fios

```
1. pushRedisMessage ──✂──→ firstGet
2. Code9            ──✂──→ mediumGet
3. mediumGet        ──✂──→ If19
4. If19 (TRUE)      ──✂──→ Escolher Branch
5. If19 (FALSE)     ──✂──→ No Operation, do nothing2
```

---

## Passo 3 — Conectar 5 fios novos

```
1. pushRedisMessage     →  Gerar Debounce ID
2. Set Debounce Owner   →  firstGet
3. Code9                →  Get Debounce Owner
4. Sou o Ultimo? (TRUE) →  Escolher Branch
5. Sou o Ultimo? (FALSE) → No Operation, do nothing2
```

---

## Resultado final

```
pushRedisMessage → Gerar Debounce ID → Set Debounce Owner → firstGet
    → Aggregate7 → Redis Chat Memory7 → Code9
    → Get Debounce Owner → Sou o Ultimo?
        ├ TRUE  → Escolher Branch → (resto do fluxo normal)
        └ FALSE → No Operation, do nothing2
```

mediumGet e If19 ficam no canvas mas desconectados.

---

## Checklist

- [ ] 4 nodes colados no canvas
- [ ] Fio cortado: pushRedisMessage → firstGet
- [ ] Fio cortado: Code9 → mediumGet
- [ ] Fio cortado: mediumGet → If19
- [ ] Fio cortado: If19 TRUE → Escolher Branch
- [ ] Fio cortado: If19 FALSE → No Operation
- [ ] Conectado: pushRedisMessage → Gerar Debounce ID
- [ ] Conectado: Set Debounce Owner → firstGet
- [ ] Conectado: Code9 → Get Debounce Owner
- [ ] Conectado: Sou o Ultimo? TRUE → Escolher Branch
- [ ] Conectado: Sou o Ultimo? FALSE → No Operation, do nothing2
- [ ] Set Debounce Owner tem credential Redis Germany
- [ ] Get Debounce Owner tem credential Redis Germany
- [ ] Salvar workflow
