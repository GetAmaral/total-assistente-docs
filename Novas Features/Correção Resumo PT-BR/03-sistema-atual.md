# 03 — Sistema Atual: Fluxo de Resumo de Audio

**Workflow:** Main - Total Assistente (ID: `9WDlyel5xRCLAvtH`)
**Node afetado:** "Message a model" (ID: `9edf93b2-6287-44ce-b73d-752af1a1ade6`)
**Data da captura:** 2026-04-01 (producao)

---

## 1. Fluxo Completo do Resumo de Audio

### Fase 1 — Recepcao e Transcricao do Audio

```
trigger-whatsapp
    |
    v
If3 (e audio?)
    | TRUE
    v
Get Media Info1 (HTTP → WhatsApp Graph API, obtem URL da midia)
    |
    v
Download File1 (HTTP → download do arquivo de audio)
    |
    v
Transcribe a recording (OpenAI Whisper, language: "pt")
    |
    v
Log: transcription (Supabase → execution_log)
    |
    v
Redis SET
    Key: "transcricao:{user_wa_id}"
    Value: $json.transcription_text
    TTL: 3600 (1 hora)
    |
    v
Send message2 (WhatsApp → envia transcricao ao usuario)
    Texto: "{transcription_text}\n\n_— Transcrito por *Total Assistente*, sua IA pessoal_"
    |
    v
Resumir (HTTP → WhatsApp Graph API)
    Envia botao interativo: "Deseja um resumo desse audio?"
    Botao: "Resuma para mim" (id: btn_resumir)
```

### Fase 2 — Resumo (quando usuario clica o botao)

```
trigger-whatsapp (novo webhook, tipo: interactive/button_reply)
    |
    v
If4 (messages array existe?)
    | TRUE
    v
Edit Fields (extrai messageSet de interactive.button_reply.title)
    |
    v
Typing (envia read receipt + typing indicator)
    |
    v
If (messageSet === "Resuma para mim"?)
    | TRUE
    v
Redis1 GET
    Key: "transcricao:{user_wa_id}"
    Output property: "data"
    |
    v
If1 ($json.data is notEmpty?)
    |
    +-- TRUE ─────────────────────────────────────┐
    |                                              |
    |                                   "Message a model"
    |                                   (GPT-5.4-mini)
    |                                              |
    |                              ┌───────────────┼───────────────┐
    |                              |                               |
    |                     Send message5                  Log: audio_summary
    |                     (WhatsApp)                     (Supabase)
    |
    +-- FALSE ──> Send message3
                  "Nao encontrei nenhum audio encaminhado recente para resumir."
```

---

## 2. Configuracao ATUAL do Node "Message a model"

| Parametro | Valor atual |
|-----------|------------|
| **Tipo** | `@n8n/n8n-nodes-langchain.openAi` (typeVersion 2.1) |
| **Modelo** | `gpt-5.4-mini` |
| **Temperature** | `0.3` |
| **Max Tokens** | `500` |
| **Credencial** | OpenAI account (ID: `ioug5VWKEO9a7n19`) |

### System Prompt ATUAL (copiar/colar exato do node):

```
Voce e um assistente que resume textos de forma clara e concisa em portugues brasileiro. Resuma o texto mantendo os pontos principais. Apenas resuma. Apenas isso.
```

### User Message ATUAL:

```
={{ $json.data }}
```

O `$json.data` vem do Redis1 GET — e a transcricao armazenada na Fase 1.

---

## 3. Problemas Identificados no Sistema Atual

| # | Problema | Impacto |
|---|----------|---------|
| 1 | System prompt nao proibe explicitamente outros idiomas | Modelo pode gerar tokens em qualquer idioma |
| 2 | Nenhuma validacao entre o "Message a model" e o "Send message5" | Resposta com anomalia vai direto ao usuario |
| 3 | Nenhum log de anomalia especifico | Falhas de idioma passam despercebidas |
| 4 | Nenhum fallback se a resposta contem caracteres inesperados | Sem mecanismo de re-tentativa ou limpeza |

---

## 4. Output Atual Enviado ao Usuario

O node "Send message5" envia:

```
*Resumo do audio:*

{output do Message a model}

_— Resumido por *Total Assistente*, sua IA pessoal_
```

Template exato no N8N:

```
*Resumo do áudio:*\n\n{{ $json.output[0].content[0].text }}\n\n_— Resumido por *Total Assistente*, sua IA pessoal_
```

---

## 5. Dados do Incidente

### Timeline do incidente (01/04/2026)

| Hora BRT | Evento | Execution ID |
|----------|--------|-------------|
| 11:34:42 | Audio encaminhado recebido | trace `tr_1775054082122_90t4k76b` |
| 11:34:52 | Transcricao gerada (Whisper, 100% PT-BR) | `fef82f35-c487-4625-8911-a3822030dcba` |
| 11:34:56 | Luan clicou "Resuma para mim" | trace `tr_1775054096524_5km528e3` |
| 11:34:58 | Resumo gerado com palavra arabe | `c9469280-a76d-4b2b-b661-30d6e10dfef7` |

### Audio original (transcricao Whisper)

> O Apoio, ele e um software multidisciplinar, onde atende alguns profissionais, como psicopedagogos, terapeutas ocupacionais, psicologos com formacao em aba, fono, fisio. E la dentro da plataforma tem alguns materiais que eles usam no dia a dia para avaliar o paciente, como o VBMAP, o PEI, tem Denver, Portage e algumas outras ferramentas. E a ideia e deixar tudo centralizado no sistema para organizar ali a clinica e tambem gerar relatorios para facilitar a visualizacao do avanco da crianca, do paciente. E o Apoio, ele tem dois ambientes, ne? O do profissional, obviamente, e o familiar. Entao, os pais, os responsaveis, eles conseguem ver o progresso do seu filho e eles tambem tem algumas funcionalidades, como as tarefas que sao prescritas pelo proprio profissional. Entao, o profissional vai la, cria uma tarefa, cai la no ambiente do responsavel e ele pode marcar, ne? Por exemplo, uma tarefa de olhar no olho por sete dias, prioridade media, enfim. Tem o chat tambem, que e direto com o profissional e tambem, obviamente, o progresso.

### Resumo gerado (com falha)

> O Apoio e um software multidisciplinar voltado para profissionais como psicopedagogos, terapeutas ocupacionais, psicologos com formacao em ABA, fonoaudiologos e fisioterapeutas. A plataforma reune ferramentas de avaliacao e acompanhamento, como VBMAP, PEI, Denver e Portage, centralizando informacoes para organizar a clinica e gerar relatorios sobre o avanco da crianca ou paciente.
>
> O sistema possui dois ambientes: o do profissional e o da familia. No ambiente familiar, pais e responsaveis podem acompanhar o progresso do filho, visualizar tarefas prescritas pelo profissional, marcar atividades concluidas e usar o chat para **التواصل** direto com o profissional.

### Usuario

| Campo | Valor |
|-------|-------|
| Nome | Luan |
| Telefone | 554398459145 |
| Email | luanvmendess@gmail.com |
| Plano | Premium (ativo) |
