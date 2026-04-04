# PASSO 1 — Fix Code9 (PF-D2: classificador recebe todas as msgs)

## O que muda

**Antes:** `mensagemPrincipal = coletadas.filter(Boolean).slice(-1)[0]` → so a ultima msg
**Depois:** Todas as msgs concatenadas com prefixo numerico

### Exemplo de saida

**Antes (1 msg para classificador):**
```
Mensagem principal do usuario: ah nao, pra 16h
```

**Depois (todas as msgs para classificador):**
```
Mensagem principal do usuario: [1] muda a reuniao pra 15h
[2] ah nao, pra 16h
```

**Mensagem unica (sem mudanca):**
```
Mensagem principal do usuario: qual minha agenda de amanha?
```

---

## Como aplicar

1. Abrir o workflow **Premium Main** no N8N
2. Dar duplo-clique no node **Code9**
3. Selecionar TODO o codigo (Ctrl+A)
4. Deletar
5. Abrir o arquivo `code9-corrigido.js` desta pasta
6. Copiar TODO o conteudo (Ctrl+A → Ctrl+C)
7. Colar no editor do Code9 (Ctrl+V)
8. Fechar o node
9. Salvar o workflow

---

## O que mudou no codigo (diff)

Localize a secao `// 2) MENSAGEM ATUAL (DEBOUNCE)` no Code9. A UNICA mudanca eh no trecho apos o loop `for`:

### REMOVER (linhas originais):

```javascript
    mensagemPrincipal = coletadas.filter(Boolean).slice(-1)[0] ?? '';
```

### INSERIR (no mesmo local):

```javascript
    // ============================================================
    // FIX PF-D2: Em vez de .slice(-1)[0], concatenar todas
    // ============================================================
    const msgsUnicas = coletadas.filter(Boolean);

    if (msgsUnicas.length === 1) {
      // Mensagem unica — manter comportamento original
      mensagemPrincipal = msgsUnicas[0];
    } else if (msgsUnicas.length > 1) {
      // Multiplas mensagens — concatenar com contexto
      // Limitar a 10 para evitar prompt explosion
      const limitadas = msgsUnicas.slice(-10);
      mensagemPrincipal = limitadas
        .map((msg, i) => `[${i + 1}] ${msg}`)
        .join('\n');
    }
    // ============================================================
```

---

## Por que funciona

1. **Mensagem unica:** Comportamento identico ao original (sem `[1]` prefix)
2. **Multiplas mensagens:** Classificador recebe TODAS em ordem cronologica
3. **Limite de 10:** Protege contra prompt explosion se Redis tiver lixo
4. **Prefixo numerico:** Classificador entende a sequencia temporal

## Impacto no Agent

Nenhum. O AI Agent ja recebe todas as mensagens via `$json.Lista.join(', ')` no campo `text`. O fix eh exclusivamente para o **classificador** (Escolher Branch) que usa `Code9.mensagem_final`.
