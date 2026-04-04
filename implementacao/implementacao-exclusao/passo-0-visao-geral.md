# Passo 0 — Visao Geral da Implementacao

**Base:** Auditoria de brechas backend + Estudo BBBK + 10 frameworks aviacao
**Principio:** Design backward (BBBK) — projetar a partir da promessa: "nenhum dado sera perdido por erro"
**Modelo:** Swiss Cheese — 10 camadas independentes; erro so passa se TODAS falharem

---

## Mapa dos Passos

| Passo | O que faz | Resolve | Camadas Swiss Cheese |
|-------|-----------|---------|---------------------|
| 1 | Prompts corrigidos (evento + financeiro + classificador) | MEDIA-1 | Camada 1 (classificacao), Camada 2 (confirmacao), Camada 3 (verificacao) |
| 2 | Corrigir nodes DELETE (adicionar user_id) | CRITICA-1 | Camada 7 (autorizacao no banco) |
| 3 | Respostas detalhadas dos webhooks | ALTA-1, MEDIA-2 | Camada 5 (resposta rica) |
| 4 | Branch de erro (If7 e fluxo eventos) | ALTA-3 | Camada 8 (tratamento de erro) |
| 5 | Soft delete + migration SQL | ALTA-2 | Camada 4 (reversibilidade) |
| 6 | Verificacao pos-DELETE (IF nodes) | ALTA-1 | Camada 6 (validacao Google) |
| 7 | Audit log (tabela + nodes INSERT) | MEDIA-5 | Camada 10 (LOSA/auditoria) |
| 8 | Google sync soft delete | ALTA-4 | Camada 4 + 10 |

---

## Ordem de Implementacao

```
FASE 1 — SEM RISCO (apenas prompts, nao muda estrutura)
  Passo 1: Colar prompts nos nodes Set

FASE 2 — BAIXO RISCO (corrigir filtros existentes)
  Passo 2: Adicionar user_id nos DELETEs
  Passo 3: Trocar respostas hardcoded por detalhadas
  Passo 4: Conectar branches de erro

FASE 3 — MEDIO RISCO (mudanca de banco)
  Passo 5: Migration soft delete
  Passo 6: IF nodes pos-DELETE

FASE 4 — COMPLEMENTAR
  Passo 7: Audit log
  Passo 8: Google sync soft delete
```

---

## Regra de Seguranca

- NUNCA editar producao diretamente
- Implementar PRIMEIRO no DEV
- Testar com bateria completa (passo 9)
- So migrar para producao apos todos os testes passarem
