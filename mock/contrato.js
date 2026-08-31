'use strict';
/**
 * ============================================================================
 * O CONTRATO, EM CODIGO
 * ============================================================================
 *
 * As formas que o R03 (frontend-specs/respostas-claude/R03_CONTRATO_DE_API.md)
 * promete ao frontend. Tudo que o mock devolve passa por aqui, e o backend real
 * vai passar pelas mesmas funcoes quando as rotas forem escritas.
 *
 * A razao de existir um arquivo so para isto: contrato que vive em documento
 * diverge. Contrato que vive em funcao, os dois lados chamam -- e o teste
 * tests/mock-contrato.test.js falha quando alguem muda a forma sem avisar.
 * ============================================================================
 */

/** Envelope de listagem. Recurso unico NAO usa envelope -- vira '.data.data'. */
function lista(itens, { pagina = 1, limite = 100, total = null, completude = null } = {}) {
  const totalReal = total === null ? itens.length : total;
  return {
    data: itens,
    total: totalReal,
    page: pagina,
    limit: limite,
    total_pages: Math.max(1, Math.ceil(totalReal / limite)),
    completude: completude || { estado: 'AUDITADO', observacao: null }
  };
}

/** Erro no formato RFC 7807 acordado. Nunca vaza stack trace. */
function erro(status, codigo, mensagem, { detalhe = null, acaoSugerida = null } = {}) {
  return {
    corpo: {
      status,
      codigo,
      mensagem,
      detalhe,
      acao_sugerida: acaoSugerida,
      requisicao_id: idRequisicao()
    },
    status
  };
}

/**
 * Numero sem base. A regra central: se nao da para apurar, o valor nao e
 * inventado -- vem nulo com o motivo escrito.
 */
function semBase(motivoCodigo, motivo, { valor = null } = {}) {
  return { valor, disponivel: false, motivo_codigo: motivoCodigo, motivo };
}

/** Numero apurado, com o caminho de volta ate os documentos que o formaram. */
function comBase(valor, { formula = null, origem = null, detalheUrl = null, completude = 'AUDITADO' } = {}) {
  return {
    valor,
    disponivel: true,
    explicabilidade: { formula, origem, detalhe_url: detalheUrl, completude }
  };
}

function idRequisicao() {
  return 'mock-' + Math.random().toString(16).slice(2, 10) + '-' + Date.now().toString(16);
}

/** Os codigos de erro publicados no R03. Estaveis: uma vez aqui, nao mudam. */
const CODIGOS = {
  NAO_AUTENTICADO: 401,
  PAPEL_INSUFICIENTE: 403,
  TENANT_NEGADO: 403,
  VALIDACAO: 400,
  NAO_ENCONTRADO: 404,
  PERIODO_FECHADO: 422,
  PARTIDA_DESBALANCEADA: 422,
  APTIDAO_BLOQUEADA: 422,
  DUPLICIDADE: 409,
  CONFLITO_VERSAO: 409
};

module.exports = { lista, erro, semBase, comBase, CODIGOS, idRequisicao };
