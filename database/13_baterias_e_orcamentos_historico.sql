-- ============================================================================
-- 13. MODULO BATERIAS & ORCAMENTOS HISTORICOS (EXTRAÇÃO INTEGRAL DE PDF)
-- ============================================================================

-- Tabela para armazenar as 218 cotações/orçamentos históricos da Mitang Brasil & Arandu
CREATE TABLE IF NOT EXISTS orcamentos_historico (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
    numero_orcamento VARCHAR(20) NOT NULL,
    vendido_por VARCHAR(50) NOT NULL, -- 'Mitang' ou 'Arandu'
    data_emissao DATE,
    mes_emissao VARCHAR(20),
    ano_emissao VARCHAR(10),
    cliente_nome VARCHAR(255) NOT NULL,
    cliente_cnpj_cpf VARCHAR(20),
    cliente_contato VARCHAR(255),
    status_aprovacao VARCHAR(50) NOT NULL, -- 'Compra Aprovada', 'Não Aprovada'
    orcamento_enviado VARCHAR(50),
    situacao_geral VARCHAR(100),
    valor_total NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    itens_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_orcamento_empresa_numero UNIQUE (empresa_id, numero_orcamento)
);

CREATE INDEX IF NOT EXISTS idx_orcamentos_empresa ON orcamentos_historico(empresa_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_numero ON orcamentos_historico(numero_orcamento);
CREATE INDEX IF NOT EXISTS idx_orcamentos_cliente_cnpj ON orcamentos_historico(cliente_cnpj_cpf);
CREATE INDEX IF NOT EXISTS idx_orcamentos_status ON orcamentos_historico(status_aprovacao);
CREATE INDEX IF NOT EXISTS idx_orcamentos_itens_gin ON orcamentos_historico USING gin(itens_json);

-- RLS
ALTER TABLE orcamentos_historico ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS orcamentos_historico_tenant_isolation ON orcamentos_historico;
    CREATE POLICY orcamentos_historico_tenant_isolation ON orcamentos_historico
        FOR ALL
        USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid);
EXCEPTION
    WHEN undefined_object THEN null;
END $$;
