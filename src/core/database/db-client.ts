export class InMemoryDB {
  public data: Record<string, any[]> = {
    empresas: [],
    catalogo_universal: [],
    tickets_triagem: [],
    clientes: [],
    cotacoes: [],
    cotacoes_itens: [],
    ordens_servico: [],
    colaboradores: [],
    apontamentos_horas: [],
    movimentacoes_estoque: [],
    planos_faturamento: [],
    parcelas_recebimento: [],
    auditorias_qsms: [],
    registros_nao_conformidade: [],
    analytics_vendas_mensal: [],
    analytics_operacao_qualidade: []
  };

  async transaction<T>(cb: (trx: this) => Promise<T>): Promise<T> {
    return await cb(this);
  }
}
export const dbInstance = new InMemoryDB();
