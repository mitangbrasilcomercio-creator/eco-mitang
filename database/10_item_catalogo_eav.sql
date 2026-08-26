-- ============================================================================
-- 10. MIGRATION: ITEM_CATALOGO & DATA INGESTION STAGING AREA
-- ============================================================================

-- Enum para Tipos de Item do Catálogo
DO $$ BEGIN
    CREATE TYPE tipo_item_enum AS ENUM ('Produto', 'Locacao', 'Servico', 'Curso');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. TABELA PRINCIPAL: ITENS_CATALOGO (MULTI-TENANT & EAV JSONB)
CREATE TABLE IF NOT EXISTS itens_catalogo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
    tipo_item tipo_item_enum NOT NULL,
    codigo_sku VARCHAR(100) UNIQUE,
    nome_comercial VARCHAR(255) NOT NULL,
    preco_base NUMERIC(14, 2) NOT NULL,
    quantidade_estoque NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    atributos_extras JSONB NOT NULL DEFAULT '{}'::jsonb,
    status_ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_preco_base_positivo CHECK (preco_base >= 0),
    CONSTRAINT chk_quantidade_estoque_nao_negativa CHECK (quantidade_estoque >= 0)
);

CREATE INDEX IF NOT EXISTS idx_itens_catalogo_empresa ON itens_catalogo(empresa_id);
CREATE INDEX IF NOT EXISTS idx_itens_catalogo_tipo ON itens_catalogo(empresa_id, tipo_item);
CREATE INDEX IF NOT EXISTS idx_itens_catalogo_ativo ON itens_catalogo(empresa_id, status_ativo);
CREATE INDEX IF NOT EXISTS idx_itens_catalogo_sku ON itens_catalogo(codigo_sku);
CREATE INDEX IF NOT EXISTS idx_itens_catalogo_atributos ON itens_catalogo USING GIN (atributos_extras);

-- 2. TABELA DE STAGING AREA (REGRA 1 DATA INGESTION: PREVIEW ANTES DE GRAVAR)
DO $$ BEGIN
    CREATE TYPE status_staging_enum AS ENUM ('PENDENTE_VALIDACAO', 'VALIDADO', 'PROCESSADO', 'ERRO_VALIDACAO', 'CANCELADO');
    CREATE TYPE tipo_arquivo_ingestao_enum AS ENUM ('XML_NFE', 'OFX_EXTRATO', 'JSON_CATALOGO', 'CNPJ_RECEITA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS importacao_staging (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
    tipo_arquivo tipo_arquivo_ingestao_enum NOT NULL,
    nome_arquivo_original VARCHAR(255) NOT NULL,
    total_registros_detectados INT NOT NULL DEFAULT 0,
    payload_bruto_json JSONB NOT NULL,
    preview_processado JSONB NOT NULL DEFAULT '[]'::jsonb,
    status status_staging_enum NOT NULL DEFAULT 'PENDENTE_VALIDACAO',
    erros_validacao JSONB DEFAULT '[]'::jsonb,
    processado_em TIMESTAMPTZ,
    processado_por VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_importacao_staging_empresa ON importacao_staging(empresa_id, status);

-- Row Level Security (RLS)
ALTER TABLE itens_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE importacao_staging ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_itens_catalogo ON itens_catalogo;
CREATE POLICY tenant_isolation_itens_catalogo ON itens_catalogo
    AS RESTRICTIVE
    USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_importacao_staging ON importacao_staging;
CREATE POLICY tenant_isolation_importacao_staging ON importacao_staging
    AS RESTRICTIVE
    USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid);
