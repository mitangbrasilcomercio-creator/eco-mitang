import { z } from 'zod';

// ============================================================================
// REGRA 2: VALIDAÇÃO DINÂMICA POLIMÓRFICA POR TIPO DE ITEM
// ============================================================================

// 1. Manufatura de Baterias (PRODUTO)
export const DetalhesProdutoSchema = z.object({
  preco_base: z.number().positive('Preco base do produto deve ser maior que zero.'),
  unidade_medida: z.string().min(1, 'Unidade de medida obrigatoria (ex: UN, CX, KG).'),
  codigo_sku: z.string().optional(),
  capacidade_ah: z.number().positive().optional(),
  voltagem_nominal: z.number().positive().optional(),
  peso_kg: z.number().positive().optional(),
  ncm: z.string().length(8, 'NCM deve possuir 8 digitos.').optional()
});

export const CatalogoProdutoInputSchema = z.object({
  tipo_item: z.literal('PRODUTO'),
  nome: z.string().min(3, 'Nome do produto deve ter no minimo 3 caracteres.'),
  descricao_tecnica: z.string().optional().nullable(),
  quantidade_estoque_atual: z.number().min(0, 'Estoque inicial nao pode ser negativo.').default(0),
  detalhes: DetalhesProdutoSchema
});

// 2. Locação Offshore (LOCACAO)
export const DetalhesLocacaoSchema = z.object({
  preco_base: z.number().positive('Preco da locacao deve ser maior que zero.'),
  unidade_cobranca: z.enum(['DIARIA', 'MENSAL', 'POR_PROJETO']),
  exige_mobilizacao: z.boolean().default(false),
  especificacao_embarque: z.string().optional(),
  certificado_offshore_obrigatorio: z.boolean().default(false)
});

export const CatalogoLocacaoInputSchema = z.object({
  tipo_item: z.literal('LOCACAO'),
  nome: z.string().min(3, 'Nome do item de locacao deve ter no minimo 3 caracteres.'),
  descricao_tecnica: z.string().optional().nullable(),
  quantidade_estoque_atual: z.number().min(0).default(1),
  detalhes: DetalhesLocacaoSchema
});

// 3. Serviços Offshore (SERVICO)
export const DetalhesServicoSchema = z.object({
  preco_base: z.number().positive('Preco base do servico deve ser maior que zero.'),
  unidade_medida: z.enum(['HORA_HOMEM', 'DIARIA_TECNICO', 'ESCOPO_FECHADO']),
  funcao_tecnica: z.string().optional(),
  necessita_art: z.boolean().default(false)
});

export const CatalogoServicoInputSchema = z.object({
  tipo_item: z.literal('SERVICO'),
  nome: z.string().min(3, 'Nome do servico deve ter no minimo 3 caracteres.'),
  descricao_tecnica: z.string().optional().nullable(),
  quantidade_estoque_atual: z.number().min(0).default(0),
  detalhes: DetalhesServicoSchema
});

// 4. Cursos e Treinamentos (CURSO)
export const DetalhesCursoSchema = z.object({
  preco_base: z.number().positive('Preco do curso deve ser maior que zero.'),
  carga_horaria_horas: z.number().positive('Carga horaria deve ser maior que zero.'),
  modalidade: z.enum(['EAD', 'PRESENCIAL', 'HIBRIDO']),
  certificacao_emitida: z.string().optional(),
  validade_meses: z.number().positive().optional()
});

export const CatalogoCursoInputSchema = z.object({
  tipo_item: z.literal('CURSO'),
  nome: z.string().min(3, 'Nome do curso deve ter no minimo 3 caracteres.'),
  descricao_tecnica: z.string().optional().nullable(),
  quantidade_estoque_atual: z.number().min(0).default(0),
  detalhes: DetalhesCursoSchema
});

// ============================================================================
// UNIÃO DISCRIMINADA DE CRIAÇÃO E ATUALIZAÇÃO
// ============================================================================
export const CreateCatalogoItemSchema = z.discriminatedUnion('tipo_item', [
  CatalogoProdutoInputSchema,
  CatalogoLocacaoInputSchema,
  CatalogoServicoInputSchema,
  CatalogoCursoInputSchema
]);

export const UpdateCatalogoItemSchema = z.object({
  nome: z.string().min(3).optional(),
  descricao_tecnica: z.string().optional().nullable(),
  quantidade_estoque_atual: z.number().min(0).optional(),
  detalhes: z.record(z.string(), z.any()).optional(),
  ativo: z.boolean().optional()
});

export const FilterCatalogoQuerySchema = z.object({
  tipo_item: z.enum(['PRODUTO', 'LOCACAO', 'SERVICO', 'CURSO']).optional(),
  ativo: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  busca: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20)
});

export type CreateCatalogoItemInput = z.infer<typeof CreateCatalogoItemSchema>;
export type UpdateCatalogoItemInput = z.infer<typeof UpdateCatalogoItemSchema>;
export type FilterCatalogoQuery = z.infer<typeof FilterCatalogoQuerySchema>;

export function validatePolymorphicDetailsUpdate(tipo: string, partialDetails: any): any {
  if (!partialDetails || typeof partialDetails !== 'object') return partialDetails;
  let schema: z.ZodTypeAny;
  switch (tipo) {
    case 'PRODUTO': schema = DetalhesProdutoSchema.partial(); break;
    case 'LOCACAO': schema = DetalhesLocacaoSchema.partial(); break;
    case 'SERVICO': schema = DetalhesServicoSchema.partial(); break;
    case 'CURSO': schema = DetalhesCursoSchema.partial(); break;
    default: return partialDetails;
  }
  return schema.parse(partialDetails);
}

