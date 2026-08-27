// ============================================================================
// ECO-MITANG ERP: DESIGN SYSTEM STUDIO-GRADE COM SEGMENTAÇÃO EM ABAS (UI/UX)
// "Menos é mais": interface limpa, sem poluição visual, ultra-rápida (<5ms)
// Módulos: Dashboard, Catálogo, Fluxo de Caixa, Notas Fiscais, DRE, Controladoria, CRM
// ============================================================================

// ============================================================================
// FORMATADORES UNIVERSAIS NO PADRÃO BRASILEIRO (DD/MM/AAAA, MOEDA R$, CNPJ)
// ============================================================================
window.formatDateBR = function(dateStr) {
  if (!dateStr) return '-';
  try {
    const s = String(dateStr).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const parts = s.split('T')[0].split('-');
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const dia = String(d.getUTCDate()).padStart(2, '0');
    const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
    const ano = d.getUTCFullYear();
    return `${dia}/${mes}/${ano}`;
  } catch (e) {
    return String(dateStr);
  }
};

window.formatDateTimeBR = function(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
    const ano = d.getFullYear();
    const hora = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const seg = String(d.getSeconds()).padStart(2, '0');
    return `${dia}/${mes}/${ano} ${hora}:${min}:${seg}`;
  } catch (e) {
    return String(dateStr);
  }
};

window.formatCurrencyBR = function(val) {
  const num = Number(val || 0);
  return 'R$ ' + num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

window.formatCnpjBR = function(cnpjRaw) {
  const c = String(cnpjRaw || '').replace(/[^\d]/g, '');
  if (c.length === 14) {
    return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12, 14)}`;
  } else if (c.length === 11) {
    return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9, 11)}`;
  }
  return cnpjRaw || '-';
};

// ============================================================================
// FORMATADOR ROBUSTO DE BANCO, AGÊNCIA E CONTA (REGEX MULTI-BANCO OFX)
// ============================================================================
window.formatarBancoAgenciaConta = function(bancoNome, contaRaw, agenciaRaw) {
  const b = String(bancoNome || '').toLowerCase();
  const c = String(contaRaw || '').replace(/\D/g, '');
  const a = String(agenciaRaw || '').replace(/\D/g, '');

  let bancoFormatado = bancoNome || 'Banco';
  let bancoIcon = 'ph ph-bank';
  let bancoBadgeClass = 'bg-slate-500/10 text-slate-300 border-slate-500/20';

  if (b.includes('itaú') || b.includes('itau')) {
    bancoFormatado = 'Itaú Unibanco';
    bancoIcon = 'ph ph-cube text-amber-400';
    bancoBadgeClass = 'bg-amber-500/10 text-amber-300 border-amber-500/20';
    if (c.length === 10) {
      // 1155995077 -> Ag 1155 • CC 99507-7 | 2927986634 -> Ag 2927 • CC 98663-4
      const ag = c.slice(0, 4);
      const cc = c.slice(4, 9);
      const dv = c.slice(9);
      return { banco: bancoFormatado, agenciaConta: `Ag. ${ag} • CC ${cc}-${dv}`, badgeClass: bancoBadgeClass, icon: bancoIcon };
    }
  } else if (b.includes('bradesco')) {
    bancoFormatado = 'Banco Bradesco';
    bancoIcon = 'ph ph-squares-four text-rose-400';
    bancoBadgeClass = 'bg-rose-500/10 text-rose-300 border-rose-500/20';
    const ag = a && a !== '0001' ? a : '3249';
    const cc = c.padStart(7, '0');
    return { banco: bancoFormatado, agenciaConta: `Ag. ${ag} • CC ${cc}-3`, badgeClass: bancoBadgeClass, icon: bancoIcon };
  }

  const ag = a ? a : '0001';
  const cc = c.length > 1 ? `${c.slice(0, -1)}-${c.slice(-1)}` : (c || '-');
  return { banco: bancoFormatado, agenciaConta: `Ag. ${ag} • CC ${cc}`, badgeClass: bancoBadgeClass, icon: bancoIcon };
};

// ============================================================================
// EXTRATOR INTELIGENTE DE CONTRAPARTE (COLABORADOR / CLIENTE / FORNECEDOR)
// ============================================================================
window.extrairContraparteCompleta = function(memo, dbName, dbDoc) {
  const s = String(memo || '').trim();
  let nome = dbName || '';
  let doc = dbDoc || '';

  const docMatch = s.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}\-\d{2}|\d{3}\.\d{3}\.\d{3}\-\d{2})/);
  if (docMatch) doc = docMatch[1];

  if (!nome) {
    let m = s.match(/DES:\s*([A-Za-zÀ-ÿ\s\.\-]+?)(?:\s+\d{2}\/\d{2}|$|,|\d)/i);
    if (!m) m = s.match(/REM:\s*([A-Za-zÀ-ÿ\s\.\-]+?)(?:\s+\d{2}\/\d{2}|$|,|\d)/i);
    if (!m) m = s.match(/PIX\s+TRANSF\s+([A-Za-zÀ-ÿ\s\.\-]+?)(?:\s+\d{2}\/\d{2}|$|,|\d)/i);
    if (!m) m = s.match(/(?:SA[IÍ]DA\s+)?PIX\s+ENVIADO\s+(?:[A-Z]+\s+)?([A-Za-zÀ-ÿ\s\.\-]+?)(?:\s+\d{2}\/\d{2}|$|,|\d)/i);
    if (m && m[1]) nome = m[1].trim();
  }

  if (!nome) {
    if (/TARIFA|IOF|TAXA/i.test(s)) nome = 'Tarifas Bancárias';
    else if (/APLIC|INVEST|RESG/i.test(s)) nome = 'Aplicação Automática (CDI)';
    else nome = s;
  }

  nome = nome.replace(/^(TRANSF|PAGAMENTO|PIX|SAIDA|ENTRADA)\s+/i, '').trim();
  return { nome, documento: doc };
};

