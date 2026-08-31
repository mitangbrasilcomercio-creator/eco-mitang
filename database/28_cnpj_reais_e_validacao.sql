-- ============================================================================
-- 28. CNPJ REAIS DAS QUATRO EMPRESAS, E A TRAVA QUE IMPEDE PLACEHOLDER
-- ============================================================================
--
-- [ERRO ANTERIOR]
-- Duas das quatro empresas da holding estavam cadastradas com CNPJ inventado:
-- 33.333.333/0001-03 e 44.444.444/0001-04. Nenhum dos dois passa no digito
-- verificador -- foram digitados como marcador temporario e ficaram. Enquanto
-- isso, qualquer tela que exiba o CNPJ da empresa mostra um numero falso ao
-- usuario, e uma nota fiscal emitida a partir dele seria rejeitada.
--
-- [CORRECAO]
-- Os quatro CNPJ reais entram, e uma constraint passa a recusar CNPJ que nao
-- feche o digito verificador. O placeholder nao volta porque o banco nao
-- aceita mais.
--
-- Os nomes tambem estavam errados nas duas: 'Mitang Services' e uma abreviacao
-- que ninguem usa, e 'Mitang Academy / Mitang Treinamentos Maritimos' nao e
-- uma empresa da holding -- a empresa de cursos offshore chama Sea House.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Validacao de CNPJ pelo digito verificador
-- ---------------------------------------------------------------------------
-- Modulo 11 sobre os 12 primeiros digitos, com os pesos da Receita Federal.
-- Recusa tambem sequencias repetidas (11111111111111), que passam na conta
-- mas nao existem como inscricao.
CREATE OR REPLACE FUNCTION cnpj_valido(p_cnpj TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    n     TEXT;
    pesos INT[];
    soma  INT;
    resto INT;
    dv    INT;
    i     INT;
BEGIN
    IF p_cnpj IS NULL THEN
        RETURN TRUE;   -- ausencia e tratada por NOT NULL, nao aqui
    END IF;

    n := regexp_replace(p_cnpj, '[^0-9]', '', 'g');

    IF length(n) <> 14 THEN
        RETURN FALSE;
    END IF;

    -- 00000000000000, 11111111111111, ... fecham a conta mas nao sao CNPJ
    IF n ~ '^(.)\1{13}$' THEN
        RETURN FALSE;
    END IF;

    FOR passo IN 1..2 LOOP
        IF passo = 1 THEN
            pesos := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2];
        ELSE
            pesos := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
        END IF;

        soma := 0;
        FOR i IN 1..array_length(pesos, 1) LOOP
            soma := soma + substring(n FROM i FOR 1)::INT * pesos[i];
        END LOOP;

        resto := soma % 11;
        dv := CASE WHEN resto < 2 THEN 0 ELSE 11 - resto END;

        IF substring(n FROM 12 + passo FOR 1)::INT <> dv THEN
            RETURN FALSE;
        END IF;
    END LOOP;

    RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION cnpj_valido(TEXT) IS
    'Digito verificador de CNPJ. Nao prova que a inscricao existe na Receita -- '
    'prova que o numero nao foi digitado errado nem inventado.';

-- ---------------------------------------------------------------------------
-- 2. Os quatro CNPJ reais
-- ---------------------------------------------------------------------------
-- As duas primeiras ja estavam certas; ficam aqui para o registro ser completo
-- e para a migration ser conferivel de uma olhada so.

UPDATE empresas SET
    razao_social   = 'MITANG BRASIL COMERCIO E SERVICOS LTDA',
    nome_fantasia  = 'Mitang Brasil',
    ramo_atividade = 'Manufatura Baterias',
    updated_at     = NOW()
WHERE cnpj = '44221348000184';

UPDATE empresas SET
    razao_social   = 'ARANDU COMERCIO E SERVICOS LTDA',
    nome_fantasia  = 'Arandu',
    ramo_atividade = 'Locacao Offshore',
    updated_at     = NOW()
WHERE cnpj = '61349982000116';

-- Servicos offshore: era 'Mitang Services' com CNPJ 33.333.333/0001-03.
-- A matriz fica no Rio; ha filial em Macae sob 14.559.354/0002-66, que e o
-- mesmo CNPJ raiz e sera tratada como estabelecimento quando o modulo fiscal
-- precisar distinguir emissao por filial.
UPDATE empresas SET
    cnpj           = '14559354000185',
    razao_social   = 'MITANG BRASIL SOLUCOES SUBMARINAS LTDA',
    nome_fantasia  = 'Mitang Solucoes Submarinas',
    ramo_atividade = 'Servicos Offshore',
    updated_at     = NOW()
WHERE cnpj = '33333333000103';

-- Cursos offshore: era 'Mitang Academy / Mitang Treinamentos Maritimos SA'
-- com CNPJ 44.444.444/0001-04. A empresa chama Sea House.
UPDATE empresas SET
    cnpj           = '49977717000187',
    razao_social   = 'SEA HOUSE BRASIL',
    nome_fantasia  = 'Sea House',
    ramo_atividade = 'Cursos',
    updated_at     = NOW()
WHERE cnpj = '44444444000104';

-- ---------------------------------------------------------------------------
-- 3. A trava
-- ---------------------------------------------------------------------------
-- Aplicada depois dos UPDATE: se algum CNPJ acima estivesse errado, a
-- migration falha aqui e a transacao inteira volta atras.
ALTER TABLE empresas DROP CONSTRAINT IF EXISTS chk_empresas_cnpj_valido;
ALTER TABLE empresas ADD CONSTRAINT chk_empresas_cnpj_valido
    CHECK (cnpj_valido(cnpj));

-- Conferencia explicita: as quatro empresas, todas com CNPJ que fecha.
DO $$
DECLARE
    invalidas INT;
    total     INT;
BEGIN
    SELECT count(*) INTO total FROM empresas;
    SELECT count(*) INTO invalidas FROM empresas WHERE NOT cnpj_valido(cnpj);

    IF invalidas > 0 THEN
        RAISE EXCEPTION 'Restaram % empresas com CNPJ invalido de % cadastradas', invalidas, total;
    END IF;

    RAISE NOTICE 'CNPJ conferido em % empresas: todos validos.', total;
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
-- ALTER TABLE empresas DROP CONSTRAINT IF EXISTS chk_empresas_cnpj_valido;
-- UPDATE empresas SET cnpj='33333333000103', razao_social='Mitang Subsea & Servicos Ltda',
--        nome_fantasia='Mitang Services' WHERE cnpj='14559354000185';
-- UPDATE empresas SET cnpj='44444444000104', razao_social='Mitang Treinamentos Maritimos SA',
--        nome_fantasia='Mitang Academy' WHERE cnpj='49977717000187';
-- DROP FUNCTION IF EXISTS cnpj_valido(TEXT);
