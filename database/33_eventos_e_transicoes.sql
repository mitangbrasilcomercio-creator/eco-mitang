-- ============================================================================
-- 33. O LIVRO DE EVENTOS: MUDANCA DE ESTADO COM DATA DO FATO E DATA DO REGISTRO
-- ============================================================================
--
-- Ate aqui o sistema so sabia LER o passado. Havia 34 rotas e apenas 6
-- escreviam -- nenhuma escrevia fato de negocio. Nao existia maquina de
-- estados em lugar nenhum do projeto.
--
-- O pedido do Diego, com as palavras dele:
--
--   "permitir alteracoes de estado -- se algo esta aguardando aprovacao,
--    permitir que seja aprovado; se algo ainda nao tem nota fiscal, permitir
--    inserir a nota fiscal; se algo esta pendente de pagamento, permitir uma
--    atualizacao dizendo que foi pago -- e pegar QUANDO que eu atualizei isso,
--    ou se foi aprovado em um dia que eu nao tinha visto: foi pago semana
--    passada e eu nao vi. Entao poder colocar a data que foi pago."
--
-- Sao DUAS datas diferentes, e confundi-las e o erro que essa migration
-- impede para sempre:
--
--   ocorrido_em    -- quando o fato aconteceu no mundo (pode ser retroativo)
--   registrado_em  -- quando entrou no sistema (carimbado pelo banco)
--
-- A diferenca entre elas (defasagem_dias) e informacao de gestao: mostra onde
-- a informacao chega atrasada. O boleto da UFPA caiu em 02/09 e so foi
-- percebido em 05/09 -- tres dias em que o caixa projetado estava errado e
-- ninguem sabia.
--
-- TRES INVARIANTES QUE ESTA MIGRATION IMPOE
--
--   [1] Nao se registra o futuro como fato. ocorrido_em > hoje e recusado;
--       o que ainda vai acontecer e vencimento/previsao, que e outra coisa.
--   [2] Transicao que nao esta na tabela transicoes_permitidas nao acontece.
--       A REGRA E DADO, NAO CODIGO: regra nova e linha nova, sem deploy --
--       e assim que o sistema absorve as respostas que o Diego ainda vai dar.
--   [3] Evento nao se altera nem se apaga. Estorno e evento inverso.
--       (E a licao do R$ 18 milhoes: numero sem origem nao existe. Aqui todo
--        estado tem um evento com autor, data, prova e motivo.)
--
-- POR QUE O ESTADO E PROJECAO, E NAO UMA COLUNA SOLTA
-- O estado atual de qualquer entidade e o estado_novo do ultimo evento dela
-- (fn_estado_atual / vw_estado_atual). Assim esta migration funciona ANTES das
-- tabelas da fatia existirem -- da para registrar evento sobre o que ja esta
-- no banco hoje (orcamentos_historico, notas_fiscais, obrigacoes_recorrentes,
-- pendencias_classificacao). Quando as tabelas novas chegarem (34+), elas
-- ganham uma coluna 'estado' materializada a partir daqui, por desempenho --
-- nunca como fonte.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. AS REGRAS DE TRANSICAO (dados, nao codigo)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transicoes_permitidas (
    id                    SERIAL PRIMARY KEY,

    entidade              VARCHAR(40) NOT NULL,
    estado_de             VARCHAR(32) NOT NULL,
    tipo_evento           VARCHAR(48) NOT NULL,
    estado_para           VARCHAR(32) NOT NULL,

    -- O que a transicao exige de quem a registra.
    exige_prova           BOOLEAN NOT NULL DEFAULT FALSE,
    exige_justificativa   BOOLEAN NOT NULL DEFAULT FALSE,

    -- Retroagir muito exige explicacao: "foi pago semana passada" nao precisa,
    -- "foi pago em marco" precisa.
    dias_retroativos_livres INT NOT NULL DEFAULT 30
        CHECK (dias_retroativos_livres >= 0),

    -- Quem pode. Vazio = qualquer papel autenticado. Quando entrar outra
    -- pessoa na empresa, e uma linha nova aqui -- nao codigo novo.
    papeis                TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

    -- O texto que a tela mostra no botao, na voz de quem opera.
    rotulo                VARCHAR(60) NOT NULL,
    ajuda                 TEXT,

    -- Regra tem vigencia: a de ontem continua explicando o evento de ontem.
    vigencia_inicio       DATE NOT NULL DEFAULT CURRENT_DATE,
    vigencia_fim          DATE,

    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_transicao UNIQUE (entidade, estado_de, tipo_evento),
    CONSTRAINT chk_transicao_muda CHECK (estado_de <> estado_para)
);

