-- ============================================================================
-- 04. MODULO COTACOES: MASTER-DETAIL COM SNAPSHOT FINANCEIRO
-- ============================================================================
DO $$ BEGIN
    CREATE TYPE status_cotacao AS ENUM (
        'RASCUNHO',
        'AGUARDANDO_APROVACAO',
        'APROVADA_INTERNAMENTE',
        'ENVIADA_CLIENTE',
        'GANHA',
        'PERDIDA',
        'CANCELADA'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
    razao_social_nome VARCHAR(255) NOT NULL,
    cnpj_cpf VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    telefone VARCHAR(50),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clientes_empresa ON clientes(empresa_id);

CREATE TABLE IF NOT EXISTS cotacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
    ticket_origem_id UUID REFERENCES tickets_triagem(id) ON DELETE SET NULL,
    numero_sequencial BIGSERIAL,
    status status_cotacao NOT NULL DEFAULT 'RASCUNHO',
    subtotal_itens NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    desconto_global_percentual NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    desconto_global_valor NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    valor_total_liquido NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    condicao_pagamento VARCHAR(255) NOT NULL,
    observacoes TEXT,
    aprovado_por UUID,
    aprovado_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cotacoes_empresa_status ON cotacoes(empresa_id, status);

CREATE TABLE IF NOT EXISTS cotacoes_itens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cotacao_id UUID NOT NULL REFERENCES cotacoes(id) ON DELETE CASCADE,
    item_catalogo_id UUID NOT NULL REFERENCES catalogo_universal(id) ON DELETE RESTRICT,
    valor_unitario_congelado NUMERIC(14, 2) NOT NULL,
    quantidade NUMERIC(12, 3) NOT NULL,
    subtotal_item NUMERIC(14, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cotacoes_itens_cotacao ON cotacoes_itens(cotacao_id);

ALTER TABLE cotacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy_cotacoes ON cotacoes;
CREATE POLICY tenant_isolation_policy_cotacoes ON cotacoes
    AS RESTRICTIVE
    USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid);
