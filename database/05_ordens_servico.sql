-- ============================================================================
-- 05. MODULO OPERACIONAL: ORDENS DE SERVICO E TRAVAS DE EXECUCAO
-- ============================================================================
DO $$ BEGIN
    CREATE TYPE tipo_ordem_servico AS ENUM ('PRODUCAO', 'MOBILIZACAO', 'SERVICO', 'CURSO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE status_ordem_servico AS ENUM (
        'AGUARDANDO_LIBERACAO',
        'NA_FILA',
        'EM_EXECUCAO',
        'IMPEDIMENTO',
        'BLOQUEADA_EM_RETRABALHO',
        'CONCLUIDA'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS ordens_servico (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
    cotacao_origem_id UUID NOT NULL REFERENCES cotacoes(id) ON DELETE RESTRICT,
    cotacao_item_origem_id UUID NOT NULL REFERENCES cotacoes_itens(id) ON DELETE RESTRICT,
    numero_os BIGSERIAL,
    tipo_os tipo_ordem_servico NOT NULL,
    status status_ordem_servico NOT NULL DEFAULT 'AGUARDANDO_LIBERACAO',
    bloqueio_financeiro BOOLEAN NOT NULL DEFAULT TRUE,
    bloqueio_qsms BOOLEAN NOT NULL DEFAULT TRUE,
    liberacao_financeiro_em TIMESTAMPTZ,
    liberacao_financeiro_por UUID,
    liberacao_qsms_em TIMESTAMPTZ,
    liberacao_qsms_por UUID,
    data_inicio_execucao TIMESTAMPTZ,
    data_conclusao TIMESTAMPTZ,
    motivo_impedimento TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_os_empresa_status ON ordens_servico(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_os_cotacao ON ordens_servico(cotacao_origem_id);

ALTER TABLE ordens_servico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy_ordens_servico ON ordens_servico;
CREATE POLICY tenant_isolation_policy_ordens_servico ON ordens_servico
    AS RESTRICTIVE
    USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid);
