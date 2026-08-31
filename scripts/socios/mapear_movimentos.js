#!/usr/bin/env node
'use strict';
/**
 * ============================================================================
 * MAPEIA MOVIMENTO DE SOCIO E ABRE AS PENDENCIAS COM PROCEDENCIA
 * ============================================================================
 *
 * Varre o extrato procurando dinheiro que passou entre a holding e um socio,
 * registra cada movimento apontando para a linha do extrato que o originou, e
 * agrupa o que ainda nao se sabe em pendencias -- cada uma com a evidencia
 * inteira: data, valor, empresa, banco, conta e memo.
 *
 * O ponto: **nao decide nada**. Todo movimento nasce INDEFINIDO. A decisao e
 * societaria e cabe a quem tem competencia para toma-la; o sistema entrega a
 * pergunta pronta, com tudo que se precisa para responder meses depois.
 *
 * Idempotente: rodar de novo nao duplica -- casa pelo id da transacao.
 *
 * Uso:
 *   node scripts/socios/mapear_movimentos.js              homologacao
 *   node scripts/socios/mapear_movimentos.js --producao   producao
 *   node scripts/socios/mapear_movimentos.js --simular    so mostra
 * ============================================================================
 */
const { Client } = require('pg');
const ambiente = require('../lib/ambiente');

const args = process.argv.slice(2);
const simular = args.includes('--simular');

const brl = (n) =>
  'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dia = (d) => new Date(d).toISOString().slice(0, 10);

/**
 * Socios conhecidos. O padrao busca o nome no memo do extrato -- e a unica
 * pista que o banco da, ja que ele nao manda documento em transferencia PIX.
 */
const SOCIOS = [
  {
    nome: 'Paulo Cesar do Rego',
    padrao: '%PAULO CESAR%',
    observacao:
      'Socio. A Mitang Brasil era originalmente so dele. Diego Fernandes comprou ' +
      'participacao em 2026 e, a partir de agosto, Paulo passou a sacar valores ' +
      'a titulo de abatimento dessa compra.'
  }
];

/**
 * As perguntas em aberto. Cada uma junta os lancamentos por um criterio
 * declarado -- normalmente periodo -- porque foi por periodo que a historia
 * mudou.
 */
const PENDENCIAS = [
  {
    codigo: 'SOC-2026-SAQUES-AGOSTO',
    titulo: 'Saques do socio Paulo em agosto de 2026',
    dominio: 'SOCIETARIO',
    socio: 'Paulo Cesar do Rego',
    sentido: 'SAIDA',
    de: '2026-08-01',
    ate: '2026-08-31',
    pergunta:
      'Estes saques sao integralmente pagamento pela compra da participacao que ' +
      'Diego Fernandes adquiriu, ou ha retirada pessoal misturada? Se houver ' +
      'mistura, qual criterio separa uma coisa da outra?',
    hipotese:
      'Provavelmente PAGAMENTO_PARTICIPACAO na integra. Diego Ribeiro relatou que ' +
      'o acordo permitindo Paulo sacar para abater a compra e recente ("mes passado ' +
      'ate agora"), e todos os 11 saques estao concentrados em 13 dias de agosto -- ' +
      'padrao que nao aparece em nenhum outro mes do ano.',
    impacto:
      'Se for pagamento de participacao ou distribuicao, nao e despesa operacional ' +
      'e sai do EBITDA. O resultado de 2026 muda de sinal.'
  },
  {
    codigo: 'SOC-2026-SAQUES-ABR-MAI',
    titulo: 'Saques do socio Paulo em abril e maio de 2026',
    dominio: 'SOCIETARIO',
    socio: 'Paulo Cesar do Rego',
    sentido: 'SAIDA',
    de: '2026-01-01',
    ate: '2026-07-31',
    pergunta:
      'Sao anteriores ao acordo de abatimento e coincidem com o periodo da venda ' +
      'da participacao. Sao parte do negocio, distribuicao, ou retirada pessoal?',
    hipotese:
      'Natureza distinta dos saques de agosto: sao dois lancamentos isolados, e nao ' +
      'uma sequencia. Foram justamente estes que o classificador chamou de ' +
      '"fornecedor", porque o banco escreveu "PAGAMENTOS A FORNECEDORES" no memo.',
    impacto:
      'Mesmo efeito no EBITDA, em menor escala. E revela que a categoria ' +
      'FORNECEDORES_OPERACIONAIS esta contaminada por movimento societario.'
  },
  {
    codigo: 'SOC-2026-APORTES',
    titulo: 'Dinheiro que o socio Paulo colocou na empresa',
    dominio: 'SOCIETARIO',
    socio: 'Paulo Cesar do Rego',
    sentido: 'ENTRADA',
    de: '2026-01-01',
    ate: '2026-12-31',
    pergunta:
      'Sao aporte de capital, devolucao de valor retirado antes, ou mutuo? Diego ' +
      'Ribeiro relatou que em fevereiro Paulo devolveu dinheiro para cobrir um ' +
      'gasto anterior -- se for isso, existe uma saida correspondente que nao ' +
      'aparece com o nome dele no memo e precisa ser localizada.',
    hipotese:
      'As duas entradas de 18/05 batem com a lembranca de "dois aportes de vinte e ' +
      'cinco mil". As de fevereiro parecem ser o acerto de algo anterior.',
    impacto:
      'Aporte de capital nao e receita e nao pode entrar na DRE como faturamento. ' +
      'Hoje a categoria "Aporte" da planilha traz R$ 50.000 como receita.'
  }
];

