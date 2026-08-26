import { z } from 'zod';
import { TipoItem } from '../models/item-catalogo.model';

export const TipoItemEnum = z.enum(['Produto', 'Locacao', 'Servico', 'Curso']);

export const BaseItemCatalogoSchema = z.object({
  empresa_id: z.string().uuid('empresa_id deve ser um UUID valido.'),
  tipo_item: TipoItemEnum,
  codigo_sku: z.string().min(1).optional().nullable(),
  nome_comercial: z.string().min(2, 'nome_comercial obrigatorio (minimo 2 caracteres).'),
  preco_base: z.number().nonnegative('preco_base deve ser maior ou igual a zero.'),
  quantidade_estoque: z.number().nonnegative('quantidade_estoque deve ser maior ou igual a zero.').default(0),
  atributos_extras: z.record(z.string(), z.any()).default({})
});

export interface CreateItemCatalogoInput {
  empresa_id: string;
  tipo_item: TipoItem;
  codigo_sku?: string | null;
  nome_comercial: string;
  preco_base: number;
  quantidade_estoque: number;
  atributos_extras: Record<string, any>;
}

export interface UpdateItemCatalogoInput {
  tipo_item?: TipoItem;
  codigo_sku?: string | null;
  nome_comercial?: string;
  preco_base?: number;
  quantidade_estoque?: number;
  atributos_extras?: Record<string, any>;
  status_ativo?: boolean;
}
