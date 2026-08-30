/**
 * login.js - Controlador de Autenticação Deep Sea UI
 * Integração client-side com POST /api/v1/auth/login via apiService
 */

window.initLoginModule = function() {
  const form = document.getElementById('form-login');
  const inputUsuario = document.getElementById('input-usuario');
  const inputSenha = document.getElementById('input-senha');
  const feedback = document.getElementById('login-feedback');
  const btnSubmit = document.getElementById('btn-submit-login');
  const textoBtn = document.getElementById('texto-btn-login');
  const iconeBtn = document.getElementById('icone-btn-login');

  if (!form) return;

  // Foco no primeiro campo
  if (inputUsuario) {
    setTimeout(() => inputUsuario.focus(), 150);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = inputUsuario?.value?.trim() || '';
    const senha = inputSenha?.value || '';

    if (!email || !senha) {
      exibirFeedback('Por favor, preencha o e-mail e a senha corporativa.', 'erro');
      return;
    }

    // Estado de Carregamento
    setLoading(true);
    limparFeedback();

    try {
      const res = await window.apiService.login(email, senha);

      if (!res.success) {
        setLoading(false);
        const msg = res.error || 'Credenciais inválidas. Verifique seu e-mail e senha.';
        exibirFeedback(msg, 'erro');
        if (inputSenha) {
          inputSenha.value = '';
          inputSenha.focus();
        }
        return;
      }

      // Sucesso na Autenticação
      exibirFeedback('Autenticado com sucesso! Carregando centro de controle...', 'sucesso');

      if (window.mostrarNotificacao) {
        window.mostrarNotificacao('sucesso', 'Acesso Concedido', `Bem-vindo(a), ${res.data?.usuario?.nome || 'Usuário'}!`);
      }

      // Notificar aplicação para reconfigurar UI (perfil, seletor de tenants, sidebar)
      window.dispatchEvent(new CustomEvent('mitang_autenticado_sucesso', { detail: res.data }));

      // Transição suave para o dashboard após breve delay visual
      setTimeout(() => {
        if (typeof window.navegarParaRota === 'function') {
          window.navegarParaRota('dashboard');
        } else if (window.location.hash) {
          window.location.hash = '#dashboard';
        }
      }, 400);

    } catch (err) {
      setLoading(false);
      exibirFeedback(`Erro de conexão com o servidor: ${err.message}`, 'erro');
    }
  });

  function setLoading(carregando) {
    if (!btnSubmit) return;
    btnSubmit.disabled = carregando;

    if (carregando) {
      btnSubmit.classList.add('opacity-75', 'cursor-not-allowed');
      if (textoBtn) textoBtn.innerText = 'Autenticando...';
      if (iconeBtn) iconeBtn.className = 'ph ph-spinner animate-spin text-lg';
    } else {
      btnSubmit.classList.remove('opacity-75', 'cursor-not-allowed');
      if (textoBtn) textoBtn.innerText = 'Autenticar Sistema';
      if (iconeBtn) iconeBtn.className = 'ph ph-sign-in text-lg group-hover:translate-x-1 transition-transform';
    }
  }

  function exibirFeedback(mensagem, tipo = 'erro') {
    if (!feedback) return;
    feedback.classList.remove('hidden', 'text-red-400', 'bg-red-500/10', 'border-red-500/20', 'text-emerald-400', 'bg-emerald-500/10', 'border-emerald-500/20');
    
    if (tipo === 'sucesso') {
      feedback.classList.add('text-emerald-400', 'bg-emerald-500/10', 'border', 'border-emerald-500/20');
    } else {
      feedback.classList.add('text-red-400', 'bg-red-500/10', 'border', 'border-red-500/20');
    }

    feedback.innerText = mensagem;
  }

  function limparFeedback() {
    if (!feedback) return;
    feedback.classList.add('hidden');
    feedback.innerText = '';
  }
};
