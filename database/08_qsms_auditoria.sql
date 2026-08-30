-- ============================================================================
-- 08. QSMS & AUDITORIA: GATEKEEPER E IMUTABILIDADE
-- ============================================================================
DO $$ BEGIN
    CREATE TYPE resultado_auditoria_qsms AS ENUM ('PENDENTE', 'APROVADO', 'REPROVADO_RNC');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE status_rnc AS ENUM ('ABERTA', 'CORRIGIDA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS auditorias_qsms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
    os_id UUID NOT NULL REFERENCES ordens_servico(id) ON DELETE RESTRICT,
    auditor_id UUID NOT NULL REFERENCES colaboradores(id) ON DELETE RESTRICT,
    resultado_final resultado_auditoria_qsms NOT NULL DEFAULT 'PENDENTE',
    assinatura_digital_hash VARCHAR(256),
    aprovado_em TIMESTAMPTZ,
    dados_snapshot_auditoria JSONB,
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auditorias_empresa ON auditorias_qsms(empresa_id);
CREATE INDEX IF NOT EXISTS idx_auditorias_os ON auditorias_qsms(os_id);

CREATE TABLE IF NOT EXISTS registros_nao_conformidade (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
    auditoria_id UUID NOT NULL REFERENCES auditorias_qsms(id) ON DELETE RESTRICT,
    descricao TEXT NOT NULL,
    status status_rnc NOT NULL DEFAULT 'ABERTA',
    corrigido_em TIMESTAMPTZ,
    resolucao_aplicada TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rnc_auditoria ON registros_nao_conformidade(auditoria_id);

-- REGRA 3: Trava de Imutabilidade
CREATE OR REPLACE FUNCTION fn_prevent_edit_auditoria_aprovada()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.resultado_final = 'APROVADO' THEN
        RAISE EXCEPTION 'REGRA 3 (IMUTABILIDADE): Auditorias APROVADAS sao imutaveis e nao podem ser alteradas ou excluidas.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bloqueio_edicao_auditoria_aprovada ON auditorias_qsms;
CREATE TRIGGER trg_bloqueio_edicao_auditoria_aprovada
    BEFORE UPDATE OR DELETE ON auditorias_qsms
    FOR EACH ROW
    EXECUTE FUNCTION fn_prevent_edit_auditoria_aprovada();

ALTER TABLE auditorias_qsms ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros_nao_conformidade ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy_auditorias ON auditorias_qsms;
CREATE POLICY tenant_isolation_policy_auditorias ON auditorias_qsms
    AS RESTRICTIVE
    USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_policy_rnc ON registros_nao_conformidade;
CREATE POLICY tenant_isolation_policy_rnc ON registros_nao_conformidade
    AS RESTRICTIVE
    USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid);