COMMENT ON TABLE transicoes_permitidas IS
    'A maquina de estados em forma de dado. Regra nova e linha nova: nenhuma '
    'transicao acontece sem estar aqui, e nenhuma precisa de deploy para existir.';
COMMENT ON COLUMN transicoes_permitidas.dias_retroativos_livres IS
    'Ate quantos dias para tras o fato pode ser datado sem justificativa. '
    'Acima disso o sistema pede o motivo -- retroagir muito e excecao, nao rotina.';

CREATE INDEX IF NOT EXISTS idx_transicoes_entidade ON transicoes_permitidas (entidade, estado_de);

-- ---------------------------------------------------------------------------
-- 2. O LIVRO
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eventos_negocio (
    id                BIGSERIAL PRIMARY KEY,
    empresa_id        UUID NOT NULL REFERENCES empresas(id),

    -- O que mudou. Sem FK de proposito: o livro vale para tabelas que ainda
    -- nao existem e para entidades com chave natural (o item '080826/1').
    entidade          VARCHAR(40) NOT NULL,
    entidade_id       VARCHAR(120) NOT NULL,

    tipo_evento       VARCHAR(48) NOT NULL,
    estado_anterior   VARCHAR(32),
    estado_novo       VARCHAR(32) NOT NULL,

    -- AS DUAS DATAS. Vide cabecalho.
    ocorrido_em       DATE NOT NULL,
    registrado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    registrado_data   DATE NOT NULL DEFAULT CURRENT_DATE,
    defasagem_dias    INT GENERATED ALWAYS AS (registrado_data - ocorrido_em) STORED,

    autor             VARCHAR(255) NOT NULL,
    origem            VARCHAR(16) NOT NULL DEFAULT 'TELA'
        CHECK (origem IN ('TELA', 'IMPORTADOR', 'SCRIPT', 'AUTOMACAO', 'MIGRACAO')),

    -- A prova. documento_id aponta para a tabela 'documentos' quando ela
    -- existir (34+); documento_ref guarda o caminho no Drive ate la.
    documento_id      UUID,
    documento_ref     TEXT,

    justificativa     TEXT,

    -- O resto do fato: valor, conta, numero da NF, celula escolhida, PO.
    dados             JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Estorno e evento inverso, nunca DELETE.
    reverte_evento_id BIGINT REFERENCES eventos_negocio(id),

    -- Importador roda de novo e nao duplica.
    chave_idempotencia VARCHAR(120)
);

COMMENT ON TABLE eventos_negocio IS
    'Livro de eventos: toda mudanca de estado do negocio, so-insercao. '
    'O estado atual de qualquer entidade e o estado_novo do ultimo evento dela.';
COMMENT ON COLUMN eventos_negocio.ocorrido_em IS
    'Quando o fato aconteceu no mundo. Pode ser retroativo ("foi pago semana passada").';
COMMENT ON COLUMN eventos_negocio.registrado_em IS
    'Quando entrou no sistema. Carimbado pelo banco; nao se edita.';
