#!/usr/bin/env node
/**
 * ============================================================================
 * MIGRACAO DAS OBRIGACOES RECORRENTES: JSON -> POSTGRES
 * ============================================================================
 *
 * [ERRO ANTERIOR]:
 * As 204 obrigacoes de contas a pagar -- e os cards executivos de R$ 99.962,04,
 * R$ 89.547,79, R$ 122.469,49 e R$ 22.167,89 do painel -- nao existiam no banco.
 * Viviam apenas em 'database/local_mirror/obrigacoes_recorrentes.json', um
 * arquivo em disco lido direto pelo controller. Sem tabela, sem constraint, sem
 * RLS, sem historico e sem chance de o usuario editar nada pela aplicacao.
 *
 * Alem disso 'status_vencimento' era um campo congelado no arquivo: um titulo
 * gravado como 'A_VENCER' continuava 'A_VENCER' para sempre, mesmo mil dias
 * depois do vencimento.
 *
 * [O QUE ESTE SCRIPT FAZ]:
 * Le o JSON, converte as datas de 'DD/MM/AAAA' para DATE de verdade, cria os
 * parceiros de negocio e o plano de contas correspondentes, e grava tudo em
 * 'obrigacoes_recorrentes'. Idempotente pela chave natural: rodar duas vezes
 * nao duplica nada.
 *
 * 'status_vencimento' deixa de ser gravado -- passa a ser calculado contra a
 * data corrente pela view vw_obrigacoes_recorrentes.
 * ============================================================================
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const ambiente = require('./lib/ambiente');

const RAIZ = path.join(__dirname, '..');
const ORIGEM = path.join(RAIZ, 'database', 'local_mirror', 'obrigacoes_recorrentes.json');


/** 'DD/MM/AAAA' -> 'AAAA-MM-DD'. Devolve null se a data nao for valida. */
function paraDate(br) {
  if (!br || typeof br !== 'string') return null;
  const m = br.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dia = Number(d);
  const mes = Number(mo);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const dt = new Date(Date.UTC(Number(y), mes - 1, dia));
  if (dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== dia) return null;
  return `${y}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

const RECORRENCIAS = new Set(['UNICA', 'MENSAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'PARCELADA']);
const STATUS = new Set(['PAGO', 'A_PAGAR', 'PROGRAMADO', 'CANCELADO']);
const MACROS = new Set([
  'RECURSOS_HUMANOS', 'PRODUCAO_INSUMOS', 'TRIBUTOS', 'FINANCEIRO',
  'SERVICOS_TERCEIROS', 'INFRAESTRUTURA', 'SOCIOS_DIRETORIA', 'COMERCIAL'
]);
const ENTIDADES = new Set([
  'CLIENTE', 'COLABORADOR_PJ', 'SOCIO_DIRETORIA', 'FORNECEDOR_INSUMO',
  'PRESTADOR_CONTINUO', 'INFRAESTRUTURA_FIXA', 'GOVERNO_TRIBUTO', 'INSTITUICAO_FINANCEIRA'
]);

async function main() {
  if (!fs.existsSync(ORIGEM)) {
    console.error(`[ERRO] Arquivo de origem nao encontrado: ${ORIGEM}`);
    process.exit(1);
  }

  const registros = JSON.parse(fs.readFileSync(ORIGEM, 'utf8'));
  console.log('======================================================================');
  console.log('   MIGRACAO DE CONTAS A PAGAR: JSON -> POSTGRES');
  console.log('======================================================================\n');
  console.log(`Registros no arquivo: ${registros.length}\n`);

  const ctx = ambiente.resolver({ papel: 'migration' });
  ambiente.banner(ctx, 'Carga de obrigacoes recorrentes');

  await ambiente.confirmarSeProducao(ctx, { operacao: 'inserir/atualizar obrigacoes recorrentes' });

  const client = new Client(ctx.configCliente());
  await client.connect();

  let inseridos = 0;
  let atualizados = 0;
  const rejeitados = [];

  try {
    const empresas = await client.query('SELECT id FROM empresas;');
    const idsValidos = new Set(empresas.rows.map((e) => e.id));

    await client.query('BEGIN');

    // ---------------------------------------------------------------
    // 1. Plano de contas, deduzido das combinacoes presentes nos dados.
    // ---------------------------------------------------------------
    const combinacoes = new Map();
    for (const r of registros) {
      if (!MACROS.has(r.macro_categoria)) continue;
      const chave = `${r.macro_categoria}|${r.categoria_detalhada}`;
      if (!combinacoes.has(chave)) {
        combinacoes.set(chave, {
          macro: r.macro_categoria,
          detalhe: r.categoria_detalhada,
          tipo: r.tipo_operacao === 'RECEITA' ? 'RECEITA' : 'DESPESA',
          // Mensal e recorrente = custo fixo, base da projecao de runway.
          fixo: r.recorrencia === 'MENSAL'
        });
      }
    }

    for (const c of combinacoes.values()) {
      await client.query(
        `INSERT INTO plano_contas (macro_categoria, categoria_detalhada, tipo_operacao, e_custo_fixo)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (macro_categoria, categoria_detalhada)
         DO UPDATE SET e_custo_fixo = plano_contas.e_custo_fixo OR EXCLUDED.e_custo_fixo;`,
        [c.macro, c.detalhe, c.tipo, c.fixo]
      );
    }
    console.log(`[PLANO DE CONTAS] ${combinacoes.size} categorias registradas.`);

    // ---------------------------------------------------------------
    // 2. Parceiros de negocio (favorecidos).
    // ---------------------------------------------------------------
    const parceiros = new Map();
    for (const r of registros) {
      if (!idsValidos.has(r.empresa_id) || !ENTIDADES.has(r.tipo_entidade)) continue;
      const chave = `${r.empresa_id}|${(r.favorecido_nome || '').toLowerCase()}`;
      if (!parceiros.has(chave) && r.favorecido_nome) {
        parceiros.set(chave, {
          empresaId: r.empresa_id,
          nome: r.favorecido_nome,
          tipo: r.tipo_entidade
        });
      }
    }

    const mapaParceiros = new Map();
    for (const p of parceiros.values()) {
      const res = await client.query(
        `INSERT INTO parceiros_negocio (empresa_id, nome, tipo_entidade)
         VALUES ($1, $2, $3::tipo_entidade_parceiro)
         ON CONFLICT (empresa_id, lower(nome)) DO UPDATE SET updated_at = NOW()
         RETURNING id;`,
        [p.empresaId, p.nome, p.tipo]
      );
      mapaParceiros.set(`${p.empresaId}|${p.nome.toLowerCase()}`, res.rows[0].id);
    }
    console.log(`[PARCEIROS] ${parceiros.size} favorecidos registrados.`);

    // ---------------------------------------------------------------
    // 3. Obrigacoes.
    // ---------------------------------------------------------------
    for (const r of registros) {
      const motivos = [];

      if (!idsValidos.has(r.empresa_id)) motivos.push('empresa_id desconhecido');
      if (!MACROS.has(r.macro_categoria)) motivos.push(`macro_categoria '${r.macro_categoria}'`);
      if (!ENTIDADES.has(r.tipo_entidade)) motivos.push(`tipo_entidade '${r.tipo_entidade}'`);

      const status = STATUS.has(r.status_pagamento) ? r.status_pagamento : 'A_PAGAR';
      const vencimento = paraDate(r.data_vencimento) || paraDate(r.data_pagamento);
      if (!vencimento) motivos.push(`data_vencimento '${r.data_vencimento}' invalida`);

      const valor = Number(r.valor);
      if (!(valor > 0)) motivos.push(`valor '${r.valor}' nao positivo`);

      if (motivos.length > 0) {
        rejeitados.push({ favorecido: r.favorecido_nome, motivos });
        continue;
      }

      // A constraint chk_obrigacao_pagamento_coerente exige que PAGO tenha data
      // de pagamento e que os demais nao tenham.
      let pagamento = paraDate(r.data_pagamento);
      let statusFinal = status;
      if (statusFinal === 'PAGO' && !pagamento) pagamento = vencimento;
      if (statusFinal !== 'PAGO') pagamento = null;

      const recorrencia = RECORRENCIAS.has(r.recorrencia) ? r.recorrencia : 'UNICA';
      const parceiroId = mapaParceiros.get(`${r.empresa_id}|${(r.favorecido_nome || '').toLowerCase()}`) || null;

      const res = await client.query(
        `INSERT INTO obrigacoes_recorrentes (
           empresa_id, parceiro_id, chave_natural, tipo_operacao, macro_categoria,
           categoria_detalhada, tipo_entidade, favorecido_nome, descricao, banco,
           valor, data_vencimento, data_pagamento, recorrencia, forma_pagamento,
           metodo_pagamento, parcelas_info, rateio_socios, status_pagamento
         ) VALUES (
           $1, $2, $3, $4::tipo_operacao_financeira, $5::macro_categoria_conta,
           $6, $7::tipo_entidade_parceiro, $8, $9, $10,
           $11, $12::date, $13::date, $14::recorrencia_obrigacao, $15,
           $16, $17, $18::jsonb, $19::status_pagamento_obrigacao
         )
         ON CONFLICT (empresa_id, chave_natural) DO UPDATE SET
           valor = EXCLUDED.valor,
           data_vencimento = EXCLUDED.data_vencimento,
           data_pagamento = EXCLUDED.data_pagamento,
           status_pagamento = EXCLUDED.status_pagamento,
           updated_at = NOW()
         RETURNING (xmax = 0) AS inserido;`,
        [
          r.empresa_id, parceiroId, r.id,
          r.tipo_operacao === 'RECEITA' ? 'RECEITA' : 'DESPESA',
          r.macro_categoria, r.categoria_detalhada, r.tipo_entidade,
          r.favorecido_nome, r.descricao || null, r.banco || null,
          valor, vencimento, pagamento, recorrencia,
          r.forma_pagamento || null, r.metodo_pagamento || null, r.parcelas_info || null,
          JSON.stringify(r.rateio_socios || {}), statusFinal
        ]
      );

      if (res.rows[0].inserido) inseridos++;
      else atualizados++;
    }

    await client.query('COMMIT');

    console.log(`[OBRIGACOES] ${inseridos} inseridas, ${atualizados} atualizadas.`);
    if (rejeitados.length > 0) {
      console.log(`\n[REJEITADOS] ${rejeitados.length} registros nao passaram na validacao:`);
      rejeitados.slice(0, 10).forEach((r) =>
        console.log(`  - ${r.favorecido || '(sem favorecido)'}: ${r.motivos.join('; ')}`)
      );
      if (rejeitados.length > 10) console.log(`  ... e mais ${rejeitados.length - 10}.`);
    }

    // Conferencia contra o painel.
    const kpis = await client.query(`
      SELECT COALESCE(SUM(valor) FILTER (WHERE status_pagamento IN ('A_PAGAR','PROGRAMADO')), 0) AS a_pagar,
             COALESCE(SUM(valor) FILTER (WHERE tipo_entidade = 'COLABORADOR_PJ'), 0)             AS pessoal,
             COALESCE(SUM(valor) FILTER (WHERE tipo_entidade = 'FORNECEDOR_INSUMO'), 0)          AS insumos,
             COALESCE(SUM(valor) FILTER (WHERE categoria_detalhada ILIKE '%PRONAMPE%'), 0)       AS pronampe,
             COUNT(*)                                                                            AS total
        FROM obrigacoes_recorrentes;`);
    const k = kpis.rows[0];
    const brl = (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    console.log('\nKPIs APURADOS DO BANCO:');
    console.log(`  Total de obrigacoes ........ ${k.total}`);
    console.log(`  A pagar / programado ....... ${brl(k.a_pagar)}`);
    console.log(`  Folha de colaboradores PJ .. ${brl(k.pessoal)}`);
    console.log(`  Materia-prima e insumos .... ${brl(k.insumos)}`);
    console.log(`  PRONAMPE capital de giro ... ${brl(k.pronampe)}`);
    console.log('\n======================================================================\n');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[ERRO]', err.message);
    process.exit(1);
  });
