-- ============================================================================
-- 12. NOTAS FISCAIS (NFe & NFSe) E INTELIGÊNCIA CADASTRAL AMPLIADA
-- ============================================================================

-- 1. Ampliação da Tabela de Clientes com Todos os Dados Públicos Possíveis
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS capital_social NUMERIC(15, 2);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS porte VARCHAR(50);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS natureza_juridica VARCHAR(150);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS opcao_pelo_simples BOOLEAN DEFAULT FALSE;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS opcao_pelo_mei BOOLEAN DEFAULT FALSE;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cnaes_secundarios JSONB DEFAULT '[]'::jsonb;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS dados_receita_brutos JSONB DEFAULT '{}'::jsonb;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS email_fiscal VARCHAR(255);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS telefone_fiscal VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_clientes_capital ON clientes(capital_social);
CREATE INDEX IF NOT EXISTS idx_clientes_porte ON clientes(porte);

-- 2. Tabela Mestre de Notas Fiscais (NFe Produto & NFSe Serviço)
CREATE TABLE IF NOT EXISTS notas_fiscais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
    cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
    
    -- Metadados de Tipo e Direção
    tipo_documento VARCHAR(20) NOT NULL, -- 'NFE_PRODUTO' | 'NFSE_SERVICO'
    direcao VARCHAR(20) NOT NULL,        -- 'EMITIDA' | 'RECEBIDA'
    modelo VARCHAR(50) NOT NULL,         -- '55' (NFe), 'NFS-e Nacional', 'Nota Carioca', etc.
    chave_acesso VARCHAR(64) UNIQUE,     -- Chave de 44 dígitos da NFe ou Id da NFSe
    numero_nota VARCHAR(50) NOT NULL,
    serie VARCHAR(20) DEFAULT '1',
    natureza_operacao VARCHAR(255),
    data_emissao TIMESTAMPTZ NOT NULL,
    data_competencia DATE,
    
    -- Partes (Emitente e Destinatário)
    emitente_cnpj_cpf VARCHAR(20) NOT NULL,
    emitente_nome VARCHAR(255) NOT NULL,
    emitente_uf VARCHAR(10),
    emitente_municipio VARCHAR(100),
    
    destinatario_cnpj_cpf VARCHAR(20),
    destinatario_nome VARCHAR(255),
    destinatario_uf VARCHAR(10),
    destinatario_municipio VARCHAR(100),
    
    -- Valores Totais
    valor_total NUMERIC(14, 2) NOT NULL,
    valor_produtos_servicos NUMERIC(14, 2) NOT NULL,
    valor_descontos NUMERIC(14, 2) DEFAULT 0.00,
    valor_frete NUMERIC(14, 2) DEFAULT 0.00,
    valor_seguro NUMERIC(14, 2) DEFAULT 0.00,
    valor_impostos_total NUMERIC(14, 2) DEFAULT 0.00,
    valor_liquido NUMERIC(14, 2) NOT NULL,

    -- Armazenamento Total: NENHUM dado ou tag é perdido
    conteudo_xml TEXT NOT NULL,          -- XML original assinado
    dados_completos_json JSONB NOT NULL, -- Árvore JSON completa convertida do XML

    -- Status de Processamento
    status_processamento VARCHAR(50) NOT NULL DEFAULT 'IMPORTADO', -- IMPORTADO | INTEGRADO_CATALOGO | CONCILIADO
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nf_empresa ON notas_fiscais(empresa_id);
CREATE INDEX IF NOT EXISTS idx_nf_chave ON notas_fiscais(chave_acesso);
CREATE INDEX IF NOT EXISTS idx_nf_emitente ON notas_fiscais(emitente_cnpj_cpf);
CREATE INDEX IF NOT EXISTS idx_nf_destinatario ON notas_fiscais(destinatario_cnpj_cpf);
CREATE INDEX IF NOT EXISTS idx_nf_data_emissao ON notas_fiscais(data_emissao);
CREATE INDEX IF NOT EXISTS idx_nf_dados_json ON notas_fiscais USING gin (dados_completos_json);

-- 3. Tabela de Itens da Nota Fiscal (Produtos e Serviços detalhados)
CREATE TABLE IF NOT EXISTS notas_fiscais_itens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nota_fiscal_id UUID NOT NULL REFERENCES notas_fiscais(id) ON DELETE CASCADE,
    item_catalogo_id UUID REFERENCES itens_catalogo(id) ON DELETE SET NULL,
    
    numero_item INT NOT NULL,
    codigo_produto VARCHAR(100),
    descricao_produto TEXT NOT NULL,
    ncm VARCHAR(20),
    cfop VARCHAR(10),
    unidade_comercial VARCHAR(20),
    quantidade NUMERIC(14, 4) NOT NULL,
    valor_unitario NUMERIC(14, 4) NOT NULL,
    valor_total NUMERIC(14, 2) NOT NULL,
    valor_desconto NUMERIC(14, 2) DEFAULT 0.00,
    
    -- Detalhes Tributários do Item (ICMS, IPI, PIS, COFINS, ISSQN)
    impostos_item JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nf_itens_nota ON notas_fiscais_itens(nota_fiscal_id);
CREATE INDEX IF NOT EXISTS idx_nf_itens_catalogo ON notas_fiscais_itens(item_catalogo_id);

-- 4. Tabela de Duplicatas e Faturas da Nota Fiscal (Contas a Receber / Pagar)
CREATE TABLE IF NOT EXISTS notas_fiscais_duplicatas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nota_fiscal_id UUID NOT NULL REFERENCES notas_fiscais(id) ON DELETE CASCADE,
    parcela_recebimento_id UUID REFERENCES parcelas_recebimento(id) ON DELETE SET NULL,
    
    numero_duplicata VARCHAR(50),
    data_vencimento DATE NOT NULL,
    valor_duplicata NUMERIC(14, 2) NOT NULL,
    status_cobranca VARCHAR(50) NOT NULL DEFAULT 'A_VENCER',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nf_dup_nota ON notas_fiscais_duplicatas(nota_fiscal_id);
CREATE INDEX IF NOT EXISTS idx_nf_dup_vencimento ON notas_fiscais_duplicatas(data_vencimento);

-- 5. Habilita RLS em Notas Fiscais
ALTER TABLE notas_fiscais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy_notas_fiscais ON notas_fiscais;
CREATE POLICY tenant_isolation_policy_notas_fiscais ON notas_fiscais
    AS RESTRICTIVE
    USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid);
