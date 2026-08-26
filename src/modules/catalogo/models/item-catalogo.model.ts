export type TipoItem = 'Produto' | 'Locacao' | 'Servico' | 'Curso';

export interface ItemCatalogo {
  id: string;
  empresa_id: string;
  tipo_item: TipoItem;
  codigo_sku?: string | null;
  nome_comercial: string;
  preco_base: number;
  quantidade_estoque: number;
  atributos_extras: Record<string, any>;
  status_ativo: boolean;
  created_at: string;
  updated_at: string;
}
