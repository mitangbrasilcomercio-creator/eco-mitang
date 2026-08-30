import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail invalido.'),
  senha: z.string().min(1, 'Senha obrigatoria.')
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const CriarUsuarioSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail invalido.'),
  nome: z.string().trim().min(3, 'Nome deve ter ao menos 3 caracteres.'),
  senha: z
    .string()
    .min(12, 'A senha deve ter no minimo 12 caracteres.')
    .regex(/[a-z]/, 'A senha deve conter letra minuscula.')
    .regex(/[A-Z]/, 'A senha deve conter letra maiuscula.')
    .regex(/[0-9]/, 'A senha deve conter numero.'),
  papel: z.enum(['Gestor_CLevel', 'Financeiro', 'Vendedor', 'Operacional']).default('Vendedor'),
  pode_visao_consolidada: z.boolean().default(false),
  empresas: z.array(z.string().uuid('empresa_id deve ser um UUID.')).min(1, 'Informe ao menos um CNPJ.')
});
export type CriarUsuarioInput = z.infer<typeof CriarUsuarioSchema>;
