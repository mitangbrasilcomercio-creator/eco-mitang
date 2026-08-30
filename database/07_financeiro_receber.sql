-- ============================================================================
-- 07. FINANCEIRO: PLANOS, PARCELAS E TRIGGER ANTI-HARD-DELETE
-- ============================================================================
DO $$ BEGIN
    CREATE TYPE status_credito_plano AS ENUM ('ANALISE', 'APROVADO', 'BLOQUEADO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE status_pagamento_parcela AS ENUM ('A_VENCER', 'PAGO', 'RENEGOCIADA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS planos_faturamento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
    cotacao_origem_id UUID NOT NULL REFERENCES cotacoes(id) ON DELETE RESTRICT,
    valor_total_devido NUMERIC(14, 2) NOT NULL,
    status_credito status_credito_plano NOT NULL DEFAULT 'ANALISE',
    observacoes_financeiras TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_valor_devido_positivo CHECK (valor_total_devido > 0)
);
CREATE INDEX IF NOT EXISTS idx_planos_faturamento_empresa ON planos_faturamento(empresa_id);

CREATE TABLE IF NOT EXISTS parcelas_recebimento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plano_id UUID NOT NULL REFERENCES planos_faturamento(id) ON DELETE RESTRICT,
    numero_parcela INT NOT NULL,
    valor_parcela NUMERIC(14, 2) NOT NULL,
    data_vencimento DATE NOT NULL,
    data_pagamento TIMESTAMPTZ,
    status_pagamento status_pagamento_parcela NOT NULL DEFAULT 'A_VENCER',
    exige_quitacao_para_liberar_os BOOLEAN NOT NULL DEFAULT FALSE,
    renegociada_em TIMESTAMPTZ,
    motivo_renegociacao TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_valor_parcela_positivo CHECK (valor_parcela > 0)
);
CREATE INDEX IF NOT EXISTS idx_parcelas_plano ON parcelas_recebimento(plano_id);

-- REGRA 2: Bloqueio de Hard-Delete
CREATE OR REPLACE FUNCTION fn_prevent_delete_parcela_recebimento()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'REGRA 2 (ESTORNO): Proibido excluir parcelas do banco de dados. Altere para RENEGOCIADA.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bloqueio_delete_parcelas ON parcelas_recebimento;
CREATE TRIGGER trg_bloqueio_delete_parcelas
    BEFORE DELETE ON parcelas_recebimento
    FOR EACH ROW
    EXECUTE FUNCTION fn_prevent_delete_parcela_recebimento();

ALTER TABLE planos_faturamento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy_planos_faturamento ON planos_faturamento;
CREATE POLICY tenant_isolation_policy_planos_faturamento ON planos_faturamento
    AS RESTRICTIVE
    USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid);
