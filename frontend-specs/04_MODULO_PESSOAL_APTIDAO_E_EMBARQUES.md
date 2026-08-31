# 04 — Módulo de Pessoal, Aptidão & Operações Offshore

> **Destinatário:** Claude Code Opus (Backend & Database Architecture)  
> **Autor:** Antigravity / Gemini (Frontend, UI & UX)  
> **Finalidade:** Especificar a interface, componentes visuais, matriz de alocação e fluxos de bloqueio/override do motor de aptidão de pessoal, atendendo às regras de proteção de dados (LGPD) e segurança operacional marítima/industrial.

---

## 1. Contexto Operacional e o Incidente que Originou o Módulo

### 1.1. O Diagnóstico do Erro Humano vs. Arquitetura de Informação
Conforme ressaltado nas decisões arquiteturais da holding Eco-Mitang:
* A alocação indevida de um técnico para uma operação marítima/offshore sem que todos os requisitos de segurança estejam em conformidade **não é uma simples desatenção individual**.
* Trata-se de uma **falha da arquitetura de informação**: quando o gestor precisa consultar férias em uma planilha, certificados em uma pasta de rede, ASO em um e-mail e escala em um caderno, o erro é uma certeza estatística sob a pressão dos prazos dos navios.
* **A Diretriz de UX:** O sistema não deve exigir que o usuário confira mentalmente dezenas de certidões. O sistema deve responder diretamente à pergunta: *"Este colaborador está 100% apto para o embarque na embarcação X, de dd/mm a dd/mm, na função Z?"* — e **bloquear fisicamente** a confirmação da escala em caso negativo.

---

## 2. Cadastro Unificado de Colaboradores (CLT & PJ)

### 2.1. Fim dos Dados Fixos no Frontend
Hoje, `colaboradores.html` exibe um card com dados estáticos codificados no arquivo JavaScript. A nova interface consome dados reais da API e suporta os diferentes tipos de vínculo jurídico:
* **CLT:** Registro de matrícula, departamento, cargo formal, CBO, salário base, benefícios, controle de férias e banco de horas.
* **Prestadores de Serviços PJ / Autônomos:** Razão social, CNPJ enriquecido, contrato de prestação de serviços com vigência, valor pactuado de diária offshore, dados bancários para repasse e controle de emissão de NFS-e.
* **Distinção Mandatória:** `colaborador` ≠ `usuario_sistema`. Um técnico de montagem de baterias é colaborador, mas pode não ter acesso ao sistema; um auditor externo tem usuário, mas não é colaborador da empresa.

### 2.2. Proteção de Dados Sensíveis e Mascaramento (LGPD)
* **Regra de Apresentação de Remuneração:**
  * O salário, valor de pró-labore ou valor de diária de qualquer colaborador é tratado como dado de confidencialidade estrita.
  * Para usuários comuns, coordenadores de campo ou líderes de equipe, os campos de salário e histórico de remuneração aparecem mascarados com asteriscos: `R$ •••••••`.
  * Somente os papéis com permissão explícita (`rh.salarios.ver`, `diretoria.clevel`) visualizam os números abertos.
  * **Trilha de Visualização em Tempo Real:** Toda vez que a tela de um colaborador com salário aberto é carregada, o frontend informa ao usuário que a consulta foi registrada em `auditoria_acessos`.

---

## 3. A Matriz Visual de Aptidão e Escala (Gantt Operacional)

### 3.1. Visão Geral da Ferramenta de Alocação
Para o setor de Operações e RH, a tela principal de escala é uma **Matriz de Linha do Tempo (Gantt Interativo)**:
* **Eixo Vertical:** Lista de Colaboradores e Técnicos Especializados (com foto, função principal, base de atuação e status atual: *Disponível*, *Embarcado*, *Em Folga Regulamentar*, *Em Férias*, *Certificação Vencida*).
* **Eixo Horizontal:** Calendário diário (com zoom para 30 dias, 60 dias ou visão semestral).

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ESCALA DE EMBARQUES OFFSHORE — SETEMBRO/2026                                                         │
├───────────────────┬──────────────────────────────────────────────────────────────────────────────────┤
│ TÉCNICO / FUNÇÃO  │ LINHA DO TEMPO DIÁRIA (01/09 a 30/09)                                            │
├───────────────────┼──────────────────────────────────────────────────────────────────────────────────┤
│ Carlos Alberto    │ [01 ────────── 14] 🟢 EMBARQUE OS-88 (Navio Astro Guaporé)  [15 ─── 30] ⚪ FOLGA │
│ Téc. Baterias Sub │ Status: 100% Regularizado e Apto para todo o período.                           │
├───────────────────┼──────────────────────────────────────────────────────────────────────────────────┤
│ Rodrigo Mendes    │ [05 ────⚠️──── 22] 🔴 ALOCAÇÃO BLOQUEADA (OS-91)                                │
│ Eletricista Subsea│ MOTIVO: Certificação NR-37 vence no dia 12/09 (no meio do período de embarque!). │
│                   │ [Ver Impedimentos (2)]  [Substituir Técnico]  [Quebra de Vidro / Override]       │
└───────────────────┴──────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2. A Validação Temporal Contínua (O Segredo do Período Inteiro)
* A falha mais perigosa em conferências manuais ocorre quando o certificado está válido no dia do embarque (ex: 05/09), mas vence enquanto o técnico está a bordo no alto-mar (ex: 12/09).
* O motor de aptidão e a interface do Gantt avaliam a validade de cada documento para **cada um dos dias** da janela `[data_embarque, data_desembarque]`.
* Se qualquer documento obrigatório expirar dentro do intervalo, a barra inteira no Gantt fica vermelha e a emissão da lista de embarque (POB - Personnel on Board) é bloqueada.

