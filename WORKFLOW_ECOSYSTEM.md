> ⚠️ **ESTE DOCUMENTO ESTÁ DESATUALIZADO — 27/08/2026.**
>
> Muita coisa mudou depois desta data e não foi refletida aqui: os nomes e CNPJ
> de duas das quatro empresas, as contas bancárias (agência e conta estavam
> grudadas num campo só), o `valor_total` de 5 orçamentos, e cinco migrations.
> A afirmação de "Carga 100% Real Ativa" não descreve o estado atual.
>
> **Para o estado real e os próximos passos, leia [`ROADMAP.md`](ROADMAP.md).**
>
> Aviso acrescentado pelo Claude Code a pedido do Diego. O conteúdo abaixo não
> foi alterado — a atualização ou aposentadoria deste arquivo cabe ao agente de
> frontend, que o escreveu.

---

# 🗺️ ECO-MITANG ERP: FLUXOGRAMA DINÂMICO DO ECOSSISTEMA & WORKFLOWS

> **Última Atualização Automática:** 26/08/2026, 22:46:28  
> **Último Commit:** `6bed3f2 - docs: implementacao do fluxograma dinamico do ecossistema e gerador automatico (26/08/2026 20:40)`  
> **Legenda de Destaque:** ⚡ Elementos com borda destacada em **Laranja/Vermelho** indicam as **ÚLTIMAS ALTERAÇÕES IMPLEMENTADAS NO PROJETO**.

---

## 1. Fluxograma Geral de Negócios (End-to-End Workflow)

