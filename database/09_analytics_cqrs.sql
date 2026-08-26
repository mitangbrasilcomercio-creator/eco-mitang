-- ============================================================================
-- 09. ANALYTICS & DASHBOARDS: CQRS READ MODEL E POLITICAS ABAC
-- ============================================================================
CREATE TABLE IF NOT EXISTS analytics_vendas_mensal (
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    ano_mes VARCHAR(7) NOT NULL, -- 'YYYY-MM'
    total_cotacoes_ganhas INT NOT NULL DEFAULT 0,
    valor_total_convertido NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    ultima_atualizacao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (empresa_id, ano_mes)
);
CREATE INDEX IF NOT EXISTS idx_analytics_vendas_ano_mes ON analytics_vendas_mensal(ano_mes);

CREATE TABLE IF NOT EXISTS analytics_operacao_qualidade (
    empresa_id UUID PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
    total_os_concluidas INT NOT NULL DEFAULT 0,
    total_rncs_geradas INT NOT NULL DEFAULT 0,
    ultima_atualizacao TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE analytics_vendas_mensal ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_operacao_qualidade ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS abac_select_policy_analytics_vendas ON analytics_vendas_mensal;
CREATE POLICY abac_select_policy_analytics_vendas ON analytics_vendas_mensal
    FOR SELECT
    USING (
        current_setting('app.user_role', true) = 'Gestor_CLevel'
        OR empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid
    );

DROP POLICY IF EXISTS abac_select_policy_analytics_qualidade ON analytics_operacao_qualidade;
CREATE POLICY abac_select_policy_analytics_qualidade ON analytics_operacao_qualidade
    FOR SELECT
    USING (
        current_setting('app.user_role', true) = 'Gestor_CLevel'
        OR empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid
    );
