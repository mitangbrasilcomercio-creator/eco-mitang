// ==========================================
// 1. Funções de Suporte ao Perfil e Tenancy
// ==========================================
function atualizarPerfilUsuario() {
    if (!window.apiService || typeof window.apiService.getUsuario !== 'function') return;
    const usuario = window.apiService.getUsuario();
    if (!usuario) return;

    const nome = usuario.nome || 'Diego Ribeiro';
    const partes = nome.trim().split(/\s+/);
    const iniciais = partes.length > 1
        ? `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase()
        : partes[0].slice(0, 2).toUpperCase();

    const avatarEl = document.getElementById('user-avatar-initials');
    if (avatarEl) avatarEl.innerText = iniciais;

    const nameEl = document.getElementById('user-display-name');
    if (nameEl) nameEl.innerText = nome;

    const roleMap = {
        'Gestor_CLevel': 'Diretoria • C-Level',
        'Financeiro': 'Controladoria & Finanças',
        'Vendedor': 'Comercial & Vendas',
        'Operacional': 'Engenharia & Operações'
    };

    const roleEl = document.getElementById('user-display-role');
    if (roleEl) roleEl.innerText = roleMap[usuario.papel] || usuario.papel || 'Colaborador';

    // RBAC: Mostrar botão de reset apenas para Gestor_CLevel
    const btnReset = document.getElementById('btn-resetar-dados');
    if (btnReset) {
        if (usuario.papel === 'Gestor_CLevel') {
            btnReset.classList.remove('hidden');
        } else {
            btnReset.classList.add('hidden');
        }
    }
}

function atualizarSeletorTenants() {
    if (!window.apiService) return;
    const selector = document.getElementById('tenant-selector');
    if (!selector) return;

    const empresas = window.apiService.getEmpresasPermitidas();
    const podeConsolidado = window.apiService.podeVisaoConsolidada();
    const activeId = window.apiService.getActiveEmpresaId();

    selector.innerHTML = '';

    if (podeConsolidado) {
        const optAll = document.createElement('option');
        optAll.value = 'all';
        optAll.className = 'bg-slate-900 text-slate-200';
        optAll.innerText = 'Holding Eco-Mitang (Consolidado)';
        selector.appendChild(optAll);
    }

    empresas.forEach(emp => {
        const opt = document.createElement('option');
        opt.value = emp.id;
        opt.className = 'bg-slate-900 text-slate-200';
        const docFormatado = emp.cnpj ? ` (${window.formatCnpjBR ? window.formatCnpjBR(emp.cnpj) : emp.cnpj})` : '';
        opt.innerText = `${emp.nome_fantasia || emp.razao_social}${docFormatado}`;
        selector.appendChild(opt);
    });

    if (activeId) {
        selector.value = activeId;
    } else if (selector.options.length > 0) {
        selector.selectedIndex = 0;
        const selOpt = selector.options[0];
        window.apiService.setActiveEmpresa(selOpt.value, selOpt.innerText);
    }

    selector.onchange = (e) => {
        const sel = e.target;
        const id = sel.value;
        const nome = sel.options[sel.selectedIndex]?.innerText || '';
        window.apiService.setActiveEmpresa(id, nome);
    };
}

// ==========================================
// 2. Motor SPA (Single Page Application)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const conteudoDinamico = document.getElementById('conteudo-dinamico');
    const headerTitle = document.getElementById('header-title');
    const sidebarApp = document.getElementById('sidebar-app');
    const headerApp = document.getElementById('header-app');
    const navLinks = document.querySelectorAll('.nav-link');
    const classesAtivas = ['bg-cyan-500/10', 'dark:bg-cyan-400/10', 'text-cyan-600', 'dark:text-cyan-400', 'font-medium'];

    const titulosRotas = {
        'dashboard': 'Dashboard Executivo',
        'produtos': 'Catálogo de Baterias & Ficha BOM',
        'orcamento_master': 'Propostas & Contratos Comerciais',
        'crm': 'CRM & Gestão de Clientes 360°',
        'financeiro': 'Fluxo de Caixa & Tesouraria',
        'notas_fiscais': 'Notas Fiscais Eletrônicas (172 XMLs)',
        'contabilidade': 'Demonstração do Resultado do Exercício (DRE)',
        'controladoria': 'Controladoria & Diagnóstico DuPont',
        'arquivos': 'Gestor de Arquivos & Extrator',
        'colaboradores': 'Colaboradores & Folha PJ',
        'planilha': 'Editor de Dados & Banco',
        'operacoes': 'Engenharia & Operações Subsea',
        'compras': 'Compras & Suprimentos',
        'relatorios': 'Relatórios Técnicos (DPR/FAT)',
        'compliance': 'Compliance & Certidões CNDs',
        'parametros': 'Parâmetros & Configurações',
        'login': 'Acesso Corporativo'
    };

    let rotaAtual = 'dashboard';

    // Função auxiliar para carregar scripts modulares isolados
    function carregarScriptModular(idScript, src, initFunction) {
        if (!document.getElementById(idScript)) {
            const script = document.createElement('script');
            script.id = idScript;
            script.src = src;
            script.onload = () => {
                if (typeof window[initFunction] === 'function') window[initFunction]();
            };
            document.body.appendChild(script);
        } else {
            if (typeof window[initFunction] === 'function') window[initFunction]();
        }
    }

    async function carregarRota(rota) {
        // Guarda de Autenticação Real:
        const estaAuth = window.apiService && window.apiService.estaAutenticado();

        if (!estaAuth && rota !== 'login') {
            console.warn('[ROTA GUARD] Usuário não autenticado. Redirecionando para login.');
            carregarRota('login');
            return;
        }

        rotaAtual = rota;

        // Se estiver em login, oculta sidebar e header para isolamento visual
        if (rota === 'login') {
            if (sidebarApp) sidebarApp.style.display = 'none';
            if (headerApp) headerApp.style.display = 'none';
        } else {
            if (sidebarApp) sidebarApp.style.display = 'flex';
            if (headerApp) headerApp.style.display = 'flex';
            atualizarPerfilUsuario();
            atualizarSeletorTenants();
        }

        try {
            const response = await fetch(`${rota}.html`);
            if (!response.ok) throw new Error('Página não encontrada ou servidor local inativo.');
            
            const html = await response.text();
            conteudoDinamico.innerHTML = html;
            
            if (titulosRotas[rota] && headerTitle) {
                headerTitle.innerHTML = titulosRotas[rota];
            }

            // Marca o link ativo no menu (exceto para login)
            if (rota !== 'login') {
                navLinks.forEach(link => {
                    if (link.dataset.route === rota) {
                        link.classList.add(...classesAtivas);
                    } else {
                        link.classList.remove(...classesAtivas);
                    }
                });
            }

            // ==========================================
            // Gatilhos de Renderização de Dados Reais do Eco-Mitang ERP
            // ==========================================
            if (rota === 'dashboard' && typeof window.renderDashboardRealData === 'function') {
                window.renderDashboardRealData();
            } else if (rota === 'produtos' && typeof window.renderProdutosRealData === 'function') {
                window.renderProdutosRealData();
            } else if (rota === 'orcamento_master' && typeof window.renderOrcamentosRealData === 'function') {
                window.renderOrcamentosRealData();
            } else if (rota === 'arquivos') {
                carregarScriptModular('script-arquivos', 'arquivos.js', 'initArquivosModule');
            } else if (rota === 'login') {
                carregarScriptModular('script-login', 'login.js', 'initLoginModule');
            } else if (rota === 'colaboradores') {
                carregarScriptModular('script-colaboradores', 'colaboradores.js', 'initColaboradoresModule');
            } else if (rota === 'planilha') {
                carregarScriptModular('script-planilha', 'planilha.js', 'initPlanilhaModule');
            } else if (rota === 'notas_fiscais' && typeof window.renderNotasFiscaisRealData === 'function') {
                window.renderNotasFiscaisRealData();
            } else if (rota === 'contabilidade' && typeof window.renderDreRealData === 'function') {
                window.renderDreRealData();
            } else if (rota === 'financeiro' && typeof window.renderFluxoCaixaRealData === 'function') {
                window.renderFluxoCaixaRealData();
            } else if (rota === 'controladoria' && typeof window.renderControladoriaRealData === 'function') {
                window.renderControladoriaRealData();
            } else if (rota === 'crm' && typeof window.renderCrmRealData === 'function') {
                window.renderCrmRealData();
            } else if (rota === 'operacoes') {
                carregarScriptModular('script-operacoes', 'operacoes.js', 'initOperacoesModule');
            } else if (rota === 'compras') {
                carregarScriptModular('script-compras', 'compras.js', 'initComprasModule');
            } else if (rota === 'relatorios') {
                carregarScriptModular('script-relatorios', 'relatorios.js', 'initRelatoriosModule');
            } else if (rota === 'compliance') {
                carregarScriptModular('script-compliance', 'compliance.js', 'initComplianceModule');
            } else if (rota === 'parametros') {
                carregarScriptModular('script-parametros', 'parametros.js', 'initParametrosModule');
            }

        } catch (error) {
            conteudoDinamico.innerHTML = `
                <div class="glass-panel p-6 rounded-2xl border-red-500/30 text-red-400 m-6">
                    <h2 class="text-xl font-medium mb-2">Erro ao carregar módulo</h2>
                    <p class="text-sm text-slate-400">${error.message}</p>
                </div>
            `;
        }
    }

    // Expor função de navegação globalmente
    window.navegarParaRota = carregarRota;

    // Configuração dos links de navegação
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            carregarRota(link.dataset.route);
        });
    });

    // Botão de Logout
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            if (confirm('Deseja realmente encerrar sua sessão corporativa?')) {
                window.apiService.logout();
            }
        });
    }

    // ==========================================
    // Eventos do Sistema & apiService
    // ==========================================
    window.addEventListener('mitang_nao_autenticado', () => {
        if (window.mostrarNotificacao) {
            window.mostrarNotificacao('aviso', 'Sessão Expirada', 'Por favor, autentique-se novamente para continuar.');
        }
        carregarRota('login');
    });

    window.addEventListener('mitang_acesso_negado', (e) => {
        const det = e.detail || {};
        if (window.mostrarNotificacao) {
            window.mostrarNotificacao('erro', 'Acesso Negado', det.error || 'Seu perfil não tem permissão para este recurso ou CNPJ.');
        }
    });

    window.addEventListener('mitang_tenant_changed', (e) => {
        const selector = document.getElementById('tenant-selector');
        if (selector && e.detail?.id && selector.value !== e.detail.id) {
            selector.value = e.detail.id;
        }
        if (window.mostrarNotificacao) {
            window.mostrarNotificacao('info', 'Empresa Selecionada', `Alternado para: ${e.detail?.nome || 'Novo Tenant'}`);
        }
        // Recarregar dados da tela ativa com o novo contexto de tenant
        if (rotaAtual && rotaAtual !== 'login') {
            carregarRota(rotaAtual);
        }
    });

    window.addEventListener('mitang_sessao_encerrada', () => {
        if (window.mostrarNotificacao) {
            window.mostrarNotificacao('info', 'Sessão Encerrada', 'Você saiu do sistema com segurança.');
        }
        carregarRota('login');
    });

    window.addEventListener('mitang_autenticado_sucesso', () => {
        carregarRota('dashboard');
    });

    // Início: verificar autenticação
    if (window.apiService && window.apiService.estaAutenticado()) {
        carregarRota('dashboard');
    } else {
        carregarRota('login');
    }
});

// ==========================================
// 3. Lógica do Light / Dark Mode
// ==========================================
const htmlElement = document.documentElement;
const themeToggleBtn = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');

let isDarkMode = htmlElement.classList.contains('dark');

if(themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        htmlElement.classList.toggle('dark');
        isDarkMode = htmlElement.classList.contains('dark');
        
        if (isDarkMode) {
            themeIcon.classList.remove('ph-moon');
            themeIcon.classList.add('ph-sun');
        } else {
            themeIcon.classList.remove('ph-sun');
            themeIcon.classList.add('ph-moon');
        }
    });
}

// ==========================================
// 4. Animação Batimétrica Otimizada
// ==========================================
const canvas = document.getElementById('bathymetryCanvas');
const ctx = canvas.getContext('2d', { alpha: false }); 

let width, height;
let time = 0;

function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize(); 

const centers = [
    { x: 0.8, y: 0.3, scale: 1.2 },
    { x: 0.2, y: 0.8, scale: 0.8 },
    { x: 0.5, y: 0.5, scale: 0.4 }
];

function getRadius(baseRadius, angle, t, centerIndex) {
    let noise = Math.sin(angle * 3 + t * 0.5 + centerIndex) * 0.1;
    noise += Math.cos(angle * 2 - t * 0.3) * 0.05;
    return baseRadius * (1 + noise);
}

function draw() {
    const bgColor = isDarkMode ? '#020b14' : '#f0f4f8';
    const lineColorRGB = isDarkMode ? '0, 229, 255' : '0, 150, 180'; 

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    ctx.lineWidth = 1.2;
    
    const numLevels = 15; 
    const maxRadius = Math.max(width, height) * 0.6;
    const segments = 60; 

    centers.forEach((center, cIdx) => {
        const cx = width * center.x;
        const cy = height * center.y;

        for (let level = 1; level <= numLevels; level++) {
            const baseRadius = (level / numLevels) * maxRadius * center.scale;
            ctx.beginPath();
            
            for (let i = 0; i <= segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                const tOffset = time + (level * 0.1); 
                const r = getRadius(baseRadius, angle, tOffset, cIdx);
                const x = cx + Math.cos(angle) * r;
                const y = cy + Math.sin(angle) * r;

                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            
            ctx.closePath();
            
            const baseAlpha = isDarkMode ? 0.08 : 0.03;
            const dynamicAlpha = isDarkMode ? 0.35 : 0.15;
            const opacity = baseAlpha + (level / numLevels) * dynamicAlpha;
            
            ctx.strokeStyle = `rgba(${lineColorRGB}, ${opacity})`;
            ctx.stroke();
        }
    });

    time += 0.003;
    requestAnimationFrame(draw);
}

draw();

// ==========================================
// 5. Controle Dinâmico da Animação
// ==========================================
const animToggleBtn = document.getElementById('anim-toggle-btn');
const animDropdown = document.getElementById('anim-dropdown');
const animSwitch = document.getElementById('anim-switch');
const animSlider = document.getElementById('anim-slider');
const animValDisplay = document.getElementById('anim-val-display');

canvas.style.transition = 'opacity 0.3s ease';
canvas.style.opacity = 1;

if(animToggleBtn) {
    animToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (animDropdown.classList.contains('hidden')) {
            animDropdown.classList.remove('hidden');
            setTimeout(() => {
                animDropdown.classList.remove('opacity-0', 'scale-95');
                animDropdown.classList.add('opacity-100', 'scale-100');
            }, 10);
        } else {
            fecharDropdown();
        }
    });
}

document.addEventListener('click', (e) => {
    if (animDropdown && animToggleBtn && !animDropdown.contains(e.target) && !animToggleBtn.contains(e.target)) {
        fecharDropdown();
    }
});

function fecharDropdown() {
    if(!animDropdown) return;
    animDropdown.classList.remove('opacity-100', 'scale-100');
    animDropdown.classList.add('opacity-0', 'scale-95');
    setTimeout(() => {
        animDropdown.classList.add('hidden');
    }, 150);
}

function updateCanvasOpacity() {
    if (animSwitch.checked) {
        const val = animSlider.value;
        canvas.style.opacity = val / 100;
        animValDisplay.innerText = val + '%';
    } else {
        canvas.style.opacity = 0;
        animValDisplay.innerText = '0%';
    }
}

if(animSlider && animSwitch) {
    animSlider.addEventListener('input', updateCanvasOpacity);
    animSwitch.addEventListener('change', updateCanvasOpacity);
}

// ==========================================
// SISTEMA MODERNO DE NOTIFICAÇÕES TOAST (ERGONOMIA DE ALERTA)
// ==========================================
window.mostrarNotificacao = function(tipo = 'info', titulo = 'Aviso', mensagem = '') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `pointer-events-auto flex items-start gap-3 p-4 rounded-2xl border backdrop-blur-xl shadow-2xl transition-all duration-300 transform translate-x-12 opacity-0 animate-fade-in text-xs`;

    let icone = 'ph-info';
    let corBorda = 'border-cyan-500/30 bg-slate-900/90 text-slate-200';
    let corIcone = 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20';

    if (tipo === 'sucesso') {
        icone = 'ph-check-circle';
        corBorda = 'border-emerald-500/30 bg-slate-900/95 text-slate-200';
        corIcone = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    } else if (tipo === 'erro') {
        icone = 'ph-x-circle';
        corBorda = 'border-red-500/30 bg-slate-900/95 text-slate-200';
        corIcone = 'text-red-400 bg-red-500/10 border-red-500/20';
    } else if (tipo === 'aviso') {
        icone = 'ph-warning';
        corBorda = 'border-amber-500/30 bg-slate-900/95 text-slate-200';
        corIcone = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    }

    toast.classList.add(...corBorda.split(' '));

    toast.innerHTML = `
        <div class="p-2 rounded-xl border ${corIcone} flex-shrink-0">
            <i class="ph ${icone} text-lg"></i>
        </div>
        <div class="flex-1 pr-2">
            <h4 class="font-bold text-white text-xs mb-0.5">${titulo}</h4>
            <p class="text-slate-300 leading-relaxed">${mensagem}</p>
        </div>
        <button onclick="this.parentElement.remove()" class="text-slate-500 hover:text-white text-sm p-1">
            <i class="ph ph-x"></i>
        </button>
    `;

    container.appendChild(toast);

    // Animação de entrada
    requestAnimationFrame(() => {
        toast.classList.remove('translate-x-12', 'opacity-0');
        toast.classList.add('translate-x-0', 'opacity-100');
    });

    // Auto-dismiss após 4.5 segundos
    setTimeout(() => {
        toast.classList.remove('translate-x-0', 'opacity-100');
        toast.classList.add('translate-x-12', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 4500);
};