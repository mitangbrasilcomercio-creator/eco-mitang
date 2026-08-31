'use strict';
/**
 * ============================================================================
 * ROTAS QUE AINDA NAO EXISTEM NO BACKEND
 * ============================================================================
 *
 * Cada rota aqui e uma promessa: quando eu escrever a versao real, ela devolve
 * exatamente esta forma. O frontend pode ser construido hoje contra elas.
 *
 * O que NAO entra aqui: rota que ja existe de verdade. Essas o servidor
 * encaminha para a API real -- ver mock/servidor.js. Duplicar uma rota real
 * aqui seria criar uma segunda fonte de verdade, que e pior que nao ter mock.
 *
 * Toda resposta sai com o cabecalho 'X-Eco-Origem: mock', para ninguem
 * confundir desenho com software funcionando.
 * ============================================================================
 */
const { lista, erro, semBase, CODIGOS } = require('./contrato');

// ---------------------------------------------------------------------------
// Catalogo de apoio: os itens reais que a Arandu vende, com a margem de
// contribuicao de cada um. Margem por item importa -- 10% de desconto numa
// pilha de 28% de margem machuca mais que 5% num pack de 44%.
// ---------------------------------------------------------------------------
const CATALOGO = {
  AQL25:  { nome: 'Pack Aquadopp 14,4 V · 17,3 Ah', unit: 4380.0, margem_base: 0.442, quimica: 'Li-SOCL2' },
  MN1300: { nome: 'Pilha alcalina D · Duracell',    unit: 34.2,   margem_base: 0.28,  quimica: 'Alcalina' },
  CMXL48: { nome: 'cNode Maxi 14,4 V · 180 Ah',     unit: 14850.0, margem_base: 0.46, quimica: 'Li-SOCL2' },
  ADL30:  { nome: 'ADCP Workhorse 300/600 kHz',     unit: 9850.0, margem_base: 0.41,  quimica: 'Li-SOCL2' }
};

const PISO_MARGEM = 35;

/** Guarda os rascunhos criados na sessao. Some quando o servidor reinicia. */
const rascunhos = new Map();
let sequencial = 43;

// ---------------------------------------------------------------------------

function arredondar(n) {
  return Math.round(n * 100) / 100;
}

/**
 * O calculo que a tela de orcamento precisa e que o backend real vai repetir.
 *
 * Duas decisoes valem comentario:
 *
 * 1. A margem nao cai linearmente com o desconto. O desconto encolhe o preco,
 *    que e o denominador: margem = (base - desconto) / (1 - desconto).
 *    Em 44,2% de desconto a margem zera; acima disso, vende-se abaixo do custo.
 *
 * 2. A alcada olha a margem SEM a taxa de urgencia. A urgencia e receita extra
 *    que carrega custo extra ainda nao medido (hora extra, compra fora de
 *    estoque). Deixar que ela levante a margem seria maquiar a decisao.
 */
function calcularOrcamento({ itens = [], urgencia = null }) {
  let bruto = 0, liquido = 0, custo = 0;

  const detalhados = itens.map((linha) => {
    const ref = CATALOGO[linha.sku];
    if (!ref) return null;

    const qtd = Number(linha.quantidade) || 0;
    const d = Math.max(0, Math.min(90, Number(linha.desconto_pct) || 0)) / 100;

    const vBruto = qtd * ref.unit;
    const vLiquido = vBruto * (1 - d);
    const vCusto = vBruto * (1 - ref.margem_base);

    bruto += vBruto;
    liquido += vLiquido;
    custo += vCusto;

    const margem = ((ref.margem_base - d) / (1 - d)) * 100;

    return {
      sku: linha.sku,
      nome: ref.nome,
      quimica: ref.quimica,
      quantidade: qtd,
      valor_unitario: ref.unit,
      desconto_pct: arredondar(d * 100),
      valor_tabela: arredondar(vBruto),
      valor_final: arredondar(vLiquido),
      valor_abatido: arredondar(vBruto - vLiquido),
      margem_pct: arredondar(margem),
      margem_base_pct: arredondar(ref.margem_base * 100),
      abaixo_do_custo: margem <= 0,
      abaixo_da_politica: margem < PISO_MARGEM,
      custo_origem: 'CATALOGO_MANUAL'
    };
  }).filter(Boolean);

  const taxa = urgencia ? Math.max(0, Number(urgencia.acrescimo_pct) || 0) / 100 : 0;
  const acrescimo = liquido * taxa;
  const proposta = liquido + acrescimo;

  const margemProposta = liquido > 0 ? ((liquido - custo) / liquido) * 100 : 0;
  const margemComUrgencia = proposta > 0 ? ((proposta - custo) / proposta) * 100 : 0;

  return {
    itens: detalhados,
    totais: {
      valor_tabela: arredondar(bruto),
      descontos_concedidos: arredondar(bruto - liquido),
      desconto_efetivo_pct: bruto > 0 ? arredondar(((bruto - liquido) / bruto) * 100) : 0,
      subtotal_com_desconto: arredondar(liquido),
      acrescimo_urgencia: arredondar(acrescimo),
      valor_proposta: arredondar(proposta),
      // O comparativo que o operador pediu: quanto entraria sem ter dado nada.
      entraria_sem_desconto: arredondar(bruto * (1 + taxa)),
      diferenca_do_desconto: arredondar(proposta - bruto * (1 + taxa))
    },
    urgencia: urgencia
      ? {
          motivo: urgencia.motivo || null,
          acrescimo_pct: arredondar(taxa * 100),
          prazo_dias_uteis: urgencia.prazo_dias_uteis ?? 3,
          custo_da_urgencia: semBase(
            'APONTAMENTO_PRODUCAO_PENDENTE',
            'A urgência aumenta o preço agora e o custo depois. O custo real só será medido quando existir apontamento de produção.'
          )
        }
      : null,
    margem: {
      // Sobre a qual a alcada decide.
      proposta_pct: arredondar(margemProposta),
      com_urgencia_pct: arredondar(margemComUrgencia),
      com_urgencia_confiavel: false,
      piso_politica_pct: PISO_MARGEM,
      abaixo_do_custo: margemProposta <= 0,
      abaixo_da_politica: margemProposta < PISO_MARGEM,
      custo_origem: 'CATALOGO_MANUAL',
      observacao:
        'Margem sobre custo digitado no catálogo, não sobre estrutura de produto. Vira BOM real na Fase 5.'
    },
    // Contabilidade e faturamento sao coisas diferentes: o valor acima e o que
    // o cliente paga, nao o que sobra depois do imposto.
    tributos: semBase(
      'APURACAO_FISCAL_PENDENTE',
      'Os valores são de faturamento. O imposto destacado sai na emissão da nota.'
    )
  };
}

