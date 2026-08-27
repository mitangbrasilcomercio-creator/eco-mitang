---
name: cnpj-client-intelligence
description: >-
  Guia de inteligência comercial, fiscal e cadastral a partir de consultas públicas de CNPJ.
  Ensina o agente a interpretar capital social, QSA, CNAEs, situação fiscal e aplicar inteligência de mercado.
---

# Inteligência de Clientes & Parceiros via CNPJ: Conhecimento é Poder

Este guia ensina o modelo de IA e os desenvolvedores a utilizarem todos os dados públicos oficiais de clientes e fornecedores a favor da sustentabilidade e lucratividade da holding Eco-Mitang.

---

## 1. O Princípio Estratégico: "Conhecimento é Poder"

No setor offshore e industrial marítimo, transações envolvem cifras expressivas e ciclos contratuais longos. O ERP Eco-Mitang não armazena apenas cadastros estáticos — ele transforma dados governamentais abertos em **inteligência competitiva, análise de crédito e mitigação de risco de fraude**.

### Campos Estratégicos e sua Aplicação de Negócio:

1. **Capital Social (`capital_social`)**:
   - *Finalidade*: Mensurar a capacidade patrimonial e a solidez financeira do cliente antes de fechar grandes contratos de locação ou manufatura de baterias.
   - *Regra*: Clientes com capital social de grande porte (ex: Fugro com R$ 447M, Oceanpact com R$ 842M) são elegíveis a condições especiais de pagamento e contratos anuais de fornecimento garantido. Clientes com capital baixo exigem sinal antecipado e garantias operacionais.

2. **Quadro de Sócios e Administradores (`qsa` - JSONB)**:
   - *Finalidade*: Identificar os sócios formais, administradores delegados e procuradores.
   - *Regra*: Validação de signatários em contratos de locação de guinchos e pedidos de compra. Previne fraudes de assinatura e garante conformidade de governança corporativa.

3. **CNAE Principal e Secundários (`cnae_principal`, `cnaes_secundarios` - JSONB)**:
   - *Finalidade*: Compreensão do escopo de atuação do cliente (apoio marítimo, sísmica, oceanografia, engenharia clínica).
   - *Regra*: Determina qual alíquota de impostos aplicar (ISSQN vs ICMS, retenções federais) e sugere proativamente itens do Catálogo Universal compatíveis com a atividade do cliente.

4. **Regime Tributário (`opcao_pelo_simples`, `opcao_pelo_mei`)**:
   - *Finalidade*: Gestão fiscal e faturamento.
   - *Regra*: Empresas no Simples Nacional possuem tratamento tributário diferenciado, dispensando retenção na fonte de CSLL, PIS e COFINS na emissão de notas de serviço.

5. **Situação Cadastral & Gatilho de Bloqueio Fiscal (`situacao_cadastral`, `bloqueio_fiscal`)**:
   - *Finalidade*: Compliance e segurança jurídica.
   - *Regra Mandatória*: Empresas declaradas `BAIXADA`, `INAPTA`, `SUSPENSA` ou `NULA` na Receita Federal recebem automaticamente `bloqueio_fiscal = true`, impedindo o fechamento de propostas comerciais e emissão de notas fiscais fraudulentas.

6. **Armazenamento Total de Resposta (`dados_receita_brutos` - JSONB)**:
   - *Regra*: NENHUM dado retornado pela API da Receita Federal / BrasilAPI pode ser descartado. Ele é preservado na coluna `dados_receita_brutos` para consultas futuras e inteligência analítica.

---

## 2. Padrão de Fila e Resiliência em Consultas em Lote (Motor de Extração)

Ao efetuar consultas em lote de CNPJs (como realizado pelo motor histórico de extração da empresa):
- **Delay entre Requisições**: Manter intervalo de segurança (`DELAY_MS = 2000` ms) para respeitar limites de taxa dos órgãos emissores.
- **Tratamento de HTTP 429 (Too Many Requests)**: Aplicar backoff exponencial (sleep de 10 segundos e retry automático).
- **Idempotência no Banco**: Realizar UPSERT com `ON CONFLICT (empresa_id, cnpj_cpf) DO UPDATE`, garantindo que os dados sejam atualizados sem duplicações.

---

## 3. Monitoramento Silencioso em Background ("Por Trás dos Panos")

O serviço `ClienteSyncBackgroundService` executa rotinas periódicas que:
1. Reconsultam clientes ativos da carteira na Receita Federal.
2. Fazem *deep diff* contra o registro local.
3. Se detectarem alterações (ex: sócio alterado, empresa baixada, novo endereço):
   - Atualizam o registro no DB silenciosamente.
   - Gravam cada divergência na tabela `clientes_historico_alteracoes` (SCD Tipo 2) registrando o `campo_alterado`, `valor_anterior`, `valor_novo` e **data de vigência oficial**.
   - Publicam o evento de domínio `CLIENTE.DADOS_ATUALIZADOS_AUTOMATICAMENTE` no barramento `globalEventBus`.
