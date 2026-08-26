-- ============================================================================
-- 10. MODULO DE CLIENTES: ENRIQUECIMENTO CADASTRAL & HISTORICO DE AUDITORIA (CDC)
-- ============================================================================

-- 1. Evolução da Tabela Clientes com Campos Oficiais Fiscais e Compliance
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS nome_fantasia VARCHAR(255);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cnae_principal VARCHAR(20);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cnae_descricao VARCHAR(255);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS situacao_cadastral VARCHAR(50) NOT NULL DEFAULT 'ATIVA';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS motivo_situacao_cadastral TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS data_situacao_cadastral DATE;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cep VARCHAR(20);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS logradouro VARCHAR(255);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS numero VARCHAR(50);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS complemento VARCHAR(100);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS bairro VARCHAR(100);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS municipio VARCHAR(100);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS uf VARCHAR(10);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS qsa JSONB DEFAULT '[]'::jsonb;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS bloqueio_fiscal BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS ultima_sincronizacao_rfb TIMESTAMPTZ;

-- 2. Tabela de Histórico de Alterações Cadastrais (Slowly Changing Dimensions / Audit Log)
CREATE TABLE IF NOT EXISTS clientes_historico_alteracoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    campo_alterado VARCHAR(100) NOT NULL,
    valor_anterior TEXT,
    valor_novo TEXT,
    origem_alteracao VARCHAR(50) NOT NULL DEFAULT 'AUTO_SYNC_RFB', -- AUTO_SYNC_RFB | MANUAL | WEBHOOK_RECEITA
    data_vigencia TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    registrado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notificado BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_hist_cliente ON clientes_historico_alteracoes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_hist_empresa ON clientes_historico_alteracoes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_hist_vigencia ON clientes_historico_alteracoes(data_vigencia);

-- 3. Habilita Row-Level Security no Histórico
ALTER TABLE clientes_historico_alteracoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy_clientes_historico ON clientes_historico_alteracoes;
CREATE POLICY tenant_isolation_policy_clientes_historico ON clientes_historico_alteracoes
    AS RESTRICTIVE
    USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid);