/** A maquina de estados decide o botao da tela -- a tela nao conhece a regra. */
function transicoesDe(calculo) {
  if (calculo.margem.abaixo_do_custo) {
    return [
      {
        para: 'AGUARDANDO_ALCADA',
        rotulo: 'Autorizar venda abaixo do custo',
        exige_justificativa: true,
        exige_papel: 'Gestor_CLevel',
        severidade: 'ALTA',
        motivo: 'Margem de ' + calculo.margem.proposta_pct + '%: cada unidade vendida dá prejuízo.'
      }
    ];
  }
  if (calculo.margem.abaixo_da_politica) {
    return [
      {
        para: 'AGUARDANDO_ALCADA',
        rotulo: 'Solicitar alçada de desconto',
        exige_justificativa: true,
        exige_papel: 'Gestor_CLevel',
        severidade: 'MEDIA',
        motivo:
          'Margem de ' + calculo.margem.proposta_pct + '% abaixo do piso de ' + PISO_MARGEM + '%.'
      }
    ];
  }
  return [
    {
      para: 'APROVADO',
      rotulo: 'Aprovar e emitir proposta',
      exige_justificativa: false,
      exige_papel: null,
      severidade: 'NENHUMA',
      motivo: null
    }
  ];
}

// ---------------------------------------------------------------------------
// Tabela de rotas. Chave: 'METODO /caminho' -- ':x' casa um segmento.
// ---------------------------------------------------------------------------

