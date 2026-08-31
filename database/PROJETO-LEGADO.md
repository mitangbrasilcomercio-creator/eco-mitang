# Projeto Supabase legado — `Ecossistema Mitang`

**Ref:** `vqnledwoioqllfifzyuy` · região `sa-east-1` · criado em 11/08/2026
**Situação:** órfão e fechado. Nenhum código deste repositório aponta para ele —
o sistema usa exclusivamente `xbwdjfvhulqdiswkazpn`.

---

## O que aconteceu

Este é um projeto anterior do mesmo ERP, abandonado quando o desenvolvimento
recomeçou no projeto atual. Foi encontrado em 30/08/2026 durante a Fase 0.

### O risco que tinha

As **28 tabelas estavam com Row-Level Security desabilitada** e acessíveis pelos
papéis `anon` e `authenticated` do PostgREST. Qualquer pessoa com a chave
anônima do projeto lia e escrevia tudo: custo de produto, margem de lucro,
contratos, CNPJ de clientes e certidões negativas.

### O que foi feito

Migration `fecha_exposicao_anon_rls_em_todas_as_tabelas`, aplicada em 30/08/2026:

- `ENABLE ROW LEVEL SECURITY` nas 28 tabelas, **sem policy** — nega todo acesso
  via `anon`/`authenticated`
- `REVOKE ALL` explícito dos dois papéis, em tabelas e sequences

O alerta do linter da Supabase saiu de `rls_disabled` (**CRITICAL**) para
`rls_enabled_no_policy` (**INFO**), que é o estado correto para um projeto
arquivado.

**Optou-se por RLS em vez de pausar o projeto** porque fecha a exposição do mesmo
jeito e mantém o conteúdo alcançável pela API de gestão — sem isso, os dados de
engenharia abaixo ficariam presos atrás de um projeto pausado.

---

## Por que não foi simplesmente descartado

Ele contém dados de engenharia reais que o projeto atual **não tem**, e que o
roadmap pretende construir do zero nas Fases 4 e 5.

### Estrutura de produto (BOM) — Fase 5.4

6 produtos, 17 insumos, 32 linhas de estrutura. Custo decomposto em
`custo_pilhas` + `custo_componentes` = `custo_total_bom`, com margem e preço.

| Código | Produto | Química | Prof. | BOM | Venda |
|---|---|---|---|---|---|
| `CMXL48-M` | cNode Maxi (Kongsberg) 14,4 V 180 Ah | Li-SOCL2 | 3000 m | R$ 4.007,44 | R$ 14.850 |
| `ADL30` | ADCP Workhorse 300/600 kHz (Teledyne) | Li-SOCL2 | 3000 m | R$ 2.229,45 | R$ 9.850 |
| `ADA30` | ADCP Workhorse 300/600 kHz | Alcalina | 1000 m | R$ 286,96 | R$ 1.850 |
| `CNML16` | cNode MiniS (Kongsberg) | LiFePO4 | 1000 m | R$ 727,36 | R$ 3.950 |
| `SEL` | Seaguard II (Aanderaa) | Li-SOCL2 | 6000 m | R$ 432,87 | R$ 2.450 |

Insumos com part number e fornecedor reais — SAFT LSH20, Samsung INR18650-30Q,
Duracell Procell, SubConn MCBH4M (USD 45 com 10% de IPI → R$ 269,78), Strema
Cabos. **É a base para o CMV real** que hoje falta: a DRE informa
`cmv_disponivel: false` justamente porque não existe estrutura de produto nem
controle de estoque no projeto atual.

### Ativo imobilizado — Fase 5.6

4 ativos, R$ 2.535.000 de aquisição, R$ 452.000 de depreciação acumulada:

- Sonardyne Ranger 2 Pro (USBL) — R$ 850.000
- Kongsberg EM2040 Dual RX (multifeixe) — R$ 1.200.000
- Exail Quadrans (AHRS/FOG) — R$ 420.000
- Pack de bateria subsea LiFePO4 — R$ 65.000

Fecha a lacuna do `lucro_liquido` da DRE, que hoje não é apurado por falta de
depreciação.

### Outros modelos aproveitáveis

- `centros_custo` e `categorias_globais` (25) — centros de custo reais (Búzios /
  FPSO Almirante Barroso, Mero 3), verticais de negócio, tipos de estrutura
  DimCon (spool, jumper, manifold, PLET/PLEM). Insumo para a Fase 1.3.
- `pedidos_compra`, `mapas_cotacao` (cotação com 3 fornecedores e justificativa
  de escolha) — modelo para a Fase 5.5.
- `romaneios_carga` / `itens_romaneio` — packing list offshore com número de
  série, peso, dimensões e valor declarado.
- `relatorios_dpr`, `relatorios_dimcon`, `certificados_fat` — relatórios técnicos
  offshore com estrutura já pensada (horas operacionais vs. standby, desvio 3D em
  mm contra tolerância contratual, laudo elétrico de pack com OCV/CCV/impedância).
- `certidoes_negativas` — 8 certidões com validade, para a Fase 6.9 (compliance).

---

## Cuidados ao aproveitar

- **Os CNPJs das empresas não batem** com a produção. Aqui: Mitang
  `50.158.455/0001-08`, Arandu `42.189.340/0001-90`. Na produção:
  `44221348000184` e `61349982000116`. Nenhum dos dois conjuntos foi confirmado
  como oficial — conferir antes de migrar qualquer coisa.
- **Alguns CNPJs de fornecedor são fictícios** (`99.888.777/0001-11` para Mouser,
  `88.777.666/0001-22` para Expower). Os de cliente parecem reais (Oceanpact,
  Fugro, CLS Brasil, COPPETEC/UFRJ, Petrobras).
- **Há registros de teste misturados** com os reais: `PC-TESTE-2026-9976`,
  `DPR-TESTE-2026-1593`, `080826-CLONE-4402`, `CMXL48-M-V2` com BOM zerado.
  Filtrar na migração.
- O schema usa `camelCase` em colunas (`produtoId`, `criadoEm`) e não tem
  `empresa_id` — não é multi-tenant. Qualquer migração precisa mapear para o
  modelo atual, não copiar tabela.

---

## Como acessar

Pela API de gestão da Supabase (MCP `execute_sql` / `list_tables`), com o ref
acima. O acesso por chave `anon` está fechado e deve continuar fechado.

Se o projeto for reativado para uso real, **criar policies antes** — RLS
habilitada sem policy nega tudo, inclusive para a aplicação.
