export interface ApontamentoHoras {
  id: string;
  empresa_id: string;
  os_id: string;
  colaborador_id: string;
  data_hora_inicio: string;
  data_hora_fim?: string | null;
  descricao: string;
  created_at: string;
  updated_at: string;
}

export interface MovimentacaoEstoque {
  id: string;
  empresa_id: string;
  os_id: string;
  item_catalogo_id: string;
  quantidade: number;
  lote?: string | null;
  created_at: string;
}
