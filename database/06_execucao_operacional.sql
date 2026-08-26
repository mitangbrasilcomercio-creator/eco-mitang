-- ============================================================================
-- 06. EXECUCAO OPERACIONAL: APONTAMENTO HH E CONSUMO DE ESTOQUE
-- ============================================================================
CREATE TABLE IF NOT EXISTS colaboradores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
    nome VARCHAR(255) NOT NULL,
    matricula VARCHAR(50) NOT NULL,
    cargo VARCHAR(100) NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_colaboradores_empresa ON colaboradores(empresa_id);

CREATE TABLE IF NOT EXISTS apontamentos_horas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
    os_id UUID NOT NULL REFERENCES ordens_servico(id) ON DELETE RESTRICT,
    colaborador_id UUID NOT NULL REFERENCES colaboradores(id) ON DELETE RESTRICT,
    data_hora_inicio TIMESTAMPTZ NOT NULL,
    data_hora_fim TIMESTAMPTZ,
    descricao VARCHAR(500) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_periodo_apontamento CHECK (data_hora_fim IS NULL OR data_hora_fim > data_hora_inicio)
);
CREATE INDEX IF NOT EXISTS idx_apontamentos_os ON apontamentos_horas(os_id);

CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
    os_id UUID NOT NULL REFERENCES ordens_servico(id) ON DELETE RESTRICT,
    item_catalogo_id UUID NOT NULL REFERENCES catalogo_universal(id) ON DELETE RESTRICT,
    quantidade NUMERIC(12, 3) NOT NULL,
    lote VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_qtd_movimentacao_positiva CHECK (quantidade > 0)
);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_os ON movimentacoes_estoque(os_id);

ALTER TABLE apontamentos_horas ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimentacoes_estoque ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy_apontamentos ON apontamentos_horas;
CREATE POLICY tenant_isolation_policy_apontamentos ON apontamentos_horas
    AS RESTRICTIVE
    USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_policy_movimentacoes ON movimentacoes_estoque;
CREATE POLICY tenant_isolation_policy_movimentacoes ON movimentacoes_estoque
    AS RESTRICTIVE
    USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid);
