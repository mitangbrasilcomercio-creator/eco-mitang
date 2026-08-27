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
   - *Regra*: Clientes com capital social de grande porte (ex: Fugro com R$ 447M, Oceanpact com R$ 842M, Petrobras com R$ 205B) são elegíveis a condições especiais de pagamento e contratos anuais de fornecimento garantido. Clientes com capital baixo exigem sinal antecipado e garantias operacionais.

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

## 2. Classificação Automática de Verticais e Nichos por CNAE

Para apoiar a tomada de decisão comercial e o direcionamento de propostas técnicas, a IA classifica automaticamente cada parceiro em uma das 5 verticais estratégicas da holding:

| Vertical de Mercado | CNAEs Típicos | Exemplos de Empresas | Aplicação de Baterias / Serviços |
| :--- | :--- | :--- | :--- |
| **Offshore, Petróleo & Gás Subsea** | `06xxx`, `09xxx`, `7112000`, ou termos "SUBSEA", "OCEAN", "PETROLEO" | Petrobras, Fugro, Oceanpact, Modec, Ensco | Packs primários Li-SOCl2 / Alcalinas para ADCPs, acústicos e oceanografia |
| **Hospitalar & Equipamentos Médicos** | `86xxx`, `4773`, `3250`, `4645`, ou termos "HOSPITAL", "MEDIC", "CLINIC" | MV3 Hospitalar, Clínicas Médicas | Packs recarregáveis para ventiladores Servo, Liko Viking e monitores |
| **Indústria & Insumos Manufaturados** | `22xxx` (plásticos), `17xxx` (embalagens), `27xxx` (eletroeletrônica) | Strema, SBT Embalagens, Ryndack, Hayamax | Fornecimento de matéria-prima, células e componentes |
| **Serviços Técnicos & Consultoria PJ** | `71xxx`, `70xxx`, `69xxx`, `62xxx`, `63xxx` | Consultorias de Engenharia, Perícias, TI | Treinamentos HUET/CBSP, softwares e assessoria |
| **Comércio & Distribuição Geral** | `46xxx`, `47xxx` | Distribuidores e Atacadistas de Variedades | Pilhas de prateleira e baterias secas |

---

## 3. Arquitetura do Dossiê 360° do Parceiro (UI / UX)

Ao clicar sobre qualquer cliente ou fornecedor no CRM ou em transações:
1. **Cabeçalho Executivo**: Razão Social, Fantasia, CNPJ formatado no padrão `XX.XXX.XXX/XXXX-XX`, botão de cópia rápida, status RFB em tempo real e badge de nicho com ícone e cor correspondente.
2. **Ficha Cadastral & QSA**: Capital Social, Tempo de Mercado, Endereço completo com CEP, telefones, e-mails, e tabela do Quadro de Sócios e Administradores com qualificação e faixa etária.
3. **Histórico de Notas Fiscais**: Relatório de todas as NF-e (produtos) e NFS-e (serviços) emitidas e recebidas, com data formatada em `DD/MM/AAAA`.
4. **Cotações & Orçamentos**: Todas as propostas comerciais emitidas pela Arandu ou Mitang, com status (`Compra Aprovada`, `Em Negociação`) e valor monetário.
5. **Ranking de Baterias / Produtos**: Modelos mais vendidos ou comprados, com SKU, quantidade física e valor financeiro acumulado.
6. **Extrato Bancário OFX**: Relação de TEDs, PIXs e boletos vinculados àquele CNPJ/CPF com data `DD/MM/AAAA`.

---

## 4. Prevenção de Duplicidades em Consultas Multi-Tenant

Para evitar duplicações de parceiros nas listagens consolidadas da holding:
- A consulta consolidada (`empresa_id = 'all'`) deve sempre aplicar agregação por CNPJ (`DISTINCT ON (regexp_replace(cnpj_cpf, '[^0-9]', '', 'g'))`).
- Todas as datas devem ser exibidas estritamente no padrão brasileiro (`DD/MM/AAAA` e `DD/MM/AAAA HH:mm:ss`), jamais no formato americano `AAAA-MM-DD`.
