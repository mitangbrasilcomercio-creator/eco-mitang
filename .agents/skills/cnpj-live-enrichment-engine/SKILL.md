---
name: cnpj-live-enrichment-engine
description: Arquitetura do motor de busca, validação e enriquecimento em tempo real de CNPJs na holding Eco-Mitang. Ensina a IA a operar a cascata de múltiplos provedores oficiais (BrasilAPI -> Minha Receita -> ReceitaWS), respeitar rate-limits (HTTP 429), gerenciar cache local bidirecional e inferir verticais de mercado sem gerar dados fictícios.
---

# Motor de Busca e Enriquecimento de CNPJ em Tempo Real (Eco-Mitang)

> **Documento Mandatório de Integração com a Receita Federal do Brasil (RFB)**  
> **Base de Referência:** `motor antigo de extração de dados de CNPJ.html` e `cnpj_data.json` (287 KB).

---

## 1. Arquitetura da Cascata de Provedores Oficiais

Para garantir 100% de taxa de sucesso nas buscas de CNPJ sem depender de serviços pagos ou sofrer bloqueios:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        FLUXO DE CASCATA MULTI-PROVEDOR EM TEMPO REAL                   │
└───────────────────────────────────┬────────────────────────────────────────────────────┘
                                    │
                         [CNPJ Informado (14 Dígitos)]
                                    │
                                    ▼
                         [1. Cache Local em Disco] ── (Encontrado?) ──> Retorna em <2ms
                                    │ (Não)
                                    ▼
                         [2. BrasilAPI v1 (Oficial)]
                         (Timeout 8s, Retry em 429)
                                    │
                         ┌──────────┴──────────┐
                         │ (Sucesso)           │ (Falha de Rede / 500)
                         ▼                     ▼
                  Retorna & Salva       [3. Minha Receita (Fallback 1)]
                  no Cache Local               │
                                        ┌──────┴──────┐
                                        │ (Sucesso)   │ (Falha)
                                        ▼             ▼
                                 Retorna & Salva   [4. ReceitaWS (Fallback 2)]
                                 no Cache Local        │
                                                ┌──────┴──────┐
                                                │ (Sucesso)   │ (Falha)
                                                ▼             ▼
                                         Retorna & Salva   Erro Informativo Oficial
                                         no Cache Local    (NUNCA gerar dados fake!)
```

---

## 2. Regras Rígidas de Integridade de Dados

1. **PROIBIDO GERAR DADOS FICTÍCIOS:**  
   O colaborador anterior gerava strings como `COMPANHIA INDUSTRIAL {cnpj} S/A`. Isso é estritamente proibido no ERP da Eco-Mitang. Se todos os provedores falharem, o sistema reporta indisponibilidade temporária.
2. **Validação Algorítmica Módulo 11:**  
   O CNPJ deve ser validado com os pesos `[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]` antes de qualquer requisição externa.
3. **Persistência Bidirecional:**  
   Toda nova consulta bem-sucedida deve atualizar imediatamente o arquivo `cnpj_data.json` e o espelho local do banco de dados para que a próxima consulta ocorra em tempo zero.

---

## 3. Mapeamento de Verticais por CNAE e Razão Social

A IA deve classificar o parceiro nas 5 verticais estratégicas da holding Eco-Mitang:
1. **Offshore, Petróleo & Gás Subsea:** CNAE 06, 09, 7112-0/00 ou termos como *SUBSEA, OFFSHORE, FUGRO, OCEANPACT, C-INNOVATION, PETROBRAS*.
2. **Hospitalar & Equipamentos Médicos:** CNAE 86, 4773, 3250, 4645 ou termos como *HOSPITAL, MEDIC, CLINIC, CIRURG, MV3, MEDSAVE*.
3. **Indústria & Insumos Manufaturados:** CNAE 22, 17, 27 ou fornecedores como *STREMA, SBT, HAYAMAX, RYNDACK*.
4. **Serviços Técnicos & Consultoria PJ:** CNAE 71, 70, 69, 62 ou termos como *CONSULTORIA, ENGENHARIA, SURVEY, PERICIA*.
5. **Comércio & Distribuição Geral:** CNAE 46, 47.
