/* script.js */

// ==========================================
// 1. Lógica de Autenticação Global (RBAC Base)
// ==========================================
const tokenLogado = localStorage.getItem('mitang_auth_token');
const dadosUsuario = JSON.parse(localStorage.getItem('mitang_user_data'));

const sidebarApp = document.querySelector('aside');
const headerApp = document.querySelector('header');
const navLinks = document.querySelectorAll('[data-route]');
const headerTitle = document.getElementById('header-title');

// Títulos dinâmicos (ATUALIZADO COM MÓDULOS NOVOS)
const titulosRotas = {
    'dashboard': 'Bem-vindo ao <span class="font-semibold">Centro de Controle</span>',
    'contabilidade': 'Demonstração Contábil — <span class="font-semibold">DRE & Desempenho Real</span>',
    'notas_fiscais': 'Repositório Fiscal Sem Perdas — <span class="font-semibold">172 XMLs de NF-e e NFS-e</span>',
    'financeiro': 'Saúde de <span class="font-semibold">Caixa e Tesouraria</span>',
    'controladoria': 'Controladoria & Inteligência — <span class="font-semibold">Dashboard Transversal & DuPont</span>',
    'arquivos': 'Gestão de <span class="font-semibold">Arquivos e Dados</span>',
    'analises': 'Painel de <span class="font-semibold">Análises</span>',
    'orcamento_master': 'Comercial & <span class="font-semibold">Contratos Vivos</span>',
    'crm': 'CRM & SRM 360° — <span class="font-semibold">Dossiê de Clientes & Fornecedores</span>',
    'operacoes': 'Operações Subsea & <span class="font-semibold">Metrologia DimCon</span>',
    'produtos': 'Engenharia de Baterias & <span class="font-semibold">Catálogo Industrial</span>',
    'compras': 'Gestão de Compras (QUA-REG) & <span class="font-semibold">Packing List Offshore</span>',
    'relatorios': 'Engenharia Técnica — <span class="font-semibold">DPR Offshore & Laudos DimCon / FAT</span>',
    'compliance': 'Governança & Compliance — <span class="font-semibold">Robô de CNDs & Gestão Multi-Empresa</span>',
    'parametros': 'Configurações — <span class="font-semibold">Gerenciador Global de Categorias & Parâmetros</span>',
    'colaboradores': 'Gestão de <span class="font-semibold">Colaboradores</span>',
    'automacoes': 'Central de <span class="font-semibold">Automações</span>',
    'planilha': 'Editor de <span class="font-semibold">Banco de Dados</span>'
};

const classesAtivas = ['bg-cyan-500/10', 'dark:bg-cyan-400/10', 'text-cyan-600', 'dark:text-cyan-400', 'border', 'border-cyan-500/20', 'dark:border-cyan-400/20'];

// ==========================================
// 2. Motor SPA (Single Page Application)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const conteudoDinamico = document.getElementById('conteudo-dinamico');

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
        try {
            const response = await fetch(`${rota}.html`);
            if (!response.ok) throw new Error('Página não encontrada ou servidor local inativo.');
            
            const html = await response.text();
            conteudoDinamico.innerHTML = html;
            
            if (titulosRotas[rota]) {
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

    // Inicialização direta do usuário da holding
    if (!localStorage.getItem('mitang_auth_token')) {
        localStorage.setItem('mitang_auth_token', 'mitang-session-root');
        localStorage.setItem('mitang_user_data', JSON.stringify({
            nome: 'Diego Ribeiro',
            cargo: 'Diretoria / Comercial Técnico',
            departamento: 'Holding Eco-Mitang'
        }));
    }

    sidebarApp.style.display = 'flex';
    headerApp.style.display = 'flex';
    
    const userInfos = document.querySelectorAll('.text-sm.font-medium.text-slate-800');
    if(userInfos.length > 0) {
         document.querySelector('.w-10.h-10.rounded-full').innerText = 'DR';
         const nameEl = document.querySelector('.text-sm.font-medium.text-slate-800.dark\\:text-slate-200.truncate');
         if (nameEl) nameEl.innerText = 'Diego Ribeiro';
         const roleEl = document.querySelector('.text-xs.text-cyan-600.dark\\:text-cyan-400\\/70.truncate');
         if (roleEl) roleEl.innerText = 'Diretoria • Comercial Técnico';
    }

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            carregarRota(link.dataset.route);
        });
    });

    carregarRota('dashboard');
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