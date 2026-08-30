const fs = require('fs');
const path = require('path');
const { pgPool } = require('../dist/core/database/supabase-pool');
const { OfxIngestionService } = require('../dist/modules/financeiro/ofx/ofx-ingestion.service');

async function testOfxIngestion() {
  console.log('======================================================================');
  console.log('    TESTE REAL DE INGESTÃO OFX, CONCILIAÇÃO & ANTI-DUPLICAÇÃO (ACID)   ');
  console.log('======================================================================\n');

  const client = await pgPool.connect();

  try {
    // 1. Obter uma empresa ativa no banco
    const empRes = await client.query(`
      SELECT id, razao_social, nome_fantasia FROM empresas LIMIT 1;
    `);
    if (empRes.rows.length === 0) {
      throw new Error('Nenhuma empresa cadastrada no banco de dados.');
    }
    const empresa = empRes.rows[0];
    console.log(`[1/5] Tenant Ativo para Teste: ${empresa.nome_fantasia} (${empresa.id})`);

    const ingestionService = new OfxIngestionService();

    // 2. Carregar arquivo OFX real de Itaú (Abril/2026)
    const ofxDirItau = path.join(__dirname, '..', 'Arquivos_Reais_Para_A_IA_Usar_Como_Parametro', 'Extratos Bancários OFX', 'Arandu (Baterias)', 'Itaú');
    const filesItau = fs.readdirSync(ofxDirItau);
    const sampleFileItau = filesItau[0]; // Extrato_1155_995077_26-08-2026-Abril-2026.ofx
    const contentItau = fs.readFileSync(path.join(ofxDirItau, sampleFileItau), 'latin1');

    console.log(`\n[2/5] Importando Extrato Real Itaú pela Primeira Vez: "${sampleFileItau}"`);
    const res1 = await ingestionService.importarOfx(empresa.id, sampleFileItau, contentItau, 'TEST_RUNNER');

    console.log(`   -> Banco Identificado: ${res1.banco} | Conta: ${res1.conta}`);
    console.log(`   -> Total de transações no arquivo: ${res1.totalTransacoesArquivo}`);
    console.log(`   -> Transações INSERIDAS no DB:     ${res1.transacoesInseridas}`);
    console.log(`   -> Duplicatas Ignoradas:           ${res1.transacoesDuplicadasIgnoradas}`);
    console.log(`   -> Saldo Final do Extrato:         R$ ${res1.saldoFinalExtrato?.toFixed(2)}`);

    if (res1.transacoesInseridas === 0) {
      console.log('   (Nota: As transações já haviam sido importadas em execução prévia)');
    }

    // Contar total no banco
    const countQuery1 = `
      SELECT COUNT(*) AS total, SUM(valor) AS soma_total 
      FROM transacoes_bancarias 
      WHERE empresa_id = $1 AND conta_bancaria_id = $2;
    `;
    const countRes1 = await client.query(countQuery1, [empresa.id, res1.contaBancariaId]);
    const totalBanco1 = parseInt(countRes1.rows[0].total, 10);
    console.log(`   -> Estado do Banco pós-importação: ${totalBanco1} transações gravadas.`);

    // 3. PROVA DE FOGO: Re-importar EXATAMENTE o mesmo arquivo OFX
    console.log(`\n[3/5] PROVA DE FOGO ANTI-DUPLICAÇÃO: Re-importando o mesmo arquivo "${sampleFileItau}"...`);
    const res2 = await ingestionService.importarOfx(empresa.id, sampleFileItau, contentItau, 'TEST_RUNNER_REPETIDO');

    console.log(`   -> Transações Inseridas na 2ª tentativa:   ${res2.transacoesInseridas} (ESPERADO: 0)`);
    console.log(`   -> Duplicatas Rejeitadas na 2ª tentativa: ${res2.transacoesDuplicadasIgnoradas} (ESPERADO: ${res1.totalTransacoesArquivo})`);

    const countRes2 = await client.query(countQuery1, [empresa.id, res1.contaBancariaId]);
    const totalBanco2 = parseInt(countRes2.rows[0].total, 10);
    console.log(`   -> Estado do Banco após re-importação:    ${totalBanco2} transações gravadas.`);

    if (res2.transacoesInseridas !== 0) {
      throw new Error(`FALHA DE IDEMPOTÊNCIA: ${res2.transacoesInseridas} transações duplicadas foram aceitas!`);
    }
    if (totalBanco2 !== totalBanco1) {
      throw new Error(`FALHA DE INTEGRIDADE: Contagem no banco alterou de ${totalBanco1} para ${totalBanco2}!`);
    }
    console.log(`   -> [OK] IDEMPOTÊNCIA ABSOLUTA CONFIRMADA! NENHUMA transação foi duplicada no DB.`);

    // 4. Testar Ingestão de Extrato Bradesco (com vírgula decimal e tags específicas)
    const ofxDirBrad = path.join(__dirname, '..', 'Arquivos_Reais_Para_A_IA_Usar_Como_Parametro', 'Extratos Bancários OFX', 'Mitang Brasil (Baterias)', 'Bradesco');
    const filesBrad = fs.readdirSync(ofxDirBrad);
    const sampleFileBrad = filesBrad[0]; // Bradesco Agosto 2026
    const contentBrad = fs.readFileSync(path.join(ofxDirBrad, sampleFileBrad), 'latin1');

    console.log(`\n[4/5] Importando Extrato Real Bradesco (com vírgulas decimeis): "${sampleFileBrad}"`);
    const resBrad = await ingestionService.importarOfx(empresa.id, sampleFileBrad, contentBrad, 'TEST_RUNNER_BRADESCO');

    console.log(`   -> Banco Identificado: ${resBrad.banco} | Conta: ${resBrad.conta}`);
    console.log(`   -> Total de transações no arquivo: ${resBrad.totalTransacoesArquivo}`);
    console.log(`   -> Transações INSERIDAS no DB:     ${resBrad.transacoesInseridas}`);
    console.log(`   -> Duplicatas Ignoradas:           ${resBrad.transacoesDuplicadasIgnoradas}`);
    console.log(`   -> Saldo Final do Extrato:         R$ ${resBrad.saldoFinalExtrato?.toFixed(2)}`);

    // 5. Testar Re-importação Bradesco (Anti-duplicação Bradesco)
    console.log(`\n[5/5] Re-importando o mesmo extrato Bradesco para validar anti-duplicação...`);
    const resBrad2 = await ingestionService.importarOfx(empresa.id, sampleFileBrad, contentBrad, 'TEST_RUNNER_BRADESCO_2');
    console.log(`   -> Transações Inseridas na 2ª tentativa:   ${resBrad2.transacoesInseridas} (ESPERADO: 0)`);
    console.log(`   -> Duplicatas Rejeitadas na 2ª tentativa: ${resBrad2.transacoesDuplicadasIgnoradas}`);

    if (resBrad2.transacoesInseridas !== 0) {
      throw new Error(`FALHA DE IDEMPOTÊNCIA BRADESCO: ${resBrad2.transacoesInseridas} duplicadas foram aceitas!`);
    }
    console.log(`   -> [OK] IDEMPOTÊNCIA BRADESCO CONFIRMADA!`);

    console.log('\n======================================================================');
    console.log('>>> TODOS OS TESTES DE INGESTÃO E ANTI-DUPLICAÇÃO PASSARAM COM 100%! <<<');
    console.log('======================================================================\n');
  } catch (err) {
    console.error('\n[ERRO NO TESTE OFX]:', err);
    process.exit(1);
  } finally {
    client.release();
    await pgPool.end();
    process.exit(0);
  }
}

testOfxIngestion();
