// ============================================================================
// API SERVICE: CONECTOR CLIENT-SIDE DO ECO-MITANG ERP (SUPABASE / REST API)
// ============================================================================

class ApiService {
  constructor() {
    this.baseURL = '/api/v1';
    // Tenant padrão (Mitang Brasil / Mitang Power)
    if (!localStorage.getItem('mitang_active_empresa')) {
      localStorage.setItem('mitang_active_empresa', '29ea0857-7cf7-44e1-ba36-a3f323c4670c');
      localStorage.setItem('mitang_active_empresa_nome', 'Mitang Brasil (Baterias)');
    }
  }

  getActiveEmpresaId() {
    return localStorage.getItem('mitang_active_empresa') || '29ea0857-7cf7-44e1-ba36-a3f323c4670c';
  }

  getActiveEmpresaNome() {
    return localStorage.getItem('mitang_active_empresa_nome') || 'Mitang Brasil (Baterias)';
  }

  setActiveEmpresa(id, nome) {
    localStorage.setItem('mitang_active_empresa', id);
    localStorage.setItem('mitang_active_empresa_nome', nome);
    window.dispatchEvent(new CustomEvent('mitang_tenant_changed', { detail: { id, nome } }));
  }

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'x-empresa-id': this.getActiveEmpresaId(),
      ...(options.headers || {})
    };

    try {
      const res = await fetch(`${this.baseURL}${endpoint}`, { ...options, headers });
      const data = await res.json();
      return data;
    } catch (err) {
      console.error(`[API Error] ${endpoint}:`, err);
      return { success: false, error: err.message };
    }
  }

  // 1. Métricas do Dashboard Executivo
  async getDashboardMetrics(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/dashboard/metrics?${query}`);
  }

  // 2. Catálogo de Baterias e Produtos
  async getProdutos(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/catalogo?${query}`);
  }

  // 3. Clientes & Inteligência de CNPJ
  async getClientes(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/clientes?${query}`);
  }

  // 4. Base Histórica de Cotações e Orçamentos
  async getOrcamentos(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/orcamentos?${query}`);
  }

  async getOrcamentoDetalhe(numero) {
    return this.request(`/orcamentos/${numero}`);
  }

  async getOrcamento(numero) {
    return this.getOrcamentoDetalhe(numero);
  }

  // 5. Transações Bancárias Conciliadas (OFX Itaú e Bradesco)
  async getTransacoesFinanceiras(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/financeiro/transacoes?${query}`);
  }

  // 6. Documentos Fiscais Eletrônicos (NF-e e NFS-e)
  async getNotasFiscais(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/faturamento/notas?${query}`);
  }

  // 7. Resumo de Caixa e Previsibilidade Financeira
  async getResumoCaixa() {
    return this.request('/financeiro/resumo-caixa');
  }

  // 8. Demonstração do Resultado do Exercício (DRE)
  async getDreConsolidada(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/contabilidade/dre?${query}`);
  }

  // 9. Dossiê 360° Completo do Parceiro (Cadastral, Histórico, NF-e, Cotações, Produtos)
  async getDossieCliente(id) {
    return this.request(`/clientes/${id}/dossie`);
  }
}

window.apiService = new ApiService();
