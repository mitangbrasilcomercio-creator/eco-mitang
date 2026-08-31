-- ============================================================================
-- ANONIMIZACAO DO ESPELHO DE PRODUCAO
-- ============================================================================
--
-- Roda SEMPRE, e apenas, depois de restaurar um dump de producao em
-- homologacao. O plano de execucao e explicito no ponto: "sem dado real em
-- homologacao".
--
-- O que se preserva e o que se descarta segue um criterio unico:
--   PRESERVA  tudo que muda o resultado de um calculo -- valor, data, CNPJ de
--             pessoa juridica, categoria, empresa. Sem isso o espelho nao serve
--             para testar DRE, conciliacao ou isolamento entre tenants.
--   DESTROI   tudo que identifica uma pessoa fisica ou permite entrar no
--             sistema -- e-mail, senha, telefone, nome de pessoa, CPF.
--
-- CNPJ de empresa e dado publico (consultavel na Receita) e e a chave do
-- pareamento nota x pagamento: mante-lo e o que permite reproduzir aqui o
-- teste de duplicidade do DRE. CPF nao tem essa funcao, e vai embora.
--
-- Este arquivo NAO recebe numeracao de migration de proposito -- ele nunca
-- deve ser alcancado por 'db:migrate' em lugar nenhum.
-- ============================================================================

-- --- Trava: jamais rodar na base de producao -------------------------------
-- O container de homologacao e um PostgreSQL puro. Producao e Supabase, e traz
-- papeis que so existem la.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('supabase_admin', 'supabase_auth_admin')) THEN
        RAISE EXCEPTION
            'RECUSADO: este banco tem papeis da Supabase. anonimizar.sql so roda no container de homologacao.';
    END IF;
END $$;

-- --- Acesso ao sistema -----------------------------------------------------
-- Toda senha vira a mesma, conhecida e sem valor fora daqui: 'homologacao'.
-- Hash bcrypt de custo 12, fixado; nao ha segredo a proteger num container
-- local descartavel, e uma senha estavel evita reescrever o .env a cada reset.
UPDATE usuarios
SET
    email             = 'usuario' || LEFT(MD5(id::text), 6) || '@homologacao.local',
    nome              = 'Usuario ' || UPPER(LEFT(MD5(id::text), 4)),
    senha_hash        = '$2b$12$MUO.uWrzSzrcNB6G40gJmus8rziEFrUGBa/ZECX8C58KpW0YLSCs2',
    tentativas_falhas = 0,
    bloqueado_ate     = NULL,
    ultimo_login_em   = NULL;

-- O log de acesso guarda e-mails digitados, inclusive de quem errou o login.
TRUNCATE TABLE usuarios_log_acesso;

-- --- Contato de cliente ----------------------------------------------------
-- razao_social_nome e cnpj_cpf de PJ ficam: sao a chave fiscal.
UPDATE clientes
SET
    email           = CASE WHEN email           IS NULL THEN NULL ELSE 'cliente' || LEFT(MD5(id::text), 6) || '@homologacao.local' END,
    telefone        = CASE WHEN telefone        IS NULL THEN NULL ELSE '(00) 00000-0000' END,
    email_fiscal    = CASE WHEN email_fiscal    IS NULL THEN NULL ELSE 'fiscal' || LEFT(MD5(id::text), 6) || '@homologacao.local' END,
    telefone_fiscal = CASE WHEN telefone_fiscal IS NULL THEN NULL ELSE '(00) 00000-0000' END;

-- Cliente pessoa fisica: 11 digitos no documento. Nome e CPF saem.
UPDATE clientes
SET
    razao_social_nome = 'Cliente PF ' || UPPER(LEFT(MD5(id::text), 6)),
    cnpj_cpf          = '000.000.000-00'
WHERE LENGTH(REGEXP_REPLACE(cnpj_cpf, '[^0-9]', '', 'g')) = 11;

UPDATE orcamentos_historico
SET
    cliente_contato  = CASE WHEN cliente_contato IS NULL THEN NULL ELSE 'Contato Homologacao' END,
    cliente_cnpj_cpf = CASE WHEN LENGTH(REGEXP_REPLACE(COALESCE(cliente_cnpj_cpf, ''), '[^0-9]', '', 'g')) = 11
                            THEN '000.000.000-00' ELSE cliente_cnpj_cpf END;

-- Parceiro pessoa fisica (autonomo, prestador PF).
UPDATE parceiros_negocio
SET
    nome      = 'Parceiro PF ' || UPPER(LEFT(MD5(id::text), 6)),
    documento = '000.000.000-00'
WHERE documento IS NOT NULL
  AND LENGTH(REGEXP_REPLACE(documento, '[^0-9]', '', 'g')) = 11;

-- --- Pessoas ---------------------------------------------------------------
-- Nome e matricula de colaborador sao dado pessoal. Cargo fica: e o que a
-- Fase 3 vai usar para testar requisito por funcao.
UPDATE colaboradores
SET
    nome      = 'Colaborador ' || UPPER(LEFT(MD5(id::text), 6)),
    matricula = 'HML-' || UPPER(LEFT(MD5(id::text), 6));

-- Texto livre vindo de e-mail e WhatsApp: assinatura, telefone, nome proprio.
UPDATE tickets_triagem
SET dados_contato_bruto = '[anonimizado em homologacao]';

-- --- Contraparte bancaria pessoa fisica ------------------------------------
-- O CNPJ da contraparte e a chave do pareamento com a nota fiscal e fica.
-- CPF em memo de PIX ou TED nao tem essa funcao.
UPDATE transacoes_bancarias
SET documento_contraparte = '000.000.000-00'
WHERE documento_contraparte IS NOT NULL
  AND LENGTH(REGEXP_REPLACE(documento_contraparte, '[^0-9]', '', 'g')) = 11;

-- --- Registro do que este espelho e ---------------------------------------
COMMENT ON DATABASE eco_mitang IS
    'HOMOLOGACAO -- espelho anonimizado de producao. Senha de todo usuario: homologacao';
