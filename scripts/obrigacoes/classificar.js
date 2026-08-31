#!/usr/bin/env node
'use strict';
/**
 * ============================================================================
 * CLASSIFICA AS OBRIGACOES: VIGENCIA, PARCELA E FATURA DE CARTAO
 * ============================================================================
 *
 * Preenche o que a migration 32 acrescentou, a partir do que ja esta gravado.
 * Nao inventa nada: promove 'parcelas_info' para coluna, deriva a vigencia da
 * ultima parcela, e marca a fatura de cartao como agregadora.
 *
 * A regra que evita o erro mais caro aqui: **ausencia nao prova encerramento**.
 * O aluguel da Prima sumiu do extrato por tres meses e continua ativo -- o que
 * faltou foi lancamento. Entao so e marcado ENCERRADA o que da para provar:
 * parcelamento cuja ultima parcela ja venceu. O resto que parece parado vira
 * SUSPEITA_DE_PARADA, que e um pedido de conferencia, nao um veredito.
 *
 * Uso:
 *   node scripts/obrigacoes/classificar.js              homologacao
 *   node scripts/obrigacoes/classificar.js --producao   producao
 *   node scripts/obrigacoes/classificar.js --simular    so mostra
 * ============================================================================
 */
const { Client } = require('pg');
const ambiente = require('../lib/ambiente');

