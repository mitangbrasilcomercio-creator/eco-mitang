-- ============================================================================
-- 11. FINANCEIRO: CONTAS BANCÁRIAS, EXTRATOS OFX E TRANSAÇÕES CONCILIADAS
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE tipo_conta_bancaria AS ENUM ('CORRENTE', 'POUPANCA', 'INVESTIMENTO', 'PAGAMENTO');
    CREATE TYPE tipo_transacao_bancaria AS ENUM ('CREDIT', 'DEBIT', 'OTHER');
    CREATE TYPE status_conciliacao AS ENUM ('PENDENTE', 'CONCILIADO_AUTOMATICO', 'CONCILIADO_MANUAL', 'IGNORADO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Tabela de Contas Bancárias da Holding (Itaú, Bradesco, etc.)
CREATE TABLE IF NOT EXISTS contas_bancarias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
    banco_codigo VARCHAR(10) NOT NULL, -- ex: '0341' (Itaú), '0237' (Bradesco)
    banco_nome VARCHAR(100) NOT NULL,   -- ex: 'Itaú Unibanco', 'Banco Bradesco'
    agencia VARCHAR(20) NOT NULL,
    conta_numero VARCHAR(50) NOT NULL,
    tipo_conta tipo_conta_bancaria NOT NULL DEFAULT 'CORRENTE',
    moeda VARCHAR(10) NOT NULL DEFAULT 'BRL',
    saldo_atual NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    data_ultimo_saldo TIMESTAMPTZ,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unq_conta_bancaria_empresa UNIQUE (empresa_id, banco_codigo, agencia, conta_numero)
);
CREATE INDEX IF NOT EXISTS idx_contas_bancarias_empresa ON contas_bancarias(empresa_id);

-- 2. Tabela de Log e Auditoria de Importação de Arquivos OFX
CREATE TABLE IF NOT EXISTS extratos_ofx_importacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
    conta_bancaria_id UUID NOT NULL REFERENCES contas_bancarias(id) ON DELETE RESTRICT,
    nome_arquivo VARCHAR(255) NOT NULL,
    arquivo_hash_sha256 VARCHAR(64) NOT NULL,
    dt_inicio_extrato DATE,
    dt_fim_extrato DATE,
    total_transacoes_arquivo INT NOT NULL DEFAULT 0,
    transacoes_inseridas INT NOT NULL DEFAULT 0,
    transacoes_duplicadas_ignoradas INT NOT NULL DEFAULT 0,
    saldo_final_extrato NUMERIC(14, 2),
    data_saldo_extrato TIMESTAMPTZ,
    importado_por VARCHAR(100) DEFAULT 'SISTEMA_AUTO',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ofx_importacoes_empresa ON extratos_ofx_importacoes(empresa_id);

-- 3. Tabela de Transações Bancárias com Idempotência Estrita
CREATE TABLE IF NOT EXISTS transacoes_bancarias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
    conta_bancaria_id UUID NOT NULL REFERENCES contas_bancarias(id) ON DELETE RESTRICT,
    importacao_id UUID REFERENCES extratos_ofx_importacoes(id) ON DELETE SET NULL,
    cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
    parcela_id UUID REFERENCES parcelas_recebimento(id) ON DELETE SET NULL,

    -- Tags OFX extraídas
    bank_id VARCHAR(10) NOT NULL,
    acct_id VARCHAR(50) NOT NULL,
    fitid VARCHAR(100) NOT NULL,
    checknum VARCHAR(100),
    tipo_operacao tipo_transacao_bancaria NOT NULL,
    data_lancamento DATE NOT NULL,
    dtposted_raw VARCHAR(50) NOT NULL,
    valor NUMERIC(14, 2) NOT NULL,
    memo TEXT NOT NULL,

    -- Enriquecimento inteligente
    documento_contraparte VARCHAR(30), -- CNPJ ou CPF extraído do memo
    nome_contraparte VARCHAR(255),
    categoria_financeira VARCHAR(100), -- FORNECEDORES, TRIBUTOS, CLIENTES, SOCIOS, etc.
    is_saldo_informativo BOOLEAN NOT NULL DEFAULT FALSE,

    -- Conciliação
    status_conciliacao status_conciliacao NOT NULL DEFAULT 'PENDENTE',
    conciliado_em TIMESTAMPTZ,
    conciliado_por VARCHAR(100),

    -- Chave criptográfica única de idempotência anti-duplicação
    idempotency_hash VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transacoes_empresa_data ON transacoes_bancarias(empresa_id, data_lancamento);
CREATE INDEX IF NOT EXISTS idx_transacoes_conta ON transacoes_bancarias(conta_bancaria_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_hash ON transacoes_bancarias(idempotency_hash);
CREATE INDEX IF NOT EXISTS idx_transacoes_contraparte ON transacoes_bancarias(documento_contraparte);

-- RLS Policies
ALTER TABLE contas_bancarias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy_contas_bancarias ON contas_bancarias;
CREATE POLICY tenant_isolation_policy_contas_bancarias ON contas_bancarias
    AS RESTRICTIVE
    USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid);

ALTER TABLE extratos_ofx_importacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy_ofx_importacoes ON extratos_ofx_importacoes;
CREATE POLICY tenant_isolation_policy_ofx_importacoes ON extratos_ofx_importacoes
    AS RESTRICTIVE
    USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid);

ALTER TABLE transacoes_bancarias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy_transacoes_bancarias ON transacoes_bancarias;
CREATE POLICY tenant_isolation_policy_transacoes_bancarias ON transacoes_bancarias
    AS RESTRICTIVE
    USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid);