```mermaid
flowchart TD
    %% Estilos de destaque para últimas alterações
    classDef recent fill:#fff3cd,stroke:#ff6b00,stroke-width:3px,stroke-dasharray: 5 5,color:#856404;
    classDef core fill:#e7f3ff,stroke:#0d6efd,stroke-width:2px,color:#084298;
    classDef lock fill:#f8d7da,stroke:#dc3545,stroke-width:2px,color:#842029;
    classDef success fill:#d1e7dd,stroke:#198754,stroke-width:2px,color:#0f5132;
    classDef queue fill:#e2e3e5,stroke:#6c757d,stroke-width:2px,color:#41464b;

    subgraph INGESTION["⚡ [NOVO] MOTOR DE INGESTÃO DE DADOS (ETL & STAGING)"]
        direction TB
        F_JSON["📄 Arquivos JSON (Catálogo)"]
        F_XML["📄 XML SEFAZ (NFe v4.00)"]
        F_OFX["📄 OFX Extratos Bancários"]
        F_CNPJ["📄 CNPJ Receita Federal"]
        
        STAGING["📦 Staging Area (importacao_staging)<br/><i>Preview Humano & ACID Rollback</i>"]:::recent
        
        F_JSON & F_XML & F_OFX & F_CNPJ --> STAGING
    end

    subgraph CATALOGO["⚡ [NOVO] CATÁLOGO UNIVERSAL (EAV & POLIMORFISMO)"]
        direction TB
        ITEM_CAT["📦 Item_Catalogo (itens_catalogo)<br/><b>Colunas Core + atributos_extras (JSONB)</b><br/><i>Soft Delete: status_ativo = false</i>"]:::recent
        INGESTION -- "ACID Commit" --> ITEM_CAT
    end

    subgraph COMERCIAL["1. NÚCLEO COMERCIAL & FUNIL"]
        direction TB
        LEAD["📥 Lead / Solicitação Bruta"] --> TRIAGEM["🎫 Ticket Triagem<br/><i>Multi-Tenant</i>"]:::core
        TRIAGEM -- "Status: QUALIFICADO<br/>(Evento: TICKET.QUALIFICADO)" --> COT_GEN["📝 Cotação Automática (cotacoes)<br/><i>Master-Detail + Snapshot Financeiro</i>"]:::core
        
        ITEM_CAT -. "Snapshot de Preço Congelado" .-> COT_GEN
        
        COT_GEN --> CHECK_DESC{"Desconto Global > 10%?"}
        CHECK_DESC -- Sim --> L_APROV["🔒 TRAVA: Aguardando_Aprovacao (Diretoria)"]:::lock
        CHECK_DESC -- Não --> COT_APROV["✅ Aprovada_Internamente"]:::success
        L_APROV -- Aprovado --> COT_APROV
        COT_APROV --> COT_GANHA["🏆 Cotação Ganha (Status: GANHA)<br/><i>Trava de Imutabilidade Ativada</i>"]:::success
    end

    subgraph OPERACIONAL["2. ROTEADOR OPERACIONAL DE PRODUÇÃO/SERVIÇOS"]
        direction TB
        COT_GANHA -- "Evento: COTACAO.GANHA" --> ROUTER["⚙️ Roteador de Ordens de Serviço"]:::core
        
        ROUTER --> OS_PROD["🏭 OS Produção (Baterias)"]:::core
        ROUTER --> OS_LOC["⚓ OS Mobilização (Locação Offshore)"]:::core
        ROUTER --> OS_SERV["🔧 OS Serviços Subsea"]:::core
        ROUTER --> OS_CURSO["🎓 OS Treinamento (Cursos)"]:::core

        OS_PROD & OS_LOC & OS_SERV & OS_CURSO --> OS_LOCKED["🔒 TRAVAS INICIAIS DA OS<br/>* bloqueio_financeiro = TRUE<br/>* bloqueio_qsms = TRUE<br/>* status = AGUARDANDO_LIBERACAO"]:::lock
    end

    subgraph FINANCEIRO["3. GESTÃO FINANCEIRA & CONTAS A RECEBER"]
        direction TB
        COT_GANHA -. "Criação de Acordo" .-> PLANO["💳 Plano de Faturamento (planos_faturamento)"]:::core
        PLANO --> PARC_SINAL["💰 Parcela 1 (Sinal / Entrada)<br/><i>exige_quitacao_para_liberar_os = TRUE</i>"]:::core
        
        PARC_SINAL -- "Registro de Pagamento (PAGO)" --> WH_FIN["⚡ Webhook POST /desbloqueio-financeiro<br/>(Evento: FINANCEIRO.PARCELA_LIBERACAO_QUITADA)"]:::recent
    end

    WH_FIN -- "Destrava bloqueio_financeiro = FALSE" --> OS_LOCKED

    subgraph EXECUCAO["4. CHÃO DE FÁBRICA & EXECUÇÃO OFFSHORE"]
        direction TB
        QSMS_START["🛡️ Liberação Inicial QSMS<br/><i>bloqueio_qsms = FALSE</i>"] --> OS_READY["🚀 OS em Execução (Status: NA_FILA -> EM_EXECUCAO)"]:::success
        
        OS_READY --> HH["⏱️ Apontamento de HH (apontamentos_horas)<br/><i>Cronômetro em Aberto</i>"]:::core
        OS_READY --> ESTOQUE["📦 Consumo de Estoque (movimentacoes_estoque)<br/><i>Baixa Atômica de Saldo</i>"]:::core
        
        HH --> CHECK_HH{"Existe Cronômetro Aberto?"}
        CHECK_HH -- Sim --> L_HH["🔒 TRAVA: Impede Conclusão da OS"]:::lock
        CHECK_HH -- Não --> OS_FIN["🏁 Conclusão da OS (Status: CONCLUIDA)"]:::success
    end

    OS_LOCKED -- "Todas as travas = FALSE" --> QSMS_START

    subgraph QUALIDADE["5. GATEKEEPER QSMS & CONFORMIDADE"]
        direction TB
        OS_FIN --> AUDITORIA["🔍 Auditoria QSMS (auditorias_qsms)"]:::core
        
        AUDITORIA --> DECISAO_QSMS{"Resultado?"}
        DECISAO_QSMS -- "Reprovado_RNC" --> RNC["⚠️ RNC Obrigatória + OS Revertida:<br/>* status = BLOQUEADA_EM_RETRABALHO<br/>* bloqueio_qsms = TRUE"]:::lock
        DECISAO_QSMS -- "Aprovado" --> HASH["🔐 Assinatura Hash SHA-256 + Imutabilidade"]:::success
        
        RNC -. Retrabalho .-> OS_READY
        HASH --> FATURAMENTO["🚀 Liberação de Nota Fiscal & Despacho Logístico"]:::success
    end

    subgraph CQRS["6. ANALYTICS & DASHBOARD C-LEVEL (READ MODEL)"]
        direction TB
        COT_GANHA -. Evento .-> AGG_VENDAS["📊 analytics_vendas_mensal (UPSERT em Tempo Real)"]:::core
        OS_FIN -. Evento .-> AGG_OPS["📈 analytics_operacao_qualidade (OSs Concluídas + % RNC)"]:::core
        RNC -. Evento .-> AGG_OPS
        
        AGG_VENDAS & AGG_OPS --> DASH["🖥️ Dashboard Executivo Holding & CNPJs (ABAC Read-Only)"]:::core
    end
```

