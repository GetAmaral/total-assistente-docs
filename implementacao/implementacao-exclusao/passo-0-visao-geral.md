# Passo 0 — Visao Geral da Implementacao

**Base:** Auditoria de brechas backend + caso BBBK + 10 frameworks aviacao
**Principio:** Design backward (BBBK) — projetar a partir da promessa: "nenhum dado sera perdido por erro"
**Modelo:** Swiss Cheese — camadas independentes; erro so passa se TODAS falharem

---

## Mapa dos Passos

| Passo | O que faz | Resolve | Tempo |
|-------|-----------|---------|-------|
| 1 | Colar 3 prompts nos nodes Set | MEDIA-1 | ~3 min |
| 2 | Adicionar filtro user_id em 2 nodes DELETE | CRITICA-1 | ~2 min |
| 3 | Trocar campos dos 2 nodes de resposta | ALTA-1, MEDIA-2 | ~3 min |
| 4 | Adicionar 4 nodes Set + 1 If (branches de erro) | ALTA-3 | ~5 min |
| 5 | Rodar SQL + trocar DELETE→UPDATE em 3 nodes + filtro | ALTA-2 | ~5 min |
| 6 | Adicionar 2 IFs + 2 Sets pos-delete | ALTA-1 | ~4 min |
| 7 | Rodar SQL + adicionar 3 nodes Supabase INSERT | MEDIA-5 | ~5 min |
| 8 | Trocar 1 trecho na Edge Function | ALTA-4 | ~3 min |
| **9** | **Testar tudo** | **Validacao** | **~10 min** |

**Total estimado: ~40 minutos**

---

## Ordem de Execucao

```
1. Passo 5 (SQL migration — soft delete) ← precisa rodar ANTES dos passos 2-6
2. Passo 7 (SQL migration — audit log)   ← precisa rodar ANTES dos passos 7.2-7.4 e 8
3. Passo 1 (prompts)
4. Passo 2 (user_id nos DELETEs)
5. Passo 3 (respostas detalhadas)
6. Passo 4 (branches de erro)
7. Passo 5.2-5.5 (trocar DELETE→UPDATE nos nodes)
8. Passo 6 (IFs pos-delete)
9. Passo 7.2-7.4 (nodes de audit log)
10. Passo 8 (Edge Function)
11. Passo 9 (testar)
```

---

## Regra de Seguranca

- Implementar PRIMEIRO no DEV
- Testar com bateria do Passo 9
- So migrar para producao apos todos os testes passarem
