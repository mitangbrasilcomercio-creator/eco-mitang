# 10 — Aplicação: Ingestão Inteligente de XML (NF-e/NFS-e) e OFX Bancário

> **Destinatário Principal:** Claude Code Opus (Backend & Database Architect) e Diego (Liderança do Produto)  
> **Autor:** Antigravity / Gemini (Frontend & UX Architect)  
> **Objetivo:** Definir a melhor experiência de usuário para que qualquer operador importe lotes massivos de XMLs (NF-e de produtos e NFS-e municipais) e extratos bancários OFX com máxima velocidade, zero erros, conferência imediata e detecção visual instantânea de anomalias e duplicidades.

---

## 1. O Problema Crítico da Ingestão de Dados no ERP Atual

A entrada de dados fiscais e bancários hoje enfrenta três gargalos graves identificados no diagnóstico:
1. **Dependência do Terminal e de Desenvolvedor:** Hoje o processo exige rodar scripts CLI (`npm run db:reingest`), impedindo que o operador financeiro atue com autonomia no dia a dia.
2. **Ingestão às Cegas (Falta de Preview e Quarentena):** Quando arquivos são processados direto no banco, erros de layout, memos bancários desconhecidos ou duplicidades corrompem os saldos silenciosamente antes que alguém possa revisar.
3. **Falta de Feedback Didático de Erros:** Quando um XML falha, o usuário geralmente recebe um erro genérico incompreensível (ex: *"Parser Error at line 14"*), em vez de uma explicação acionável (ex: *"Esta nota fiscal foi cancelada na SEFAZ em 10/08/2026"*).

---

## 2. A Central Unificada de Ingestão e Quarentena (UI/UX)

A nova tela de Ingestão de Arquivos funciona em **4 Fases Sequenciais Claras (Wizard Fluido)**:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ CENTRAL DE INGESTÃO FISCAL E BANCÁRIA — AGOSTO/2026                                                    │
│ [ Etapa 1: Upload & Triagem ] ──▶ [ Etapa 2: Quarentena & Conferência ] ──▶ [ Etapa 3: Efetivação ]    │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ZONA DE ARRASTAR E SOLTAR INTELIGENTE (DRAG & DROP)                                                    │
│ ┌────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │                  📥 Arraste seus arquivos XML de NF-e, NFS-e ou extratos OFX aqui                  │ │
│ │                         ou [ Selecionar Arquivos do seu Computador ]                               │ │
│ │   • Suporta lotes múltiplos (até 200 arquivos simultâneos)  • Detecção automática de formato       │ │
│ └────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                        │
│ RESUMO DA TRIAGEM EM TEMPO REAL:                                                                       │
│ Total de Arquivos Detectados: 42 arquivos (38 XMLs NF-e | 2 XMLs NFS-e | 2 Extratos OFX)               │
│ • 🟢 39 Arquivos Novos e Válidos (Prontos para Conferência)                                            │
│ • 🟡 02 Arquivos com Aviso (1 NF-e com CFOP novo | 1 OFX com transação sem memo padronizado)           │
│ • 🔴 01 Arquivo Bloqueado por Duplicidade (Extrato Itaú 01 a 15/08 já importado com mesmo hash SHA)    │
│                                                                                                        │
│ [ Inspecionar Lote na Quarentena ]  [ Descartar Duplicados ]  [ Confirmar e Efetivar no Sistema ]      │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Experiência de Conferência: O Inspetor de Quarentena

Antes de comitar qualquer linha no Razão ou no Estoque, o usuário visualiza a **Grade de Quarentena (Preview Grid)**:

### 3.1. Como Funciona a Conferência de XML de NF-e (Produtos)
A tela exibe os dados extraídos pelo parser do backend antes da gravação definitiva:
* **Cabeçalho:** Número da Nota, Série, Emitente (CNPJ com selo de Situação Cadastral), Destinatário e Valor Total.
* **Conferência Automática de Totalizadores:**
  * O frontend compara: `Soma dos Itens (vProd) + Frete + Impostos - Descontos` **versus** `Total da Nota (vNF)`.
  * Se houver divergência de centavos (erro de arredondamento da SEFAZ), a linha ganha um alerta com sugestão de ajuste de arredondamento.
