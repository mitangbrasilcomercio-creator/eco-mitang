const { pgPool } = require('../dist/core/database/supabase-pool');
const fs = require('fs');
const path = require('path');

function parseMoney(val) {
  if (!val || typeof val !== 'string') return 0;
  const clean = val.replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function parsePercent(val) {
  if (!val || typeof val !== 'string') return 0;
  const clean = val.replace('%', '').replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

async function repopulateOrcamentosHistorico() {
  const client = await pgPool.connect();
  try {
    console.log('--- RE-POPULAÇÃO DE ORÇAMENTOS HISTÓRICOS COM LINHAS DETALHADAS, POs E NFEs ---');

    const content = fs.readFileSync(path.join(__dirname, '..', 'database', 'seeds', 'Planilha de Orçamentos - Atualizada 26-08-2026.txt'), 'utf8');
    const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('--- Page'));
    const headerIdx = lines.indexOf('N°');
    const dataLines = lines.slice(headerIdx + 1);

    const starts = [];
    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i];
      const isQuoteNumber = /^\d{6}(-\d+)?$/.test(line) || /^01\.S\./.test(line);
      if (isQuoteNumber) {
        const next1 = dataLines[i+1];
        const next2 = dataLines[i+2];
        if (next1 === 'Mitang' || next1 === 'Arandu' || next2 === 'Mitang' || next2 === 'Arandu') {
          starts.push(i);
        }
      }
    }

    const rows = [];
    for (let i = 0; i < starts.length; i++) {
      const startIdx = starts[i];
      const endIdx = (i < starts.length - 1) ? starts[i + 1] : dataLines.length;
      rows.push(dataLines.slice(startIdx, endIdx));
    }

    console.log(`Total de blocos identificados: ${rows.length}`);

    // Mapear por numero_orcamento
    const orcamentosAgrupados = new Map();

    for (const b of rows) {
      let mIdx = -1;
      for (let j = 12; j < b.length - 4; j++) {
        if (b[j].startsWith('R$') && b[j+1].startsWith('R$') && b[j+2].includes('%') && b[j+3].startsWith('R$') && b[j+4].startsWith('R$')) {
          mIdx = j;
          break;
        }
      }
      if (mIdx === -1) continue;

      const numeroOrcamento = b[0];
      const vendidoPor = b[1];
      const mesEmissao = b[2];
      const anoEmissao = b[3];
      const dataEmissao = b[4];
      const empresaCliente = b[5];
      const cnpjCpf = b[6].replace(/\D/g, '');
      const contato = b[7];
      const packProduto = b[8];
      const codigoSku = b[9];
      const quantidade = parseInt(b[10]) || 1;
      const quimica = b[11];
      const orcamentoEnviado = b[12];
      const aprovado = b[13];

      const vUnit = parseMoney(b[mIdx]);
      const vTotProd = parseMoney(b[mIdx + 1]);
      const descPct = parsePercent(b[mIdx + 2]);
      const vFrete = parseMoney(b[mIdx + 3]);
      const vFinal = parseMoney(b[mIdx + 4]);

      const posPag = b[mIdx + 5];
      const posSit = b[mIdx + 6];
      let obs = null;
      let seq = null;

      if (b.length === mIdx + 8) {
        seq = parseInt(b[mIdx + 7]);
      } else if (b.length >= mIdx + 9) {
        obs = b[mIdx + 7] === '-' ? null : b[mIdx + 7];
        seq = parseInt(b[b.length - 1]);
      }

      const stFin = b[mIdx - 1] === '-' ? null : b[mIdx - 1];
      const metPag = b[mIdx - 2] === '-' ? null : b[mIdx - 2];

      const middle = b.slice(14, mIdx - 2);

      let tipoNfeIdx = middle.findIndex(c => c.includes('NFe') || c.includes('NFSe'));
      let tipoNfe = tipoNfeIdx !== -1 ? middle[tipoNfeIdx] : null;

      let poCliente = null;
      let dataAprovacao = null;
      if (tipoNfeIdx > 0) {
        const beforeNfe = middle.slice(0, tipoNfeIdx);
        for (const val of beforeNfe) {
          if (val === '-') continue;
          if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
            dataAprovacao = val;
          } else if (!/^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|\d{4})$/i.test(val)) {
            poCliente = val;
          }
        }
      }

      let numeroNfe = null;
      let dataEnvioNf = null;
      let prazo = null;
      let vencimento = null;

      if (tipoNfeIdx !== -1) {
        const afterNfe = middle.slice(tipoNfeIdx + 1);
        for (const val of afterNfe) {
          if (val === '-') continue;
          if (/^\d{2}\.\d{3}\.\d{3}$/.test(val) || /^00\.\d{3}\.\d{3}$/.test(val) || val.startsWith('NFS -')) {
            numeroNfe = val;
          } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
            if (!dataEnvioNf && !numeroNfe) {
              dataEnvioNf = val;
            } else if (!vencimento) {
              vencimento = val;
            }
          } else if (val === 'À Vista' || (/^\d{1,3}$/.test(val) && parseInt(val) <= 120)) {
            prazo = val;
          }
        }
      }

      const itemObj = {
        sequencial: seq,
        pack_produto: packProduto,
        codigo_sku: codigoSku,
        quimica: quimica,
        quantidade: quantidade,
        valor_unitario: vUnit,
        valor_total_produtos: vTotProd,
        desconto_percentual: descPct,
        valor_frete: vFrete,
        valor_final_item: vFinal,
        status_item: aprovado,
        po_cliente: poCliente,
        data_aprovacao: dataAprovacao,
        tipo_nfe: tipoNfe,
        numero_nfe: numeroNfe,
        data_envio_nf: dataEnvioNf,
        prazo: prazo,
        vencimento: vencimento,
        metodo_pagamento: metPag,
        status_financeiro: stFin,
        situacao_item: posSit,
        pagamento_status: posPag,
        observacao: obs
      };

      if (!orcamentosAgrupados.has(numeroOrcamento)) {
        orcamentosAgrupados.set(numeroOrcamento, {
          numero_orcamento: numeroOrcamento,
          vendido_por: vendidoPor,
          data_emissao: dataEmissao,
          mes_emissao: mesEmissao,
          ano_emissao: anoEmissao,
          cliente_nome: empresaCliente,
          cliente_cnpj_cpf: cnpjCpf,
          cliente_contato: contato,
          orcamento_enviado: orcamentoEnviado,
          itens: []
        });
      }

      orcamentosAgrupados.get(numeroOrcamento).itens.push(itemObj);
    }

    console.log(`Total de orçamentos consolidados únicos: ${orcamentosAgrupados.size}`);

    // Limpar tabela orcamentos_historico e re-inserir
    await client.query('BEGIN');
    await client.query('DELETE FROM orcamentos_historico;');

    let inseridos = 0;
    const recordsForMirror = [];

    for (const [qNum, o] of orcamentosAgrupados.entries()) {
      // Calcular totais e status gerais
      const hasAprovado = o.itens.some(it => it.status_item === 'Compra Aprovada');
      const statusGeral = hasAprovado ? 'Compra Aprovada' : o.itens[0].status_item;
      const situacaoGeral = o.itens[0].situacao_item || 'Compra Não Finalizada';

      // Somatório do valor: se aprovado, soma apenas os aprovados; se não, soma todos
      let valorTotalOrc = 0;
      if (hasAprovado) {
        valorTotalOrc = o.itens
          .filter(it => it.status_item === 'Compra Aprovada')
          .reduce((acc, it) => acc + (it.valor_final_item || 0), 0);
      } else {
        valorTotalOrc = o.itens.reduce((acc, it) => acc + (it.valor_final_item || 0), 0);
      }

      // Converter data_emissao de DD/MM/AAAA para AAAA-MM-DD
      let dtSql = '2025-01-01';
      if (o.data_emissao && o.data_emissao.includes('/')) {
        const p = o.data_emissao.split('/');
        if (p.length === 3) dtSql = `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
      }

      // Empresa ID
      const empresaId = o.vendido_por === 'Arandu' 
        ? '0754c882-d528-4d34-8c96-6d9af7e8d322' 
        : '29ea0857-7cf7-44e1-ba36-a3f323c4670c';

      const insertRes = await client.query(`
        INSERT INTO orcamentos_historico (
          empresa_id, numero_orcamento, vendido_por, data_emissao, mes_emissao, ano_emissao,
          cliente_nome, cliente_cnpj_cpf, cliente_contato, status_aprovacao, orcamento_enviado,
          situacao_geral, valor_total, itens_json, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW()
        ) RETURNING *;
      `, [
        empresaId,
        qNum,
        o.vendido_por,
        dtSql,
        o.mes_emissao,
        o.ano_emissao,
        o.cliente_nome,
        o.cliente_cnpj_cpf,
        o.cliente_contato,
        statusGeral,
        o.orcamento_enviado,
        situacaoGeral,
        valorTotalOrc,
        JSON.stringify(o.itens)
      ]);

      recordsForMirror.push(insertRes.rows[0]);
      inseridos++;
    }

    await client.query('COMMIT');
    console.log(`[SUCESSO] ${inseridos} orçamentos mestres inseridos com todos os seus itens ricos!`);

    // Sincronizar Local Mirror
    const mirrorPath = path.join(__dirname, '..', 'database', 'local_mirror', 'orcamentos_historico.json');
    fs.writeFileSync(mirrorPath, JSON.stringify(recordsForMirror, null, 2), 'utf8');
    console.log(`[LOCAL MIRROR] Gravado com sucesso em: ${mirrorPath}`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao repopular orcamentos_historico:', err);
  } finally {
    client.release();
    pgPool.end();
  }
}

repopulateOrcamentosHistorico();
