-- ============================================================================
-- 02. CATALOGO UNIVERSAL: POLIMORFISMO E SALDO DE ESTOQUE
-- ============================================================================
DO $$ BEGIN
    CREATE TYPE tipo_item_catalogo AS ENUM ('PRODUTO', 'LOCACAO', 'SERVICO', 'CURSO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS catalogo_universal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
    tipo_item tipo_item_catalogo NOT NULL,
    nome VARCHAR(255) NOT NULL,
    descricao_tecnica TEXT,
    detalhes JSONB NOT NULL DEFAULT '{}'::jsonb,
    quantidade_estoque_atual NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_saldo_estoque_nao_negativo CHECK (quantidade_estoque_atual >= 0.000)
);

CREATE INDEX IF NOT EXISTS idx_catalogo_empresa ON catalogo_universal(empresa_id);
CREATE INDEX IF NOT EXISTS idx_catalogo_tipo ON catalogo_universal(empresa_id, tipo_item);
CREATE INDEX IF NOT EXISTS idx_catalogo_ativo ON catalogo_universal(empresa_id, ativo);

ALTER TABLE catalogo_universal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy_catalogo ON catalogo_universal;
CREATE POLICY tenant_isolation_policy_catalogo ON catalogo_universal
    AS RESTRICTIVE
    USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid);
