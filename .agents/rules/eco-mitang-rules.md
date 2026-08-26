# Regras Mandatórias de Desenvolvimento: Eco-Mitang ERP

Ao trabalhar neste repositório, qualquer assistente de IA deve seguir estritamente estas diretrizes:

1. **Segurança Multi-Tenant & SQL Parametrizado**:
   - Nunca utilize interpolação de strings em consultas SQL ou comandos de sessão.
   - Sempre utilize parâmetros preparados `$1, $2, ...`.
   - Todas as operações em tabelas do banco devem respeitar o `empresa_id` do tenant ativo.

2. **Arquitetura Orientada a Eventos (Event-Driven)**:
   - Sempre que alterar o status de uma entidade de domínio (Catálogo, Cotação, Ordem de Serviço, Pagamento, QSMS, Cliente), publique o evento correspondente no `globalEventBus`.
   - Adicione os tipos de payload em `src/core/events/events.types.ts`.

3. **Validação Estrita de Schemas (Zod)**:
   - Em operações polimórficas (como Catálogo Universal), a validação deve ser aplicada tanto no `POST` quanto no `PUT`/`PATCH`.

4. **Filosofia do Usuário: Automação Cadastral & Monitoramento em Background**:
   - Sempre que criar ou evoluir módulos de entidades cadastradas (Clientes, Fornecedores, Insumos, Ativos Offshore), implemente:
     * Auto-enriquecimento via fontes públicas/oficiais.
     * Detecção de inconsistências ou riscos de compliance (ex: CNPJ inapto, certidões vencidas).
     * Rotina de sincronização em background ("por trás dos panos").
     * Tabela de histórico de alterações (SCD Tipo 2 / CDC) com registro da data de vigência da alteração.

5. **Integridade de Testes & Graceful Shutdown**:
   - Todos os scripts de teste devem encerrar conexões de banco (`pgPool.end()`, `client.end()`) e invocar `process.exit(0)` ao final para evitar que o processo Node permaneça travado.
   - Sempre execute `npm run build` e `npm run test:all` para certificar que nada foi quebrado.
