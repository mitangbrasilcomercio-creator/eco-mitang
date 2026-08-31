#!/usr/bin/env node
/**
 * ============================================================================
 * CRIACAO DE USUARIO DO ERP
 * ============================================================================
 * O primeiro usuario nao pode ser criado pela API (a rota exige um Gestor_CLevel
 * ja autenticado), entao ele nasce por aqui.
 *
 * Uso:
 *   node scripts/criar_usuario.js --email a@b.com --nome "Diego" --papel Gestor_CLevel --consolidado
 *   node scripts/criar_usuario.js --email a@b.com --nome "Fulano" --empresas <uuid>,<uuid>
 *
 * A senha e pedida via variavel de ambiente ECO_SENHA_INICIAL para nao ficar no
 * historico do shell:
 *   ECO_SENHA_INICIAL='...' node scripts/criar_usuario.js --email ...
 *
 * Sem --empresas, o usuario e vinculado a TODOS os CNPJs ativos da holding.
 * ============================================================================
 */
const bcrypt = require('bcryptjs');
const { Client } = require('pg');
const crypto = require('crypto');
const ambiente = require('./lib/ambiente');

function arg(nome, padrao = null) {
  const i = process.argv.indexOf('--' + nome);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : padrao;
}
const temFlag = (nome) => process.argv.includes('--' + nome);

function validarSenha(senha) {
  const problemas = [];
  if (senha.length < 12) problemas.push('minimo 12 caracteres');
  if (!/[a-z]/.test(senha)) problemas.push('precisa de letra minuscula');
  if (!/[A-Z]/.test(senha)) problemas.push('precisa de letra maiuscula');
  if (!/[0-9]/.test(senha)) problemas.push('precisa de numero');
  return problemas;
}

async function main() {
  const email = arg('email');
  const nome = arg('nome');
  const papel = arg('papel', 'Vendedor');
  const empresasArg = arg('empresas');
  const consolidado = temFlag('consolidado');

  if (!email || !nome) {
    console.error('Uso: node scripts/criar_usuario.js --email <email> --nome <nome> [--papel <papel>] [--consolidado] [--empresas <uuid,uuid>]');
    process.exit(1);
  }

  const papeisValidos = ['Gestor_CLevel', 'Financeiro', 'Vendedor', 'Operacional'];
  if (!papeisValidos.includes(papel)) {
    console.error(`[ERRO] Papel invalido. Use um de: ${papeisValidos.join(', ')}`);
    process.exit(1);
  }

  let senha = process.env.ECO_SENHA_INICIAL;
  let senhaGerada = false;
  if (!senha) {
    // Gera uma senha forte e mostra uma unica vez.
    senha = crypto.randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, '') + 'Aa1';
    senhaGerada = true;
  }

  const problemas = validarSenha(senha);
  if (problemas.length > 0) {
    console.error('[ERRO] Senha fraca: ' + problemas.join(', ') + '.');
    process.exit(1);
  }

  const ctx = ambiente.resolver({ papel: 'migration' });
  ambiente.banner(ctx, 'Criacao de usuario');
  await ambiente.confirmarSeProducao(ctx, { operacao: 'criar/alterar um usuario com acesso ao sistema' });

  const client = new Client(ctx.configCliente());
  await client.connect();

  try {
    let empresas;
    if (empresasArg) {
      empresas = empresasArg.split(',').map((s) => s.trim()).filter(Boolean);
    } else {
      const res = await client.query('SELECT id, nome_fantasia FROM empresas WHERE ativo = TRUE ORDER BY nome_fantasia;');
      empresas = res.rows.map((r) => r.id);
      console.log(`Vinculando a todos os ${empresas.length} CNPJs ativos da holding:`);
      res.rows.forEach((r) => console.log(`  - ${r.nome_fantasia}`));
    }

    if (empresas.length === 0) {
      console.error('[ERRO] Nenhum CNPJ para vincular.');
      process.exit(1);
    }

    const jaExiste = await client.query('SELECT id FROM usuarios WHERE lower(email) = lower($1);', [email]);
    if (jaExiste.rows.length > 0) {
      console.error(`[ERRO] Ja existe um usuario com o e-mail ${email}.`);
      process.exit(1);
    }

    const senhaHash = await bcrypt.hash(senha, 12);

    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO usuarios (email, nome, senha_hash, papel, pode_visao_consolidada)
       VALUES ($1, $2, $3, $4, $5) RETURNING id;`,
      [email.toLowerCase(), nome, senhaHash, papel, consolidado]
    );
    const usuarioId = ins.rows[0].id;

    for (const empresaId of empresas) {
      await client.query(
        'INSERT INTO usuarios_empresas (usuario_id, empresa_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;',
        [usuarioId, empresaId]
      );
    }
    await client.query('COMMIT');

    console.log('\n======================================================================');
    console.log('  USUARIO CRIADO');
    console.log('======================================================================');
    console.log(`  E-mail      : ${email}`);
    console.log(`  Nome        : ${nome}`);
    console.log(`  Papel       : ${papel}`);
    console.log(`  Consolidado : ${consolidado ? 'sim' : 'nao'}`);
    console.log(`  CNPJs       : ${empresas.length}`);
    if (senhaGerada) {
      console.log(`\n  SENHA (anote agora, nao sera mostrada de novo):\n  ${senha}`);
    }
    console.log('======================================================================\n');
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