---

## 4. O Painel de Diagnóstico do Motor de 10 Checagens

Ao clicar em qualquer colaborador para verificar sua aptidão, o sistema abre o **Painel Diagnóstico de Aptidão**, exibindo em tempo real o resultado retornado pela função do banco de dados:

| # | Verificação de Aptidão | Status na Interface | Detalhamento Exibido ao Usuário |
|---|---|---|---|
| **1** | Vínculo Empregatício / Contrato | 🟢 APROVADO | Vínculo CLT Ativo (Admissão: 10/03/2023) |
| **2** | ASO (Atestado de Saúde Ocupacional) | 🟢 APROVADO | Válido até 18/12/2026 (Apto para Trabalho em Altura e Espaço Confinado) |
| **3** | Certificações Obrigatórias da Função | 🔴 BLOQUEANTE | **NR-37 Básica:** Vencida em 15/08/2026 há 15 dias. |
| **4** | Ausência de Férias ou Afastamento | 🟢 APROVADO | Sem registros de gozo de férias ou atestado médico no período. |
| **5** | Sobreposição de Escalas | 🟢 APROVADO | Nenhuma outra OS alocada para o período de 01/09 a 20/09. |
| **6** | Descanso Mínimo Interjornada | 🟢 APROVADO | Cumpriu 14 dias de folga após o desembarque da OS-82. |
| **7** | Limite de Dias Consecutivos no Mar | 🟢 APROVADO | Total previsto: 14 dias (Limite regulatório: 28 dias). |
| **8** | Documentação Pessoal Marítima | 🟡 ALERTA | Passaporte válido; Caderneta de Inscrição e Registro (CIR) vence em 45 dias. |
| **9** | Requisitos do Cliente / Embarcação | 🟢 APROVADO | Treinamento de Integração Plataforma P-68 concluído e no prazo. |
| **10**| Restrições Médicas Específicas | 🟢 APROVADO | Sem restrições ergonômicas ou auditivas apontadas no laudo. |

---

## 5. Fluxo de Bloqueio Rígido e "Quebra de Vidro" (Override Auditado)

### 5.1. Bloqueio por Padrão
Se o painel diagnóstico apresentar qualquer item marcado como `🔴 BLOQUEANTE`:
* O botão principal **[Confirmar Alocação de Embarque]** permanece desabilitado, exibindo a mensagem em tooltip: *"Ação impedida: O técnico possui 1 impedimento bloqueante não resolvido."*
* A lista de sugestões exibe automaticamente o botão: **[Sugerir Substitutos Aptos]**, que busca no banco técnicos com a mesma qualificação e com todos os exames e certificações válidos para a mesma data.

### 5.2. Modal de Quebra de Vidro (Emergency Override)
Para cenários extremos em que a operação offshore não pode parar (ex: substituição emergencial onde o certificado de renovação foi emitido pelo instituto de treinamento mas ainda não subiu para a base com documento oficial):
1. O usuário precisa ter o perfil `Gestor_CLevel` ou papel equivalente de operações offshore.
2. Ao clicar em **[Acionar Override de Emergência]**, o modal escurece a tela e exibe um alerta de alta severidade:
   > ⚠️ **Atenção: Você está autorizando o embarque de um colaborador com pendência regulatória.**  
   > Esta ação será registrada no Livro Imutável de Auditoria, com seu usuário, carimbo de data/hora, endereço IP e notificação imediata à Diretoria Executiva e ao QSMS.
3. **Campos Obrigatórios no Modal:**
   * Seleção da Natureza da Emergência (*Substituição Imprevista de Navio*, *Falha Operacional Crítica a Bordo*, *Certificado Válido Pendente de Homologação Digital*).
   * Justificativa Detalhada por escrito (mínimo de 30 caracteres).
   * Confirmação de Senha e Código MFA (TOTP).
4. **Resultado Visual no Sistema:**
   * A alocação é efetivada para não paralisar o navio, mas o registro ganha uma tarja vermelha piscante no Gantt com a etiqueta: `[OVERRIDE AUTORIZADO POR: DIEGO RIBEIRO — AUDITORIA PENDENTE]`.
   * Um e-mail/notificação prioritária é disparada para o comitê de compliance para resolução e regularização em no máximo 24 horas.

---

## 6. Central de Gestão de Documentos e Alertas Preditivos

### 6.1. Painel de Vencimentos em 90, 60, 30 e 15 Dias
Para evitar que os impedimentos aconteçam de surpresa, o módulo de pessoal disponibiliza um **Radar Preditivo de Vencimentos**:
* Agrupa em abas dinâmicas os documentos que estão entrando na zona de risco:
  * **Amarelo (60 a 90 dias):** Momento de agendar cursos ou renovação de ASO.
  * **Laranja (30 a 60 dias):** Alerta prioritário no painel do RH e do colaborador.
  * **Vermelho (< 30 dias):** Notificação diária e impedimento de alocação em escalas futuras que ultrapassem a data de vencimento.

### 6.2. Histórico Profissional e Trajetória (O Currículo Vivo do Técnico)
Ao selecionar a ficha do colaborador, a interface disponibiliza:
* **Histórico de Embarques:** Total de dias no mar no ano, navios onde já operou, clientes atendidos e avaliações técnicas da liderança a bordo.
* **Histórico de Funções e Salários:** Linha do tempo com datas de início e fim de cada cargo, permitindo responder a auditorias trabalhistas sobre qual era a função e remuneração exatas em qualquer mês do passado.
* **Repositório Digital de Certificados:** Visualizador integrado de PDFs e imagens de certificados com status de verificação (*Aguardando Análise*, *Homologado*, *Recusado por Ilegibilidade*).
