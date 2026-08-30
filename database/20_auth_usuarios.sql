-- ============================================================================
-- 20. AUTENTICACAO: USUARIOS, PAPEIS E VINCULO COM OS CNPJs DA HOLDING
-- ============================================================================
--
-- [ERRO ANTERIOR]:
-- Nao existia autenticacao alguma. 'public/login.html' era um fragmento visual
-- sem backend: sem tabela de usuarios, sem rota de login, sem token. O tenant
-- vinha do header 'x-empresa-id', lido do localStorage do navegador -- ou seja,
-- qualquer pessoa escolhia de qual CNPJ queria ver os dados financeiros.
--
-- [COMO FOI CORRIGIDO]:
-- O tenant passa a ser derivado do JWT. 'usuarios_empresas' define quais CNPJs
-- cada pessoa enxerga; o header 'x-empresa-id' vira apenas uma *selecao* dentro
-- desse conjunto, validada no servidor.
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE papel_usuario AS ENUM ('Gestor_CLevel', 'Financeiro', 'Vendedor', 'Operacional');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS usuarios (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                  VARCHAR(255) NOT NULL,
    senha_hash             TEXT         NOT NULL,
    nome                   VARCHAR(255) NOT NULL,
    papel                  papel_usuario NOT NULL DEFAULT 'Vendedor',

    -- Permite a visao consolidada da holding ('all'), somando todos os CNPJs
    -- aos quais o usuario tem acesso em usuarios_empresas.
    pode_visao_consolidada BOOLEAN      NOT NULL DEFAULT FALSE,

    ativo                  BOOLEAN      NOT NULL DEFAULT TRUE,
    ultimo_login_em        TIMESTAMPTZ,

    -- Trava contra forca bruta no login
    tentativas_falhas      INT          NOT NULL DEFAULT 0,
    bloqueado_ate          TIMESTAMPTZ,

    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_usuarios_email_formato CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

-- E-mail unico sem diferenciar maiusculas/minusculas
CREATE UNIQUE INDEX IF NOT EXISTS unq_usuarios_email_lower ON usuarios (lower(email));
CREATE INDEX IF NOT EXISTS idx_usuarios_ativo ON usuarios (ativo);

CREATE TABLE IF NOT EXISTS usuarios_empresas (
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (usuario_id, empresa_id)
);

CREATE INDEX IF NOT EXISTS idx_usuarios_empresas_usuario ON usuarios_empresas (usuario_id);

-- Auditoria de acesso: quem entrou, de onde e se deu certo.
CREATE TABLE IF NOT EXISTS usuarios_log_acesso (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    email_tentado VARCHAR(255),
    sucesso     BOOLEAN NOT NULL,
    motivo      VARCHAR(100),
    ip_origem   VARCHAR(64),
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_log_acesso_usuario ON usuarios_log_acesso (usuario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_log_acesso_data ON usuarios_log_acesso (created_at DESC);

-- Estas tabelas nao sao multi-tenant (um usuario atravessa CNPJs), entao nao
-- levam RLS por empresa_id. O isolamento delas vem do GRANT: apenas o papel da
-- aplicacao enxerga, e os papeis publicos da Supabase sao revogados na
-- migration 21.