COMMENT ON COLUMN eventos_negocio.defasagem_dias IS
    'registrado - ocorrido. Quantos dias a informacao levou para chegar.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_evento_idempotencia
    ON eventos_negocio (empresa_id, entidade, entidade_id, tipo_evento, chave_idempotencia)
    WHERE chave_idempotencia IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_evento_entidade ON eventos_negocio (entidade, entidade_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_evento_empresa_data ON eventos_negocio (empresa_id, ocorrido_em DESC);
CREATE INDEX IF NOT EXISTS idx_evento_defasagem ON eventos_negocio (defasagem_dias) WHERE defasagem_dias > 0;

-- ---------------------------------------------------------------------------
-- 3. ESTADO ATUAL = ULTIMO EVENTO
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_estado_atual(p_entidade VARCHAR, p_entidade_id VARCHAR)
RETURNS VARCHAR
LANGUAGE sql
STABLE
AS $$
    SELECT estado_novo
      FROM eventos_negocio
     WHERE entidade = p_entidade AND entidade_id = p_entidade_id
     ORDER BY id DESC
     LIMIT 1;
$$;

COMMENT ON FUNCTION fn_estado_atual(VARCHAR, VARCHAR) IS
    'O estado atual e uma projecao do livro, nunca um campo digitado.';

CREATE OR REPLACE VIEW vw_estado_atual
WITH (security_invoker = true) AS
SELECT DISTINCT ON (e.entidade, e.entidade_id)
       e.empresa_id,
       e.entidade,
       e.entidade_id,
       e.estado_novo        AS estado,
       e.tipo_evento        AS ultimo_evento,
       e.ocorrido_em,
       e.registrado_em,
       e.defasagem_dias,
       e.autor,
       e.origem,
       e.id                 AS evento_id
  FROM eventos_negocio e
 ORDER BY e.entidade, e.entidade_id, e.id DESC;

COMMENT ON VIEW vw_estado_atual IS
    'Uma linha por entidade com o estado vigente e de onde ele veio.';

-- ---------------------------------------------------------------------------
-- 4. A VALIDACAO (o que faz o livro ser confiavel)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_evento_valida()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_regra    transicoes_permitidas%ROWTYPE;
    v_atual    VARCHAR(32);
    v_ultima_data DATE;
    v_defas    INT;
BEGIN
    -- [1] Nao se registra o futuro como fato.
    IF NEW.ocorrido_em > CURRENT_DATE THEN
        RAISE EXCEPTION
            'DATA_NO_FUTURO: o fato nao pode ter acontecido em % (hoje e %). '
            'O que ainda vai acontecer e vencimento ou previsao, nao evento.',
            NEW.ocorrido_em, CURRENT_DATE
            USING ERRCODE = 'check_violation';
    END IF;

    -- [2] O estado anterior tem de ser o estado real da entidade.
    v_atual := fn_estado_atual(NEW.entidade, NEW.entidade_id);
    IF v_atual IS NOT NULL AND NEW.estado_anterior IS DISTINCT FROM v_atual THEN
        RAISE EXCEPTION
            'CONFLITO_DE_ESTADO: % % esta em "%", nao em "%". '
            'Alguem mudou antes de voce -- recarregue e tente de novo.',
            NEW.entidade, NEW.entidade_id, v_atual, NEW.estado_anterior
            USING ERRCODE = 'serialization_failure';
    END IF;
    -- Primeiro evento da entidade. Duas portas de entrada, ambas legitimas:
    --   [a] o chamador declara de onde parte (carga inicial: a linha da planilha
    --       ja esta 'COTADO' ha meses, e o livro comeca dali);
    --   [b] nao declara nada -- a entidade nasce agora, e a regra de abertura
    --       parte de 'INEXISTENTE'.
    IF v_atual IS NULL AND NEW.estado_anterior IS NULL THEN
        NEW.estado_anterior := 'INEXISTENTE';
    END IF;

    -- [2b] A historia de uma entidade nao anda para tras: um fato nao pode ter
    -- acontecido antes do fato anterior dela. (Retroagir e permitido; reescrever
    -- a ordem dos acontecimentos, nao.)
    IF v_atual IS NOT NULL THEN
        SELECT ocorrido_em INTO v_ultima_data
          FROM eventos_negocio
         WHERE entidade = NEW.entidade AND entidade_id = NEW.entidade_id
         ORDER BY id DESC LIMIT 1;
        IF NEW.ocorrido_em < v_ultima_data THEN
            RAISE EXCEPTION
                'FORA_DE_ORDEM: o fato anterior de % % aconteceu em %, e este esta '
                'datado em %. Corrija a data, ou registre primeiro o que veio antes.',
                NEW.entidade, NEW.entidade_id, v_ultima_data, NEW.ocorrido_em
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- [3] A transicao tem de existir na tabela de regras, vigente hoje.
    SELECT * INTO v_regra
      FROM transicoes_permitidas
     WHERE entidade = NEW.entidade
       AND estado_de = NEW.estado_anterior
       AND tipo_evento = NEW.tipo_evento
       AND vigencia_inicio <= CURRENT_DATE
       AND (vigencia_fim IS NULL OR vigencia_fim >= CURRENT_DATE)
     LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'TRANSICAO_INVALIDA: nao existe regra para % em "%" receber o evento "%". '
            'Se essa transicao deveria existir, ela e uma linha nova em transicoes_permitidas.',
            NEW.entidade, NEW.estado_anterior, NEW.tipo_evento
            USING ERRCODE = 'check_violation';
    END IF;

    -- O destino vem da regra: quem registra nao escolhe para onde vai.
    NEW.estado_novo := v_regra.estado_para;

    -- [4] Prova obrigatoria.
    IF v_regra.exige_prova
       AND NEW.documento_id IS NULL
       AND (NEW.documento_ref IS NULL OR btrim(NEW.documento_ref) = '') THEN
        RAISE EXCEPTION
            'PROVA_OBRIGATORIA: "%" so entra com o documento que prova (comprovante, '
            'nota fiscal ou a linha do extrato).', v_regra.rotulo
            USING ERRCODE = 'check_violation';
    END IF;

    -- [5] Justificativa: quando a regra exige, e quando se retroage demais.
    v_defas := CURRENT_DATE - NEW.ocorrido_em;
    IF v_regra.exige_justificativa
       AND (NEW.justificativa IS NULL OR length(btrim(NEW.justificativa)) < 10) THEN
        RAISE EXCEPTION
            'JUSTIFICATIVA_OBRIGATORIA: "%" exige o motivo (ao menos 10 caracteres).',
            v_regra.rotulo
            USING ERRCODE = 'check_violation';
    END IF;
    IF v_defas > v_regra.dias_retroativos_livres
       AND (NEW.justificativa IS NULL OR length(btrim(NEW.justificativa)) < 10) THEN
        RAISE EXCEPTION
            'RETROATIVO_SEM_MOTIVO: voce esta registrando um fato de % dias atras (%). '
            'Ate % dias nao precisa explicar; alem disso, escreva o motivo.',
            v_defas, NEW.ocorrido_em, v_regra.dias_retroativos_livres
            USING ERRCODE = 'check_violation';
    END IF;

    -- [6] Autor sempre. Sem dono, o evento nao vale.
    IF NEW.autor IS NULL OR btrim(NEW.autor) = '' THEN
        RAISE EXCEPTION 'AUTOR_OBRIGATORIO: todo evento tem dono.'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_evento_valida ON eventos_negocio;
CREATE TRIGGER trg_evento_valida
    BEFORE INSERT ON eventos_negocio
    FOR EACH ROW EXECUTE FUNCTION fn_evento_valida();

-- ---------------------------------------------------------------------------
-- 5. SO-INSERCAO: evento nao se altera nem se apaga
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_evento_imutavel()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'EVENTO_IMUTAVEL: o livro de eventos e so-insercao. Para desfazer, '
        'registre o evento inverso (reverte_evento_id) -- o historico nunca se apaga.'
        USING ERRCODE = 'check_violation';
END $$;

DROP TRIGGER IF EXISTS trg_evento_imutavel ON eventos_negocio;
CREATE TRIGGER trg_evento_imutavel
    BEFORE UPDATE OR DELETE ON eventos_negocio
    FOR EACH ROW EXECUTE FUNCTION fn_evento_imutavel();

-- ---------------------------------------------------------------------------
-- 6. RLS E PRIVILEGIOS
-- ---------------------------------------------------------------------------
ALTER TABLE eventos_negocio       ENABLE ROW LEVEL SECURITY;
ALTER TABLE transicoes_permitidas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON eventos_negocio;
CREATE POLICY tenant_isolation ON eventos_negocio AS PERMISSIVE FOR ALL
    USING (empresa_id = ANY (app_empresa_ids()))
    WITH CHECK (empresa_id = app_current_empresa());

-- As regras de transicao sao do sistema, iguais para todas as empresas:
-- leitura livre, escrita so por migration.
DROP POLICY IF EXISTS leitura_livre ON transicoes_permitidas;
CREATE POLICY leitura_livre ON transicoes_permitidas AS PERMISSIVE FOR SELECT
    USING (true);

GRANT SELECT, INSERT ON eventos_negocio TO eco_app;
GRANT USAGE, SELECT ON SEQUENCE eventos_negocio_id_seq TO eco_app;
GRANT SELECT ON transicoes_permitidas TO eco_app;
GRANT SELECT ON vw_estado_atual TO eco_app;

-- Segunda tranca, e ela precisa ser EXPLICITA: migrations anteriores concedem
-- privilegio amplo a eco_app (default privileges do schema), entao apenas "nao
-- conceder" nao basta -- conferi e o papel vinha com UPDATE e DELETE. Aqui se
-- revoga: o trigger recusa, e o privilegio tambem.
REVOKE UPDATE, DELETE, TRUNCATE ON eventos_negocio FROM eco_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON transicoes_permitidas FROM eco_app;

-- ---------------------------------------------------------------------------
-- 7. AS REGRAS DA PRIMEIRA FATIA: DO ORCAMENTO AO DINHEIRO
-- ---------------------------------------------------------------------------
INSERT INTO transicoes_permitidas
    (entidade, estado_de, tipo_evento, estado_para, exige_prova, exige_justificativa, dias_retroativos_livres, rotulo, ajuda)
VALUES
-- Abertura: como cada coisa entra no livro. Sem isso, uma entidade so poderia
-- nascer por carga declarada -- e o comeco da historia ficaria sem autor.
('orcamento_item','INEXISTENTE','ITEM_COTADO','COTADO',           false,false,3650,'Cotar',
 'O item entrou no orcamento. A data e a da emissao do orcamento.'),
('parcela','INEXISTENTE','PARCELA_PREVISTA','PREVISTA',           false,false,3650,'Criar titulo',
 'Nasce da condicao de pagamento do orcamento, da PO ou da duplicata da nota.'),
('nota_fiscal','INEXISTENTE','NF_IMPORTADA','IMPORTADA',          false,false,3650,'Importar nota',
 'O XML ou o PDF entrou no acervo.'),
('pendencia','INEXISTENTE','PENDENCIA_ABERTA','ABERTA',           false,false,3650,'Abrir pendencia',
 'O sistema nao conseguiu decidir sozinho e guardou a evidencia.'),
('obrigacao','INEXISTENTE','OBRIGACAO_LANCADA','A_PAGAR',         false,false,3650,'Lancar conta',
 'Uma conta a pagar entrou no calendario.'),
('pack_bom','INEXISTENTE','BOM_PROPOSTA','CANDIDATA',             false,false,3650,'Propor BOM',
 'Uma contagem candidata: convive com as outras ate a confirmacao.'),
('serial','INEXISTENTE','SERIAL_CRIADO','EM_PRODUCAO',            false,false,3650,'Abrir serial',
 'Um pack entrou em montagem.'),

-- Item de orcamento: a venda e decidida por linha (regra R-COM-01)
('orcamento_item','COTADO','ITEM_APROVADO','APROVADO',            false,false,60,'Aprovar',
 'O cliente aprovou. Informe a data em que ele aprovou, a quantidade e a PO.'),
('orcamento_item','COTADO','ITEM_NAO_APROVADO','NAO_APROVADO',    false,false,90,'Nao aprovado',
 'O cliente nao seguiu com este item.'),
('orcamento_item','COTADO','ITEM_CANCELADO','CANCELADO',          false,true, 90,'Cancelar',
 'Pedido cancelado nao conta como venda, mesmo marcado como aprovado.'),
('orcamento_item','APROVADO','ITEM_CANCELADO','CANCELADO',        false,true, 90,'Cancelar',
 'Cancelamento depois da aprovacao: exige motivo.'),
('orcamento_item','APROVADO','NF_REGISTRADA','FATURADO',          true, false,60,'Lancar a nota',
 'Numero, serie e data da nota, com o PDF ou o XML.'),
('orcamento_item','FATURADO','NF_CANCELADA','APROVADO',           false,true, 90,'Cancelar a nota',
 'A nota foi cancelada; informe qual a substitui.'),

-- Parcela a receber: e aqui que mora "foi pago semana passada e eu nao vi"
('parcela','PREVISTA','PARCELA_EMITIDA','EMITIDA',                false,false,30,'Boleto emitido',
 'O titulo foi emitido para o cliente.'),
('parcela','PREVISTA','PARCELA_PAGA','PAGA',                      true, false,30,'Dar baixa',
 'Informe a data em que o dinheiro entrou e anexe o comprovante.'),
('parcela','EMITIDA','PARCELA_PAGA','PAGA',                       true, false,30,'Dar baixa',
 'Informe a data em que o dinheiro entrou e anexe o comprovante.'),
('parcela','EMITIDA','PARCELA_PAGA_PARCIAL','PARCIAL',            true, false,30,'Baixa parcial',
 'Entrou parte do valor: o titulo continua aberto pelo saldo.'),
('parcela','PARCIAL','PARCELA_PAGA','PAGA',                       true, false,30,'Quitar o saldo',
 'Entrou o restante.'),
('parcela','PREVISTA','PARCELA_RENEGOCIADA','RENEGOCIADA',        false,true, 60,'Renegociar',
 'O cliente pediu para dividir ou adiar; as novas parcelas nascem daqui.'),
('parcela','EMITIDA','PARCELA_RENEGOCIADA','RENEGOCIADA',         false,true, 60,'Renegociar',
 'O cliente pediu para dividir ou adiar; as novas parcelas nascem daqui.'),
('parcela','EMITIDA','PARCELA_CANCELADA','CANCELADA',             false,true, 60,'Cancelar o titulo',
 'O titulo nao sera cobrado.'),
('parcela','PAGA','PAGAMENTO_ESTORNADO','EMITIDA',                true, true, 60,'Estornar',
 'O pagamento voltou. O evento original permanece no historico.'),

-- Nota fiscal
('nota_fiscal','IMPORTADA','NF_CONCILIADA','CONCILIADA',          false,false,90,'Conciliar',
 'A nota foi casada com a venda e com o recebimento.'),
('nota_fiscal','AUTORIZADA','NF_CANCELADA','CANCELADA',           false,true, 90,'Cancelar',
 'Informe o numero da nota que a substitui.'),

-- Pendencia: e a fila que substitui os Docs de perguntas
('pendencia','ABERTA','PENDENCIA_RESOLVIDA','RESOLVIDA',          false,true, 365,'Resolver',
 'Escreva a decisao: ela vira regra e passa a valer para os proximos casos.'),
('pendencia','ABERTA','PENDENCIA_DESCARTADA','DESCARTADA',        false,true, 365,'Descartar',
 'Nao se aplica; diga por que.'),

-- Obrigacao a pagar
('obrigacao','A_PAGAR','OBRIGACAO_PROGRAMADA','PROGRAMADO',       false,false,30,'Agendar',
 'Boleto agendado no banco.'),
('obrigacao','A_PAGAR','OBRIGACAO_PAGA','PAGA',                   true, false,30,'Marcar como paga',
 'Data em que saiu do caixa, com o comprovante.'),
('obrigacao','PROGRAMADO','OBRIGACAO_PAGA','PAGA',                true, false,30,'Marcar como paga',
 'Data em que saiu do caixa, com o comprovante.'),

-- BOM de pack: as duas candidatas de 50 x 60 pilhas convivem ate a decisao
('pack_bom','CANDIDATA','BOM_CONFIRMADA','CONFIRMADA',            false,true, 365,'Confirmar a BOM',
 'Diga de onde veio a confirmacao (abriu um pack, documento do fabricante).'),
('pack_bom','CANDIDATA','BOM_DESCARTADA','DESCARTADA',            false,true, 365,'Descartar',
 'Esta contagem nao e a certa.'),
('pack_bom','CONFIRMADA','BOM_SUBSTITUIDA','SUBSTITUIDA',         false,true, 365,'Nova versao',
 'A montagem mudou: a versao anterior continua valendo para os packs antigos.'),

-- Serial: da bancada ate o cliente
('serial','EM_PRODUCAO','ENSAIO_REGISTRADO','ENSAIADO',           true, false,60,'Registrar ensaio',
 'O CSV do testador e a prova.'),
('serial','ENSAIADO','ENVIO_APROVADO','LIBERADO',                 false,false,60,'Liberar',
 'Pack aprovado para sair.'),
('serial','ENSAIADO','RETRABALHO_ABERTO','RETRABALHO',            false,true, 60,'Mandar para retrabalho',
 'Ficou fora da faixa da familia; diga o que sera refeito.'),
('serial','LIBERADO','SAIDA_REGISTRADA','VENDIDO',                true, false,60,'Registrar saida',
 'Controle de Saida de Material com o S/N preenchido.')
ON CONFLICT (entidade, estado_de, tipo_evento) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 8. CONFERENCIA
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    n_regras INT;
BEGIN
    SELECT count(*) INTO n_regras FROM transicoes_permitidas;
    RAISE NOTICE 'Livro de eventos pronto. % transicoes permitidas em % entidades.',
        n_regras, (SELECT count(DISTINCT entidade) FROM transicoes_permitidas);
END $$;
