---
name: battery-product-catalog
description: >-
  Catálogo de engenharia de baterias submarinas e hospitalares da holding Eco-Mitang (Arandu e Mitang Brasil).
  Ensina o agente a identificar químicas, tensões, capacidades, fabricantes OEM e normas de segurança.
---

# Catálogo Especializado de Baterias Submarinas & Hospitalares

Este guia orienta o modelo de IA e desenvolvedores a compreender a engenharia de produtos que compõe o faturamento da **Mitang Brasil** e da **Arandu**.

---

## 1. As Duas Grandes Verticais de Produtos

### 1.1 Setor Náutico / Subsea (Equipamentos Oceanográficos e de Petróleo & Gás)
Baterias projetadas para operação submersa em profundidades de até 3.000 metros, sujeitas a alta pressão hidrostática, vibração de navios e requisitos rigorosos de segurança e densidade de energia:
- **ADCP (Acoustic Doppler Current Profiler)**: Perfiladores de corrente marítima dos fabricantes **Teledyne** e **Sontek**.
  * Modelos: Workhorse 1200kHz, 600kHz, 300kHz, LR 150kHz, LR 75kHz.
  * Tensão/Energia: 32,4V / 1.820Wh (em Li-SOCL2, pack de 2 ou 4 furos) ou 42V / 630Wh (Alcalina).
- **Aquadopp & AWAC**: Correntômetros e perfiladores de ondas do fabricante **Nortek**.
  * Modelos: Aquadopp 13,5V 50Wh/100Wh (Alcalina), 14,4V 250Wh/380Wh (Li-SOCL2, código `AQL38`), 10,8V 75,6Wh (Li-Ion recarregável com carregador `220067`), AWAC 13,5V 540Wh (`220011`), AWAC 15V 1.800Wh (`220029`), AWAC 2 18V 1.800Wh (`220051-2`).
- **Signature**: Linha moderna de perfiladores multifrequência da **Nortek**:
  * Modelos: Signature 18V 100Ah / 1.800Wh (`220051`), Signature 18V 30Ah / 540Wh (`220014`), Signature 15V 6Ah / 90Wh (`220047`).
- **cNode**: Transponders acústicos submarinos de posicionamento USBL da **Kongsberg**:
  * Modelos: cNode Maxi 14,4V 180Ah / 2.592Wh (`CMXL48-M` e `CMXL48-N`), cNode MiniS 25,6V 2,8Ah / 71,7Wh (`CNML16` em LiFePO4).
- **Liberadores Acústicos**: Equipamentos de ancoragem e resgate no fundo do mar dos fabricantes **Edgetech** e **Benthos**:
  * Modelos: Edgetech 8242SX 9V 25,5Ah / 230Wh (`LAE`), Benthos 13,5V (`BT13`), Benthos 27V (`BT27`), Sonardyne RT6-3000 (`RT6-3-A`).
- **Equipamentos Especiais**:
  * **Exail Canopus**: 15V 36Ah / 540Wh (`EXCP`).
  * **Jasco AMAR G4 Ultra Deep**: 12V 164Ah / 1.968Wh (`JAG4UD`).
  * **Aanderaa Seaguard II**: 7V 35Ah / 245Wh (`SEL`) e 9V 15Ah (`SEA`).
  * **Blue ROV2**: Robótica submarina 14,8V 18Ah / 266,4Wh (`BLU`).
  * **Seaglider Kongsberg**: Veículo submarino autônomo 10,8V 78Ah / 842,4Wh (`SGD10`) e 24V 117Ah / 2.948,4Wh (`SGD24`).

### 1.2 Setor Hospitalar & Engenharia Clínica
Baterias de backup crítico para equipamentos de suporte à vida e diagnóstico:
- **Ventiladores Pulmonares**: Maquet Servo S 12V 4Ah / 48Wh (`MQ` em Ni-MH), Leistung Luft 3 11,1V 13,2Ah / 146,5Wh (`LL3` em Li-Ion), Mindray SV300 14,4V 5,7Ah / 82Wh (`SV30`).
- **Desfibriladores & Cardioversores**: Zoll M-Series PD4410 10V 2,5Ah / 25Wh (`ZLR`), Instramed Cardiomax 14,4V 4,4Ah / 64Wh (`CDM`).
- **Monitores Multiparâmetros**: Mindray BeneVision N12/N15/N17 11,1V 4,5Ah (`MM-N12`), Philips Efficia 11,1V 2,4Ah (`ME202EK`).
- **Bombas Infusoras e Homogeneizadores**: Lifemed LF Inject 7,2V 2,5Ah (`BILF`), GenesisBPS DCM-3000 (`HM`), Macopharma DCN7 (`DCN7-M`).

---

## 2. As Químicas e suas Características Operacionais

| Química | Tipo | Densidade | Aplicação Típica | Cuidados Especiais |
| :--- | :--- | :--- | :--- | :--- |
| **Li-SOCL2** (Cloreto de Tionila) | Primária (Não recarregável) | Altíssima (até 19Ah em célula D) | Subsea: 3.000m profundidade, missões de 1 a 3 anos contínuos (Aquadopp, cNode, Signature) | Tensão estável até o fim da vida. Passivação pode exigir despassivação antes do uso. Não recarregar jamais! |
| **Alcalina** | Primária | Média | Instrumentação oceanográfica de menor custo e liberação rápida (Canopus, 8242SX, correntômetros) | Sem risco de transporte aéreo estrito, substituição simples. |
| **Li-Ion & LiFePO4** | Secundária (Recarregável) | Alta | ROVs, robôs submarinos e ventiladores pulmonares móveis | Exige BMS (Battery Management System) interno de proteção contra sobrecarga, subtensão e curto. |
| **Ni-MH** | Secundária | Média-Alta | Equipamentos médicos (Servo S, desfibriladores, bombas) | Baixo efeito memória, robustez térmica. |
| **Pb / VRLA** | Secundária | Baixa-Média | Nobreaks e baterias seladas estacionárias | Chumbo-ácido regulado por válvula. Pesada, mas barata e tolerante a flutuação. |
| **Capacitor Híbrido** | Auxiliar | Pulso Alto | Pilhas associadas a células Li-SOCL2 para liberar rajadas de transmissão acústica sem queda de tensão | Ex: Expower EXP-HPC1550. |

---

## 3. Estrutura de Armazenamento no Banco de Dados

Os 117 produtos estruturados residem na tabela `catalogo_universal` (e `itens_catalogo`), onde:
- `tipo_item = 'PRODUTO'`
- `nome`: Nome oficial com especificações (ex: *Aquadopp - 14,4v / 26,3Ah / 380Wh*).
- `detalhes (JSONB)`:
  ```json
  {
    "codigo_sku": "AQL38",
    "fabricante": "Nortek",
    "setor": "NÁUTICO",
    "quimica": "Li-SOCL2",
    "preco_base": 6890.00,
    "unidade_medida": "UN",
    "estoque_atual": 10,
    "especificacoes_tecnicas": {
      "tensao_nominal_v": 14.4,
      "capacidade_nominal_ah": 26.3,
      "energia_nominal_wh": 380,
      "quimica_detalhada": "Li-SOCL2"
    }
  }
  ```
