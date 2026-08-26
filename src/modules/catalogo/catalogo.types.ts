export type TipoItemCatalogo = 'PRODUTO' | 'LOCACAO' | 'SERVICO' | 'CURSO';

export interface BaseEntity {
  id: string;
  empresa_id: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface CatalogoUniversalBase extends BaseEntity {
  nome: string;
  descricao_tecnica?: string | null;
  quantidade_estoque_atual: number;
}

export interface DetalhesProduto {
  codigo_sku?: string;
  unidade_medida: string;
  capacidade_ah?: number;
  voltagem_nominal?: number;
  preco_base: number;
}

export interface CatalogoProduto extends CatalogoUniversalBase {
  tipo_item: 'PRODUTO';
  detalhes: DetalhesProduto;
}

export interface DetalhesLocacao {
  unidade_cobranca: 'DIARIA' | 'MENSAL' | 'POR_PROJETO';
  exige_mobilizacao: boolean;
  preco_base: number;
}

export interface CatalogoLocacao extends CatalogoUniversalBase {
  tipo_item: 'LOCACAO';
  detalhes: DetalhesLocacao;
}

export interface DetalhesServico {
  unidade_medida: 'HORA_HOMEM' | 'DIARIA_TECNICO' | 'ESCOPO_FECHADO';
  preco_base: number;
}

export interface CatalogoServico extends CatalogoUniversalBase {
  tipo_item: 'SERVICO';
  detalhes: DetalhesServico;
}

export interface DetalhesCurso {
  carga_horaria_horas: number;
  modalidade: 'EAD' | 'PRESENCIAL' | 'HIBRIDO';
  preco_base: number;
}

export interface CatalogoCurso extends CatalogoUniversalBase {
  tipo_item: 'CURSO';
  detalhes: DetalhesCurso;
}

export type CatalogoUniversalItem =
  | CatalogoProduto
  | CatalogoLocacao
  | CatalogoServico
  | CatalogoCurso;