---

## 2. Mapa do Motor de Ingestão de Dados (ETL & Staging Area) ⚡ [RECÉM IMPLEMENTADO]

```mermaid
flowchart LR
    classDef recent fill:#fff3cd,stroke:#ff6b00,stroke-width:3px,color:#856404;
    classDef acid fill:#d1e7dd,stroke:#198754,stroke-width:2px,color:#0f5132;
    classDef error fill:#f8d7da,stroke:#dc3545,stroke-width:2px,color:#842029;

    RAW_IN["📥 Entrada de Arquivo Bruto<br/>(JSON, XML SEFAZ, OFX)"] --> STAGE_INSERT["📦 Tabela importacao_staging<br/><i>Status: PENDENTE_VALIDACAO</i>"]:::recent
    
    STAGE_INSERT --> PARSER_RUN["⚙️ Parser & Validador de Estrutura"]
    
    PARSER_RUN --> VALIDATION{"Validação Estrutural & Esquema?"}
    
    VALIDATION -- "Erro em qualquer item (ex: Item 999 de 1000)" --> ROLLBACK["⛔ ROLLBACK TOTAL DA TRANSAÇÃO ACID<br/><i>Status: ERRO_VALIDACAO (Banco Limpo)</i>"]:::error
    
    VALIDATION -- "100% dos Itens Válidos" --> EAV_EXTRACT["🧩 Interceptador EAV (JSONB)<br/><i>Campos extras -> atributos_extras</i>"]:::recent
    
    EAV_EXTRACT --> COMMIT_ACID["✅ COMMIT Transacional Atômico<br/><i>Status: PROCESSADO</i>"]:::acid
    
    COMMIT_ACID --> TARGET_TBL["🎯 Tabela de Produção Core (ex: itens_catalogo)"]:::recent
```

---

## 3. Matriz de Eventos de Domínio, Webhooks e Reações

| Evento / Webhook | Emissor (Publisher) | Consumidores (Subscribers) | Ação Executada / Efeito Colateral | Status |
| :--- | :--- | :--- | :--- | :--- |
| **`CATALOGO.ITEM_CRIADO`** | `ItemCatalogoService` | Frontend / Cotação | Notifica novos itens disponíveis com `atributos_extras` | ⚡ **Recente** |
| **`CATALOGO.ITEM_INATIVADO`** | `ItemCatalogoService` (Soft Delete) | Cotação / API | Remove item de novas seleções (`status_ativo = false`) | ⚡ **Recente** |
| **`POST /desbloqueio-financeiro`** | Webhook Financeiro | `OperacionalWebhookController` | **Destrava OS**: `bloqueio_financeiro = false` e avança para `NA_FILA` | ⚡ **Recente** |
| **`POST /status-qsms`** | Webhook QSMS | `OperacionalWebhookController` | **Libera ou Trava Retrabalho**: `status = BLOQUEADA_EM_RETRABALHO` | ⚡ **Recente** |
| **`TICKET.QUALIFICADO`** | `TicketTriagemService` | `CotacaoTriagemListener` | Criação automática da Cotação com congelamento de preço | Ativo |
| **`COTACAO.GANHA`** | `CotacaoService` | `CotacaoGanhaOperacionalListener` & CQRS | Spawna OSs especializadas e agrega vendas mensais | Ativo |
| **`ORDEM_SERVICO.CONCLUIDA`** | `ExecucaoOperacionalService` | `DashboardProjectionService` | Atualiza métricas operacionais no painel executivo | Ativo |
| **`QSMS.AUDITORIA_REPROVADA`**| `QsmsAuditoriaService` | `DashboardProjectionService` | Incrementa contadores de RNC e recalcula índice de qualidade | Ativo |

