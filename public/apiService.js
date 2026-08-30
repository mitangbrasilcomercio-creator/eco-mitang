// ============================================================================
// API SERVICE: CONECTOR CLIENT-SIDE DO ECO-MITANG ERP
// ============================================================================
//
// MUDANCA DE CONTRATO (backend):
//
// 1. Toda rota de dado agora exige 'Authorization: Bearer <token>'.
//    Sem token, a resposta e HTTP 401.
//
// 2. O tenant NAO e mais escolhido pelo navegador. O token carrega a lista de
//    CNPJs que o usuario pode acessar; 'x-empresa-id' virou apenas uma *selecao*
//    dentro dessa lista. Um CNPJ fora dela devolve HTTP 403.
//    Antes, qualquer pessoa trocava o localStorage e via os dados de qualquer
//    empresa da holding -- e o valor ia direto para dentro do SQL.
//
// 3. A lista de empresas do seletor deve vir de GET /auth/me, e nao de um UUID
//    fixo no codigo.
//
// Esta camada trata apenas do transporte (token, cabecalhos, 401).
// A tela de login e o seletor de empresas sao trabalho da camada de UI.
// ============================================================================

class ApiService {
  constructor() {
    this.baseURL = '/api/v1';
    this.tokenKey = 'mitang_token';
    this.usuarioKey = 'mitang_usuario';
  }

  // -------------------------------------------------------------------------
  // Sessao
  // -------------------------------------------------------------------------
  getToken() {
    try {
      return localStorage.getItem(this.tokenKey);
    } catch {
      return null;
    }
  }

  estaAutenticado() {
    return !!this.getToken();
  }

  getUsuario() {
    try {
      const bruto = localStorage.getItem(this.usuarioKey);
      return bruto ? JSON.parse(bruto) : null;
    } catch {
      return null;
    }
  }

  /** Empresas que ESTE usuario pode acessar. Base do seletor de CNPJ. */
  getEmpresasPermitidas() {
    const u = this.getUsuario();
    return u && Array.isArray(u.empresas) ? u.empresas : [];
  }

  podeVisaoConsolidada() {
    const u = this.getUsuario();
    return !!(u && u.pode_visao_consolidada);
  }