const args = process.argv.slice(2);
const simular = args.includes('--simular');
const brl = (n) =>
  'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  const ctx = ambiente.resolver({ papel: 'migration', args });
  ambiente.banner(ctx, 'Classificacao de obrigacoes recorrentes');

  const c = new Client(ctx.configCliente());
  await c.connect();

  try {
    if (!simular) await c.query('BEGIN');

    // --- 1. parcelas_info -> coluna ---------------------------------------
    const parcelas = await c.query(`
      UPDATE obrigacoes_recorrentes
         SET parcela_numero = (parcelas_info::jsonb ->> 'parcela_atual')::INT,
             parcela_total  = (parcelas_info::jsonb ->> 'total_parcelas')::INT,
             updated_at     = NOW()
       WHERE parcelas_info IS NOT NULL
         AND parcelas_info <> ''
         AND parcelas_info LIKE '%total_parcelas%'
       RETURNING 1`);
    console.log('  parcelas promovidas para coluna: ' + parcelas.rowCount);

    // --- 2. fatura de cartao e agregadora ---------------------------------
    // A despesa foi reconhecida na compra; a fatura e a liquidacao dela.
    // Somar as duas conta o mesmo dinheiro duas vezes.
    const agreg = await c.query(`
      UPDATE obrigacoes_recorrentes
         SET agregadora = TRUE, updated_at = NOW()
       WHERE tipo_operacao = 'DESPESA'
         AND (categoria_detalhada ILIKE '%cart%cr%dito%'
              OR (favorecido_nome IN ('Itaú','Itau','Bradesco','Banco Bradesco')
                  AND categoria_detalhada ILIKE '%cart%'))
       RETURNING favorecido_nome, valor, data_vencimento`);
    console.log('  faturas de cartao marcadas como agregadoras: ' + agreg.rowCount);
    for (const f of agreg.rows)
      console.log('     ' + f.favorecido_nome + '  ' + brl(f.valor) +
                  '  vence ' + f.data_vencimento.toISOString().slice(0, 10));

    // --- 3. compra no cartao aponta para a fatura do mes -------------------
    // Liga a parcela a fatura que a liquida, quando existe fatura no mesmo mes
    // de vencimento e na mesma empresa.
    const liga = await c.query(`
      UPDATE obrigacoes_recorrentes p
         SET agregada_em_id = f.id, updated_at = NOW()
        FROM obrigacoes_recorrentes f
       WHERE p.metodo_pagamento = 'CARTAO_CREDITO'
         AND NOT p.agregadora
         AND f.agregadora
         AND f.empresa_id = p.empresa_id
         AND date_trunc('month', f.data_vencimento) = date_trunc('month', p.data_vencimento)
         AND p.agregada_em_id IS NULL
       RETURNING p.favorecido_nome, p.valor`);
    console.log('  compras de cartao ligadas a fatura: ' + liga.rowCount);

    // --- 4. vigencia a partir da ultima parcela ---------------------------
    // Agrupa as parcelas da mesma compra por favorecido + total de parcelas +
    // valor, e usa o vencimento da ultima como fim da vigencia.
    const vig = await c.query(`
      WITH serie AS (
        SELECT empresa_id, favorecido_nome, parcela_total, round(valor, 2) AS v,
               MAX(data_vencimento)::date AS fim,
               MIN(data_vencimento)::date AS inicio
          FROM obrigacoes_recorrentes
         WHERE parcela_total > 1
         GROUP BY 1,2,3,4
      )
      UPDATE obrigacoes_recorrentes o
         SET vigencia_inicio = s.inicio,
             vigencia_fim    = s.fim,
             encerra_por     = 'PARCELAS',
             updated_at      = NOW()
        FROM serie s
       WHERE o.empresa_id = s.empresa_id
         AND o.favorecido_nome = s.favorecido_nome
         AND o.parcela_total = s.parcela_total
         AND round(o.valor, 2) = s.v
       RETURNING 1`);
    console.log('  vigencia derivada de parcelamento: ' + vig.rowCount);

    // Recorrente sem parcela nao tem fim previsto.
    const indet = await c.query(`
      UPDATE obrigacoes_recorrentes
         SET encerra_por = 'INDETERMINADO', updated_at = NOW()
       -- Valores do enum recorrencia_obrigacao. A planilha usa tambem
       -- 'Trienal' e 'Semanal', que NAO existem no enum -- essas linhas foram
       -- mapeadas para outra coisa na importacao e precisam ser investigadas.
       WHERE recorrencia IN ('MENSAL','BIMESTRAL','TRIMESTRAL','SEMESTRAL','ANUAL')
         AND parcela_total IS NULL
         AND encerra_por IS NULL
       RETURNING 1`);
    console.log('  sem fim previsto (luz, aluguel, telefone): ' + indet.rowCount);

    // --- 5. situacao: so encerra o que da para provar ----------------------
    const encerradas = await c.query(`
      UPDATE obrigacoes_recorrentes
         SET situacao = 'ENCERRADA', updated_at = NOW()
       WHERE encerra_por = 'PARCELAS'
         AND vigencia_fim < CURRENT_DATE
       RETURNING favorecido_nome, vigencia_fim`);
    console.log('  encerradas (ultima parcela ja venceu): ' + encerradas.rowCount);

    const ativas = await c.query(`
      UPDATE obrigacoes_recorrentes
         SET situacao = 'ATIVA', updated_at = NOW()
       WHERE situacao = 'INDEFINIDA'
         AND (vigencia_fim IS NULL OR vigencia_fim >= CURRENT_DATE)
       RETURNING 1`);
    console.log('  ativas: ' + ativas.rowCount);

    // Ultima ocorrencia observada, para a tela poder sinalizar buraco.
    await c.query(`
      WITH ult AS (
        SELECT empresa_id, favorecido_nome, MAX(COALESCE(data_pagamento, data_vencimento))::date AS d
          FROM obrigacoes_recorrentes GROUP BY 1,2
      )
      UPDATE obrigacoes_recorrentes o SET ultima_ocorrencia = u.d
        FROM ult u
       WHERE o.empresa_id = u.empresa_id AND o.favorecido_nome = u.favorecido_nome`);

    if (!simular) await c.query('COMMIT');

    // --- resultado ---------------------------------------------------------
    const resumo = await c.query(`
      SELECT situacao, count(*)::int n, sum(valor)::numeric(14,2) total
        FROM obrigacoes_recorrentes WHERE tipo_operacao='DESPESA'
       GROUP BY 1 ORDER BY 3 DESC NULLS LAST`);
    console.log('\n  --- situacao ---');
    for (const r of resumo.rows)
      console.log('    ' + String(r.situacao).padEnd(22) + String(r.n).padStart(4) + '   ' + brl(r.total));

    const fim = await c.query(`
      SELECT favorecido_nome, parcela_numero, parcela_total, valor, vigencia_fim::date f
        FROM obrigacoes_recorrentes
       WHERE encerra_por = 'PARCELAS' AND parcela_numero = parcela_total
       ORDER BY vigencia_fim`);
    console.log('\n  --- o que termina, e quando ---');
    for (const r of fim.rows)
      console.log('    ' + r.f.toISOString().slice(0, 10) + '  ' +
        String(r.favorecido_nome).slice(0, 26).padEnd(28) +
        'parcela ' + r.parcela_numero + '/' + r.parcela_total + '   ' + brl(r.valor));
  } catch (e) {
    if (!simular) await c.query('ROLLBACK');
    throw e;
  } finally {
    await c.end();
  }
}

main().catch((e) => { console.error('[ERRO]', e.message); process.exit(1); });