---

## 4. Histórico de Alterações de Fluxo & Rastreabilidade

| Data / Versão | Módulo Impactado | Alteração no Fluxo de Negócios | Destaque Visual |
| **27/08/2026 (Atual)** | **Orçamentos Multi-Item & Multi-NF** | Parser determinístico de 5-tupla monetária para 325 itens; suporte a múltiplas NFs e POs por proposta e visualizador executivo detalhado. | ⚡ **Última Alteração** |
| **27/08/2026 (Atual)** | **Curva ABC Auditada de Atrasos** | Isolamento estrito de inadimplência real (Viva Rio 33d, Fugro 27d, Aerodrone 112d); eliminação de mocks e descarte de faturas pagas (DOF/Sea Survey). | ⚡ **Última Alteração** |
| **27/08/2026 (Atual)** | **Gráfico Executivo Adaptativo** | Granularidade dinâmica automática: semanas reais para recortes curtos (ex: Mês Atual) vs meses consolidados para ano todo. | ⚡ **Última Alteração** |
| **27/08/2026 (Atual)** | **Tesouraria OFX & Regex** | Separação estrita de Instituição Bancária e Agência/Conta com normalização regex universal para Itaú (`Ag. AAAA • CC CCCCC-D`) e Bradesco (`Ag. AAAA • CC 00CCCC-D`). | ⚡ **Última Alteração** |
| **27/08/2026 (Atual)** | **Subtotais Dinâmicos (`tfoot`)** | Linha fixa de rodapé calculando em tempo real os subtotais exclusivos do recorte filtrado (lançamentos, entradas, saídas e saldo líquido). | ⚡ **Última Alteração** |
| **27/08/2026 (Atual)** | **Dossiê 360° de Contraparte** | Clique no Histórico/Memo abre modal com histórico consolidado da pessoa/empresa no exercício (Total Pago, Recebido, Saldo Líquido e extrato). | ⚡ **Última Alteração** |
| **27/08/2026 (Atual)** | **Runway 15d & Auditoria** | Modal de auditoria em 4 abas (Contas Bancárias Reais, Faturas a Receber 15d, Títulos de Insumos a Pagar 15d e Projeção Diária acumulada). | ⚡ **Última Alteração** |
| **27/08/2026** | **Repositório Fiscal & XML** | Ingestão integral de 172 XMLs de NF-e e NFS-e gravados em JSONB sem perda de tags e dados relacionais. | Base Core |
| **27/08/2026** | **Conciliação OFX & Caixa** | 1.386 transações bancárias reais em Itaú e Bradesco com hash SHA-256 anti-duplicação e projeção de caixa. | Base Core |
| **27/08/2026** | **Classificação de Parceiros** | Separação estrita em Clientes (compradores), Fornecedores (insumos Strema/SBT) e Colaboradores PJ (NFS-e). | Base Core |
| **27/08/2026** | **DRE & Controladoria DuPont** | Apuração contábil automatizada (Receita Bruta, CMV, EBITDA) e simulador interativo DuPont de ROE com sliders. | Base Core |
| **27/08/2026** | **Frontend SPA "Menos é Mais"** | Redesign em abas segmentadas e camada de cache em memória com resposta instantânea (< 2ms). | Base Core |
| **26/08/2026** | **Catálogo Universal & EAV** | Implementação de `itens_catalogo` com EAV dinâmico em `atributos_extras` (JSONB) e **Soft Delete** (`status_ativo = false`). | Base Core |
| **26/08/2026** | **Data Ingestion (ETL)** | Criação da `importacao_staging` e `JsonCatalogParser` com transação **ACID com Rollback Total**. | Base Core |
| **26/08/2026** | **Webhooks & Travas Operacionais** | Endpoints dedicados para destravamento de OS via Quitação Financeira e Liberação de QSMS. | Base Core |
| **26/08/2026** | **Banco Supabase Multi-Tenant** | 16 tabelas DDL provisionadas com Row Level Security (RLS) e Triggers de Imutabilidade. | Base Core |