  async login(email, senha) {
    const res = await fetch(`${this.baseURL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha })
    });
    const data = await res.json();

    if (!data.success) return data;

    try {
      localStorage.setItem(this.tokenKey, data.data.token);
      localStorage.setItem(this.usuarioKey, JSON.stringify(data.data.usuario));

      // Seleciona o primeiro CNPJ permitido, ou a visao consolidada.
      const empresas = data.data.usuario.empresas || [];
      const consolidado = data.data.usuario.pode_visao_consolidada;
      if (consolidado) {
        this.setActiveEmpresa('all', 'Holding (consolidado)');
      } else if (empresas.length > 0) {
        this.setActiveEmpresa(empresas[0].id, empresas[0].nome_fantasia);
      }
    } catch (e) {
      console.warn('[API] Nao foi possivel guardar a sessao:', e.message);
    }
    return data;
  }

  logout() {
    try {
      localStorage.removeItem(this.tokenKey);
      localStorage.removeItem(this.usuarioKey);
      localStorage.removeItem('mitang_active_empresa');
      localStorage.removeItem('mitang_active_empresa_nome');
    } catch { /* ignora */ }
    window.dispatchEvent(new CustomEvent('mitang_sessao_encerrada'));
  }

  // -------------------------------------------------------------------------
  // Tenant selecionado
  // -------------------------------------------------------------------------
  getActiveEmpresaId() {
    try {
      // Sem default fixo: se nao ha selecao, o backend usa o primeiro CNPJ do
      // token. O UUID da Mitang Brasil nao fica mais escrito no codigo.
      return localStorage.getItem('mitang_active_empresa') || '';
    } catch {
      return '';
    }
  }

  getActiveEmpresaNome() {
    try {
      return localStorage.getItem('mitang_active_empresa_nome') || '';
    } catch {
      return '';
    }
  }

  setActiveEmpresa(id, nome) {
    try {
      localStorage.setItem('mitang_active_empresa', id);
      localStorage.setItem('mitang_active_empresa_nome', nome || '');
    } catch { /* ignora */ }
    window.dispatchEvent(new CustomEvent('mitang_tenant_changed', { detail: { id, nome } }));
  }

  // -------------------------------------------------------------------------
  // Transporte
  // -------------------------------------------------------------------------
  async request(endpoint, options = {}) {
    const token = this.getToken();
    const empresaId = this.getActiveEmpresaId();

    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(empresaId ? { 'x-empresa-id': empresaId } : {}),
      ...(options.headers || {})
    };

    try {
      const res = await fetch(`${this.baseURL}${endpoint}`, { ...options, headers });

      // Sessao expirada ou ausente: limpa e avisa a UI, em vez de deixar a tela
      // com dados velhos e sem explicacao.
      if (res.status === 401) {
        this.logout();
        window.dispatchEvent(new CustomEvent('mitang_nao_autenticado'));
        return { success: false, error: 'Sessao expirada. Faca login novamente.', code: 'NAO_AUTENTICADO' };
      }

      if (res.status === 403) {
        const corpo = await res.json().catch(() => ({}));
        window.dispatchEvent(new CustomEvent('mitang_acesso_negado', { detail: corpo }));
        return { success: false, error: corpo.error || 'Acesso negado.', code: corpo.code || 'ACESSO_NEGADO' };
      }

      return await res.json();
    } catch (err) {
      console.error(`[API Error] ${endpoint}:`, err);
      return { success: false, error: err.message, code: 'ERRO_REDE' };
    }
  }

  // -------------------------------------------------------------------------
  // Endpoints
  // -------------------------------------------------------------------------
  async getPerfil() {
    return this.request('/auth/me');
  }

  async getDashboardMetrics(params = {}) {
    return this.request(`/dashboard/metrics?${new URLSearchParams(params)}`);
  }

  async getProdutos(params = {}) {
    return this.request(`/catalogo?${new URLSearchParams(params)}`);
  }

  async getClientes(params = {}) {
    return this.request(`/clientes?${new URLSearchParams(params)}`);
  }

  async getDossieCliente(id) {
    return this.request(`/clientes/${id}/dossie`);
  }

  async getOrcamentos(params = {}) {
    return this.request(`/orcamentos?${new URLSearchParams(params)}`);
  }

  async getOrcamentoDetalhe(numero) {
    return this.request(`/orcamentos/${encodeURIComponent(numero)}`);
  }

  async getOrcamento(numero) {
    return this.getOrcamentoDetalhe(numero);
  }

  async getTransacoesFinanceiras(params = {}) {
    return this.request(`/financeiro/transacoes?${new URLSearchParams(params)}`);
  }

  async getNotasFiscais(params = {}) {
    return this.request(`/faturamento/notas?${new URLSearchParams(params)}`);
  }

  async getNotaFiscal(id) {
    return this.request(`/faturamento/notas/${id}`);
  }

  async getResumoCaixa(params = {}) {
    return this.request(`/financeiro/resumo-caixa?${new URLSearchParams(params)}`);
  }

  async getDreConsolidada(params = {}) {
    return this.request(`/contabilidade/dre?${new URLSearchParams(params)}`);
  }

  async getContasAPagar(params = {}) {
    return this.request(`/financeiro/contas-a-pagar?${new URLSearchParams(params)}`);
  }

  async getProjecaoFutura(params = {}) {
    return this.request(`/financeiro/projecao-futura?${new URLSearchParams(params)}`);
  }

  async getCategoriasFinanceiras() {
    return this.request('/financeiro/categorias');
  }

  async categorizarTransacao(dados = {}) {
    return this.request('/financeiro/categorizar-transacao', {
      method: 'POST',
      body: JSON.stringify(dados)
    });
  }
}

window.apiService = new ApiService();