// ---------------------------------------------------------------------------

async function main() {
  const ctx = ambiente.resolver({ papel: 'migration', args });
  ambiente.banner(ctx, 'Mapeamento de movimento de socio');

  const c = new Client(ctx.configCliente());
  await c.connect();

  try {
    if (!simular) await c.query('BEGIN');

    // --- socios ---
    const idPorNome = new Map();
    for (const s of SOCIOS) {
      const existente = await c.query('SELECT id FROM socios WHERE nome = $1', [s.nome]);
      if (existente.rows.length) {
        idPorNome.set(s.nome, existente.rows[0].id);
      } else if (!simular) {
        const r = await c.query(
          'INSERT INTO socios (nome, observacao) VALUES ($1, $2) RETURNING id',
          [s.nome, s.observacao]
        );
        idPorNome.set(s.nome, r.rows[0].id);
        console.log('  socio cadastrado: ' + s.nome);
      }
    }

    let movimentos = 0, pendenciasAbertas = 0;

    for (const p of PENDENCIAS) {
      const socio = SOCIOS.find((s) => s.nome === p.socio);
      const sinal = p.sentido === 'SAIDA' ? 't.valor < 0' : 't.valor > 0';

      const { rows } = await c.query(
        `SELECT t.id, t.data_lancamento::date AS data, ABS(t.valor)::numeric(14,2) AS valor,
                t.empresa_id, t.memo, e.nome_fantasia AS empresa,
                cb.banco_nome AS banco, cb.agencia, cb.conta_numero
           FROM transacoes_bancarias t
           JOIN empresas e ON e.id = t.empresa_id
      LEFT JOIN contas_bancarias cb ON cb.id = t.conta_bancaria_id
          WHERE ${sinal}
            AND NOT COALESCE(t.is_saldo_informativo, FALSE)
            AND t.memo ILIKE $1
            AND t.data_lancamento::date BETWEEN $2 AND $3
          ORDER BY t.data_lancamento`,
        [socio.padrao, p.de, p.ate]
      );

      if (rows.length === 0) continue;

      const total = rows.reduce((a, r) => a + Number(r.valor), 0);

      // A evidencia que permite decidir meses depois sem refazer a investigacao.
      const evidencia = rows.map((r) => ({
        transacao_id: r.id,
        data: dia(r.data),
        valor: Number(r.valor),
        empresa: r.empresa,
        banco: r.banco,
        agencia: r.agencia,
        conta: r.conta_numero,
        memo: r.memo
      }));

      console.log('\n  ' + p.codigo);
      console.log('    ' + rows.length + ' lancamentos · ' + brl(total) +
                  ' · ' + dia(rows[0].data) + ' a ' + dia(rows[rows.length - 1].data));
      for (const e of evidencia) {
        console.log('      ' + e.data + '  ' + String(e.empresa).slice(0, 14).padEnd(15) +
                    brl(e.valor).padStart(15) + '  ' + String(e.banco || '').slice(0, 16));
      }

      if (simular) { pendenciasAbertas++; continue; }

      const pend = await c.query(
        `INSERT INTO pendencias_classificacao
           (codigo, titulo, pergunta, dominio, valor_envolvido, qtd_lancamentos,
            periodo_inicio, periodo_fim, evidencia, hipotese, impacto)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
         ON CONFLICT (codigo) DO UPDATE SET
            valor_envolvido = EXCLUDED.valor_envolvido,
            qtd_lancamentos = EXCLUDED.qtd_lancamentos,
            evidencia = EXCLUDED.evidencia,
            hipotese = EXCLUDED.hipotese,
            updated_at = NOW()
         RETURNING id`,
        [p.codigo, p.titulo, p.pergunta, p.dominio, total, rows.length,
         dia(rows[0].data), dia(rows[rows.length - 1].data),
         JSON.stringify(evidencia), p.hipotese, p.impacto]
      );
      const pendenciaId = pend.rows[0].id;
      pendenciasAbertas++;

      for (const r of rows) {
        await c.query(
          `INSERT INTO socios_movimentos
             (socio_id, empresa_id, transacao_bancaria_id, data_movimento, valor,
              sentido, natureza, pendencia_id)
           VALUES ($1,$2,$3,$4,$5,$6,'INDEFINIDO',$7)
           ON CONFLICT DO NOTHING`,
          [idPorNome.get(p.socio), r.empresa_id, r.id, dia(r.data), r.valor, p.sentido, pendenciaId]
        );
        movimentos++;
      }
    }

    if (!simular) await c.query('COMMIT');

    console.log('\n  ' + '-'.repeat(60));
    console.log('  movimentos registrados : ' + movimentos + (simular ? ' (simulado)' : ''));
    console.log('  pendencias abertas     : ' + pendenciasAbertas);
    console.log('  todos com natureza INDEFINIDO -- nenhuma decisao foi tomada.');
  } catch (e) {
    if (!simular) await c.query('ROLLBACK');
    throw e;
  } finally {
    await c.end();
  }
}

main().catch((e) => { console.error('[ERRO]', e.message); process.exit(1); });
