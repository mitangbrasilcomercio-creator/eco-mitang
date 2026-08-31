# 06 — Demandas de Backend & Banco de Dados Derivadas do Frontend

> **Destinatário:** Claude Code Opus (Backend & Database Engineer)  
> **Autor:** Antigravity / Gemini (Frontend, UI & UX)  
> **Finalidade:** Servir como **guia técnico direto de requisitos** que o backend e o banco de dados PostgreSQL/Supabase devem implementar para viabilizar todas as telas, fluxos e ferramentas descritas nos documentos de 01 a 05.

---

## 1. Princípio de Cooperação entre os Dois Agentes

Conforme estabelecido no `AGENTES.md`:
* **Claude Code** é o proprietário de `src/`, `database/`, `scripts/` e `tests/`.
* **Antigravity / Gemini** é o proprietário de `public/` (telas, estilos, fluxos e dashboards).
* **Fronteira Compartilhada:** `public/apiService.js` e `CONTRATO-API-FRONTEND.md`.

Para que a interface do Eco-Mitang atinja o padrão de *"rastreabilidade total, ausência de falha silenciosa e recusa a estimativas fictícias"*, o backend precisa fornecer estruturas de dados pensadas para consumo analítico. Abaixo estão as demandas contratuais.

---

## 2. Requisitos Estruturais para o Banco de Dados (Schema & PostgreSQL)

### 2.1. O Contrato dos "Três Livros Imutáveis" (Append-Only)
O frontend não terá botões de "Deletar". Todas as telas de cancelamento acionam estornos. Para sustentar isso no banco:
1. **Livro Contábil (`lancamentos_contabeis` + `lancamentos_partidas`):**
   * Campos obrigatórios: `data_competencia` (DATE NOT NULL) e `data_caixa` (DATE NULLABLE).
   * Trigger estrito de integridade: rejeitar qualquer transação onde `SUM(debito) <> SUM(credito)`.
   * Campos de rastreamento: `documento_origem_tipo` (ex: `NFE`, `OFX`, `FOLHA`) e `documento_origem_id`.
   * Campo `estornado_por_id` para apontar o lançamento de estorno sem deletar o original.
2. **Livro de Auditoria (`auditoria_eventos` + `auditoria_acessos`):**
   * Trigger genérico que captura: `tabela`, `registro_id`, `operacao`, `dados_antes` (JSONB), `dados_depois` (JSONB), `campos_alterados` (TEXT[]), `usuario_id`, `motivo`, `ip_origem` e `ocorrido_em`.
   * O `tenantMiddleware` deve injetar as variáveis de sessão via `set_config('app.usuario_id', ...)` e `set_config('app.motivo', ...)`.
   * Tabela `auditoria_acessos` para registrar leituras de dados sensíveis (salário, exames médicos) com `concessao_id` (vínculo com o acesso JIT).
3. **Livro de Movimentos (`estoque_movimentos`, `alocacoes`, `embarques`):**
   * Saldo nunca deve ser coluna editável diretamente. Saldo em tela é computado por agregação ou snapshot auditado.

### 2.2. O Motor de Aptidão como Função de Banco (`aptidao_colaborador`)
O frontend necessita de uma função RPC (Remote Procedure Call) ultra-rápida para alimentar a matriz Gantt e os formulários de escala:
```sql
FUNCTION aptidao_colaborador(
  p_colaborador_id UUID,
  p_data_inicio    DATE,
  p_data_fim       DATE,
  p_funcao_id      UUID,
  p_projeto_id     UUID DEFAULT NULL
) RETURNS TABLE (
  apto            BOOLEAN,
  impedimentos    JSONB,   -- Array de [{ tipo, descricao, vence_em, gravidade: 'BLOQUEANTE' }]
  alertas         JSONB    -- Array de [{ tipo, descricao, vence_em, gravidade: 'ALERTA' }]
);
```
* **Exigência Crítica:** A validação deve cobrir **todos os dias** do intervalo entre `p_data_inicio` e `p_data_fim`, e não apenas a data inicial.

### 2.3. Tabelas de Códigos Fiscais como Tabelas de Decisão
O frontend precisa que códigos fiscais venham acompanhados de seus comportamentos semânticos:
* Tabela `cfop_referencia`:
  * Deve conter flags booleanas: `gera_estoque`, `sinal_estoque` (+1, -1, 0), `gera_resultado` (entra ou não na DRE), `gera_titulo` (gera contas a pagar/receber).
  * Isso permite que a interface exiba o "Tradutor Humano de Códigos Fiscais" e evite que notas de conserto ou comodato inflacionem a receita.

---

## 3. Endpoints e Contratos de API Esperados pelo Frontend

Abaixo está a lista consolidada de endpoints que o Claude Code deve priorizar para alimentar os novos fluxos visuais:

### 3.1. Módulo Financeiro & Contábil
* `GET /api/v1/contabilidade/dre`
  * **Parâmetros:** `periodo_inicio`, `periodo_fim`, `regime` (`COMPETENCIA` | `CAIXA`), `empresa_id`.
  * **Payload de Resposta:** Deve conter a árvore de contas com `valor`, `%_rec_bruta` e flags de transparência:
    ```json
    {
      "periodo": "2026-08",
      "regime": "COMPETENCIA",
      "status_periodo": "ABERTO",
      "baseado_em_dados": true,
      "cmv_disponivel": true,
      "lucro_liquido_parcial": true,
      "motivo_parcial": "ATIVO_IMOBILIZADO_SEM_DEPRECIACAO",
      "linhas": [ ... ]
    }
    ```
