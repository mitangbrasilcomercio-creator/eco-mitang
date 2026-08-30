-- ============================================================================
-- 03. TICKETS DE TRIAGEM: FUNIL DE QUALIFICACAO DE LEADS
-- ============================================================================
DO $$ BEGIN
    CREATE TYPE canal_origem_ticket AS ENUM ('EMAIL', 'WHATSAPP', 'TELEFONE', 'SITE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE status_ticket AS ENUM ('NOVO', 'EM_ANALISE', 'QUALIFICADO', 'DESCARTADO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS tickets_triagem (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_alvo_id UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
    canal_origem canal_origem_ticket NOT NULL,
    dados_contato_bruto VARCHAR(500) NOT NULL,
    descricao_pedido TEXT NOT NULL,
    status status_ticket NOT NULL DEFAULT 'NOVO',
    qualificado_em TIMESTAMPTZ,
    qualificado_por UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_triagem_empresa ON tickets_triagem(empresa_alvo_id);
CREATE INDEX IF NOT EXISTS idx_tickets_triagem_status ON tickets_triagem(empresa_alvo_id, status);

ALTER TABLE tickets_triagem ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy_tickets_triagem ON tickets_triagem;
CREATE POLICY tenant_isolation_policy_tickets_triagem ON tickets_triagem
    AS RESTRICTIVE
    USING (empresa_alvo_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid);
