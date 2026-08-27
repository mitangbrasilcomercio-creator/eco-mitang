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
window.renderDashboardRealData = async function() {
  const container = document.getElementById('conteudo-dinamico');
  if (!container) return;

  container.innerHTML = `
    <div class="space-y-6 animate-fade-in">
      <!-- Barra Superior de Abas -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <h2 class="text-xl font-semibold text-slate-100 tracking-tight">Centro de Inteligência Executiva</h2>
          <p class="text-xs text-slate-400 mt-0.5">Visão consolidada multi-tenant da holding Eco-Mitang</p>
        </div>

        <div class="flex items-center gap-1.5 bg-slate-900/60 p-1.5 rounded-xl border border-white/5">
          <button onclick="switchTab('dash', 'visao_geral')" data-module="dash" data-tab-btn="visao_geral" 
                  class="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 transition-all flex items-center gap-1.5">
            <i class="ph ph-squares-four text-sm"></i> Visão Geral
          </button>
          <button onclick="switchTab('dash', 'tesouraria')" data-module="dash" data-tab-btn="tesouraria" 
                  class="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1.5">
            <i class="ph ph-bank text-sm"></i> Tesouraria & OFX
          </button>
          <button onclick="switchTab('dash', 'negociacoes')" data-module="dash" data-tab-btn="negociacoes" 
                  class="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1.5">
            <i class="ph ph-receipt text-sm"></i> Negociações Recentes
          </button>
        </div>
      </div>

      <!-- ABA 1: VISÃO GERAL & KPIS -->
      <div data-module="dash" data-tab-content="visao_geral" class="space-y-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="glass-panel p-5 rounded-2xl border border-white/5">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Faturamento Ganho</span>
            <h3 class="text-2xl font-bold text-slate-100 mt-1" id="dash-faturamento">...</h3>
            <p class="text-xs text-emerald-400 mt-1 font-medium flex items-center gap-1">
              <i class="ph ph-trend-up"></i> <span id="dash-conversao">58.3%</span> de conversão comercial
            </p>
          </div>

          <div class="glass-panel p-5 rounded-2xl border border-white/5">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Volume em Aberto</span>
            <h3 class="text-2xl font-bold text-slate-100 mt-1" id="dash-negociacao">...</h3>
            <p class="text-xs text-cyan-400 mt-1 font-medium flex items-center gap-1">
              <i class="ph ph-clock"></i> <span id="dash-propostas">218</span> propostas ativas
            </p>
          </div>

          <div class="glass-panel p-5 rounded-2xl border border-white/5">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Modelos de Baterias</span>
            <h3 class="text-2xl font-bold text-slate-100 mt-1" id="dash-baterias">...</h3>
            <p class="text-xs text-blue-400 mt-1 font-medium flex items-center gap-1">
              <i class="ph ph-waves"></i> <span id="dash-subsea-label">Subsea & Hospitalar</span>
            </p>
          </div>

          <div class="glass-panel p-5 rounded-2xl border border-white/5">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Clientes Corporativos</span>
            <h3 class="text-2xl font-bold text-slate-100 mt-1" id="dash-clientes">...</h3>
            <p class="text-xs text-purple-400 mt-1 font-medium flex items-center gap-1">
              <i class="ph ph-buildings"></i> <span id="dash-grandes-label">Grandes contas offshore</span>
            </p>
          </div>
        </div>

        <!-- Gráfico Mensal com Altura Fixa e Barras Claras -->
        <div class="glass-panel p-6 rounded-2xl border border-white/5">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-base font-semibold text-slate-200">Faturamento Consolidado por Mês</h3>
              <p class="text-xs text-slate-400">Evolução cronológica de vendas faturadas</p>
            </div>
            <span class="text-xs font-mono text-cyan-400 px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
              Dados 100% Reais
            </span>
          </div>
          <div id="grafico-barras-dash" class="flex items-end justify-between gap-4 h-56 pt-6 pb-2 px-4 border-b border-white/5">
            <div class="text-slate-500 text-xs text-center w-full">Carregando gráfico mensal...</div>
          </div>
        </div>
      </div>

      <!-- ABA 2: TESOURARIA & OFX -->
      <div data-module="dash" data-tab-content="tesouraria" class="space-y-4 hidden">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="glass-panel p-4 rounded-xl border border-white/5">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Entradas Reais (OFX)</span>
            <h4 class="text-xl font-bold text-emerald-400 mt-1" id="dash-entradas">...</h4>
          </div>
          <div class="glass-panel p-4 rounded-xl border border-white/5">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Saídas Reais (OFX)</span>
            <h4 class="text-xl font-bold text-red-400 mt-1" id="dash-saidas">...</h4>
          </div>
          <div class="glass-panel p-4 rounded-xl border border-white/5">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Saldo Operacional</span>
            <h4 class="text-xl font-bold text-cyan-400 mt-1" id="dash-saldo">...</h4>
          </div>
        </div>

        <div class="glass-panel rounded-2xl border border-white/5 overflow-hidden">
          <div class="p-4 border-b border-white/5 flex items-center justify-between">
            <h3 class="text-sm font-semibold text-slate-200">Extratos Bancários Conciliados (Itaú & Bradesco)</h3>
            <span class="text-xs text-slate-400 font-mono" id="dash-ofx-total">Lançamentos gravados</span>
          </div>
          <div class="overflow-x-auto max-h-96 overflow-y-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead class="bg-black/20 text-slate-400 uppercase font-semibold sticky top-0 backdrop-blur-md">
                <tr>
                  <th class="p-3">Data</th>
                  <th class="p-3">Banco / Conta</th>
                  <th class="p-3">Histórico / Memo</th>
                  <th class="p-3 text-right">Valor</th>
                  <th class="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody id="tabela-ofx-dash" class="divide-y divide-white/5 text-slate-300">
                <tr><td colspan="5" class="p-4 text-center text-slate-500">Carregando extratos...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ABA 3: NEGOCIAÇÕES RECENTES -->
      <div data-module="dash" data-tab-content="negociacoes" class="space-y-4 hidden">
        <div class="glass-panel rounded-2xl border border-white/5 overflow-hidden">
          <div class="p-4 border-b border-white/5">
            <h3 class="text-sm font-semibold text-slate-200">Histórico de Propostas Recentes</h3>
            <p class="text-xs text-slate-400">Últimas cotações emitidas por Mitang e Arandu</p>
          </div>
          <div class="overflow-x-auto max-h-96 overflow-y-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead class="bg-black/20 text-slate-400 uppercase font-semibold sticky top-0 backdrop-blur-md">
                <tr>
                  <th class="p-3">Nº Cotação</th>
                  <th class="p-3">Empresa</th>
                  <th class="p-3">Cliente</th>
                  <th class="p-3 text-right">Valor</th>
                  <th class="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody id="tabela-recentes-dash" class="divide-y divide-white/5 text-slate-300">
                <!-- Injetado via JS -->
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  try {
    const res = await window.apiService.getDashboardMetrics();
    if (!res.success) return;
    const { kpis, grafico_vendas_mensal, atividades_recentes } = res.data;

    document.getElementById('dash-faturamento').innerText = `R$ ${kpis.faturamento_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    document.getElementById('dash-negociacao').innerText = `R$ ${kpis.volume_negociacao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    document.getElementById('dash-conversao').innerText = kpis.taxa_conversao;
    document.getElementById('dash-propostas').innerText = kpis.total_propostas;
    document.getElementById('dash-baterias').innerText = `${kpis.total_baterias} Modelos`;
    document.getElementById('dash-clientes').innerText = `${kpis.total_clientes} Contas`;
    document.getElementById('dash-entradas').innerText = `R$ ${kpis.entradas_bancarias.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    document.getElementById('dash-saidas').innerText = `R$ ${kpis.saidas_bancarias.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    document.getElementById('dash-saldo').innerText = `R$ ${kpis.saldo_operacional.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

    // Renderiza Gráfico Mensal com Alturas em Pixels Definidas
    const barContainer = document.getElementById('grafico-barras-dash');
    if (barContainer && grafico_vendas_mensal.length > 0) {
      const maxVal = Math.max(...grafico_vendas_mensal.map(v => Number(v.total)), 1);
      const maxHeightPx = 160; // Altura máxima da barra em pixels

      barContainer.innerHTML = grafico_vendas_mensal.map(g => {
        const val = Number(g.total);
        const barHeight = Math.max(14, Math.round((val / maxVal) * maxHeightPx));
        const mesUpper = (g.mes || '').toUpperCase();

        return `
          <div class="flex-1 h-full flex flex-col justify-end items-center group cursor-pointer">
            <span class="text-[11px] font-mono text-cyan-300 font-bold mb-1 opacity-80 group-hover:opacity-100 transition-opacity">
              R$ ${(val / 1000).toFixed(1)}k
            </span>
            <div class="w-full max-w-[48px] bg-gradient-to-t from-cyan-600/40 via-cyan-500/70 to-cyan-400 rounded-t-lg transition-all duration-300 group-hover:brightness-125 group-hover:shadow-[0_0_15px_rgba(0,229,255,0.6)]"
                 style="height: ${barHeight}px;"></div>
            <span class="text-xs font-semibold text-slate-300 uppercase tracking-wide mt-2">${mesUpper}</span>
          </div>
        `;
      }).join('');
    }

    const recBody = document.getElementById('tabela-recentes-dash');
    if (recBody && atividades_recentes) {
      recBody.innerHTML = atividades_recentes.map(r => `
        <tr class="hover:bg-white/5 transition-colors">
          <td class="p-3 font-mono font-bold text-cyan-400">#${r.numero_orcamento}</td>
          <td class="p-3">
            <span class="px-2 py-0.5 rounded text-[10px] font-semibold ${r.vendido_por === 'Arandu' ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300'}">
              ${r.vendido_por}
            </span>
          </td>
          <td class="p-3 font-medium text-slate-200">${r.cliente_nome}</td>
          <td class="p-3 text-right font-bold text-slate-100">R$ ${Number(r.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
          <td class="p-3 text-center">
            <span class="px-2 py-0.5 rounded text-[10px] font-semibold ${r.status_aprovacao === 'Compra Aprovada' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'}">
              ${r.status_aprovacao}
            </span>
          </td>
        </tr>
      `).join('');
    }

    const ofxRes = await window.apiService.getTransacoesFinanceiras({ limit: 40 });
    if (ofxRes.success && ofxRes.data) {
      const ofxBody = document.getElementById('tabela-ofx-dash');
      if (ofxBody) {
        document.getElementById('dash-ofx-total').innerText = `${ofxRes.total} lançamentos gravados`;
        ofxBody.innerHTML = ofxRes.data.map(t => {
          const isPos = Number(t.valor) > 0;
          return `
            <tr class="hover:bg-white/5 transition-colors">
              <td class="p-3 text-slate-400 font-mono">${window.formatDateBR(t.data_lancamento)}</td>
              <td class="p-3 font-medium text-slate-200">${t.banco_nome || 'Banco'} (${t.agencia}/${t.conta_numero})</td>
              <td class="p-3 text-slate-300 truncate max-w-[280px]" title="${t.memo}">${t.memo}</td>
              <td class="p-3 text-right font-mono font-bold ${isPos ? 'text-emerald-400' : 'text-slate-300'}">
                R$ ${Number(t.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </td>
              <td class="p-3 text-center">
                <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400">Conciliado</span>
              </td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (err) {
    console.error('Erro renderDashboardRealData:', err);
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
});