const ROTAS = {
  // ---- Orcamentos: criacao, que hoje nao existe (a API real so tem GET) ----

  'POST /api/v1/orcamentos': (req) => {
    const corpo = req.corpo || {};
    if (!Array.isArray(corpo.itens) || corpo.itens.length === 0) {
      return erro(400, 'VALIDACAO', 'A proposta precisa de pelo menos um item.', {
        detalhe: { campo: 'itens', recebido: corpo.itens }
      });
    }

    const desconhecidos = corpo.itens.filter((i) => !CATALOGO[i.sku]).map((i) => i.sku);
    if (desconhecidos.length > 0) {
      return erro(400, 'VALIDACAO', 'SKU fora do catálogo: ' + desconhecidos.join(', '), {
        detalhe: { skus_validos: Object.keys(CATALOGO) }
      });
    }

    const calculo = calcularOrcamento(corpo);
    const numero = 'AR-2026/' + String(++sequencial).padStart(3, '0');

    const doc = {
      numero_orcamento: numero,
      empresa: corpo.empresa || 'Arandu Comércio',
      cliente: corpo.cliente || null,
      estado_atual: 'RASCUNHO',
      criado_em: new Date().toISOString(),
      ...calculo,
      transicoes_disponiveis: transicoesDe(calculo)
    };

    rascunhos.set(numero, doc);
    return { corpo: doc, status: 201 };
  },

  // Recalcula sem gravar: e o que a tela chama a cada digito no desconto.
  'POST /api/v1/orcamentos/simular': (req) => {
    const calculo = calcularOrcamento(req.corpo || {});
    return {
      corpo: { ...calculo, transicoes_disponiveis: transicoesDe(calculo) },
      status: 200
    };
  },

  'GET /api/v1/orcamentos/:numero/transicoes': (req) => {
    const doc = rascunhos.get(req.params.numero);
    if (!doc) {
      return erro(404, 'NAO_ENCONTRADO', 'Proposta ' + req.params.numero + ' não encontrada.');
    }
    return { corpo: { estado_atual: doc.estado_atual, transicoes_disponiveis: doc.transicoes_disponiveis }, status: 200 };
  },

  'POST /api/v1/orcamentos/:numero/transicoes': (req) => {
    const doc = rascunhos.get(req.params.numero);
    if (!doc) {
      return erro(404, 'NAO_ENCONTRADO', 'Proposta ' + req.params.numero + ' não encontrada.');
    }
    const { para, justificativa } = req.corpo || {};
    const transicao = doc.transicoes_disponiveis.find((t) => t.para === para);
    if (!transicao) {
      return erro(422, 'VALIDACAO', 'Transição não disponível a partir de ' + doc.estado_atual + '.', {
        detalhe: { disponiveis: doc.transicoes_disponiveis.map((t) => t.para) }
      });
    }
    if (transicao.exige_justificativa && String(justificativa || '').trim().length < 30) {
      return erro(422, 'VALIDACAO', 'Esta transição exige justificativa de pelo menos 30 caracteres.', {
        detalhe: { campo: 'justificativa', minimo: 30, recebido: String(justificativa || '').trim().length }
      });
    }
    doc.estado_atual = para;
    doc.transicoes_disponiveis = [];
    return { corpo: { estado_atual: para, registrado_em_auditoria: true }, status: 200 };
  },

  // ---- Ingestao: hoje so existe por terminal ----

  'POST /api/v1/ingestao/verificar-hashes': (req) => {
    const hashes = (req.corpo && req.corpo.hashes) || [];
    // Um hash fixo simula arquivo ja importado, para a tela ter o caso vermelho.
    const jaVistos = new Set(['e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855']);
    return {
      corpo: lista(
        hashes.map((h) => ({
          hash: h,
          ja_importado: jaVistos.has(h),
          importado_em: jaVistos.has(h) ? '2026-08-27T14:02:00Z' : null,
          lote_id: jaVistos.has(h) ? 24 : null
        }))
      ),
      status: 200
    };
  },

  'POST /api/v1/ingestao/lotes': () => ({
    corpo: {
      lote_id: 25,
      estado: 'EM_QUARENTENA',
      recebidos: 42,
      novos: 39,
      com_aviso: 2,
      bloqueados_por_duplicidade: 1,
      observacao: 'Nada foi gravado. O lote pode ser descartado inteiro.'
    },
    status: 202
  }),

  'GET /api/v1/ingestao/lotes/:id': (req) => ({
    corpo: {
      lote_id: Number(req.params.id),
      estado: 'EM_QUARENTENA',
      grupos: [
        { chave: 'RECONHECIDOS', titulo: 'Reconhecidos e conciliáveis', qtd: 84, exige_decisao: false },
        {
          chave: 'MOVIMENTO_BANCARIO',
          titulo: 'Movimento automático do banco',
          qtd: 31,
          exige_decisao: false,
          observacao: 'SALDO APLICAÇÃO AUTOMÁTICA e resgates: transferência entre contas próprias, fora do resultado.'
        },
        { chave: 'MEMO_NOVO', titulo: 'Memo novo, sem classificação', qtd: 3, exige_decisao: true }
      ],
      pendencias: 3,
      pode_efetivar: false,
      observacao: 'Classifique os 3 memos novos antes de efetivar.'
    },
    status: 200
  }),

  'POST /api/v1/ingestao/lotes/:id/efetivar': (req) => ({
    corpo: {
      lote_id: Number(req.params.id),
      estado: 'EFETIVADO',
      efetivado_em: new Date().toISOString(),
      gravados: { notas_fiscais: 36, transacoes: 118, duplicatas: 22, regras_aprendidas: 3 },
      // O que torna o "desfazer em lote" possivel: tudo carrega o lote.
      desfazer_url: '/api/v1/ingestao/lotes/' + req.params.id + '/estornar'
    },
    status: 200
  }),

  // ---- Troca de tenant: substitui o header x-empresa-id ----

  'POST /api/v1/auth/trocar-tenant': (req) => {
    const id = (req.corpo || {}).empresa_id;
    if (!id) {
      return erro(400, 'VALIDACAO', 'Informe empresa_id.', { detalhe: { campo: 'empresa_id' } });
    }
    return {
      corpo: {
        token: 'jwt.de.mentira.' + Date.now(),
        empresa_atual: { id, nome_fantasia: 'Arandu Comércio' },
        observacao: 'O tenant vive no token, nunca em cabeçalho. Ver R04, item 1.'
      },
      status: 200
    };
  },

  // ---- Enriquecimento de CNPJ, cache-first ----

  'GET /api/v1/parceiros/cnpj/:cnpj': (req) => ({
    corpo: {
      dados: {
        cnpj: req.params.cnpj,
        razao_social: 'Fugro Brasil Serviços Submarinos LTDA',
        situacao_cadastral: 'ATIVA',
        capital_social: 12500000
      },
      cache: { consultado_em: '2026-07-02', idade_dias: 60, atualizacao_em_andamento: true }
    },
    status: 200
  })
};

module.exports = { ROTAS, CATALOGO, calcularOrcamento, transicoesDe, PISO_MARGEM };
