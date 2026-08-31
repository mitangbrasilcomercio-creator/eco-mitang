'use strict';
/**
 * ============================================================================
 * LIVRO DE MIGRATIONS PROVADAS EM HOMOLOGACAO
 * ============================================================================
 *
 * [ERRO ANTERIOR]
 * Nao havia nada entre escrever uma migration e ela rodar em producao. O plano
 * de execucao pede "homologacao obrigatoria, rollback testado" -- mas isso,
 * escrito so num documento, e disciplina humana, e disciplina humana falha
 * exatamente no dia em que se esta com pressa.
 *
 * [CORRECAO]
 * Toda migration aplicada com sucesso em homologacao e registrada aqui, com o
 * hash do arquivo. Antes de aplicar em producao, o executor confere: migration
 * que nunca passou em homologacao -- ou que mudou depois de passar -- e
 * recusada.
 *
 * O arquivo e versionado de proposito. Ele responde, meses depois, "esta
 * migration chegou a ser testada em algum lugar antes de tocar os dados reais?"
 * ============================================================================
 */
const fs = require('fs');
const path = require('path');

const CAMINHO = path.join(__dirname, '..', '..', 'database', 'homologado.json');

function ler() {
  try {
    const bruto = fs.readFileSync(CAMINHO, 'utf8');
    const dados = JSON.parse(bruto);
    return dados && typeof dados === 'object' ? dados : {};
  } catch {
    return {};
  }
}

function gravar(dados) {
  const ordenado = {};
  for (const nome of Object.keys(dados).sort()) ordenado[nome] = dados[nome];
  fs.writeFileSync(CAMINHO, JSON.stringify(ordenado, null, 2) + '\n', 'utf8');
}

/** Chamado pelo executor de migrations depois de aplicar em homologacao. */
function registrar(nome, hash, versaoPostgres) {
  const dados = ler();
  dados[nome] = {
    hash,
    provada_em: new Date().toISOString(),
    postgres: versaoPostgres || null
  };
  gravar(dados);
}

/**
 * @param {{nome: string, hash: string}[]} migrations  as pendentes
 * @returns {{nome: string, motivo: string}[]}         as que barram producao
 */
function naoProvadas(migrations) {
  const dados = ler();
  const problemas = [];

  for (const m of migrations) {
    const registro = dados[m.nome];
    if (!registro) {
      problemas.push({ nome: m.nome, motivo: 'nunca aplicada em homologacao' });
    } else if (registro.hash !== m.hash) {
      problemas.push({
        nome: m.nome,
        motivo: 'alterada depois de passar em homologacao (' + registro.provada_em + ')'
      });
    }
  }

  return problemas;
}

module.exports = { ler, registrar, naoProvadas, CAMINHO };