* **Apropriação Semântica do CFOP:**
  * Se a nota é de **compra de células de lítio (CFOP 1102)**, o sistema mostra: *"Ação prevista: Adicionar 500 unidades ao Estoque de Matéria-Prima e gerar 1 Duplicata a Pagar para 30 dias."*
  * Se a nota é de **remessa para conserto (CFOP 5915)**, o sistema mostra: *"Ação prevista: Baixar temporariamente o equipamento do estoque físico sem gerar despesa na DRE."*

### 3.2. Como Funciona a Conferência de NFS-e (Serviços)
* Pela multiplicidade de layouts municipais (Rio de Janeiro, Macaé, Niterói, São Paulo):
  * O sistema exibe o espelho simplificado da nota: Tomador, Prestador, Descrição dos Serviços Offshore, Alíquota de ISS e Retenções na Fonte (PIS, COFINS, CSLL, IRRF).
  * A tela destaca em azul: *"Retenção de Tributos detectada: R$ 4.200,00. O sistema gerará o título líquido e provisionará as guias de retenção aos órgãos competentes."*

### 3.3. Como Funciona a Conferência de OFX Bancário
* A interface agrupa os lançamentos do extrato bancário em três categorias visuais:
  1. **🟢 Lançamentos Claros e Conciliáveis:** Saídas que possuem valor, data e CNPJ idênticos a duplicatas em aberto (ex: pagamento de fornecedor de baterias).
  2. **🟡 Lançamentos Automáticos do Banco:** Aplicação automática / Resgate automático / CDI (Overnight) — a interface isola esses lançamentos para **não inflacionar a DRE**, tratando-os como mera transferência interna de custódia bancária.
  3. **🔴 Lançamentos com Memo Novo:** Descrições não reconhecidas pela regex. A tela abre um campo inline onde o usuário seleciona a categoria em 2 segundos e clica em: `[Salvar e Criar Regra Futura]`.

---

## 4. Auditoria de Veracidade: Como o Usuário Confere se Está Correto?

Para que o operador e o auditor tenham 100% de certeza de que a importação foi perfeita:
1. **Hash SHA-256 e Prova de Integridade:**
   * Cada arquivo importado tem seu hash SHA-256 gravado no banco e exibido ao lado do registro.
   * Clicar no hash exibe: *"Arquivo XML original preservado sem alterações desde a autorização da SEFAZ em 14/08/2026 às 14:32."*
2. **Botão de Desfazer em Lote (Rollback Assistido):**
   * Se o usuário importar por engano um arquivo errado (ex: extrato do mês passado), ele não precisa deletar linha por linha.
   * No histórico de ingestões, há o botão: **`[ Desfazer Importação Deste Lote ]`**.
   * O sistema estorna todos os lançamentos gerados por aquele lote de uma só vez, registrando a reversão na tabela de auditoria.

---

## 5. Perguntas Estruturadas para o Claude Code Opus (Backend & DB)

Para construirmos juntos essa central de ingestão robusta, Claude, precisamos da sua visão arquitetural:

1. **Pipeline de Parser de XML em Memória para o Preview:**
   * *Pergunta:* Você prefere que a etapa de Preview processe os XMLs em memória (ou em uma tabela temporária `ingestao_quarentena_lotes`), retornando o JSON parseado para o frontend validar na tela antes de gravar em definitivo nas tabelas finais (`documentos_fiscais`, `lancamentos_contabeis`, `estoque_movimentos`)?
2. **Idempotência Real e Hash Composto no OFX:**
   * *Pergunta:* No diagnóstico, você elogiou o hash composto no OFX que lida com o reaproveitamento de FITID do Bradesco. Como expor esse hash composto no endpoint de verificação prévia (`POST /api/v1/ingestao/verificar-hashes`) para que a interface avise o usuário antes mesmo do upload físico do arquivo?
3. **Tratamento de NFS-e Multi-Município:**
   * *Pergunta:* Como você estruturará a fábrica de parsers de NFS-e (`nfse-parser.factory.ts`)? Quais cidades você sugere suportarmos na primeira onda? Rio de Janeiro (onde fica a sede) e Macaé (onde ocorrem as operações offshore)?
4. **Tratamento de Aplicações Automáticas (CDI/Overnight) no Backend:**
   * *Pergunta:* Como você garantirá no schema que movimentações bancárias com histórico como *"APLIC AUT"* ou *"INVEST FACIL"* gerem lançamentos contábeis puramente patrimoniais (Transferência entre Contas de Disponibilidade) e sejam bloqueadas de entrar como receita ou despesa na DRE?
