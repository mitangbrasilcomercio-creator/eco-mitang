-- ============================================================================
-- 11a. ITENS_CATALOGO & AREA DE STAGING DE INGESTAO
-- ============================================================================
--
-- [ERRO ANTERIOR]
-- Este arquivo ja se chamou '10_item_catalogo_eav.sql' e colidia em numeracao
-- com '10_clientes_historico.sql'. A colisao foi resolvida renomeando-o para
-- '14_', o que o jogou para DEPOIS de '12_nfe_nfse_xml_armazenamento.sql' --
-- que cria 'notas_fiscais_itens' com uma FK para 'itens_catalogo'.
--
-- Em producao ninguem percebeu: as tabelas ja existiam, aplicadas fora de
-- ordem por um script avulso (scripts/_arquivo/apply_migration_10.js). O
-- resultado e que o conjunto de migrations descrevia um schema que NAO podia
-- ser reconstruido do zero: parar na 12 com 'relation "itens_catalogo" does
-- not exist'. Um banco que nao se reconstroi a partir das proprias migrations
-- nao tem plano de recuperacao.
--
-- Encontrado na primeira execucao do ambiente de homologacao -- era
-- exatamente para isso que ele foi criado.
--
-- [CORRECAO]
-- Renumerado para '11a', antes da 12. O conteudo e integralmente idempotente
-- (CREATE ... IF NOT EXISTS), entao reaplicar em producao sob o nome novo nao
-- altera nada alem do proprio ledger.
--
-- O bloco de RLS que existia aqui foi removido: ele criava a policy
-- RESTRICTIVE 'tenant_isolation_itens_catalogo', que a migration 21 substituiu
-- por uma PERMISSIVE correta. Mantido, ele voltaria a valer em producao ao
-- reaplicar este arquivo -- e uma policy RESTRICTIVE se soma as demais por AND,
-- entao a visao consolidada da holding passaria a esconder itens em silencio.
-- A migration 21 e a autoridade sobre RLS e ja cobre as duas tabelas daqui.
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
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
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

-- A RLS destas duas tabelas e definida na migration 21, que e a autoridade
-- unica sobre isolamento de tenant. Ver o cabecalho deste arquivo.

-- ---------------------------------------------------------------------------
-- Limpeza do ledger: a linha do nome antigo aponta para um arquivo que nao
-- existe mais. Deixa-la faria um leitor futuro procurar por uma migration
-- inexistente.
-- ---------------------------------------------------------------------------
DELETE FROM schema_migrations WHERE nome = '14_item_catalogo_eav.sql';
