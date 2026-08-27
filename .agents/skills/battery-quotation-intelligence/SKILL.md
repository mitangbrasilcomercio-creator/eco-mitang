---
name: battery-quotation-intelligence
description: >-
  Guia de inteligência e elaboração de orçamentos e propostas comerciais técnicas para baterias na Mitang Brasil e Arandu.
  Ensina o agente a estruturar cotações simples de 1 página e propostas avançadas escalonadas por volume de 7 páginas.
---

# Inteligência em Orçamentos e Cotações Comerciais (Mitang & Arandu)

Este guia ensina o modelo de IA e os operadores comerciais a estruturar cotações comerciais sem erros, com base no histórico real consolidado de **218 propostas** (R$ 2,15 milhões aprovados).

---

## 1. As Duas Entidades Fornecedoras da Holding

Ao formular qualquer proposta ou orçamento, a IA deve identificar por qual empresa a venda será canalizada:

| Atributo | Mitang Brasil Comércio e Serviços LTDA | Arandu Comércio e Serviços LTDA |
| :--- | :--- | :--- |
| **CNPJ** | `44.221.348/0001-84` | `61.349.982/0001-16` |
| **Inscrição Estadual** | `12284519` | `15587598` |
| **Inscrição Municipal** | `1352739-3` | `15873647` |
| **Endereço Operacional** | Av. das Américas, 16511 - Sala 206/207 - Recreio dos Bandeirantes, Rio de Janeiro/RJ - CEP: 22790-703 | Av. das Américas, 16511 - Sala 206/207 - Recreio dos Bandeirantes, Rio de Janeiro/RJ - CEP: 22790-703 |
| **Banco Principal** | Itaú Unibanco (0341) | Itaú Unibanco (0341) |
| **Agência / Conta** | Agência: `2927` | Conta Corrente: `98663-4` | Agência: `1155` | Conta Corrente: `99507-7` |
| **Chave PIX Oficial** | `regina.fernandes@bateriasmitang.com.br` | `61.349.982/0001-16` |
| **E-mail Comercial** | `diego@bateriasmitang.com.br` | `orcamentos@arandugroup.com.br` |

---

## 2. Os Dois Padrões de Cotação

### 2.1 Modelo 1: Orçamento Simples de Exemplo (1 Página)
*Ideal para clientes recorrentes, vendas spot e reposição rápida de packs:*
- **Cabeçalho Fornecedora**: Razão Social, CNPJ, IE, IM, Endereço, Contato, E-mail, Site e Telefone.
- **Identificação do Comprador**: Razão Social, CNPJ, IE, Endereço completo, Contato técnico/comercial, E-mail e Celular.
- **Tabela de Itens**:
  * `Item` (001, 002...), `Cód. SKU` (ex: `AQL38`, `EXCP`, `220010`).
  * `Produto`: Descrição detalhada incluindo tensão (V), capacidade (Ah) e energia (Wh).
  * `Qnt.` e `U.M.` (Unid.).
  * `Valor Unitário` e `Valor Total`.
  * `Desconto de Abatimento`: Linha destacada indicando desconto por volume ou abatimento de proposta anterior.
- **Condições Comerciais**:
  * `Prazo de faturamento`: 30 dias úteis (para grandes contas cadastradas) ou **50% na aprovação + 50% na coleta/embarque** (para novos clientes ou grandes montantes).
  * `Forma de pagamento`: Boleto bancário ou Transferência Bancária / PIX.
  * `Validade do orçamento`: **15 dias**.
  * `Prazo de confecção`: Pronta entrega (se em estoque) ou 10 a 25 dias úteis (manufatura sob encomenda).
  * `Frete`: Padrão FOB ("Coleta por conta do comprador / cliente") ou CIF (adicionar linha de frete).

---

### 2.2 Modelo 2: Cotação Avançada / Proposta Técnica Estruturada (7 Páginas)
*Mandatório para multinacionais, grandes operadoras de O&G e licitações (ex: Exail do Brasil, Fugro, Petrobras, Modec):*
1. **Página 1 - Capa Institucional**: Proposta comercial, código de referência (ex: `MB-2026/01`), emitente e destinatário.
2. **Página 2 - Controle de Documento & Governança**:
   * Nº de cópia, classificação (Confidencial), criado pelo comercial técnico e assinado pelos sócios administrativos.
   * Informações do projeto: contato do cliente, escopo da aplicação e localização.
3. **Página 3 - Sumário Estruturado**: 5 seções numeradas.
4. **Página 4 - Apresentação, Contextualização & Diagnóstico**:
   * *Sumário Executivo*: Garantia de funcionamento contínuo, seguro e com máxima eficiência operacional.
   * *Declaração da Necessidade*: Diagnóstico dos riscos de oscilação elétrica, falhas de carga prematuras e paradas não programadas em navios oceanográficos.
5. **Página 5 - Solução & Escopo Técnico**:
   * Tensão nominal, capacidade nominal (mAh), composição química e curvas de descarga.
   * *Escopo de Fornecimento*: Inspeção técnica de lote prévia (tolerâncias de tensão e resistência interna), embalagem homologada para produtos perigosos (Dangerous Goods / Lítio).
   * *O que NÃO está incluso*: Instalação física no equipamento offshore (escopo da contratante).
6. **Página 6 - Escalonamento de Prazos & Tabela de Preços por Volume**:
   * *Cronograma Escalonado*:
     - 1 unidade: 3 a 5 dias úteis.
     - 25 unidades: 10 a 15 dias úteis.
     - 50 unidades: 20 a 25 dias úteis.
   * *Investimento Escalonado*: Descontos progressivos de margem por quantidade.
   * *Validade da Proposta*: **30 dias**.
7. **Página 7 - Autoridade, Termos de Garantia & Aceite**:
   * Termos de Garantia: **6 meses** contra defeitos de fabricação.
   * Tributos: Todos os impostos inclusos no preço.
   * Formalização: Solicitação de Purchase Order (P.O) oficial ou aceite assinado.

---

## 3. Diretrizes de Precificação e Rentabilidade
1. **Proteção de Margem**: Descontos superiores a 10% exigem justificativa e registro formal (`desconto_global_percentual > 10%`).
2. **Snapshot Financeiro**: Ao converter o orçamento em cotação ganha, o ERP congela o valor unitário (`valor_unitario_congelado`) na tabela `cotacoes_itens`, blindando a margem operacional contra variações futuras de custo de matéria-prima.
3. **Cruzamento de Inteligência**: A IA deve consultar previamente o Capital Social e a situação fiscal do cliente na base `clientes` antes de conceder prazos faturados a 30 DDL.