* `POST /api/v1/conciliacoes`
  * **Payload de Envio:** `{ "transacao_bancaria_id": "uuid", "documento_tipo": "NFE", "documento_id": "uuid", "justificativa": "string" }`
  * **Ação:** Cria o vínculo, baixa a duplicata/obrigação e gera lançamento de baixa no Razão.
* `GET /api/v1/conciliacoes/sugestoes`
  * Retorna sugestões automatizadas de pareamento entre transações bancárias e títulos em aberto baseadas em score de similaridade (valor, CNPJ, janela de datas ± 3 dias).
* `POST /api/v1/contabilidade/fechamento-periodo`
  * Trava o mês contábil após conferência de partidas dobradas e reconciliação com o contador.

### 3.2. Módulo de Ingestão & Quarentena
* `POST /api/v1/ingestao/verificar-hashes`
  * Recebe array de hashes SHA-256 dos arquivos que o usuário arrastou para a tela. Retorna quais já foram ingeridos previamente para bloquear duplicidade visualmente.
* `POST /api/v1/ingestao/upload-lote`
  * Upload com processamento assíncrono em quarentena, gerando preview antes da confirmação final pelo usuário.

### 3.3. Módulo de Pessoal & Aptidão
* `GET /api/v1/pessoal/colaboradores`
  * Retorna lista de colaboradores com projeção condicional: se o usuário tiver `rh.salarios.ver`, o campo `remuneracao` vem preenchido; se não, vem `null` ou mascarado pelo backend.
* `POST /api/v1/pessoal/verificar-aptidao`
  * Executa a função `aptidao_colaborador` e retorna o diagnóstico completo das 10 verificações para exibição no Gantt e no modal de alocação.
* `POST /api/v1/pessoal/alocar-embarque`
  * Recebe dados do embarque. Se houver impedimento bloqueante e não for enviado o payload de `override_autorizacao`, o backend **deve recusar com HTTP 422**.
* `POST /api/v1/pessoal/override-alocacao`
  * Registra a "Quebra de Vidro" com motivo, senha/MFA e gera evento de auditoria de severidade alta.

### 3.4. Governança e Acesso Just-in-Time (JIT)
* `POST /api/v1/autorizacao/solicitar-acesso-jit`
  * Solicitação de liberação temporária de campo restrito (ex: custo de produto para cotação).
* `POST /api/v1/autorizacao/conceder-acesso-jit`
  * Gestor aprova a solicitação, definindo prazo de expiração (ex: 4 horas) e escopo de IDs.

---

## 4. Requisitos de Performance e Ergonomia da API

1. **Paginação e Virtual Scrolling:**
   * Endpoints de listagem (`/notas_fiscais`, `/transacoes`, `/lancamentos_contabeis`) devem aceitar parâmetros padronizados: `page`, `limit` (suportando até 500 itens para o DataGrid virtual), `sort_by`, `sort_order` e filtros compostos em JSON.
   * Resposta sempre acompanhada de: `{ "data": [...], "total": 12450, "page": 1, "total_pages": 25 }`.
2. **Campos de Agregação e Drill-Down:**
   * Sempre que um endpoint retornar um totalizador (ex: total de deduções fiscais na DRE), deve retornar também um array de identificadores ou uma rota de detalhamento: `detalhe_url: "/api/v1/contabilidade/lancamentos?conta_id=4.1.01&periodo=2026-08"`.
3. **Respostas Estruturadas de Erro (RFC 7807):**
   * Nenhum erro 500 com stack trace vazado no payload.
   * Formato padronizado de erro:
     ```json
     {
       "status": 422,
       "codigo": "PARTIDA_DESBALANCEADA",
       "mensagem": "A soma dos débitos (R$ 1.500) difere dos créditos (R$ 1.380).",
       "diferenca": 120.00,
       "requisicao_id": "c7a8e2b1-9124-4f51-b841-382a938c11f0"
     }
     ```
   * O frontend captura o `codigo` e a `mensagem` para renderizar o diálogo de correção assistida para o usuário.

---

## 5. Próximos Passos Sugeridos para o Claude Code Opus

Com base nas especificações de UI/UX entregues nesta pasta `frontend-specs/`, sugere-se a seguinte ordem de ataque para o Claude Code:
1. **Fase 0 (Saneamento Imediato):**
   * Corrigir `FORNECEDORES_OPERACIONAIS` e a dupla contagem de tributos em `src/modules/contabilidade/dre.repository.ts`.
   * Aplicar `exigirPermissao` em todas as rotas ativas da API.
2. **Fase 1 (Fundação Imutável):**
   * Criar as tabelas de `lancamentos_contabeis` e `lancamentos_partidas` com trigger de balanceamento.
   * Criar a tabela `auditoria_eventos` e os gatilhos genéricos de gravação.
   * Reestruturar a DRE para ler do Razão por competência.
3. **Fase 3 (Pessoal & Aptidão):**
   * Criar o schema completo de colaboradores, certificações e a função `aptidao_colaborador`.
   * Expor as rotas de consulta para que o frontend substitua a casca estática `colaboradores.html` pela Matriz Gantt real.