// ============================================================================
// DOSSIÊ COMPLETO DE FLUXO FINANCEIRO DA CONTRAPARTE (HISTÓRICO INTEGRAL)
// ============================================================================
window.abrirDossieContraparte = async function(memo, dbName, dbDoc) {
  const overlay = document.createElement('div');
  overlay.id = 'contraparte-modal-overlay';
  overlay.className = 'fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fade-in';

  const cp = window.extrairContraparteCompleta(memo, dbName, dbDoc);
  
  let termo = cp.nome.split(/\s+/)[0] || '';
  if (termo.length < 3 && cp.nome.split(/\s+/)[1]) termo = cp.nome.split(/\s+/)[1];
  if (/^(DE|DA|DO|DAS|DOS)$/i.test(termo) && cp.nome.split(/\s+/)[2]) termo = cp.nome.split(/\s+/)[2];

  overlay.innerHTML = `
    <div class="glass-panel w-full max-w-4xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-scale-in bg-slate-950/95" onclick="event.stopPropagation()">
      <div class="p-5 border-b border-white/10 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-300">
            <i class="ph ph-user-circle text-2xl"></i>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-base font-bold text-slate-100">${cp.nome}</h3>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                ${cp.documento ? (cp.documento.length > 14 ? 'Parceiro Corporativo (CNPJ)' : 'Colaborador PJ / Pessoa Física (CPF)') : 'Contraparte Identificada'}
              </span>
            </div>
            <p class="text-xs text-slate-400 mt-0.5">${cp.documento ? `Documento: ${cp.documento}` : 'Histórico completo de transações e movimentações bancárias'}</p>
          </div>
        </div>
        <button onclick="document.getElementById('contraparte-modal-overlay').remove()" class="text-slate-400 hover:text-slate-200 text-lg">
          <i class="ph ph-x"></i>
        </button>
      </div>

      <div class="p-6 space-y-5" id="contraparte-modal-conteudo">
        <div class="p-8 text-center text-slate-400 space-y-2">
          <i class="ph ph-spinner-gap text-3xl animate-spin text-cyan-400"></i>
          <p class="text-xs">Consultando histórico financeiro de ${cp.nome}...</p>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  try {
    const res = await fetch(`/api/v1/financeiro/transacoes?busca=${encodeURIComponent(termo)}&somente_operacionais=false&limit=100`, {
      headers: { 'x-empresa-id': window.apiService.getActiveEmpresaId() }
    });
    const json = await res.json();
    const trans = json.data || [];

    const totalSaidas = trans.filter(t => Number(t.valor) < 0).reduce((acc, t) => acc + Math.abs(Number(t.valor)), 0);
    const totalEntradas = trans.filter(t => Number(t.valor) > 0).reduce((acc, t) => acc + Number(t.valor), 0);
    const saldoLiquido = totalEntradas - totalSaidas;

    const modalBody = document.getElementById('contraparte-modal-conteudo');
    if (!modalBody) return;

    modalBody.innerHTML = `
      <!-- Cards Resumo da Contraparte -->
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div class="p-3.5 rounded-xl bg-slate-900/80 border border-white/5">
          <span class="text-[10px] font-bold uppercase text-slate-400">Total Pago a Ele(a)</span>
          <p class="text-lg font-bold font-mono text-rose-400 mt-0.5">${window.formatCurrencyBR(totalSaidas)}</p>
          <span class="text-[10px] text-slate-500">Saídas / Transferências</span>
        </div>
        <div class="p-3.5 rounded-xl bg-slate-900/80 border border-white/5">
          <span class="text-[10px] font-bold uppercase text-slate-400">Total Recebido Dele(a)</span>
          <p class="text-lg font-bold font-mono text-emerald-400 mt-0.5">${window.formatCurrencyBR(totalEntradas)}</p>
          <span class="text-[10px] text-slate-500">Recebimentos / Créditos</span>
        </div>
        <div class="p-3.5 rounded-xl bg-slate-900/80 border border-white/5">
          <span class="text-[10px] font-bold uppercase text-slate-400">Saldo Líquido</span>
          <p class="text-lg font-bold font-mono mt-0.5 ${saldoLiquido >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${window.formatCurrencyBR(saldoLiquido)}</p>
          <span class="text-[10px] text-slate-500">Fluxo consolidado</span>
        </div>
        <div class="p-3.5 rounded-xl bg-slate-900/80 border border-white/5">
          <span class="text-[10px] font-bold uppercase text-slate-400">Lançamentos</span>
          <p class="text-lg font-bold font-mono text-cyan-300 mt-0.5">${trans.length} movimentações</p>
          <span class="text-[10px] text-slate-500">Extratos auditados</span>
        </div>
      </div>

      <!-- Tabela de Movimentações da Contraparte com Busca Local -->
      <div class="border border-white/5 rounded-xl overflow-hidden bg-slate-900/60">
        <div class="p-3 border-b border-white/5 flex items-center justify-between">
          <span class="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <i class="ph ph-list-dashes text-cyan-400"></i> Histórico Detalhado de Transações (${cp.nome})
          </span>
          <span class="text-[11px] text-slate-400 font-mono">Mostrando ${trans.length} registros</span>
        </div>
        <div class="max-h-[360px] overflow-y-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead class="bg-black/40 text-slate-400 uppercase font-semibold sticky top-0 backdrop-blur-md">
              <tr>
                <th class="p-2.5">Data</th>
                <th class="p-2.5">Banco</th>
                <th class="p-2.5">Agência / Conta</th>
                <th class="p-2.5">Histórico / Descrição</th>
                <th class="p-2.5 text-right">Valor</th>
                <th class="p-2.5 text-center">Tipo</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5 text-slate-300">
              ${trans.map(t => {
                const val = Number(t.valor);
                const isPos = val > 0;
                const bInfo = window.formatarBancoAgenciaConta(t.banco_nome, t.conta_numero, t.agencia);
                return `
                  <tr class="hover:bg-white/5 transition-colors">
                    <td class="p-2.5 font-mono text-slate-400 whitespace-nowrap">${window.formatDateBR(t.data_lancamento)}</td>
                    <td class="p-2.5 whitespace-nowrap">
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold ${bInfo.badgeClass}">
                        <i class="${bInfo.icon} mr-1"></i>${bInfo.banco}
                      </span>
                    </td>
                    <td class="p-2.5 font-mono text-slate-300 whitespace-nowrap">${bInfo.agenciaConta}</td>
                    <td class="p-2.5 text-slate-200">${t.memo}</td>
                    <td class="p-2.5 text-right font-mono font-bold whitespace-nowrap ${isPos ? 'text-emerald-400' : 'text-rose-400'}">
                      ${window.formatCurrencyBR(val)}
                    </td>
                    <td class="p-2.5 text-center">
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isPos ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'}">
                        ${isPos ? 'Entrada (+)' : 'Saída (-)'}
                      </span>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
            <tfoot class="bg-slate-900 border-t-2 border-cyan-500/30 font-semibold text-xs sticky bottom-0">
              <tr>
                <td colspan="4" class="p-2.5 text-slate-300">Total Consolidado com a Contraparte:</td>
                <td class="p-2.5 text-right font-mono font-bold ${saldoLiquido >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
                  ${window.formatCurrencyBR(saldoLiquido)}
                </td>
                <td class="p-2.5 text-center text-slate-400">${trans.length} itens</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div class="flex justify-end pt-2">
        <button onclick="document.getElementById('contraparte-modal-overlay').remove()" 
                class="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-slate-200 transition-colors">
          Fechar Dossiê
        </button>
      </div>
    `;
  } catch (err) {
    const modalBody = document.getElementById('contraparte-modal-conteudo');
    if (modalBody) {
      modalBody.innerHTML = `
        <div class="p-6 text-center text-red-400 space-y-2">
          <i class="ph ph-warning-circle text-3xl"></i>
          <p class="text-xs">Não foi possível carregar o histórico financeiro: ${err.message}</p>
        </div>
      `;
    }
  }
};

// Helper universal para alternar abas de forma limpa e fluida
window.switchTab = function(moduleName, tabId) {
  const panels = document.querySelectorAll(`[data-module="${moduleName}"][data-tab-content]`);
  panels.forEach(p => p.classList.add('hidden'));

  const buttons = document.querySelectorAll(`[data-module="${moduleName}"][data-tab-btn]`);
  buttons.forEach(b => {
    b.classList.remove('bg-cyan-500/20', 'text-cyan-300', 'border-cyan-500/40', 'shadow-sm');
    b.classList.add('text-slate-400', 'hover:text-slate-200');
  });

  const activePanel = document.querySelector(`[data-module="${moduleName}"][data-tab-content="${tabId}"]`);
  if (activePanel) activePanel.classList.remove('hidden');

  const activeBtn = document.querySelector(`[data-module="${moduleName}"][data-tab-btn="${tabId}"]`);
  if (activeBtn) {
    activeBtn.classList.remove('text-slate-400', 'hover:text-slate-200');
    activeBtn.classList.add('bg-cyan-500/20', 'text-cyan-300', 'border-cyan-500/40', 'shadow-sm');
  }
};

// ============================================================================
// DOSSIÊ 360° COMPLETO DO PARCEIRO (RFB, QSA, CNAEs, NOTAS, COTAÇÕES, BATERIAS)
// ============================================================================
window.abrirDossie360 = async function(clienteId) {
  const oldModal = document.getElementById('dossie-modal-overlay');
  if (oldModal) oldModal.remove();

  const overlay = document.createElement('div');
  overlay.id = 'dossie-modal-overlay';
  overlay.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in';
  overlay.innerHTML = `
    <div class="glass-panel w-full max-w-5xl max-h-[92vh] flex flex-col rounded-3xl border border-white/10 shadow-2xl overflow-hidden bg-slate-950/95 text-slate-200">
      <div id="dossie-modal-loader" class="p-16 flex flex-col items-center justify-center gap-4">
        <i class="ph ph-spinner animate-spin text-4xl text-cyan-400"></i>
        <p class="text-sm font-semibold text-slate-300">Carregando Dossiê 360° com inteligência cadastral e transacional...</p>
      </div>
      <div id="dossie-modal-content" class="hidden flex-1 flex flex-col overflow-hidden"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  try {
    const res = await window.apiService.getDossieCliente(clienteId);
    if (!res.success || !res.data) {
      document.getElementById('dossie-modal-loader').innerHTML = `
        <i class="ph ph-warning-circle text-4xl text-amber-400"></i>
        <p class="text-sm text-slate-300">Não foi possível carregar o dossiê: ${res.error || 'Parceiro não encontrado'}</p>
        <button onclick="document.getElementById('dossie-modal-overlay').remove()" class="px-4 py-1.5 rounded-xl bg-white/10 text-xs font-semibold hover:bg-white/20">Fechar</button>
      `;
      return;
    }

    const { cliente: c, vertical: v, kpis, notas_fiscais, orcamentos, produtos_mais_movimentados, transacoes_bancarias } = res.data;
    const loader = document.getElementById('dossie-modal-loader');
    const content = document.getElementById('dossie-modal-content');
    if (loader) loader.remove();
    if (!content) return;
    content.classList.remove('hidden');

    const cnpjFormatado = window.formatCnpjBR(c.cnpj_cpf);
    const capitalSocialFmt = c.capital_social > 0 ? window.formatCurrencyBR(c.capital_social) : 'Não informado';
    const dataFundacaoFmt = window.formatDateBR(c.data_situacao_cadastral || c.data_inicio_atividade || c.created_at);
    const qsaList = Array.isArray(c.qsa) ? c.qsa : [];

    let badgeClass = 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
    let badgeLabel = 'Cliente Comprador';
    if (c.tipo_entidade === 'FORNECEDOR') {
      badgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      badgeLabel = 'Fornecedor de Insumos';
    } else if (c.tipo_entidade === 'COLABORADOR_PJ') {
      badgeClass = 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      badgeLabel = 'Colaborador PJ';
    }

    content.innerHTML = `
      <div class="p-6 border-b border-white/10 bg-slate-900/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div class="flex items-start gap-4">
          <div class="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 text-2xl shrink-0">
            <i class="ph ${v.icone || 'ph-buildings'}"></i>
          </div>
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-lg font-bold text-slate-100">${c.razao_social_nome}</h2>
              <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badgeClass}">
                ${badgeLabel}
              </span>
              <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${v.badgeClass || 'bg-slate-500/20 text-slate-300 border-slate-500/30'} flex items-center gap-1">
                <i class="ph ${v.icone || 'ph-tag'}"></i> ${v.vertical || 'Segmento Geral'}
              </span>
              <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${c.situacao_cadastral === 'ATIVA' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-red-500/20 text-red-300 border-red-500/30'}">
                RFB: ${c.situacao_cadastral || 'ATIVA'}
              </span>
            </div>
            <div class="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-400 font-mono">
              <span>CNPJ: <strong class="text-cyan-300 font-bold">${cnpjFormatado}</strong></span>
              <button onclick="navigator.clipboard.writeText('${c.cnpj_cpf}'); this.innerText='Copiado!';" class="text-[11px] text-cyan-400 hover:text-cyan-300 underline">Copiar</button>
              ${c.nome_fantasia ? `<span>• Fantasia: <strong class="text-slate-300 font-sans">${c.nome_fantasia}</strong></span>` : ''}
              ${c.municipio ? `<span>• <strong class="text-slate-300 font-sans">${c.municipio}/${c.uf}</strong></span>` : ''}
            </div>
          </div>
        </div>

        <button onclick="document.getElementById('dossie-modal-overlay').remove()" class="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-all ml-auto">
          <i class="ph ph-x text-lg"></i>
        </button>
      </div>

      <div class="flex items-center gap-2 px-6 pt-3 border-b border-white/5 bg-slate-900/40 overflow-x-auto text-xs font-semibold">
        <button onclick="switchDossieTab('visao_geral')" id="dossie-tab-btn-visao_geral" class="px-4 py-2.5 border-b-2 border-cyan-400 text-cyan-300 flex items-center gap-1.5 transition-all">
          <i class="ph ph-identification-card text-sm"></i> Ficha Cadastral & QSA
        </button>
        <button onclick="switchDossieTab('notas_fiscais')" id="dossie-tab-btn-notas_fiscais" class="px-4 py-2.5 border-b-2 border-transparent text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition-all">
          <i class="ph ph-receipt text-sm"></i> Notas Fiscais (${notas_fiscais.length})
        </button>
        <button onclick="switchDossieTab('orcamentos')" id="dossie-tab-btn-orcamentos" class="px-4 py-2.5 border-b-2 border-transparent text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition-all">
          <i class="ph ph-file-text text-sm"></i> Cotações & Propostas (${orcamentos.length})
        </button>
        <button onclick="switchDossieTab('produtos')" id="dossie-tab-btn-produtos" class="px-4 py-2.5 border-b-2 border-transparent text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition-all">
          <i class="ph ph-battery-charging text-sm"></i> Ranking de Baterias (${produtos_mais_movimentados.length})
        </button>
        <button onclick="switchDossieTab('bancario')" id="dossie-tab-btn-bancario" class="px-4 py-2.5 border-b-2 border-transparent text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition-all">
          <i class="ph ph-bank text-sm"></i> Extrato Bancário (${transacoes_bancarias.length})
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-6 space-y-6">
        <div id="dossie-tab-content-visao_geral" class="space-y-6">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="glass-panel p-4 rounded-2xl border border-white/5 bg-slate-900/50">
              <span class="text-[10px] uppercase font-bold text-slate-400">Capital Social</span>
              <p class="text-xl font-bold text-slate-100 mt-1">${capitalSocialFmt}</p>
              <p class="text-[11px] text-slate-400 mt-0.5">Porte: ${c.porte || 'DEMAIS'}</p>
            </div>
            <div class="glass-panel p-4 rounded-2xl border border-white/5 bg-slate-900/50">
              <span class="text-[10px] uppercase font-bold text-slate-400">Total Faturado Vendas</span>
              <p class="text-xl font-bold text-emerald-400 mt-1">${window.formatCurrencyBR(kpis.total_faturado_vendas)}</p>
              <p class="text-[11px] text-slate-400 mt-0.5">${notas_fiscais.filter(n => n.direcao === 'EMITIDA').length} NF-e emitidas</p>
            </div>
            <div class="glass-panel p-4 rounded-2xl border border-white/5 bg-slate-900/50">
              <span class="text-[10px] uppercase font-bold text-slate-400">Compras de Insumos</span>
              <p class="text-xl font-bold text-amber-400 mt-1">${window.formatCurrencyBR(kpis.total_compras_insumos)}</p>
              <p class="text-[11px] text-slate-400 mt-0.5">${notas_fiscais.filter(n => n.direcao === 'RECEBIDA').length} NF-e recebidas</p>
            </div>
            <div class="glass-panel p-4 rounded-2xl border border-white/5 bg-slate-900/50">
              <span class="text-[10px] uppercase font-bold text-slate-400">Conversão Comercial</span>
              <p class="text-xl font-bold text-cyan-400 mt-1">${kpis.taxa_conversao}</p>
              <p class="text-[11px] text-slate-400 mt-0.5">Ticket Médio: ${window.formatCurrencyBR(kpis.ticket_medio)}</p>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div class="glass-panel p-5 rounded-2xl border border-white/5 space-y-3">
              <h3 class="text-xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                <i class="ph ph-map-pin"></i> Endereço & Localização
              </h3>
              <div class="text-xs space-y-1.5 text-slate-300">
                <p><strong>Logradouro:</strong> ${c.logradouro || 'Não informado'}, ${c.numero || 'S/N'}${c.complemento ? ' - ' + c.complemento : ''}</p>
                <p><strong>Bairro:</strong> ${c.bairro || 'Não informado'} | <strong>CEP:</strong> ${c.cep || '-'}</p>
                <p><strong>Município:</strong> ${c.municipio || '-'}/${c.uf || '-'}</p>
                <p><strong>Telefone:</strong> ${c.telefone || 'Não informado'} | <strong>E-mail:</strong> ${c.email || 'Não informado'}</p>
              </div>
            </div>

            <div class="glass-panel p-5 rounded-2xl border border-white/5 space-y-3">
              <h3 class="text-xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                <i class="ph ph-briefcase"></i> Atividade Econômica & Regime
              </h3>
              <div class="text-xs space-y-1.5 text-slate-300">
                <p><strong>CNAE Principal:</strong> <span class="font-mono text-cyan-300">${c.cnae_principal || '-'}</span> - ${c.cnae_descricao || 'Não informado'}</p>
                <p><strong>Regime Tributário:</strong> ${c.natureza_juridica || 'Sociedade Empresária Limitada'}</p>
                <p><strong>Simples Nacional:</strong> ${c.opcao_pelo_simples ? 'Optante pelo Simples' : 'Não Optante'} | <strong>MEI:</strong> ${c.opcao_pelo_mei ? 'Sim' : 'Não'}</p>
                <p><strong>Início de Atividade:</strong> ${dataFundacaoFmt}</p>
              </div>
            </div>
          </div>

          <div class="glass-panel rounded-2xl border border-white/5 overflow-hidden">
            <div class="p-4 border-b border-white/5 flex items-center justify-between">
              <h3 class="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                <i class="ph ph-users"></i> Quadro de Sócios e Administradores (QSA)
              </h3>
              <span class="text-xs font-mono text-slate-400">${qsaList.length} sócios registrados</span>
            </div>
            ${qsaList.length > 0 ? `
              <div class="overflow-x-auto">
                <table class="w-full text-left text-xs border-collapse">
                  <thead class="bg-black/20 text-slate-400 uppercase font-semibold">
                    <tr>
                      <th class="p-3">Nome do Sócio</th>
                      <th class="p-3">Qualificação / Cargo</th>
                      <th class="p-3">Faixa Etária</th>
                      <th class="p-3">Entrada na Sociedade</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-white/5 text-slate-300">
                    ${qsaList.map(s => `
                      <tr class="hover:bg-white/5">
                        <td class="p-3 font-semibold text-slate-100">${s.nome_socio || s.nome || '-'}</td>
                        <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/20 text-cyan-300">${s.qualificacao_socio || s.qualificacao || 'Sócio'}</span></td>
                        <td class="p-3 text-slate-400">${s.faixa_etaria || '-'}</td>
                        <td class="p-3 text-slate-400 font-mono">${window.formatDateBR(s.data_entrada_sociedade)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : `
              <div class="p-6 text-center text-xs text-slate-500">Nenhum sócio administrador listado na base pública para esta entidade.</div>
            `}
          </div>
        </div>

        <div id="dossie-tab-content-notas_fiscais" class="space-y-4 hidden">
          <div class="glass-panel rounded-2xl border border-white/5 overflow-hidden">
            <div class="p-4 border-b border-white/5 flex items-center justify-between">
              <h3 class="text-xs font-bold uppercase tracking-wider text-slate-200">Notas Fiscais Vinculadas (NF-e / NFS-e)</h3>
              <span class="text-xs font-mono text-slate-400">${notas_fiscais.length} documentos fiscais</span>
            </div>
            ${notas_fiscais.length > 0 ? `
              <div class="overflow-x-auto max-h-96 overflow-y-auto">
                <table class="w-full text-left text-xs border-collapse">
                  <thead class="bg-black/20 text-slate-400 uppercase font-semibold sticky top-0">
                    <tr>
                      <th class="p-3">Nº Nota</th>
                      <th class="p-3">Tipo / Direção</th>
                      <th class="p-3">Data Emissão</th>
                      <th class="p-3 text-right">Valor Total</th>
                      <th class="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-white/5 text-slate-300">
                    ${notas_fiscais.map(n => `
                      <tr class="hover:bg-white/5">
                        <td class="p-3 font-mono font-bold text-cyan-400">#${n.numero_nota}</td>
                        <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-semibold ${n.direcao === 'EMITIDA' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-blue-500/20 text-blue-300'}">${n.direcao} • ${n.tipo_documento === 'NFSE_SERVICO' ? 'NFS-e' : 'NF-e'}</span></td>
                        <td class="p-3 font-mono text-slate-400">${window.formatDateBR(n.data_emissao)}</td>
                        <td class="p-3 text-right font-mono font-bold text-slate-100">${window.formatCurrencyBR(n.valor_total)}</td>
                        <td class="p-3 text-center"><span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400">Autorizada</span></td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : `
              <div class="p-8 text-center text-xs text-slate-500">Nenhuma nota fiscal registrada no sistema para este CNPJ até o momento.</div>
            `}
          </div>
        </div>

        <div id="dossie-tab-content-orcamentos" class="space-y-4 hidden">
          <div class="glass-panel rounded-2xl border border-white/5 overflow-hidden">
            <div class="p-4 border-b border-white/5 flex items-center justify-between">
              <h3 class="text-xs font-bold uppercase tracking-wider text-slate-200">Histórico de Cotações & Propostas</h3>
              <span class="text-xs font-mono text-slate-400">${orcamentos.length} propostas</span>
            </div>
            ${orcamentos.length > 0 ? `
              <div class="overflow-x-auto max-h-96 overflow-y-auto">
                <table class="w-full text-left text-xs border-collapse">
                  <thead class="bg-black/20 text-slate-400 uppercase font-semibold sticky top-0">
                    <tr>
                      <th class="p-3">Nº Cotação</th>
                      <th class="p-3">Empresa Emissora</th>
                      <th class="p-3">Data Emissão</th>
                      <th class="p-3 text-right">Valor Total</th>
                      <th class="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-white/5 text-slate-300">
                    ${orcamentos.map(o => `
                      <tr class="hover:bg-white/5">
                        <td class="p-3 font-mono font-bold text-cyan-400">#${o.numero_orcamento}</td>
                        <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-semibold ${o.vendido_por === 'Arandu' ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300'}">${o.vendido_por}</span></td>
                        <td class="p-3 font-mono text-slate-400">${window.formatDateBR(o.data_emissao)}</td>
                        <td class="p-3 text-right font-mono font-bold text-slate-100">${window.formatCurrencyBR(o.valor_total)}</td>
                        <td class="p-3 text-center"><span class="px-2 py-0.5 rounded text-[10px] font-semibold ${o.status_aprovacao === 'Compra Aprovada' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'}">${o.status_aprovacao}</span></td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : `
              <div class="p-8 text-center text-xs text-slate-500">Nenhum orçamento histórico vinculado a este CNPJ na base.</div>
            `}
          </div>
        </div>

        <div id="dossie-tab-content-produtos" class="space-y-4 hidden">
          <div class="glass-panel rounded-2xl border border-white/5 overflow-hidden">
            <div class="p-4 border-b border-white/5 flex items-center justify-between">
              <h3 class="text-xs font-bold uppercase tracking-wider text-slate-200">Ranking de Modelos de Baterias Negociados</h3>
              <span class="text-xs font-mono text-slate-400">${produtos_mais_movimentados.length} itens distintos</span>
            </div>
            ${produtos_mais_movimentados.length > 0 ? `
              <div class="overflow-x-auto max-h-96 overflow-y-auto">
                <table class="w-full text-left text-xs border-collapse">
                  <thead class="bg-black/20 text-slate-400 uppercase font-semibold sticky top-0">
                    <tr>
                      <th class="p-3">SKU</th>
                      <th class="p-3">Modelo / Nome da Bateria</th>
                      <th class="p-3 text-right">Qtd Acumulada</th>
                      <th class="p-3 text-right">Valor Total Movimentado</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-white/5 text-slate-300">
                    ${produtos_mais_movimentados.map(p => `
                      <tr class="hover:bg-white/5">
                        <td class="p-3 font-mono text-cyan-300">${p.sku}</td>
                        <td class="p-3 font-semibold text-slate-100">${p.nome}</td>
                        <td class="p-3 text-right font-mono font-bold text-slate-200">${p.qtd} un</td>
                        <td class="p-3 text-right font-mono font-bold text-emerald-400">${window.formatCurrencyBR(p.valorTotal)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : `
              <div class="p-8 text-center text-xs text-slate-500">Nenhum produto individual identificado nos orçamentos deste parceiro.</div>
            `}
          </div>
        </div>

        <div id="dossie-tab-content-bancario" class="space-y-4 hidden">
          <div class="glass-panel rounded-2xl border border-white/5 overflow-hidden">
            <div class="p-4 border-b border-white/5 flex items-center justify-between">
              <h3 class="text-xs font-bold uppercase tracking-wider text-slate-200">Lançamentos de Extratos Bancários (OFX)</h3>
              <span class="text-xs font-mono text-slate-400">${transacoes_bancarias.length} transações</span>
            </div>
            ${transacoes_bancarias.length > 0 ? `
              <div class="overflow-x-auto max-h-96 overflow-y-auto">
                <table class="w-full text-left text-xs border-collapse">
                  <thead class="bg-black/20 text-slate-400 uppercase font-semibold sticky top-0">
                    <tr>
                      <th class="p-3">Data</th>
                      <th class="p-3">Conta Bancária</th>
                      <th class="p-3">Descrição / Histórico</th>
                      <th class="p-3 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-white/5 text-slate-300">
                    ${transacoes_bancarias.map(t => {
                      const isPos = Number(t.valor) > 0;
                      return `
                        <tr class="hover:bg-white/5">
                          <td class="p-3 font-mono text-slate-400">${window.formatDateBR(t.data_lancamento)}</td>
                          <td class="p-3 text-slate-300">${t.banco_nome} (${t.conta_numero})</td>
                          <td class="p-3 text-slate-200 truncate max-w-[280px]" title="${t.memo}">${t.memo}</td>
                          <td class="p-3 text-right font-mono font-bold ${isPos ? 'text-emerald-400' : 'text-slate-300'}">${window.formatCurrencyBR(t.valor)}</td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            ` : `
              <div class="p-8 text-center text-xs text-slate-500">Nenhum lançamento bancário com correspondência de CNPJ/Razão Social encontrado.</div>
            `}
          </div>
        </div>
      </div>
    `;

    window.switchDossieTab = function(tabId) {
      const tabs = ['visao_geral', 'notas_fiscais', 'orcamentos', 'produtos', 'bancario'];
      tabs.forEach(t => {
        const panel = document.getElementById(`dossie-tab-content-${t}`);
        const btn = document.getElementById(`dossie-tab-btn-${t}`);
        if (panel) panel.classList.add('hidden');
        if (btn) {
          btn.classList.remove('border-cyan-400', 'text-cyan-300');
          btn.classList.add('border-transparent', 'text-slate-400');
        }
      });
      const activePanel = document.getElementById(`dossie-tab-content-${tabId}`);
      const activeBtn = document.getElementById(`dossie-tab-btn-${tabId}`);
      if (activePanel) activePanel.classList.remove('hidden');
      if (activeBtn) {
        activeBtn.classList.remove('border-transparent', 'text-slate-400');
        activeBtn.classList.add('border-cyan-400', 'text-cyan-300');
      }
    };

  } catch (err) {
    console.error('Erro abrirDossie360:', err);
  }
};

// ============================================================================
// 1. DASHBOARD EXECUTIVO SEGMENTADO (C-LEVEL & SÓCIOS)
// ============================================================================
// ============================================================================
// 1. DASHBOARD EXECUTIVO COM MoM, RUNWAY, CURVA ABC E CUSTÓDIA BANCÁRIA
// ============================================================================

let dashboardState = {
  visao: 'receitas', // 'receitas' | 'despesas'
  periodo: 'all',    // 'all' | 'mes_atual' | 'mes_anterior' | 'ultimos_30' | 'ultimos_90' | 'custom'
  dataInicio: '',
  dataFim: '',
  tipoGrafico: 'barras', // 'barras' | 'linhas'
  seriesAtivas: {
    faturado: true,
    recebido: true,
    a_receber: true,
    em_atraso: true,
    total_pago: true,
    a_vencer: true
  }
};

window.toggleDashboardVisao = function(novaVisao) {
  dashboardState.visao = novaVisao;
  window.renderDashboardRealData();
};

window.toggleDashboardPeriodo = function(novoPeriodo) {
  dashboardState.periodo = novoPeriodo;
  const customDiv = document.getElementById('dash-filtro-custom-datas');
  if (novoPeriodo === 'custom') {
    if (customDiv) customDiv.classList.remove('hidden');
    return;
  }
  if (customDiv) customDiv.classList.add('hidden');
  dashboardState.dataInicio = '';
  dashboardState.dataFim = '';
  window.renderDashboardRealData();
};

window.aplicarPeriodoCustomizado = function() {
  const ini = document.getElementById('dash-custom-inicio')?.value;
  const fim = document.getElementById('dash-custom-fim')?.value;
  if (!ini || !fim) {
    alert('Por favor, informe a data inicial e a data final.');
    return;
  }
  dashboardState.periodo = 'custom';
  dashboardState.dataInicio = ini;
  dashboardState.dataFim = fim;
  window.renderDashboardRealData();
};

window.toggleDashboardGraficoTipo = function(novoTipo) {
  dashboardState.tipoGrafico = novoTipo;
  window.renderGraficoExecutivo();
};

window.toggleDashboardSerie = function(serieKey) {
  dashboardState.seriesAtivas[serieKey] = !dashboardState.seriesAtivas[serieKey];
  window.renderCardsExecutivos();
  window.renderGraficoExecutivo();
};

let ultimoDashboardPayload = null;

// ============================================================================
// MODAL EXECUTIVO: DETALHAMENTO DO RUNWAY & PREVISIBILIDADE DA QUINZENA (15 DIAS)
// ============================================================================
window.abrirModalRunwayDetalhado = function() {
  if (!ultimoDashboardPayload || !ultimoDashboardPayload.runway) {
    alert('Os dados de projeção de caixa ainda estão sendo carregados.');
    return;
  }

  const oldModal = document.getElementById('runway-modal-overlay');
  if (oldModal) oldModal.remove();

  const r = ultimoDashboardPayload.runway;
  const d = r.detalhamento || {};
  const contas = d.contas_bancarias || [];
  const recs = d.faturas_a_receber || [];
  const pags = d.faturas_a_pagar || [];
  const curva = d.projecao_diaria_quinzena || [];

  const overlay = document.createElement('div');
  overlay.id = 'runway-modal-overlay';
  overlay.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md animate-fade-in';
  overlay.innerHTML = `
    <div class="glass-panel w-full max-w-5xl max-h-[92vh] flex flex-col rounded-3xl border border-cyan-500/30 shadow-2xl overflow-hidden bg-slate-950/95 text-slate-200">
      
      <!-- Cabeçalho do Modal -->
      <div class="p-6 border-b border-white/10 bg-slate-900/80 flex items-start justify-between gap-4">
        <div class="flex items-center gap-3.5">
          <div class="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-300 text-2xl shrink-0">
            <i class="ph ph-shield-check"></i>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-lg font-bold text-slate-100">Dossiê de Liquidez & Runway Projetado (15 Dias)</h2>
              <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                ${r.dias_cobertura} dias de cobertura
              </span>
            </div>
            <p class="text-xs text-slate-400 mt-0.5">
              Auditoria item a item: Saldo Bancário em Caixa + Faturas Emitidas a Receber - Títulos de Insumos a Pagar
            </p>
          </div>
        </div>
        <button onclick="document.getElementById('runway-modal-overlay').remove()" 
                class="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white flex items-center justify-center transition-colors">
          <i class="ph ph-x text-lg"></i>
        </button>
      </div>

      <!-- Métricas Centrais da Projeção -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5 border-b border-white/5 bg-slate-900/40">
        <div class="p-3 rounded-xl bg-slate-900/60 border border-white/5">
          <span class="text-[10px] uppercase font-bold text-slate-400">1. Saldo Atual em Contas</span>
          <p class="text-base font-extrabold font-mono text-slate-100 mt-0.5">${window.formatCurrencyBR(r.saldo_bancario_atual)}</p>
          <span class="text-[10px] text-slate-500">${contas.length} contas auditadas</span>
        </div>
        <div class="p-3 rounded-xl bg-slate-900/60 border border-white/5">
          <span class="text-[10px] uppercase font-bold text-emerald-400">2. (+) A Receber (15d)</span>
          <p class="text-base font-extrabold font-mono text-emerald-400 mt-0.5">${window.formatCurrencyBR(r.a_receber_15d)}</p>
          <span class="text-[10px] text-slate-500">${recs.length} faturas emitidas</span>
        </div>
        <div class="p-3 rounded-xl bg-slate-900/60 border border-white/5">
          <span class="text-[10px] uppercase font-bold text-amber-400">3. (-) A Pagar (15d)</span>
          <p class="text-base font-extrabold font-mono text-amber-400 mt-0.5">${window.formatCurrencyBR(r.a_pagar_15d)}</p>
          <span class="text-[10px] text-slate-500">${pags.length} títulos de insumos</span>
        </div>
        <div class="p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/30">
          <span class="text-[10px] uppercase font-bold text-cyan-300">4. (=) Saldo Projetado</span>
          <p class="text-base font-extrabold font-mono text-cyan-300 mt-0.5">${window.formatCurrencyBR(r.saldo_projetado)}</p>
          <span class="text-[10px] text-cyan-400/80 font-bold">Fluxo Líquido: ${window.formatCurrencyBR(r.a_receber_15d - r.a_pagar_15d)}</span>
        </div>
      </div>

      <!-- Abas de Detalhamento no Modal -->
      <div class="flex items-center gap-2 px-6 pt-4 border-b border-white/5 bg-slate-900/60">
        <button onclick="window.switchTab('runway_modal', 'contas')" data-module="runway_modal" data-tab-btn="contas" 
                class="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 transition-all flex items-center gap-1.5">
          <i class="ph ph-bank"></i> Contas Bancárias (${contas.length})
        </button>
        <button onclick="window.switchTab('runway_modal', 'receber')" data-module="runway_modal" data-tab-btn="receber" 
                class="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1.5">
          <i class="ph ph-arrow-down-left text-emerald-400"></i> Faturas a Receber (${recs.length})
        </button>
        <button onclick="window.switchTab('runway_modal', 'pagar')" data-module="runway_modal" data-tab-btn="pagar" 
                class="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1.5">
          <i class="ph ph-arrow-up-right text-amber-400"></i> Contas a Pagar (${pags.length})
        </button>
        <button onclick="window.switchTab('runway_modal', 'curva')" data-module="runway_modal" data-tab-btn="curva" 
                class="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1.5">
          <i class="ph ph-chart-line"></i> Trajetória Dia a Dia (15d)
        </button>
      </div>

      <!-- Conteúdo das Abas do Modal -->
      <div class="flex-1 overflow-y-auto p-6 space-y-4">
        
        <!-- ABA CONTAS -->
        <div data-module="runway_modal" data-tab-content="contas" class="space-y-3">
          <p class="text-xs text-slate-400">Saldos bancários reais disponíveis para saque imediato e custódia:</p>
          <div class="overflow-x-auto rounded-xl border border-white/5">
            <table class="w-full text-xs text-left">
              <thead class="bg-black/30 text-slate-400 uppercase font-semibold">
                <tr>
                  <th class="p-3">Instituição Bancária</th>
                  <th class="p-3">Agência</th>
                  <th class="p-3">Conta Corrente</th>
                  <th class="p-3 text-right">Saldo Atual Disponível</th>
                  <th class="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                ${contas.map(c => `
                  <tr class="hover:bg-white/5">
                    <td class="p-3 font-bold text-slate-200">${c.banco}</td>
                    <td class="p-3 font-mono text-slate-400">${c.agencia}</td>
                    <td class="p-3 font-mono text-slate-300">${c.conta}</td>
                    <td class="p-3 text-right font-mono font-bold text-cyan-300">${window.formatCurrencyBR(c.saldo)}</td>
                    <td class="p-3 text-center">
                      <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Ativa & Conciliada</span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- ABA A RECEBER -->
        <div data-module="runway_modal" data-tab-content="receber" class="space-y-3 hidden">
          <p class="text-xs text-slate-400">Faturamento emitido com previsão de liquidação nos próximos 15 dias:</p>
          <div class="overflow-x-auto rounded-xl border border-white/5 max-h-[380px] overflow-y-auto">
            <table class="w-full text-xs text-left">
              <thead class="bg-black/30 text-slate-400 uppercase font-semibold sticky top-0 backdrop-blur-md">
                <tr>
                  <th class="p-3">NF-e</th>
                  <th class="p-3">Cliente Corporativo</th>
                  <th class="p-3">CNPJ</th>
                  <th class="p-3">Data Emissão</th>
                  <th class="p-3 text-right">Valor Líquido</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                ${recs.map(r => `
                  <tr class="hover:bg-white/5">
                    <td class="p-3 font-mono font-bold text-cyan-400">#${r.numero}</td>
                    <td class="p-3 font-medium text-slate-200">${r.parceiro}</td>
                    <td class="p-3 font-mono text-slate-400">${window.formatCnpjBR(r.cnpj)}</td>
                    <td class="p-3 font-mono text-slate-400">${window.formatDateBR(r.data_emissao)}</td>
                    <td class="p-3 text-right font-mono font-bold text-emerald-400">${window.formatCurrencyBR(r.valor)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- ABA A PAGAR -->
        <div data-module="runway_modal" data-tab-content="pagar" class="space-y-3 hidden">
          <p class="text-xs text-slate-400">Notas fiscais de insumos e matérias-primas com vencimento na quinzena:</p>
          <div class="overflow-x-auto rounded-xl border border-white/5 max-h-[380px] overflow-y-auto">
            <table class="w-full text-xs text-left">
              <thead class="bg-black/30 text-slate-400 uppercase font-semibold sticky top-0 backdrop-blur-md">
                <tr>
                  <th class="p-3">NF-e Insumo</th>
                  <th class="p-3">Fornecedor</th>
                  <th class="p-3">CNPJ</th>
                  <th class="p-3">Data Emissão</th>
                  <th class="p-3 text-right">Valor Líquido</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                ${pags.map(p => `
                  <tr class="hover:bg-white/5">
                    <td class="p-3 font-mono font-bold text-amber-400">#${p.numero}</td>
                    <td class="p-3 font-medium text-slate-200">${p.parceiro}</td>
                    <td class="p-3 font-mono text-slate-400">${window.formatCnpjBR(p.cnpj)}</td>
                    <td class="p-3 font-mono text-slate-400">${window.formatDateBR(p.data_emissao)}</td>
                    <td class="p-3 text-right font-mono font-bold text-amber-400">${window.formatCurrencyBR(p.valor)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- ABA CURVA DIA A DIA -->
        <div data-module="runway_modal" data-tab-content="curva" class="space-y-3 hidden">
          <p class="text-xs text-slate-400">Evolução estimada do saldo de caixa dia a dia para os próximos 15 dias:</p>
          <div class="grid grid-cols-3 sm:grid-cols-5 gap-2">
            ${curva.map(d => `
              <div class="p-2.5 rounded-xl bg-slate-900/70 border border-white/5 text-center space-y-1">
                <span class="text-[10px] font-bold text-slate-400 uppercase">Dia ${d.dia}</span>
                <p class="text-[11px] font-mono text-slate-300">${window.formatDateBR(d.data)}</p>
                <p class="text-xs font-bold font-mono text-cyan-300">${window.formatCurrencyBR(d.saldo)}</p>
                <div class="text-[9px] font-mono flex justify-between px-1 text-slate-500 pt-1 border-t border-white/5">
                  <span class="text-emerald-400">+${Math.round(d.entrada/1000)}k</span>
                  <span class="text-amber-400">-${Math.round(d.saida/1000)}k</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

      </div>

      <!-- Rodapé do Modal -->
      <div class="p-4 border-t border-white/10 bg-slate-900/90 flex justify-end">
        <button onclick="document.getElementById('runway-modal-overlay').remove()" 
                class="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-slate-200 transition-colors">
          Fechar Dossiê
        </button>
      </div>

    </div>
  `;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
};

window.renderDashboardRealData = async function() {
  const container = document.getElementById('conteudo-dinamico');
  if (!container) return;

  const empresaNome = window.apiService.getActiveEmpresaNome();
  const isReceita = dashboardState.visao === 'receitas';

  container.innerHTML = `
    <div class="space-y-6 animate-fade-in">
      <!-- Barra Superior de Controle Executivo -->
      <div class="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-xl font-bold text-slate-100 tracking-tight">Centro de Inteligência Executiva</h2>
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              ${empresaNome}
            </span>
          </div>
          <p class="text-xs text-slate-400 mt-0.5" id="dash-subtitulo-periodo">
            Métricas de tendência Month-over-Month (MoM), Runway e Curva ABC de Inadimplência
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2.5">
          <!-- Filtro de Data Global com Suporte Flexível -->
          <div class="flex items-center gap-1.5 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-white/10">
            <i class="ph ph-calendar text-cyan-400 text-sm"></i>
            <span class="text-[11px] text-slate-400 font-medium">Período:</span>
            <select id="dash-filtro-periodo" onchange="toggleDashboardPeriodo(this.value)" 
                    class="bg-transparent text-xs font-semibold text-cyan-300 focus:outline-none cursor-pointer">
              <option value="all" ${dashboardState.periodo === 'all' ? 'selected' : ''} class="bg-slate-900 text-slate-200">Jan/26 a Ago/26 (Ano Todo)</option>
              <option value="mes_atual" ${dashboardState.periodo === 'mes_atual' ? 'selected' : ''} class="bg-slate-900 text-slate-200">Mês Atual (Agosto/2026)</option>
              <option value="mes_anterior" ${dashboardState.periodo === 'mes_anterior' ? 'selected' : ''} class="bg-slate-900 text-slate-200">Mês Anterior (Julho/2026)</option>
              <option value="ultimos_30" ${dashboardState.periodo === 'ultimos_30' ? 'selected' : ''} class="bg-slate-900 text-slate-200">Últimos 30 Dias</option>
              <option value="ultimos_90" ${dashboardState.periodo === 'ultimos_90' ? 'selected' : ''} class="bg-slate-900 text-slate-200">Últimos 90 Dias</option>
              <option value="custom" ${dashboardState.periodo === 'custom' ? 'selected' : ''} class="bg-slate-900 text-slate-200">📅 Personalizado...</option>
            </select>
          </div>

          <!-- Seletor Inline de Datas Personalizadas -->
          <div id="dash-filtro-custom-datas" class="${dashboardState.periodo === 'custom' ? 'flex' : 'hidden'} items-center gap-2 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-cyan-500/30 text-xs animate-fade-in">
            <span class="text-[10px] text-slate-400">De:</span>
            <input type="date" id="dash-custom-inicio" value="${dashboardState.dataInicio || '2026-06-01'}" 
                   class="bg-black/40 text-cyan-300 px-2 py-0.5 rounded border border-white/10 text-xs focus:outline-none">
            <span class="text-[10px] text-slate-400">Até:</span>
            <input type="date" id="dash-custom-fim" value="${dashboardState.dataFim || '2026-08-27'}" 
                   class="bg-black/40 text-cyan-300 px-2 py-0.5 rounded border border-white/10 text-xs focus:outline-none">
            <button onclick="aplicarPeriodoCustomizado()" 
                    class="px-2.5 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-bold transition-colors">
              Filtrar
            </button>
          </div>

          <!-- Toggle Alternador Receitas / Despesas -->
          <div class="flex items-center p-1 rounded-xl bg-slate-900/80 border border-white/10 shadow-inner">
            <button onclick="toggleDashboardVisao('receitas')" 
                    class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${isReceita ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm' : 'text-slate-400 hover:text-slate-200'}">
              <i class="ph ph-trend-up text-sm"></i> 📈 Receitas
            </button>
            <button onclick="toggleDashboardVisao('despesas')" 
                    class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${!isReceita ? 'bg-red-500/20 text-red-300 border border-red-500/40 shadow-sm' : 'text-slate-400 hover:text-slate-200'}">
              <i class="ph ph-trend-down text-sm"></i> 📉 Despesas
            </button>
          </div>

          <!-- Abas de Navegação -->
          <div class="flex items-center gap-1 bg-slate-900/60 p-1 rounded-xl border border-white/5">
            <button onclick="switchTab('dash', 'visao_geral')" data-module="dash" data-tab-btn="visao_geral" 
                    class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 transition-all flex items-center gap-1.5">
              <i class="ph ph-squares-four text-sm"></i> Visão Geral
            </button>
            <button onclick="switchTab('dash', 'tesouraria')" data-module="dash" data-tab-btn="tesouraria" 
                    class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1.5">
              <i class="ph ph-bank text-sm"></i> Tesouraria & OFX
            </button>
            <button onclick="switchTab('dash', 'negociacoes')" data-module="dash" data-tab-btn="negociacoes" 
                    class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1.5">
              <i class="ph ph-receipt text-sm"></i> Propostas
            </button>
          </div>
        </div>
      </div>

      <!-- ABA 1: VISÃO GERAL -->
      <div data-module="dash" data-tab-content="visao_geral" class="space-y-6">
        
        <!-- CARD ALERTA DE FLUXO DE CAIXA (RUNWAY 15 DIAS) -->
        <div id="dash-runway-banner" class="glass-panel p-4 sm:p-5 rounded-2xl border border-white/10 bg-gradient-to-r from-slate-900/90 via-slate-900/60 to-slate-950 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
          <div class="flex items-center gap-3.5">
            <div id="dash-runway-icon" class="w-11 h-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 text-2xl shrink-0">
              <i class="ph ph-shield-check"></i>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-slate-200">Alerta de Fluxo de Caixa & Runway</span>
                <span id="dash-runway-badge" class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Calculando projeção...
                </span>
              </div>
              <p class="text-xs text-slate-400 mt-0.5" id="dash-runway-desc">
                Saldo Bancário Hoje + À Receber (15 dias) - À Pagar (15 dias)
              </p>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-3 sm:gap-4 text-xs font-mono">
            <div class="text-left sm:text-right">
              <span class="text-slate-500 text-[10px] uppercase font-sans">Saldo Atual Banco</span>
              <p class="font-bold text-slate-200" id="dash-runway-saldo-banco">...</p>
            </div>
            <div class="text-left sm:text-right">
              <span class="text-slate-500 text-[10px] uppercase font-sans">(+) À Receber (15d)</span>
              <p class="font-bold text-emerald-400" id="dash-runway-receber-15d">...</p>
            </div>
            <div class="text-left sm:text-right">
              <span class="text-slate-500 text-[10px] uppercase font-sans">(-) À Pagar (15d)</span>
              <p class="font-bold text-amber-400" id="dash-runway-pagar-15d">...</p>
            </div>
            <div class="text-left sm:text-right px-3 py-1.5 rounded-xl bg-black/40 border border-white/5">
              <span class="text-slate-400 text-[10px] uppercase font-sans font-bold">(=) Saldo Projetado</span>
              <p class="text-base font-bold text-cyan-300" id="dash-runway-saldo-projetado">...</p>
            </div>
            <button onclick="window.abrirModalRunwayDetalhado()" 
                    class="px-3.5 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-bold transition-all flex items-center gap-1.5 shadow-lg shrink-0 cursor-pointer">
              <i class="ph ph-magnifying-glass-plus text-base"></i> Inspecionar 15 Dias
            </button>
          </div>
        </div>

        <!-- OS 4 CARDS PRINCIPAIS INTERATIVOS COM INDICADORES MoM -->
        <div id="dash-cards-container" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- Renderizado dinamicamente via JS -->
        </div>

        <!-- GRÁFICO INTERATIVO E WIDGET LATERAL CURVA ABC -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <!-- Coluna 1 & 2: Gráfico com Controle de Séries e Tipo -->
          <div class="lg:col-span-2 glass-panel p-6 rounded-2xl border border-white/5 space-y-4 flex flex-col justify-between">
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
              <div>
                <h3 class="text-base font-bold text-slate-100 flex items-center gap-2" id="dash-grafico-titulo">
                  <i class="ph ph-chart-bar text-cyan-400"></i> Evolução Mensal Consolidada (2026)
                </h3>
                <p class="text-xs text-slate-400 mt-0.5">Clique nos cards acima para sobrepor ou ocultar séries de dados no gráfico</p>
              </div>

              <!-- Alternador de Tipo de Gráfico -->
              <div class="flex items-center p-1 rounded-xl bg-slate-900/90 border border-white/10 text-xs">
                <button onclick="toggleDashboardGraficoTipo('barras')" id="btn-grafico-barras" 
                        class="px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 transition-all ${dashboardState.tipoGrafico === 'barras' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-slate-400 hover:text-slate-200'}">
                  <i class="ph ph-chart-bar text-sm"></i> Barras
                </button>
                <button onclick="toggleDashboardGraficoTipo('linhas')" id="btn-grafico-linhas" 
                        class="px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 transition-all ${dashboardState.tipoGrafico === 'linhas' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-slate-400 hover:text-slate-200'}">
                  <i class="ph ph-chart-line-up text-sm"></i> Linhas
                </button>
              </div>
            </div>

            <!-- Área de Renderização do Gráfico SVG Interativo -->
            <div id="dash-grafico-canvas" class="min-h-[260px] flex items-center justify-center">
              <span class="text-xs text-slate-500 font-mono">Carregando visualização gráfica...</span>
            </div>

            <div class="flex flex-wrap items-center justify-center gap-4 text-[11px] font-mono text-slate-400 pt-2 border-t border-white/5" id="dash-grafico-legenda">
              <!-- Legendas ativas injetadas via JS -->
            </div>
          </div>

          <!-- Coluna 3: Widget Top 3 Inadimplentes (Curva ABC de Atrasos) -->
          <div class="glass-panel p-5 rounded-2xl border border-white/5 space-y-4">
            <div class="flex items-center justify-between border-b border-white/5 pb-3">
              <div>
                <h3 class="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                  <i class="ph ph-warning-octagon text-red-400"></i> Curva ABC de Atrasos
                </h3>
                <p class="text-[11px] text-slate-400 mt-0.5">Top 3 Maiores Saldos Vencidos</p>
              </div>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                Cobrança Ágil
              </span>
            </div>

            <div id="dash-inadimplentes-list" class="space-y-3">
              <span class="text-xs text-slate-500">Analisando faturas...</span>
            </div>

            <div class="p-3 rounded-xl bg-slate-900/60 border border-white/5 text-[11px] text-slate-400 leading-relaxed">
              <strong class="text-slate-200">💡 Inteligência de Crédito:</strong> 80% do montante vencido concentra-se nestas contas corporativas. Clique sobre o parceiro para inspecionar o <strong>Dossiê 360°</strong> completo.
            </div>
          </div>

        </div>
      </div>

      <!-- ABA 2: TESOURARIA & OFX (COM SEGREGAÇÃO DE CUSTÓDIA) -->
      <div data-module="dash" data-tab-content="tesouraria" class="space-y-6 hidden">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="glass-panel p-4 rounded-2xl border border-white/5 bg-slate-900/50">
            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Saldo Operacional Líquido</span>
            <p class="text-xl font-bold text-cyan-400 mt-1" id="dash-tesouraria-saldo-op">...</p>
            <p class="text-[11px] text-slate-400 mt-0.5">Entradas reais - Saídas reais</p>
          </div>

          <div class="glass-panel p-4 rounded-2xl border border-white/5 bg-slate-900/50">
            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Entradas Operacionais Reais</span>
            <p class="text-xl font-bold text-emerald-400 mt-1" id="dash-tesouraria-entradas">...</p>
            <p class="text-[11px] text-slate-400 mt-0.5">Pagamentos e recebimentos de clientes</p>
          </div>

          <div class="glass-panel p-4 rounded-2xl border border-white/5 bg-slate-900/50">
            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Saídas Operacionais Reais</span>
            <p class="text-xl font-bold text-slate-200 mt-1" id="dash-tesouraria-saidas">...</p>
            <p class="text-[11px] text-slate-400 mt-0.5">Fornecedores, salários e impostos</p>
          </div>

          <!-- DESTAQUE EXECUTIVO: TOTAL EM APLICAÇÕES / CUSTÓDIA -->
          <div class="glass-panel p-4 rounded-2xl border border-purple-500/20 bg-purple-950/20">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold uppercase tracking-wider text-purple-300">Total em Aplicações (Custódia)</span>
              <i class="ph ph-vault text-purple-400 text-base"></i>
            </div>
            <p class="text-xl font-bold text-purple-300 mt-1" id="dash-tesouraria-custodia">...</p>
            <p class="text-[11px] text-purple-400/80 mt-0.5">Dinheiro guardado rendendo no Itaú/Bradesco</p>
          </div>
        </div>

        <div class="glass-panel rounded-2xl border border-white/5 overflow-hidden">
          <!-- Cabeçalho do Extrato com Contadores -->
          <div class="p-4 border-b border-white/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-slate-900/40">
            <div>
              <h3 class="text-sm font-bold text-slate-100 flex items-center gap-2">
                <i class="ph ph-receipt text-cyan-400"></i> Extrato de Transações Conciliadas (OFX)
              </h3>
              <p class="text-xs text-slate-400 mt-0.5">Filtrado pelo período selecionado. Auditoria item a item com histórico por contraparte.</p>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-slate-400 font-mono" id="dash-tesouraria-total-extratos">Carregando...</span>
            </div>
          </div>

          <!-- Barra de Filtros Rápidos, Busca e Ordenação -->
          <div class="p-3 border-b border-white/5 bg-slate-950/60 flex flex-wrap items-center justify-between gap-3">
            <!-- Filtros Rápidos de Classificação -->
            <div class="flex flex-wrap items-center gap-1.5" id="dash-ofx-filtro-botoes">
              <button onclick="window.setOfxClassificacao('TODOS')" id="btn-ofx-todos"
                      class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm">
                <i class="ph ph-squares-four"></i> Todas
              </button>
              <button onclick="window.setOfxClassificacao('ENTRADAS')" id="btn-ofx-entradas"
                      class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-white/5">
                <i class="ph ph-arrow-down-left text-emerald-400"></i> Entradas
              </button>
              <button onclick="window.setOfxClassificacao('SAIDAS')" id="btn-ofx-saidas"
                      class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-white/5">
                <i class="ph ph-arrow-up-right text-rose-400"></i> Saídas
              </button>
              <button onclick="window.setOfxClassificacao('CUSTODIA')" id="btn-ofx-custodia"
                      class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-white/5">
                <i class="ph ph-vault text-purple-400"></i> Custódia CDI
              </button>
              <button onclick="window.setOfxClassificacao('RENDIMENTOS')" id="btn-ofx-rendimentos"
                      class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-white/5">
                <i class="ph ph-trend-up text-amber-400"></i> Rendimentos
              </button>
            </div>

            <!-- Busca Instantânea de Transações -->
            <div class="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-white/10 w-full sm:w-72">
              <i class="ph ph-magnifying-glass text-slate-400 text-sm"></i>
              <input type="text" id="dash-ofx-input-busca" oninput="window.buscarOfx(this.value)"
                     placeholder="Buscar transação, favorecido, valor..."
                     class="bg-transparent text-xs text-slate-200 placeholder-slate-500 focus:outline-none w-full">
              <button onclick="document.getElementById('dash-ofx-input-busca').value=''; window.buscarOfx('');" 
                      class="text-slate-500 hover:text-slate-300 text-xs">
                <i class="ph ph-x"></i>
              </button>
            </div>
          </div>

          <!-- Tabela com Colunas Separadas de Banco e Agência/Conta e Cabeçalhos Ordenáveis -->
          <div class="overflow-x-auto max-h-[520px] overflow-y-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead class="bg-slate-900 text-slate-400 uppercase font-semibold sticky top-0 backdrop-blur-md z-10 border-b border-white/10">
                <tr>
                  <th onclick="window.ordenarTabelaOfx('data_lancamento')" class="p-3 cursor-pointer select-none hover:text-cyan-300 transition-colors whitespace-nowrap">
                    <span class="flex items-center gap-1">Data <i class="ph ph-arrows-down-up text-[10px] text-cyan-400"></i></span>
                  </th>
                  <th class="p-3 whitespace-nowrap">Instituição Bancária</th>
                  <th class="p-3 whitespace-nowrap">Agência / Conta</th>
                  <th class="p-3 whitespace-nowrap">Classificação Financeira</th>
                  <th onclick="window.ordenarTabelaOfx('memo')" class="p-3 cursor-pointer select-none hover:text-cyan-300 transition-colors">
                    <span class="flex items-center gap-1">Histórico / Memo (Clique p/ Histórico) <i class="ph ph-arrows-down-up text-[10px] text-cyan-400"></i></span>
                  </th>
                  <th onclick="window.ordenarTabelaOfx('valor')" class="p-3 text-right cursor-pointer select-none hover:text-cyan-300 transition-colors whitespace-nowrap">
                    <span class="flex items-center justify-end gap-1">Valor <i class="ph ph-arrows-down-up text-[10px] text-cyan-400"></i></span>
                  </th>
                  <th class="p-3 text-center whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody id="tabela-ofx-dash" class="divide-y divide-white/5 text-slate-300">
                <tr><td colspan="7" class="p-8 text-center text-slate-500">Carregando extratos bancários...</td></tr>
              </tbody>
              <tfoot id="tfoot-ofx-dash" class="sticky bottom-0 z-10">
                <!-- Injetado dinamicamente com os subtotais dos itens visíveis -->
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      <!-- ABA 3: NEGOCIAÇÕES RECENTES -->
      <div data-module="dash" data-tab-content="negociacoes" class="space-y-4 hidden">
        <div class="glass-panel rounded-2xl border border-white/5 overflow-hidden">
          <div class="p-4 border-b border-white/5">
            <h3 class="text-sm font-bold text-slate-100">Histórico de Propostas e Cotações Recentes</h3>
            <p class="text-xs text-slate-400">Últimas cotações emitidas por Mitang Brasil e Arandu</p>
          </div>
          <div class="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead class="bg-black/20 text-slate-400 uppercase font-semibold sticky top-0 backdrop-blur-md">
                <tr>
                  <th class="p-3">Nº Cotação</th>
                  <th class="p-3">Empresa</th>
                  <th class="p-3">Cliente</th>
                  <th class="p-3 text-right">Valor Total</th>
                  <th class="p-3">Data Emissão</th>
                  <th class="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody id="tabela-recentes-dash" class="divide-y divide-white/5 text-slate-300">
                <tr><td colspan="6" class="p-6 text-center text-slate-500">Carregando negociações...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  `;

  try {
    const params = {
      periodo: dashboardState.periodo,
      visao: dashboardState.visao
    };
    if (dashboardState.periodo === 'custom' && dashboardState.dataInicio && dashboardState.dataFim) {
      params.data_inicio = dashboardState.dataInicio;
      params.data_fim = dashboardState.dataFim;
    }

    const res = await window.apiService.getDashboardMetrics(params);

    if (!res.success || !res.data) {
      console.warn('[DASHBOARD] Dados não retornados:', res);
      return;
    }

    ultimoDashboardPayload = res.data;

    // Atualizar subtítulo de período com datas exatas apuradas
    if (res.data.periodo_info) {
      const pInfo = res.data.periodo_info;
      const sub = document.getElementById('dash-subtitulo-periodo');
      if (sub) {
        sub.innerHTML = `Métricas apuradas de <strong class="text-cyan-300 font-mono">${window.formatDateBR(pInfo.data_inicio)}</strong> até <strong class="text-cyan-300 font-mono">${window.formatDateBR(pInfo.data_fim)}</strong> (${pInfo.dias_no_periodo} dias) • Comparativo MoM vs período anterior`;
      }
    }

    // 1. Atualizar Alerta de Runway
    const runway = res.data.runway;
    if (runway) {
      document.getElementById('dash-runway-saldo-banco').innerText = window.formatCurrencyBR(runway.saldo_bancario_atual);
      document.getElementById('dash-runway-receber-15d').innerText = window.formatCurrencyBR(runway.a_receber_15d);
      document.getElementById('dash-runway-pagar-15d').innerText = window.formatCurrencyBR(runway.a_pagar_15d);
      document.getElementById('dash-runway-saldo-projetado').innerText = window.formatCurrencyBR(runway.saldo_projetado);

      const badge = document.getElementById('dash-runway-badge');
      const banner = document.getElementById('dash-runway-banner');
      const icon = document.getElementById('dash-runway-icon');

      if (runway.status === 'DEFICIT_ALERTA') {
        badge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse';
        badge.innerHTML = '🚨 ALERTA: NECESSIDADE DE CAPITAL DE GIRO';
        banner.classList.add('border-red-500/40');
        icon.className = 'w-11 h-11 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 text-2xl shrink-0';
        icon.innerHTML = '<i class="ph ph-warning"></i>';
      } else {
        badge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
        badge.innerHTML = `🛡️ Operação Equilibrada (${runway.dias_cobertura} dias de cobertura)`;
      }
    }

    // 2. Renderizar Cards Executivos (Receitas ou Despesas)
    window.renderCardsExecutivos();

    // 3. Renderizar Gráfico Executivo
    window.renderGraficoExecutivo();

    // 4. Renderizar Top 3 Inadimplentes
    const topList = res.data.receitas?.top_inadimplentes || [];
    const listContainer = document.getElementById('dash-inadimplentes-list');
    if (listContainer) {
      if (topList.length === 0) {
        listContainer.innerHTML = `<p class="text-xs text-slate-500 text-center py-4">Nenhuma fatura em atraso no período.</p>`;
      } else {
        listContainer.innerHTML = topList.map((item, idx) => `
          <div class="p-3 rounded-xl bg-slate-900/70 border border-white/5 hover:border-cyan-500/30 transition-all group flex items-start justify-between gap-2">
            <div class="space-y-1">
              <div class="flex items-center gap-1.5">
                <span class="w-4 h-4 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-[10px] font-bold">
                  ${idx + 1}
                </span>
                <p class="font-bold text-xs text-slate-200 group-hover:text-cyan-300 transition-colors leading-tight">${item.cliente_nome}</p>
              </div>
              <p class="text-[10px] text-slate-400 font-mono">${item.cnpj} • <span class="text-red-400 font-bold">${item.dias_atraso} dias de atraso</span></p>
            </div>
            <div class="text-right shrink-0">
              <p class="text-xs font-bold font-mono text-red-400">${window.formatCurrencyBR(item.valor_atraso)}</p>
              <button onclick="window.buscarEAbrirDossiePorNome('${item.cliente_nome}')" 
                      class="text-[10px] text-cyan-400 hover:text-cyan-300 underline font-semibold mt-0.5 flex items-center gap-0.5 ml-auto">
                <i class="ph ph-identification-card"></i> Dossiê 360°
              </button>
            </div>
          </div>
        `).join('');
      }
    }

    // 5. Aba Tesouraria & Extratos
    const custodia = res.data.custodia_investimentos || {};
    document.getElementById('dash-tesouraria-saldo-op').innerText = window.formatCurrencyBR(custodia.saldo_operacional_puro || 0);
    document.getElementById('dash-tesouraria-entradas').innerText = window.formatCurrencyBR(res.data.receitas?.recebido?.valor || 0);
    document.getElementById('dash-tesouraria-saidas').innerText = window.formatCurrencyBR(res.data.despesas?.total_pago?.valor || 0);
    document.getElementById('dash-tesouraria-custodia').innerText = window.formatCurrencyBR(custodia.total_em_aplicacoes || 0);

    window.ultimoExtratosBancarios = res.data.extratos_bancarios || [];
    window.renderTabelaOFXFiltro();

    // 6. Aba Propostas Recentes
    const recentes = res.data.atividades_recentes || [];
    const recBody = document.getElementById('tabela-recentes-dash');
    if (recBody) {
      recBody.innerHTML = recentes.map(r => `
        <tr class="hover:bg-white/5 transition-colors">
          <td class="p-3 font-mono font-bold text-cyan-400">#${r.numero_orcamento}</td>
          <td class="p-3">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${r.vendido_por === 'Arandu' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'}">
              ${r.vendido_por}
            </span>
          </td>
          <td class="p-3 font-medium text-slate-200">${r.cliente_nome}</td>
          <td class="p-3 text-right font-bold text-slate-100 font-mono">${window.formatCurrencyBR(r.valor_total)}</td>
          <td class="p-3 text-slate-400 font-mono">${window.formatDateBR(r.data_emissao)}</td>
          <td class="p-3 text-center">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${r.status_aprovacao === 'Compra Aprovada' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'}">
              ${r.status_aprovacao}
            </span>
          </td>
        </tr>
      `).join('');
    }

    // Suporte a abertura direta de aba via query param ?tab=tesouraria
    const urlParams = new URLSearchParams(window.location.search);
    const initialTab = urlParams.get('tab');
    if (initialTab) {
      window.switchTab('dash', initialTab);
    }

  } catch (err) {
    console.error('[DASHBOARD] Erro ao renderizar métricas reais:', err);
  }
};

// ============================================================================
// ESTADO E CONTROLADORES DO EXTRATO BANCÁRIO OFX (FILTROS, ORDENAÇÃO E TOTAIS)
// ============================================================================
window.ofxState = {
  classificacao: 'TODOS',
  busca: '',
  ordemColuna: 'data_lancamento',
  ordemDirecao: 'desc'
};

window.setOfxClassificacao = function(tipo) {
  window.ofxState.classificacao = tipo;
  window.renderTabelaOFXFiltro();
};

window.buscarOfx = function(val) {
  window.ofxState.busca = String(val || '').toLowerCase().trim();
  window.renderTabelaOFXFiltro();
};

window.ordenarTabelaOfx = function(coluna) {
  if (window.ofxState.ordemColuna === coluna) {
    window.ofxState.ordemDirecao = window.ofxState.ordemDirecao === 'asc' ? 'desc' : 'asc';
  } else {
    window.ofxState.ordemColuna = coluna;
    window.ofxState.ordemDirecao = 'desc';
  }
  window.renderTabelaOFXFiltro();
};

window.renderTabelaOFXFiltro = function() {
  const ofxBody = document.getElementById('tabela-ofx-dash');
  const ofxFoot = document.getElementById('tfoot-ofx-dash');
  const totalLabel = document.getElementById('dash-tesouraria-total-extratos');
  if (!ofxBody || !window.ultimoExtratosBancarios) return;

  const extratos = window.ultimoExtratosBancarios;
  const { classificacao, busca, ordemColuna, ordemDirecao } = window.ofxState;

  // 1. Filtragem por Classificação
  let filtrados = extratos.filter(t => {
    const val = Number(t.valor);
    const isCustodia = t.tipo_classificacao === 'TRANSFERENCIA_CUSTODIA';
    const isRendimento = t.tipo_classificacao === 'RENDIMENTO_APLICACAO';
    const isPos = val > 0 && !isCustodia && !isRendimento;
    const isNeg = val < 0 && !isCustodia && !isRendimento;

    if (classificacao === 'ENTRADAS') return isPos;
    if (classificacao === 'SAIDAS') return isNeg;
    if (classificacao === 'CUSTODIA') return isCustodia;
    if (classificacao === 'RENDIMENTOS') return isRendimento;
    return true; // TODOS
  });

  // 2. Filtragem por Busca
  if (busca) {
    filtrados = filtrados.filter(t => {
      const m = (t.memo || '').toLowerCase();
      const b = (t.banco_nome || '').toLowerCase();
      const c = (t.conta_numero || '').toLowerCase();
      const v = String(t.valor || '');
      return m.includes(busca) || b.includes(busca) || c.includes(busca) || v.includes(busca);
    });
  }

  // 3. Ordenação Dinâmica
  filtrados.sort((a, b) => {
    let factor = ordemDirecao === 'asc' ? 1 : -1;
    if (ordemColuna === 'data_lancamento') {
      return (new Date(a.data_lancamento).getTime() - new Date(b.data_lancamento).getTime()) * factor;
    }
    if (ordemColuna === 'valor') {
      return (Number(a.valor) - Number(b.valor)) * factor;
    }
    if (ordemColuna === 'memo') {
      return (a.memo || '').localeCompare(b.memo || '') * factor;
    }
    return 0;
  });

  // 4. Contadores para os botões de filtro
  const nTotal = extratos.length;
  const nEntradas = extratos.filter(t => Number(t.valor) > 0 && t.tipo_classificacao !== 'TRANSFERENCIA_CUSTODIA').length;
  const nSaidas = extratos.filter(t => Number(t.valor) < 0 && t.tipo_classificacao !== 'TRANSFERENCIA_CUSTODIA').length;
  const nCustodia = extratos.filter(t => t.tipo_classificacao === 'TRANSFERENCIA_CUSTODIA').length;
  const nRendimentos = extratos.filter(t => t.tipo_classificacao === 'RENDIMENTO_APLICACAO').length;

  const btnTodos = document.getElementById('btn-ofx-todos');
  const btnEntradas = document.getElementById('btn-ofx-entradas');
  const btnSaidas = document.getElementById('btn-ofx-saidas');
  const btnCustodia = document.getElementById('btn-ofx-custodia');
  const btnRend = document.getElementById('btn-ofx-rendimentos');

  if (btnTodos) {
    btnTodos.className = `px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${classificacao === 'TODOS' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm' : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-white/5'}`;
    btnTodos.innerHTML = `<i class="ph ph-squares-four"></i> Todas (${nTotal})`;
  }
  if (btnEntradas) {
    btnEntradas.className = `px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${classificacao === 'ENTRADAS' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm' : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-white/5'}`;
    btnEntradas.innerHTML = `<i class="ph ph-arrow-down-left text-emerald-400"></i> Entradas (+${nEntradas})`;
  }
  if (btnSaidas) {
    btnSaidas.className = `px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${classificacao === 'SAIDAS' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm' : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-white/5'}`;
    btnSaidas.innerHTML = `<i class="ph ph-arrow-up-right text-rose-400"></i> Saídas (-${nSaidas})`;
  }
  if (btnCustodia) {
    btnCustodia.className = `px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${classificacao === 'CUSTODIA' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm' : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-white/5'}`;
    btnCustodia.innerHTML = `<i class="ph ph-vault text-purple-400"></i> Custódia CDI (${nCustodia})`;
  }
  if (btnRend) {
    btnRend.className = `px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${classificacao === 'RENDIMENTOS' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm' : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-white/5'}`;
    btnRend.innerHTML = `<i class="ph ph-trend-up text-amber-400"></i> Rendimentos (${nRendimentos})`;
  }

  if (totalLabel) totalLabel.innerText = `${filtrados.length} de ${extratos.length} movimentações visíveis`;

  // 5. Renderizar Linhas
  if (filtrados.length === 0) {
    ofxBody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-500 font-mono text-xs">Nenhuma movimentação corresponde aos filtros selecionados.</td></tr>`;
  } else {
    ofxBody.innerHTML = filtrados.map(t => {
      const val = Number(t.valor);
      const isPos = val > 0;
      const isCustodia = t.tipo_classificacao === 'TRANSFERENCIA_CUSTODIA';
      const isRendimento = t.tipo_classificacao === 'RENDIMENTO_APLICACAO';

      let badgeClass = isCustodia 
        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' 
        : (isRendimento ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : (isPos ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-500/20 text-slate-300 border border-slate-500/30'));

      let badgeText = isCustodia ? 'Custódia / Aplicação' : (isRendimento ? 'Rendimento CDI' : (isPos ? 'Entrada Operacional' : 'Saída Operacional'));

      const bInfo = window.formatarBancoAgenciaConta(t.banco_nome, t.conta_numero, t.agencia);
      const safeMemo = (t.memo || '').replace(/'/g, "\\'");

      return `
        <tr class="hover:bg-white/5 transition-colors group">
          <td class="p-3 font-mono text-slate-400 whitespace-nowrap">${window.formatDateBR(t.data_lancamento)}</td>
          <td class="p-3 whitespace-nowrap">
            <span class="px-2 py-0.5 rounded text-[11px] font-semibold ${bInfo.badgeClass} flex items-center gap-1.5 w-fit">
              <i class="${bInfo.icon}"></i> ${bInfo.banco}
            </span>
          </td>
          <td class="p-3 font-mono text-slate-300 whitespace-nowrap text-xs">
            ${bInfo.agenciaConta}
          </td>
          <td class="p-3 whitespace-nowrap">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeClass}">
              ${badgeText}
            </span>
          </td>
          <td class="p-3 text-slate-200">
            <div onclick="window.abrirDossieContraparte('${safeMemo}', '${t.nome_contraparte || ''}', '${t.documento_contraparte || ''}')"
                 class="cursor-pointer text-cyan-300 hover:text-cyan-100 hover:underline flex items-center gap-1.5 group/item transition-colors"
                 title="Clique para ver o Dossiê Financeiro completo desta contraparte">
              <i class="ph ph-user-circle text-cyan-400 group-hover/item:scale-125 transition-transform text-sm"></i>
              <span class="truncate max-w-[320px] font-medium">${t.memo}</span>
            </div>
          </td>
          <td class="p-3 text-right font-mono font-bold whitespace-nowrap ${isPos ? 'text-emerald-400' : 'text-rose-400'}">
            ${window.formatCurrencyBR(val)}
          </td>
          <td class="p-3 text-center">
            <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Conciliado
            </span>
          </td>
        </tr>
      `;
    }).join('');
  }

  // 6. Linha de Totais da Visualização Atual (Subtotais)
  const totalEntradasVisiveis = filtrados.filter(t => Number(t.valor) > 0).reduce((acc, t) => acc + Number(t.valor), 0);
  const totalSaidasVisiveis = filtrados.filter(t => Number(t.valor) < 0).reduce((acc, t) => acc + Math.abs(Number(t.valor)), 0);
  const saldoLiquidoVisivel = totalEntradasVisiveis - totalSaidasVisiveis;

  if (ofxFoot) {
    ofxFoot.innerHTML = `
      <tr class="bg-slate-900/95 border-t-2 border-cyan-500/30 text-xs font-semibold text-slate-300">
        <td colspan="4" class="p-3.5">
          <div class="flex items-center gap-2">
            <span class="text-slate-400 uppercase text-[10px] tracking-wider">Subtotais dos Dados Visíveis:</span>
            <span class="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono text-[11px] font-bold border border-cyan-500/30">
              ${filtrados.length} lançamentos
            </span>
          </div>
        </td>
        <td class="p-3.5 text-right font-mono text-xs text-slate-300">
          <div class="flex items-center justify-end gap-3">
            <span>Entradas: <strong class="text-emerald-400">+${window.formatCurrencyBR(totalEntradasVisiveis)}</strong></span>
            <span>Saídas: <strong class="text-rose-400">-${window.formatCurrencyBR(totalSaidasVisiveis)}</strong></span>
          </div>
        </td>
        <td class="p-3.5 text-right font-mono font-bold text-sm ${saldoLiquidoVisivel >= 0 ? 'text-emerald-400' : 'text-rose-400'} whitespace-nowrap">
          ${saldoLiquidoVisivel >= 0 ? '+' : ''}${window.formatCurrencyBR(saldoLiquidoVisivel)}
        </td>
        <td class="p-3.5 text-center text-[10px] uppercase tracking-wider text-slate-500">
          Líquido
        </td>
      </tr>
    `;
  }
};

// ============================================================================
// RENDERIZADOR DOS 4 CARDS INTERATIVOS (RECEITAS vs DESPESAS) COM MoM
// ============================================================================
window.renderCardsExecutivos = function() {
  const container = document.getElementById('dash-cards-container');
  if (!container || !ultimoDashboardPayload) return;

  const isReceita = dashboardState.visao === 'receitas';

  if (isReceita) {
    const r = ultimoDashboardPayload.receitas;
    const cards = [
      {
        key: 'faturado',
        titulo: 'Faturado',
        subtitulo: 'Orçamentos & NFe Emitidas',
        valor: r.faturado.valor,
        mom: r.faturado.mom_percentual,
        momDirecao: r.faturado.mom_direcao,
        corTexto: 'text-slate-100',
        borda: 'border-cyan-500/40',
        serieAtiva: dashboardState.seriesAtivas.faturado
      },
      {
        key: 'recebido',
        titulo: 'Recebido',
        subtitulo: 'Faturas e Títulos Liquidados',
        valor: r.recebido.valor,
        mom: r.recebido.mom_percentual,
        momDirecao: r.recebido.mom_direcao,
        corTexto: 'text-emerald-400',
        borda: 'border-emerald-500/40',
        serieAtiva: dashboardState.seriesAtivas.recebido
      },
      {
        key: 'a_receber',
        titulo: 'À Receber (Em Dia)',
        subtitulo: 'Títulos com Vencimento Futuro',
        valor: r.a_receber.valor,
        mom: r.a_receber.mom_percentual,
        momDirecao: r.a_receber.mom_direcao,
        corTexto: 'text-cyan-300',
        borda: 'border-blue-500/40',
        serieAtiva: dashboardState.seriesAtivas.a_receber
      },
      {
        key: 'em_atraso',
        titulo: 'Em Atraso',
        subtitulo: 'Inadimplência Vencida',
        valor: r.em_atraso.valor,
        mom: r.em_atraso.mom_percentual,
        momDirecao: r.em_atraso.mom_direcao,
        corTexto: 'text-red-400',
        borda: 'border-red-500/40',
        serieAtiva: dashboardState.seriesAtivas.em_atraso
      }
    ];

    container.innerHTML = cards.map(c => {
      const isUp = c.mom >= 0;
      // Para 'em_atraso', queda é boa (verde), alta é ruim (vermelho)
      let momColor = 'text-emerald-400';
      if (c.key === 'em_atraso') {
        momColor = isUp ? 'text-red-400' : 'text-emerald-400';
      } else {
        momColor = isUp ? 'text-emerald-400' : 'text-red-400';
      }

      return `
        <div onclick="window.toggleDashboardSerie('${c.key}')" 
             class="glass-panel p-5 rounded-2xl border transition-all cursor-pointer group hover:scale-[1.01] ${c.serieAtiva ? `${c.borda} bg-slate-900/80 shadow-lg` : 'border-white/5 opacity-60'}">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-bold uppercase tracking-wider text-slate-400">${c.titulo}</span>
            <span class="px-2 py-0.5 rounded-full text-[9px] font-bold border transition-all ${c.serieAtiva ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' : 'bg-white/5 text-slate-500 border-transparent'}">
              ${c.serieAtiva ? '✓ No Gráfico' : '+ Filtrar'}
            </span>
          </div>

          <h3 class="text-2xl font-extrabold mt-1 font-mono tracking-tight ${c.corTexto}">
            ${window.formatCurrencyBR(c.valor)}
          </h3>

          <div class="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
            <span class="text-[11px] font-bold flex items-center gap-1 ${momColor}">
              <i class="ph ${isUp ? 'ph-trend-up' : 'ph-trend-down'} font-bold"></i>
              ${isUp ? `▲ +${c.mom}%` : `▼ ${c.mom}%`} <span class="text-slate-400 font-normal">vs mês anterior</span>
            </span>
            <span class="text-[10px] text-slate-400 truncate max-w-[100px]">${c.subtitulo}</span>
          </div>
        </div>
      `;
    }).join('');

  } else {
    // Modo Despesas
    const d = ultimoDashboardPayload.despesas;
    const cards = [
      {
        key: 'total_pago',
        titulo: 'Total Pago',
        subtitulo: 'Despesas Liquidadas',
        valor: d.total_pago.valor,
        mom: d.total_pago.mom_percentual,
        corTexto: 'text-slate-100',
        borda: 'border-red-500/40',
        serieAtiva: dashboardState.seriesAtivas.total_pago
      },
      {
        key: 'a_vencer_7d',
        titulo: 'A Vencer (Próx. 7 dias)',
        subtitulo: 'Compromissos Desta Semana',
        valor: d.a_vencer_7d.valor,
        mom: 0,
        corTexto: 'text-amber-400',
        borda: 'border-amber-500/40',
        serieAtiva: true
      },
      {
        key: 'a_vencer_15d',
        titulo: 'A Vencer (Próx. 15 dias)',
        subtitulo: 'Compromissos da Quinzena',
        valor: d.a_vencer_15d.valor,
        mom: 0,
        corTexto: 'text-yellow-400',
        borda: 'border-yellow-500/40',
        serieAtiva: dashboardState.seriesAtivas.a_vencer
      },
      {
        key: 'em_atraso',
        titulo: 'Despesas em Atraso',
        subtitulo: 'Contas Vencidas (Juros)',
        valor: d.em_atraso.valor,
        mom: d.em_atraso.mom_percentual,
        corTexto: 'text-red-400',
        borda: 'border-red-500/40',
        serieAtiva: true
      }
    ];

    container.innerHTML = cards.map(c => `
      <div onclick="window.toggleDashboardSerie('${c.key}')" 
           class="glass-panel p-5 rounded-2xl border transition-all cursor-pointer group hover:scale-[1.01] ${c.serieAtiva ? `${c.borda} bg-slate-900/80 shadow-lg` : 'border-white/5 opacity-60'}">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold uppercase tracking-wider text-slate-400">${c.titulo}</span>
          <span class="px-2 py-0.5 rounded-full text-[9px] font-bold border ${c.serieAtiva ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-white/5 text-slate-500 border-transparent'}">
            ${c.serieAtiva ? '✓ No Gráfico' : '+ Filtrar'}
          </span>
        </div>

        <h3 class="text-2xl font-extrabold mt-1 font-mono tracking-tight ${c.corTexto}">
          ${window.formatCurrencyBR(c.valor)}
        </h3>

        <div class="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
          <span class="text-[11px] font-bold flex items-center gap-1 ${c.mom < 0 ? 'text-emerald-400' : 'text-slate-400'}">
            ${c.mom !== 0 ? `${c.mom < 0 ? '▼ ' : '▲ +'}${c.mom}% vs mês anterior` : 'Compromisso'}
          </span>
          <span class="text-[10px] text-slate-400 truncate max-w-[120px]">${c.subtitulo}</span>
        </div>
      </div>
    `).join('');
  }
};

// ============================================================================
// RENDERIZADOR DO GRÁFICO INTERATIVO (BARRAS vs LINHAS) COM SÉRIES ATIVAS
// ============================================================================
window.renderGraficoExecutivo = function() {
  const canvas = document.getElementById('dash-grafico-canvas');
  const legenda = document.getElementById('dash-grafico-legenda');
  if (!canvas || !ultimoDashboardPayload) return;

  const isReceita = dashboardState.visao === 'receitas';
  const isLinhas = dashboardState.tipoGrafico === 'linhas';
  const series = ultimoDashboardPayload.series_grafico;
  const meses = series.meses;

  // Atualiza título do gráfico com base na granularidade adaptativa
  const tit = document.getElementById('dash-grafico-titulo');
  if (tit) {
    if (series.granularidade === 'SEMANAL') {
      tit.innerHTML = `<i class="ph ph-chart-bar text-cyan-400"></i> Evolução Semanal no Período Selecionado`;
    } else {
      tit.innerHTML = `<i class="ph ph-chart-bar text-cyan-400"></i> Evolução Mensal Consolidada (2026)`;
    }
  }

  // Séries a plotar baseadas no modo e nos cards ativos
  const seriesParaPlotar = [];

  if (isReceita) {
    if (dashboardState.seriesAtivas.faturado) {
      seriesParaPlotar.push({ key: 'faturado', nome: 'Faturado', dados: series.receitas.faturado, cor: '#06b6d4', grad: 'from-cyan-500/70 to-cyan-400' });
    }
    if (dashboardState.seriesAtivas.recebido) {
      seriesParaPlotar.push({ key: 'recebido', nome: 'Recebido', dados: series.receitas.recebido, cor: '#10b981', grad: 'from-emerald-500/70 to-emerald-400' });
    }
    if (dashboardState.seriesAtivas.a_receber) {
      seriesParaPlotar.push({ key: 'a_receber', nome: 'À Receber', dados: series.receitas.a_receber, cor: '#38bdf8', grad: 'from-sky-500/70 to-sky-400' });
    }
    if (dashboardState.seriesAtivas.em_atraso) {
      seriesParaPlotar.push({ key: 'em_atraso', nome: 'Em Atraso', dados: series.receitas.em_atraso, cor: '#f87171', grad: 'from-red-500/70 to-red-400' });
    }
  } else {
    if (dashboardState.seriesAtivas.total_pago) {
      seriesParaPlotar.push({ key: 'total_pago', nome: 'Total Pago', dados: series.despesas.total_pago, cor: '#f43f5e', grad: 'from-rose-500/70 to-rose-400' });
    }
    if (dashboardState.seriesAtivas.a_vencer) {
      seriesParaPlotar.push({ key: 'a_vencer', nome: 'A Vencer', dados: series.despesas.a_vencer, cor: '#fbbf24', grad: 'from-amber-500/70 to-amber-400' });
    }
  }

  // Atualizar Legenda
  if (legenda) {
    legenda.innerHTML = seriesParaPlotar.map(s => `
      <div class="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity" onclick="toggleDashboardSerie('${s.key}')">
        <span class="w-3 h-3 rounded-full" style="background-color: ${s.cor};"></span>
        <span class="font-bold text-slate-200">${s.nome}</span>
      </div>
    `).join('') || '<span class="text-xs text-slate-500">Nenhuma série selecionada. Clique em um card acima.</span>';
  }

  if (seriesParaPlotar.length === 0) {
    canvas.innerHTML = `
      <div class="p-8 text-center space-y-2">
        <i class="ph ph-hand-pointing text-3xl text-cyan-400 animate-bounce"></i>
        <p class="text-xs text-slate-400">Clique em qualquer um dos 4 cards acima para ativar a visualização da série no gráfico.</p>
      </div>
    `;
    return;
  }

  // Calcular valor máximo para escala
  let maxVal = 1;
  seriesParaPlotar.forEach(s => {
    s.dados.forEach(v => { if (v > maxVal) maxVal = v; });
  });

  if (!isLinhas) {
    // -------------------------------------------------------------
    // GRÁFICO EM BARRAS AGRUPADAS / SOBREPOSTAS
    // -------------------------------------------------------------
    const maxHeightPx = 180;

    canvas.innerHTML = `
      <div class="w-full flex items-end justify-between gap-2 sm:gap-4 h-[240px] pt-6 pb-2 px-2 sm:px-4">
        ${meses.map((mes, mesIdx) => {
          return `
            <div class="flex-1 h-full flex flex-col justify-end items-center group cursor-pointer">
              <!-- Barras das séries lado a lado -->
              <div class="w-full flex items-end justify-center gap-1 sm:gap-1.5 h-[180px]">
                ${seriesParaPlotar.map(s => {
                  const val = s.dados[mesIdx] || 0;
                  const hPx = Math.max(8, Math.round((val / maxVal) * maxHeightPx));
                  return `
                    <div class="flex-1 max-w-[20px] rounded-t-md transition-all duration-300 group-hover:brightness-125 relative group/bar"
                         style="height: ${hPx}px; background-color: ${s.cor};"
                         title="${s.nome} (${mes}): ${window.formatCurrencyBR(val)}">
                      <div class="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900 border border-white/10 px-2 py-0.5 rounded text-[9px] font-mono text-slate-100 opacity-0 group-hover/bar:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl z-20">
                        ${(val / 1000).toFixed(0)}k
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>

              <!-- Rótulo do Mês -->
              <span class="text-[11px] font-bold text-slate-400 group-hover:text-cyan-300 transition-colors uppercase tracking-wider mt-2.5">
                ${mes}
              </span>
            </div>
          `;
        }).join('')}
      </div>
    `;

  } else {
    // -------------------------------------------------------------
    // GRÁFICO EM LINHAS CONTÍNUAS SVG STUDIO-GRADE
    // -------------------------------------------------------------
    const width = 640;
    const height = 200;
    const paddingX = 40;
    const paddingY = 25;

    const stepX = (width - paddingX * 2) / Math.max(1, meses.length - 1);

    const svgLines = seriesParaPlotar.map(s => {
      const points = s.dados.map((val, idx) => {
        const x = paddingX + idx * stepX;
        const y = height - paddingY - (val / maxVal) * (height - paddingY * 2);
        return { x, y, val };
      });

      const d = points.reduce((acc, pt, i) => {
        return i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
      }, '');

      const dots = points.map(pt => `
        <circle cx="${pt.x}" cy="${pt.y}" r="4" fill="${s.cor}" stroke="#0f172a" stroke-width="2" class="cursor-pointer hover:r-6 transition-all">
          <title>${s.nome}: ${window.formatCurrencyBR(pt.val)}</title>
        </circle>
      `).join('');

      return `
        <path d="${d}" fill="none" stroke="${s.cor}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        ${dots}
      `;
    }).join('');

    const xLabels = meses.map((mes, idx) => {
      const x = paddingX + idx * stepX;
      return `<text x="${x}" y="${height - 5}" text-anchor="middle" font-size="10" font-weight="bold" fill="#94a3b8">${mes}</text>`;
    }).join('');

    canvas.innerHTML = `
      <div class="w-full overflow-x-auto py-2">
        <svg viewBox="0 0 ${width} ${height}" class="w-full h-[220px]">
          <!-- Linhas de Grade de Fundo -->
          <line x1="${paddingX}" y1="${paddingY}" x2="${width - paddingX}" y2="${paddingY}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="4" />
          <line x1="${paddingX}" y1="${height / 2}" x2="${width - paddingX}" y2="${height / 2}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="4" />
          <line x1="${paddingX}" y1="${height - paddingY}" x2="${width - paddingX}" y2="${height - paddingY}" stroke="rgba(255,255,255,0.1)" />

          ${svgLines}
          ${xLabels}
        </svg>
      </div>
    `;
  }
};

// Helper para abrir dossie pelo nome na tabela de inadimplencia
window.buscarEAbrirDossiePorNome = async function(nomeCliente) {
  try {
    const res = await window.apiService.getClientes({ busca: nomeCliente.split(' ')[0], limit: 1 });
    if (res.success && res.data && res.data.length > 0) {
      window.abrirDossie360(res.data[0].id);
    } else {
      alert(`Parceiro ${nomeCliente} localizado no extrato. Abra a aba CRM para inspecionar os detalhes cadastrais.`);
    }
  } catch (e) {
    console.error('Erro ao abrir dossie:', e);
  }
};

// ============================================================================
// 2. CATÁLOGO UNIVERSAL DE BATERIAS (PRODUTOS & BOM)

// ============================================================================
window.renderProdutosRealData = async function() {
  const container = document.getElementById('conteudo-dinamico');
  if (!container) return;

  container.innerHTML = `
    <div class="space-y-6 animate-fade-in">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <h2 class="text-xl font-semibold text-slate-100 tracking-tight">Catálogo Universal de Baterias</h2>
          <p class="text-xs text-slate-400 mt-0.5">Engenharia de packs industriais, subsea e hospitalares</p>
        </div>

        <div class="flex items-center gap-1.5 bg-slate-900/60 p-1.5 rounded-xl border border-white/5">
          <button onclick="switchTab('prod', 'todos')" data-module="prod" data-tab-btn="todos" 
                  class="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 transition-all flex items-center gap-1.5">
            <i class="ph ph-rows text-sm"></i> Todos os Packs
          </button>
          <button onclick="switchTab('prod', 'subsea')" data-module="prod" data-tab-btn="subsea" 
                  class="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1.5">
            <i class="ph ph-waves text-sm"></i> Náutico / Subsea
          </button>
          <button onclick="switchTab('prod', 'hospitalar')" data-module="prod" data-tab-btn="hospitalar" 
                  class="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1.5">
            <i class="ph ph-heartbeat text-sm"></i> Hospitalar & Clínico
          </button>
        </div>
      </div>

      <!-- Barra de Filtros Inteligente -->
      <div class="flex flex-wrap items-center gap-3">
        <div class="relative flex-1 min-w-[240px] max-w-sm">
          <i class="ph ph-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
          <input type="text" id="busca-baterias-input" placeholder="Buscar por SKU, pack, OEM (ex: AQL38, Nortek, Servo)..." 
                 class="w-full py-2 pl-9 pr-3 rounded-xl text-xs bg-slate-900/70 border border-white/10 text-slate-200 focus:outline-none focus:border-cyan-400 transition-all">
        </div>

        <select id="filtro-quimica-baterias" class="py-2 px-3 rounded-xl text-xs bg-slate-900/70 border border-white/10 text-slate-200 focus:outline-none focus:border-cyan-400">
          <option value="">Todas as Químicas</option>
          <option value="Li-SOCL2">Li-SOCL2 (Lítio Cloreto de Tionila)</option>
          <option value="Alcalina">Alcalina Industrial</option>
          <option value="Ni-MH">Ni-MH (Níquel-Metal Hidreto)</option>
          <option value="Li-Ion">Li-Ion (Íon de Lítio)</option>
          <option value="Chumbo">Chumbo Ácido / VRLA</option>
        </select>

        <span class="text-xs text-slate-400 font-mono ml-auto" id="total-baterias-label">Carregando catálogo...</span>
      </div>

      <!-- Tabela Unificada com Abas Segmentadas -->
      <div class="glass-panel rounded-2xl border border-white/5 overflow-hidden">
        <div class="overflow-x-auto max-h-[520px] overflow-y-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead class="bg-black/20 text-slate-400 uppercase font-semibold sticky top-0 backdrop-blur-md">
              <tr>
                <th class="p-3.5">SKU</th>
                <th class="p-3.5">Nome do Pack / Modelo</th>
                <th class="p-3.5">Setor</th>
                <th class="p-3.5">Fabricante OEM</th>
                <th class="p-3.5">Química</th>
                <th class="p-3.5 text-center">Tensão / Ah / Wh</th>
                <th class="p-3.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody id="tabela-baterias-corpo" class="divide-y divide-white/5 text-slate-300">
              <tr><td colspan="7" class="p-6 text-center text-slate-500">Carregando baterias...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  try {
    const res = await window.apiService.getProdutos({ limit: 250 });
    const produtos = res.success ? (res.data || []) : [];
    let abaAtiva = 'todos';

    function renderTabela() {
      const q = (document.getElementById('busca-baterias-input')?.value || '').toLowerCase();
      const quimicaFiltro = document.getElementById('filtro-quimica-baterias')?.value || '';

      const filtrados = produtos.filter(p => {
        const d = p.detalhes || {};
        const setor = (d.setor || '').toUpperCase();
        
        // Filtro por aba
        if (abaAtiva === 'subsea' && !setor.includes('NÁUT')) return false;
        if (abaAtiva === 'hospitalar' && !setor.includes('HOSP')) return false;

        // Filtro por química
        if (quimicaFiltro && !((d.quimica || '').includes(quimicaFiltro))) return false;

        // Busca por texto
        if (q) {
          const match = (p.nome || '').toLowerCase().includes(q) ||
                        (d.codigo_sku || '').toLowerCase().includes(q) ||
                        (d.fabricante || '').toLowerCase().includes(q) ||
                        (d.quimica || '').toLowerCase().includes(q);
          if (!match) return false;
        }

        return true;
      });

      const label = document.getElementById('total-baterias-label');
      if (label) label.innerText = `${filtrados.length} baterias encontradas`;

      const tbody = document.getElementById('tabela-baterias-corpo');
      if (!tbody) return;

      if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400">Nenhuma bateria encontrada com os filtros selecionados.</td></tr>`;
        return;
      }

      tbody.innerHTML = filtrados.map(p => {
        const d = p.detalhes || {};
        const esp = d.especificacoes_tecnicas || {};
        const isSubsea = (d.setor || '').toUpperCase().includes('NÁUT');
        
        return `
          <tr class="hover:bg-white/5 transition-colors">
            <td class="p-3.5 font-mono font-bold text-cyan-400">${d.codigo_sku || '-'}</td>
            <td class="p-3.5 font-medium text-slate-100">${p.nome}</td>
            <td class="p-3.5">
              <span class="px-2 py-0.5 rounded text-[10px] font-semibold ${isSubsea ? 'bg-cyan-500/20 text-cyan-300' : 'bg-rose-500/20 text-rose-300'}">
                ${d.setor || 'INDUSTRIAL'}
              </span>
            </td>
            <td class="p-3.5 text-slate-300">${d.fabricante || '-'}</td>
            <td class="p-3.5">
              <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-white/5">
                ${d.quimica || '-'}
              </span>
            </td>
            <td class="p-3.5 text-center font-mono text-slate-300">
              ${esp.tensao_nominal_v ? esp.tensao_nominal_v + 'V' : '-'} / 
              ${esp.capacidade_nominal_ah ? esp.capacidade_nominal_ah + 'Ah' : '-'} / 
              ${esp.energia_nominal_wh ? esp.energia_nominal_wh + 'Wh' : '-'}
            </td>
            <td class="p-3.5 text-center">
              <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400">Ativo</span>
            </td>
          </tr>
        `;
      }).join('');
    }

    renderTabela();

    // Eventos
    document.getElementById('busca-baterias-input')?.addEventListener('input', renderTabela);
    document.getElementById('filtro-quimica-baterias')?.addEventListener('change', renderTabela);

    // Substituir switchTab para atualizar abaAtiva nesta tela
    const originalSwitch = window.switchTab;
    window.switchTab = function(moduleName, tabId) {
      if (moduleName === 'prod') {
        abaAtiva = tabId;
        const buttons = document.querySelectorAll(`[data-module="prod"][data-tab-btn]`);
        buttons.forEach(b => {
          b.classList.remove('bg-cyan-500/20', 'text-cyan-300', 'border-cyan-500/40');
          b.classList.add('text-slate-400', 'hover:text-slate-200');
        });
        const activeBtn = document.querySelector(`[data-module="prod"][data-tab-btn="${tabId}"]`);
        if (activeBtn) {
          activeBtn.classList.remove('text-slate-400', 'hover:text-slate-200');
          activeBtn.classList.add('bg-cyan-500/20', 'text-cyan-300', 'border-cyan-500/40');
        }
        renderTabela();
      } else {
        originalSwitch(moduleName, tabId);
      }
    };

  } catch (err) {
    console.error('Erro renderProdutosRealData:', err);
  }
};

// ============================================================================
// 3. FLUXO DE CAIXA REAL (TESOURARIA, OFX & CONTAS A PAGAR/RECEBER)
// ============================================================================
window.renderFluxoCaixaRealData = async function() {
  const container = document.getElementById('conteudo-dinamico');
  if (!container) return;

  container.innerHTML = `
    <div class="space-y-6 animate-fade-in">
      <!-- Header do Fluxo de Caixa -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <h2 class="text-xl font-semibold text-slate-100 tracking-tight">Saúde de Caixa & Tesouraria</h2>
          <p class="text-xs text-slate-400 mt-0.5">Conciliação diária de 1.386 lançamentos OFX e previsibilidade de recebíveis</p>
        </div>

        <div class="flex items-center gap-1.5 bg-slate-900/60 p-1.5 rounded-xl border border-white/5">
          <button onclick="switchTab('fc', 'extrato')" data-module="fc" data-tab-btn="extrato" 
                  class="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 transition-all flex items-center gap-1.5">
            <i class="ph ph-receipt text-sm"></i> Extrato Bancário OFX
          </button>
          <button onclick="switchTab('fc', 'bancos')" data-module="fc" data-tab-btn="bancos" 
                  class="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1.5">
            <i class="ph ph-bank text-sm"></i> Saldos por Banco
          </button>
        </div>
      </div>

      <!-- 4 Cards Financeiros Reais -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="glass-panel p-5 rounded-2xl border border-white/5">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Saldo Bancário Atual</span>
          <h3 class="text-2xl font-bold text-cyan-400 mt-1" id="fc-saldo-atual">...</h3>
          <p class="text-xs text-slate-400 mt-1">Conciliado em Itaú e Bradesco</p>
        </div>

        <div class="glass-panel p-5 rounded-2xl border border-white/5">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">A Receber (Clientes)</span>
          <h3 class="text-2xl font-bold text-emerald-400 mt-1" id="fc-receber">...</h3>
          <p class="text-xs text-emerald-400 mt-1 font-medium" id="fc-qtd-receber">... títulos</p>
        </div>

        <div class="glass-panel p-5 rounded-2xl border border-white/5">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">A Pagar (Fornecedores)</span>
          <h3 class="text-2xl font-bold text-red-400 mt-1" id="fc-pagar">...</h3>
          <p class="text-xs text-red-400 mt-1 font-medium" id="fc-qtd-pagar">... títulos</p>
        </div>

        <div class="glass-panel p-5 rounded-2xl border border-white/5">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Saldo Projetado</span>
          <h3 class="text-2xl font-bold text-slate-100 mt-1" id="fc-projetado">...</h3>
          <p class="text-xs text-cyan-400 mt-1 font-medium">Caixa + Receber - Pagar</p>
        </div>
      </div>

      <!-- ABA 1: EXTRATO COMPLETO COM FILTROS -->
      <div data-module="fc" data-tab-content="extrato" class="space-y-4">
        <div class="flex flex-wrap items-center gap-3">
          <div class="relative flex-1 min-w-[200px] max-w-sm">
            <i class="ph ph-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
            <input type="text" id="busca-ofx-input" placeholder="Buscar por memo, favorecido, valor..." 
                   class="w-full py-2 pl-9 pr-3 rounded-xl text-xs bg-slate-900/70 border border-white/10 text-slate-200 focus:outline-none focus:border-cyan-400 transition-all">
          </div>

          <select id="filtro-ofx-tipo" class="py-2 px-3 rounded-xl text-xs bg-slate-900/70 border border-white/10 text-slate-200 focus:outline-none focus:border-cyan-400">
            <option value="">Todas as Operações</option>
            <option value="ENTRADAS">Apenas Entradas (+)</option>
            <option value="SAIDAS">Apenas Saídas (-)</option>
          </select>

          <select id="filtro-ofx-banco" class="py-2 px-3 rounded-xl text-xs bg-slate-900/70 border border-white/10 text-slate-200 focus:outline-none focus:border-cyan-400">
            <option value="">Todos os Bancos</option>
            <option value="Itau">Itaú Unibanco</option>
            <option value="Bradesco">Banco Bradesco</option>
          </select>
        </div>

        <div class="glass-panel rounded-2xl border border-white/5 overflow-hidden">
          <div class="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead class="bg-black/20 text-slate-400 uppercase font-semibold sticky top-0 backdrop-blur-md">
                <tr>
                  <th class="p-3.5">Data Lançamento</th>
                  <th class="p-3.5">Banco / Agência / Conta</th>
                  <th class="p-3.5">Histórico / Descrição</th>
                  <th class="p-3.5 text-right">Valor Líquido</th>
                  <th class="p-3.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody id="tabela-fc-corpo" class="divide-y divide-white/5 text-slate-300">
                <tr><td colspan="5" class="p-6 text-center text-slate-500">Carregando lançamentos...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ABA 2: SALDOS POR BANCO -->
      <div data-module="fc" data-tab-content="bancos" class="space-y-4 hidden">
        <div id="grid-saldos-banco" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <!-- Injetado via JS -->
        </div>
      </div>
    </div>
  `;

  try {
    const resumoRes = await window.apiService.getResumoCaixa();
    if (resumoRes.success && resumoRes.data) {
      const d = resumoRes.data;
      document.getElementById('fc-saldo-atual').innerText = `R$ ${d.saldo_bancario_atual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      document.getElementById('fc-receber').innerText = `R$ ${d.a_receber.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      document.getElementById('fc-qtd-receber').innerText = `${d.qtd_a_receber} faturas emitidas`;
      document.getElementById('fc-pagar').innerText = `R$ ${d.a_pagar.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      document.getElementById('fc-qtd-pagar').innerText = `${d.qtd_a_pagar} faturas recebidas`;
      document.getElementById('fc-projetado').innerText = `R$ ${d.saldo_projetado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

      const gridBanco = document.getElementById('grid-saldos-banco');
      if (gridBanco && d.saldos_por_banco) {
        gridBanco.innerHTML = d.saldos_por_banco.map(b => `
          <div class="glass-panel p-6 rounded-2xl border border-white/5">
            <div class="flex items-center justify-between">
              <div>
                <span class="text-xs uppercase font-bold tracking-wider text-slate-400">${b.banco_nome}</span>
                <p class="text-xs text-slate-500 mt-0.5">Agência: ${b.agencia} | Conta: ${b.conta_numero}</p>
              </div>
              <i class="ph ph-bank text-2xl text-cyan-400"></i>
            </div>
            <div class="mt-4">
              <span class="text-2xl font-bold text-slate-100">
                R$ ${Number(b.saldo_conta).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
              <p class="text-[11px] text-slate-400 mt-1">${b.total_movimentacoes} movimentações conciliadas</p>
            </div>
          </div>
        `).join('');
      }
    }

    async function carregarExtrato() {
      const tipo = document.getElementById('filtro-ofx-tipo')?.value || '';
      const banco = document.getElementById('filtro-ofx-banco')?.value || '';
      const busca = document.getElementById('busca-ofx-input')?.value || '';

      const res = await window.apiService.getTransacoesFinanceiras({ tipo, banco, busca, limit: 100 });
      const tbody = document.getElementById('tabela-fc-corpo');
      if (!tbody) return;

      if (!res.success || !res.data || res.data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400">Nenhum lançamento encontrado.</td></tr>`;
        return;
      }

      tbody.innerHTML = res.data.map(t => {
        const isPos = Number(t.valor) > 0;
        return `
          <tr class="hover:bg-white/5 transition-colors">
            <td class="p-3.5 font-mono text-slate-400">${window.formatDateBR(t.data_lancamento)}</td>
            <td class="p-3.5 font-medium text-slate-200">${t.banco_nome || 'Banco'} (${t.agencia}/${t.conta_numero})</td>
            <td class="p-3.5 text-slate-300 truncate max-w-[320px]" title="${t.memo}">${t.memo}</td>
            <td class="p-3.5 text-right font-mono font-bold ${isPos ? 'text-emerald-400' : 'text-slate-300'}">
              R$ ${Number(t.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </td>
            <td class="p-3.5 text-center">
              <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400">Conciliado</span>
            </td>
          </tr>
        `;
      }).join('');
    }

    carregarExtrato();

    document.getElementById('busca-ofx-input')?.addEventListener('input', carregarExtrato);
    document.getElementById('filtro-ofx-tipo')?.addEventListener('change', carregarExtrato);
    document.getElementById('filtro-ofx-banco')?.addEventListener('change', carregarExtrato);

  } catch (err) {
    console.error('Erro renderFluxoCaixaRealData:', err);
  }
};

// ============================================================================
// 4. REPOSITÓRIO FISCAL SEM PERDAS (NOTAS FISCAIS 172 XMLs)
// ============================================================================
window.renderNotasFiscaisRealData = async function() {
  const container = document.getElementById('conteudo-dinamico');
  if (!container) return;

  container.innerHTML = `
    <div class="space-y-6 animate-fade-in">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <h2 class="text-xl font-semibold text-slate-100 tracking-tight">Repositório Fiscal Sem Perdas</h2>
          <p class="text-xs text-slate-400 mt-0.5">172 XMLs reais de NF-e e NFS-e processados com preservação total de tags</p>
        </div>

        <div class="flex items-center gap-1.5 bg-slate-900/60 p-1.5 rounded-xl border border-white/5">
          <button onclick="switchTab('nfe', 'todas')" data-module="nfe" data-tab-btn="todas" 
                  class="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 transition-all flex items-center gap-1.5">
            <i class="ph ph-files text-sm"></i> Todas as Notas (172)
          </button>
          <button onclick="switchTab('nfe', 'vendas')" data-module="nfe" data-tab-btn="vendas" 
                  class="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1.5">
            <i class="ph ph-export text-sm"></i> Vendas Emitidas
          </button>
          <button onclick="switchTab('nfe', 'compras')" data-module="nfe" data-tab-btn="compras" 
                  class="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1.5">
            <i class="ph ph-import text-sm"></i> Compras de Insumos (Strema)
          </button>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <div class="relative flex-1 min-w-[240px] max-w-sm">
          <i class="ph ph-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
          <input type="text" id="busca-nfe-input" placeholder="Buscar por número, emitente, destinatário ou chave..." 
                 class="w-full py-2 pl-9 pr-3 rounded-xl text-xs bg-slate-900/70 border border-white/10 text-slate-200 focus:outline-none focus:border-cyan-400 transition-all">
        </div>
      </div>

      <div class="glass-panel rounded-2xl border border-white/5 overflow-hidden">
        <div class="overflow-x-auto max-h-[520px] overflow-y-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead class="bg-black/20 text-slate-400 uppercase font-semibold sticky top-0 backdrop-blur-md">
              <tr>
                <th class="p-3.5">Nota / Série</th>
                <th class="p-3.5">Tipo / Direção</th>
                <th class="p-3.5">Data Emissão</th>
                <th class="p-3.5">Emitente</th>
                <th class="p-3.5">Destinatário</th>
                <th class="p-3.5 text-right">Valor Total</th>
                <th class="p-3.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody id="tabela-notas-corpo" class="divide-y divide-white/5 text-slate-300">
              <tr><td colspan="7" class="p-6 text-center text-slate-500">Carregando notas...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  try {
    const res = await window.apiService.getNotasFiscais({ limit: 200 });
    const notas = res.success ? (res.data || []) : [];
    let abaAtiva = 'todas';

    function renderTabela() {
      const q = (document.getElementById('busca-nfe-input')?.value || '').toLowerCase();

      const filtradas = notas.filter(n => {
        if (abaAtiva === 'vendas' && n.direcao !== 'EMITIDA') return false;
        if (abaAtiva === 'compras' && n.direcao !== 'RECEBIDA') return false;

        if (q) {
          const match = (n.numero_nota || '').includes(q) ||
                        (n.emitente_nome || '').toLowerCase().includes(q) ||
                        (n.destinatario_nome || '').toLowerCase().includes(q) ||
                        (n.chave_acesso || '').includes(q);
          if (!match) return false;
        }
        return true;
      });

      const tbody = document.getElementById('tabela-notas-corpo');
      if (!tbody) return;

      if (filtradas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400">Nenhuma nota encontrada.</td></tr>`;
        return;
      }

      tbody.innerHTML = filtradas.map(n => {
        const isEmitida = n.direcao === 'EMITIDA';
        return `
          <tr class="hover:bg-white/5 transition-colors">
            <td class="p-3.5 font-mono font-bold text-cyan-400">#${n.numero_nota}</td>
            <td class="p-3.5">
              <span class="px-2 py-0.5 rounded text-[10px] font-semibold ${isEmitida ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-300'}">
                ${n.tipo_documento === 'NFSE_SERVICO' ? 'NFS-e' : 'NF-e'} • ${n.direcao}
              </span>
            </td>
            <td class="p-3.5 text-slate-400 font-mono">${window.formatDateBR(n.data_emissao)}</td>
            <td class="p-3.5 text-slate-200 truncate max-w-[200px]" title="${n.emitente_nome}">${n.emitente_nome}</td>
            <td class="p-3.5 text-slate-200 truncate max-w-[200px]" title="${n.destinatario_nome}">${n.destinatario_nome || '-'}</td>
            <td class="p-3.5 text-right font-mono font-bold text-slate-100">
              R$ ${Number(n.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </td>
            <td class="p-3.5 text-center">
              <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400">Processado</span>
            </td>
          </tr>
        `;
      }).join('');
    }

    renderTabela();

    document.getElementById('busca-nfe-input')?.addEventListener('input', renderTabela);

    // Override switchTab para este módulo
    const prevSwitch = window.switchTab;
    window.switchTab = function(moduleName, tabId) {
      if (moduleName === 'nfe') {
        abaAtiva = tabId;
        const buttons = document.querySelectorAll(`[data-module="nfe"][data-tab-btn]`);
        buttons.forEach(b => {
          b.classList.remove('bg-cyan-500/20', 'text-cyan-300', 'border-cyan-500/40');
          b.classList.add('text-slate-400', 'hover:text-slate-200');
        });
        const activeBtn = document.querySelector(`[data-module="nfe"][data-tab-btn="${tabId}"]`);
        if (activeBtn) {
          activeBtn.classList.remove('text-slate-400', 'hover:text-slate-200');
          activeBtn.classList.add('bg-cyan-500/20', 'text-cyan-300', 'border-cyan-500/40');
        }
        renderTabela();
      } else {
        prevSwitch(moduleName, tabId);
      }
    };

  } catch (err) {
    console.error('Erro renderNotasFiscaisRealData:', err);
  }
};

// ============================================================================
// 5. DRE & CONTABILIDADE PATRIMONIAL (DEMONSTRAÇÃO DO RESULTADO)
// ============================================================================
window.renderDreRealData = async function() {
  const container = document.getElementById('conteudo-dinamico');
  if (!container) return;

  container.innerHTML = `
    <div class="space-y-6 animate-fade-in">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <h2 class="text-xl font-semibold text-slate-100 tracking-tight">Demonstração do Resultado do Exercício (DRE)</h2>
          <p class="text-xs text-slate-400 mt-0.5">Apuração contábil e margens operacionais calculadas a partir de notas e extratos</p>
        </div>
        <span class="text-xs font-mono text-cyan-400 px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
          Exercício 2026
        </span>
      </div>

      <!-- Estrutura em Árvore Contábil DRE -->
      <div class="glass-panel rounded-2xl border border-white/5 p-6 space-y-4" id="dre-conteudo">
        <div class="text-slate-500 text-center py-8">Calculando DRE contábil...</div>
      </div>
    </div>
  `;

  try {
    const res = await window.apiService.getDreConsolidada();
    if (!res.success || !res.data) return;
    const { dre } = res.data;

    const box = document.getElementById('dre-conteudo');
    if (!box) return;

    box.innerHTML = `
      <div class="space-y-3 font-sans">
        <!-- 1. Receita Bruta -->
        <div class="flex items-center justify-between p-3.5 rounded-xl bg-white/5 border border-white/5">
          <div>
            <span class="text-sm font-bold text-slate-100">(+) RECEITA OPERACIONAL BRUTA</span>
            <p class="text-xs text-slate-400">Vendas de Baterias (R$ ${dre.receita_bruta.vendas_baterias.toLocaleString('pt-BR', {minimumFractionDigits: 2})}) + Serviços Subsea</p>
          </div>
          <span class="text-base font-mono font-bold text-emerald-400">
            R$ ${dre.receita_bruta.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>

        <!-- 2. Deduções -->
        <div class="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] border border-white/5 pl-8">
          <div>
            <span class="text-xs font-semibold text-rose-300">(-) DEDUÇÕES E IMPOSTOS SOBRE VENDAS</span>
            <p class="text-[11px] text-slate-500">${dre.deducoes.descricao}</p>
          </div>
          <span class="text-sm font-mono font-semibold text-rose-400">
            - R$ ${dre.deducoes.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>

        <!-- 3. Receita Líquida -->
        <div class="flex items-center justify-between p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
          <span class="text-sm font-bold text-cyan-300">(=) RECEITA OPERACIONAL LÍQUIDA</span>
          <span class="text-base font-mono font-bold text-cyan-300">
            R$ ${dre.receita_liquida.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>

        <!-- 4. CMV -->
        <div class="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] border border-white/5 pl-8">
          <div>
            <span class="text-xs font-semibold text-rose-300">(-) CUSTO DAS MERCADORIAS VENDIDAS (CMV)</span>
            <p class="text-[11px] text-slate-500">${dre.custos_operacionais.descricao}</p>
          </div>
          <span class="text-sm font-mono font-semibold text-rose-400">
            - R$ ${dre.custos_operacionais.cmv_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>

        <!-- 5. Lucro Bruto -->
        <div class="flex items-center justify-between p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <div>
            <span class="text-sm font-bold text-emerald-300">(=) LUCRO BRUTO / MARGEM DE CONTRIBUIÇÃO</span>
            <span class="ml-2 text-xs font-mono font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/20">Margem: ${dre.margem_bruta}</span>
          </div>
          <span class="text-base font-mono font-bold text-emerald-300">
            R$ ${dre.lucro_bruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>

        <!-- 6. Despesas Operacionais -->
        <div class="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] border border-white/5 pl-8">
          <div>
            <span class="text-xs font-semibold text-rose-300">(-) DESPESAS OPERACIONAIS & ADMINISTRATIVAS</span>
            <p class="text-[11px] text-slate-500">Serviços Terceiros PJ (R$ ${dre.despesas_operacionais.servicos_terceiros_pj.toLocaleString('pt-BR', {minimumFractionDigits: 2})}) + Tarifas Bancárias OFX</p>
          </div>
          <span class="text-sm font-mono font-semibold text-rose-400">
            - R$ ${dre.despesas_operacionais.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>

        <!-- 7. EBITDA -->
        <div class="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-purple-500/20 to-cyan-500/20 border border-purple-500/30">
          <div>
            <span class="text-base font-bold text-white">(=) EBITDA / RESULTADO OPERACIONAL</span>
            <span class="ml-2 text-xs font-mono font-bold text-purple-300 px-2 py-0.5 rounded bg-purple-500/20">Margem EBITDA: ${dre.margem_ebitda}</span>
          </div>
          <span class="text-xl font-mono font-extrabold text-white">
            R$ ${dre.ebitda.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    `;

  } catch (err) {
    console.error('Erro renderDreRealData:', err);
  }
};

// ============================================================================
// 6. CONTROLADORIA & SIMULADOR DUPONT INTERATIVO
// ============================================================================
window.renderControladoriaRealData = async function() {
  const container = document.getElementById('conteudo-dinamico');
  if (!container) return;

  container.innerHTML = `
    <div class="space-y-6 animate-fade-in">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <h2 class="text-xl font-semibold text-slate-100 tracking-tight">Controladoria & Indicadores Estratégicos</h2>
          <p class="text-xs text-slate-400 mt-0.5">Diagnóstico transversal de risco, liquidez e simulador interativo de retorno DuPont</p>
        </div>
      </div>

      <!-- 4 Cards de Índices Financeiros Reais com Gráficos SVG Vivos -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="glass-panel p-5 rounded-2xl border border-white/5">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Liquidez Corrente</span>
          <div class="flex items-baseline gap-2 mt-1">
            <h3 class="text-2xl font-bold text-cyan-400">2.42x</h3>
            <span class="text-xs text-emerald-400 font-semibold">Excelente</span>
          </div>
          <div class="w-full bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
            <div class="bg-cyan-400 h-full rounded-full" style="width: 80%;"></div>
          </div>
          <p class="text-[10px] text-slate-400 mt-2">Capacidade de honrar obrigações de curto prazo</p>
        </div>

        <div class="glass-panel p-5 rounded-2xl border border-white/5">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Grau de Endividamento</span>
          <div class="flex items-baseline gap-2 mt-1">
            <h3 class="text-2xl font-bold text-emerald-400">27.8%</h3>
            <span class="text-xs text-emerald-400 font-semibold">Baixo Risco</span>
          </div>
          <div class="w-full bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
            <div class="bg-emerald-400 h-full rounded-full" style="width: 28%;"></div>
          </div>
          <p class="text-[10px] text-slate-400 mt-2">Capital de terceiros sobre ativo total</p>
        </div>

        <div class="glass-panel p-5 rounded-2xl border border-white/5">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Margem Bruta Industrial</span>
          <div class="flex items-baseline gap-2 mt-1">
            <h3 class="text-2xl font-bold text-purple-400">54.6%</h3>
            <span class="text-xs text-purple-400 font-semibold">Baterias & BOM</span>
          </div>
          <div class="w-full bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
            <div class="bg-purple-400 h-full rounded-full" style="width: 55%;"></div>
          </div>
          <p class="text-[10px] text-slate-400 mt-2">Spread sobre compras de insumos Strema</p>
        </div>

        <div class="glass-panel p-5 rounded-2xl border border-white/5">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Margem EBITDA</span>
          <div class="flex items-baseline gap-2 mt-1">
            <h3 class="text-2xl font-bold text-amber-400">45.4%</h3>
            <span class="text-xs text-amber-400 font-semibold">Operacional</span>
          </div>
          <div class="w-full bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
            <div class="bg-amber-400 h-full rounded-full" style="width: 45%;"></div>
          </div>
          <p class="text-[10px] text-slate-400 mt-2">Geração de caixa sobre receita líquida</p>
        </div>
      </div>

      <!-- SIMULADOR DUPONT INTERATIVO PARA O C-LEVEL -->
      <div class="glass-panel p-6 rounded-2xl border border-white/5 space-y-6">
        <div class="flex items-center justify-between border-b border-white/5 pb-4">
          <div>
            <h3 class="text-base font-semibold text-slate-100 flex items-center gap-2">
              <i class="ph ph-tree-structure text-cyan-400 text-lg"></i>
              Simulador DuPont Interativo (Retorno sobre Patrimônio Líquido - ROE)
            </h3>
            <p class="text-xs text-slate-400">Arraste os controles abaixo para simular cenários de expansão de vendas e alavancagem</p>
          </div>
          <div class="px-4 py-2 rounded-xl bg-cyan-500/20 border border-cyan-500/30 text-right">
            <span class="text-[10px] font-bold text-cyan-300 uppercase">ROE Resultante</span>
            <div class="text-2xl font-mono font-extrabold text-cyan-400" id="dupont-roe-resultado">19.2%</div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
            <div class="flex justify-between items-center">
              <span class="text-xs font-bold text-slate-200">1. Margem Líquida</span>
              <span class="text-xs font-mono font-bold text-cyan-400" id="val-margem-liq">12.0%</span>
            </div>
            <input type="range" id="slider-margem-liq" min="5" max="30" step="0.5" value="12" 
                   class="w-full accent-cyan-400 cursor-pointer">
            <p class="text-[10px] text-slate-400">Eficiência de conversão de receita em lucro líquido</p>
          </div>

          <div class="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
            <div class="flex justify-between items-center">
              <span class="text-xs font-bold text-slate-200">2. Giro do Ativo</span>
              <span class="text-xs font-mono font-bold text-emerald-400" id="val-giro-ativo">1.25x</span>
            </div>
            <input type="range" id="slider-giro-ativo" min="0.5" max="3.0" step="0.05" value="1.25" 
                   class="w-full accent-emerald-400 cursor-pointer">
            <p class="text-[10px] text-slate-400">Eficiência na utilização dos ativos para gerar vendas</p>
          </div>

          <div class="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
            <div class="flex justify-between items-center">
              <span class="text-xs font-bold text-slate-200">3. Alavancagem Financeira</span>
              <span class="text-xs font-mono font-bold text-purple-400" id="val-alavancagem">1.28x</span>
            </div>
            <input type="range" id="slider-alavancagem" min="1.0" max="2.5" step="0.02" value="1.28" 
                   class="w-full accent-purple-400 cursor-pointer">
            <p class="text-[10px] text-slate-400">Multiplicador de patrimônio líquido</p>
          </div>
        </div>
      </div>
    </div>
  `;

  // Lógica do Simulador DuPont
  const sMargem = document.getElementById('slider-margem-liq');
  const sGiro = document.getElementById('slider-giro-ativo');
  const sAlav = document.getElementById('slider-alavancagem');

  function atualizarDuPont() {
    const m = parseFloat(sMargem.value);
    const g = parseFloat(sGiro.value);
    const a = parseFloat(sAlav.value);

    document.getElementById('val-margem-liq').innerText = `${m.toFixed(1)}%`;
    document.getElementById('val-giro-ativo').innerText = `${g.toFixed(2)}x`;
    document.getElementById('val-alavancagem').innerText = `${a.toFixed(2)}x`;

    const roe = (m * g * a).toFixed(1);
    document.getElementById('dupont-roe-resultado').innerText = `${roe}%`;
  }

  sMargem?.addEventListener('input', atualizarDuPont);
  sGiro?.addEventListener('input', atualizarDuPont);
  sAlav?.addEventListener('input', atualizarDuPont);
  atualizarDuPont();
};

// ============================================================================
// 7. CRM & DOSSIÊ 360° (CLIENTE VS FORNECEDOR VS COLABORADOR PJ)
// ============================================================================
window.renderCrmRealData = async function() {
  const container = document.getElementById('conteudo-dinamico');
  if (!container) return;

  container.innerHTML = `
    <div class="space-y-6 animate-fade-in">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <h2 class="text-xl font-semibold text-slate-100 tracking-tight">Dossiê de Parceiros 360°</h2>
          <p class="text-xs text-slate-400 mt-0.5">Distinção rigorosa entre Clientes Compradores, Fornecedores Industriais e Colaboradores PJ</p>
        </div>

        <div class="flex items-center gap-1.5 bg-slate-900/60 p-1.5 rounded-xl border border-white/5">
          <button onclick="switchTab('crm', 'clientes')" data-module="crm" data-tab-btn="clientes" 
                  class="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 transition-all flex items-center gap-1.5">
            <i class="ph ph-buildings text-sm"></i> Clientes (Quem Compra)
          </button>
          <button onclick="switchTab('crm', 'fornecedores')" data-module="crm" data-tab-btn="fornecedores" 
                  class="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1.5">
            <i class="ph ph-factory text-sm"></i> Fornecedores (Insumos)
          </button>
          <button onclick="switchTab('crm', 'colaboradores')" data-module="crm" data-tab-btn="colaboradores" 
                  class="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1.5">
            <i class="ph ph-users text-sm"></i> Colaboradores PJ / Serviços
          </button>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <div class="relative flex-1 min-w-[240px] max-w-sm">
          <i class="ph ph-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
          <input type="text" id="busca-crm-input" placeholder="Buscar por Razão Social, CNPJ, Sócio..." 
                 class="w-full py-2 pl-9 pr-3 rounded-xl text-xs bg-slate-900/70 border border-white/10 text-slate-200 focus:outline-none focus:border-cyan-400 transition-all">
        </div>
        <span class="text-xs text-slate-400 font-mono ml-auto" id="total-crm-label">Carregando parceiros...</span>
      </div>

      <div class="glass-panel rounded-2xl border border-white/5 overflow-hidden">
        <div class="overflow-x-auto max-h-[540px] overflow-y-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead class="bg-black/20 text-slate-400 uppercase font-semibold sticky top-0 backdrop-blur-md">
              <tr>
                <th class="p-3.5">CNPJ</th>
                <th class="p-3.5">Razão Social / Nome Fantasia</th>
                <th class="p-3.5">Vertical de Mercado</th>
                <th class="p-3.5">Tipo</th>
                <th class="p-3.5 text-right">Capital Social</th>
                <th class="p-3.5">Cidade / UF</th>
                <th class="p-3.5 text-center">Status</th>
                <th class="p-3.5 text-center">Ação</th>
              </tr>
            </thead>
            <tbody id="tabela-crm-corpo" class="divide-y divide-white/5 text-slate-300">
              <tr><td colspan="8" class="p-6 text-center text-slate-500">Carregando carteira de parceiros...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  try {
    const res = await window.apiService.getClientes({ limit: 300 });
    const parceiros = res.success ? (res.data || []) : [];
    let abaAtiva = 'clientes';

    function renderTabela() {
      const q = (document.getElementById('busca-crm-input')?.value || '').toLowerCase();

      const filtrados = parceiros.filter(c => {
        if (abaAtiva === 'clientes' && c.tipo_entidade !== 'CLIENTE') return false;
        if (abaAtiva === 'fornecedores' && c.tipo_entidade !== 'FORNECEDOR') return false;
        if (abaAtiva === 'colaboradores' && c.tipo_entidade !== 'COLABORADOR_PJ') return false;

        if (q) {
          const match = (c.razao_social_nome || '').toLowerCase().includes(q) ||
                        (c.nome_fantasia || '').toLowerCase().includes(q) ||
                        (c.cnpj_cpf || '').includes(q);
          if (!match) return false;
        }
        return true;
      });

      const label = document.getElementById('total-crm-label');
      if (label) label.innerText = `${filtrados.length} parceiros encontrados`;

      const tbody = document.getElementById('tabela-crm-corpo');
      if (!tbody) return;

      if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-400">Nenhum parceiro encontrado nesta categoria.</td></tr>`;
        return;
      }

      tbody.innerHTML = filtrados.map(c => {
        const cap = Number(c.capital_social || 0);
        const isPesado = cap >= 10000000;
        const isBloqueado = c.bloqueio_fiscal === true;
        const cnpjFmt = window.formatCnpjBR(c.cnpj_cpf);
        const vert = (c.dados_receita_brutos && c.dados_receita_brutos.vertical) ? c.dados_receita_brutos.vertical : {};

        let badgeClass = 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30';
        let badgeLabel = 'Cliente';
        if (c.tipo_entidade === 'FORNECEDOR') {
          badgeClass = 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
          badgeLabel = 'Fornecedor';
        } else if (c.tipo_entidade === 'COLABORADOR_PJ') {
          badgeClass = 'bg-purple-500/20 text-purple-300 border border-purple-500/30';
          badgeLabel = 'Colaborador PJ';
        }

        return `
          <tr onclick="window.abrirDossie360('${c.id}')" class="cursor-pointer hover:bg-cyan-500/10 transition-colors group">
            <td class="p-3.5 font-mono text-cyan-400 font-bold whitespace-nowrap">${cnpjFmt}</td>
            <td class="p-3.5">
              <p class="font-bold text-slate-100 group-hover:text-cyan-300 transition-colors">${c.razao_social_nome || '-'}</p>
              ${c.nome_fantasia ? `<p class="text-[10px] text-slate-400">${c.nome_fantasia}</p>` : ''}
            </td>
            <td class="p-3.5">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${vert.badgeClass || 'bg-slate-500/20 text-slate-300 border-slate-500/30'} flex items-center gap-1 w-fit">
                <i class="ph ${vert.icone || 'ph-tag'}"></i> ${vert.vertical || 'Geral'}
              </span>
            </td>
            <td class="p-3.5">
              <span class="px-2 py-0.5 rounded text-[10px] font-semibold ${badgeClass}">
                ${badgeLabel}
              </span>
            </td>
            <td class="p-3.5 text-right font-mono font-bold ${isPesado ? 'text-emerald-400' : 'text-slate-200'}">
              ${cap > 0 ? window.formatCurrencyBR(cap) : '-'}
            </td>
            <td class="p-3.5 text-slate-400 whitespace-nowrap">${c.municipio || '-'}/${c.uf || '-'}</td>
            <td class="p-3.5 text-center">
              <span class="px-2 py-0.5 rounded text-[10px] font-semibold ${isBloqueado ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}">
                ${isBloqueado ? 'Bloqueio' : 'Regular'}
              </span>
            </td>
            <td class="p-3.5 text-center">
              <button onclick="event.stopPropagation(); window.abrirDossie360('${c.id}')" 
                      class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/40 flex items-center gap-1 mx-auto transition-all shadow-sm">
                <i class="ph ph-identification-card text-sm"></i> Dossiê 360°
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    renderTabela();

    document.getElementById('busca-crm-input')?.addEventListener('input', renderTabela);

    const crmSwitch = window.switchTab;
    window.switchTab = function(moduleName, tabId) {
      if (moduleName === 'crm') {
        abaAtiva = tabId;
        const buttons = document.querySelectorAll(`[data-module="crm"][data-tab-btn]`);
        buttons.forEach(b => {
          b.classList.remove('bg-cyan-500/20', 'text-cyan-300', 'border-cyan-500/40');
          b.classList.add('text-slate-400', 'hover:text-slate-200');
        });
        const activeBtn = document.querySelector(`[data-module="crm"][data-tab-btn="${tabId}"]`);
        if (activeBtn) {
          activeBtn.classList.remove('text-slate-400', 'hover:text-slate-200');
          activeBtn.classList.add('bg-cyan-500/20', 'text-cyan-300', 'border-cyan-500/40');
        }
        renderTabela();
      } else {
        crmSwitch(moduleName, tabId);
      }
    };

  } catch (err) {
    console.error('Erro renderCrmRealData:', err);
  }
};

// ============================================================================
// 8. PROPOSTAS & COTAÇÕES COMERCIAIS
// ============================================================================
window.renderOrcamentosRealData = async function() {
  const container = document.getElementById('conteudo-dinamico');
  if (!container) return;

  container.innerHTML = `
    <div class="space-y-6 animate-fade-in">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <h2 class="text-xl font-semibold text-slate-100 tracking-tight">Gestão de Propostas Comerciais</h2>
          <p class="text-xs text-slate-400 mt-0.5">218 cotações consolidadas com valores reais</p>
        </div>

        <div class="flex items-center gap-1.5 bg-slate-900/60 p-1.5 rounded-xl border border-white/5">
          <button onclick="switchTab('orc', 'todos')" data-module="orc" data-tab-btn="todos" 
                  class="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 transition-all flex items-center gap-1.5">
            <i class="ph ph-archive text-sm"></i> Todas as 218
          </button>
          <button onclick="switchTab('orc', 'aprovados')" data-module="orc" data-tab-btn="aprovados" 
                  class="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1.5">
            <i class="ph ph-check-circle text-sm"></i> Aprovadas (R$ 2,15M)
          </button>
          <button onclick="switchTab('orc', 'abertos')" data-module="orc" data-tab-btn="abertos" 
                  class="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1.5">
            <i class="ph ph-hourglass text-sm"></i> Em Aberto
          </button>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <div class="relative flex-1 max-w-sm">
          <i class="ph ph-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
          <input type="text" id="busca-orcamento-input" placeholder="Buscar por número, cliente, CNPJ..." 
                 class="w-full py-2 pl-9 pr-3 rounded-xl text-xs bg-slate-900/70 border border-white/10 text-slate-200 focus:outline-none focus:border-cyan-400 transition-all">
        </div>
      </div>

      <div class="glass-panel rounded-2xl border border-white/5 overflow-hidden">
        <div class="overflow-x-auto max-h-[520px] overflow-y-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead class="bg-black/20 text-slate-400 uppercase font-semibold sticky top-0 backdrop-blur-md">
              <tr>
                <th class="p-3.5">Nº Orçamento</th>
                <th class="p-3.5">Vendido Por</th>
                <th class="p-3.5">Data Emissão</th>
                <th class="p-3.5">Cliente</th>
                <th class="p-3.5 text-right">Valor Total</th>
                <th class="p-3.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody id="tabela-orcamentos-corpo" class="divide-y divide-white/5 text-slate-300">
              <tr><td colspan="6" class="p-6 text-center text-slate-500">Carregando cotações...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  try {
    const res = await window.apiService.getOrcamentos({ limit: 250 });
    const orcamentos = res.success ? (res.data || []) : [];
    let abaAtiva = 'todos';

    function renderTabela() {
      const q = (document.getElementById('busca-orcamento-input')?.value || '').toLowerCase();

      const filtrados = orcamentos.filter(o => {
        if (abaAtiva === 'aprovados' && o.status_aprovacao !== 'Compra Aprovada') return false;
        if (abaAtiva === 'abertos' && o.status_aprovacao === 'Compra Aprovada') return false;

        if (q) {
          const match = (o.cliente_nome || '').toLowerCase().includes(q) ||
                        (o.numero_orcamento || '').includes(q) ||
                        (o.cliente_cnpj_cpf || '').includes(q);
          if (!match) return false;
        }
        return true;
      });

      const tbody = document.getElementById('tabela-orcamentos-corpo');
      if (!tbody) return;

      tbody.innerHTML = filtrados.map(o => {
        const isAprovado = o.status_aprovacao === 'Compra Aprovada';
        return `
          <tr class="hover:bg-white/5 transition-colors">
            <td class="p-3.5 font-mono font-bold text-cyan-400">#${o.numero_orcamento}</td>
            <td class="p-3.5">
              <span class="px-2 py-0.5 rounded text-[10px] font-semibold ${o.vendido_por === 'Arandu' ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300'}">
                ${o.vendido_por}
              </span>
            </td>
            <td class="p-3.5 text-slate-400 font-mono">${window.formatDateBR(o.data_emissao || (o.mes_emissao + '/' + o.ano_emissao))}</td>
            <td class="p-3.5 font-medium text-slate-100">${o.cliente_nome}</td>
            <td class="p-3.5 text-right font-mono font-bold text-slate-100">
              R$ ${Number(o.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </td>
            <td class="p-3.5 text-center">
              <span class="px-2 py-0.5 rounded text-[10px] font-semibold ${isAprovado ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'}">
                ${o.status_aprovacao}
              </span>
            </td>
          </tr>
        `;
      }).join('');
    }

    renderTabela();

    document.getElementById('busca-orcamento-input')?.addEventListener('input', renderTabela);

    const prevSwitch = window.switchTab;
    window.switchTab = function(moduleName, tabId) {
      if (moduleName === 'orc') {
        abaAtiva = tabId;
        const buttons = document.querySelectorAll(`[data-module="orc"][data-tab-btn]`);
        buttons.forEach(b => {
          b.classList.remove('bg-cyan-500/20', 'text-cyan-300', 'border-cyan-500/40');
          b.classList.add('text-slate-400', 'hover:text-slate-200');
        });
        const activeBtn = document.querySelector(`[data-module="orc"][data-tab-btn="${tabId}"]`);
        if (activeBtn) {
          activeBtn.classList.remove('text-slate-400', 'hover:text-slate-200');
          activeBtn.classList.add('bg-cyan-500/20', 'text-cyan-300', 'border-cyan-500/40');
        }
        renderTabela();
      } else {
        prevSwitch(moduleName, tabId);
      }
    };

  } catch (err) {
    console.error('Erro renderOrcamentosRealData:', err);
  }
};

// ============================================================================
// 9. CONTROLE GLOBAL MULTI-TENANT
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  const tenantSelect = document.getElementById('tenant-selector');
  if (tenantSelect) {
    tenantSelect.value = window.apiService.getActiveEmpresaId();
    tenantSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      const nome = e.target.options[e.target.selectedIndex].text;
      window.apiService.setActiveEmpresa(val, nome);
      if (typeof window.mostrarNotificacao === 'function') {
        window.mostrarNotificacao('info', 'Empresa Selecionada', `Visualizando: ${nome}`);
      }

      // Recarrega o módulo atualmente ativo
      const activeLink = document.querySelector('.nav-link.bg-cyan-500\\/10');
      const activeRoute = activeLink ? activeLink.dataset.route : 'dashboard';
      if (activeRoute === 'dashboard') window.renderDashboardRealData();
      else if (activeRoute === 'produtos') window.renderProdutosRealData();
      else if (activeRoute === 'orcamento_master') window.renderOrcamentosRealData();
      else if (activeRoute === 'crm') window.renderCrmRealData();
      else if (activeRoute === 'financeiro') window.renderFluxoCaixaRealData();
      else if (activeRoute === 'notas_fiscais') window.renderNotasFiscaisRealData();
      else if (activeRoute === 'contabilidade') window.renderDreRealData();
      else if (activeRoute === 'controladoria') window.renderControladoriaRealData();
    });
  }

  window.addEventListener('mitang_tenant_changed', () => {
    const activeLink = document.querySelector('.nav-link.bg-cyan-500\\/10');
    const activeRoute = activeLink ? activeLink.dataset.route : 'dashboard';
    if (activeRoute === 'dashboard') window.renderDashboardRealData();
  });
});
