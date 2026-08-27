import { z } from 'zod';

/**
 * Validação algorítmica de CNPJ brasileiro via cálculo dos dígitos verificadores (Módulo 11).
 */
export function isValidCNPJ(cnpjRaw: string): boolean {
  const b = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const c = cnpjRaw.replace(/[^\d]/g, '');
  if (c.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(c)) return false;

  let n = 0;
  for (let i = 0; i < 12; i++) {
    n += parseInt(c[i], 10) * b[i + 1];
  }
  n = 11 - (n % 11);
  n = n >= 10 ? 0 : n;
  if (parseInt(c[12], 10) !== n) return false;

  n = 0;
  for (let i = 0; i <= 12; i++) {
    n += parseInt(c[i], 10) * b[i];
  }
  n = 11 - (n % 11);
  n = n >= 10 ? 0 : n;
  return parseInt(c[13], 10) === n;
}

/**
 * Validação algorítmica de CPF brasileiro via cálculo dos dígitos verificadores.
 */
export function isValidCPF(cpfRaw: string): boolean {
  const cpf = cpfRaw.replace(/[^\d]/g, '');
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(cpf.charAt(i), 10) * (10 - i);
  }
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf.charAt(9), 10)) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += parseInt(cpf.charAt(i), 10) * (11 - i);
  }
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  return resto === parseInt(cpf.charAt(10), 10);
}

export function isValidDocumento(doc: string): boolean {
  const clean = doc.replace(/[^\d]/g, '');
  if (clean.length === 14) return isValidCNPJ(clean);
  if (clean.length === 11) return isValidCPF(clean);
  return false;
}

export const SocioQSASchema = z.object({
  nome: z.string().min(2),
  qualificacao: z.string().min(2),
  pais_origem: z.string().optional(),
  nome_representante_legal: z.string().optional()
});

export const CreateClienteSchema = z.object({
  cnpj_cpf: z.string().refine(isValidDocumento, {
    message: 'CNPJ ou CPF invalido com base no calculo oficial de digitos verificadores.'
  }),
  // Se auto_enriquecer for true, os outros campos serão preenchidos automaticamente pelo gateway
  auto_enriquecer_receita: z.boolean().default(true),
  razao_social_nome: z.string().min(3).optional(),
  nome_fantasia: z.string().optional(),
  cnae_principal: z.string().optional(),
  cnae_descricao: z.string().optional(),
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  municipio: z.string().optional(),
  uf: z.string().length(2).optional(),
  email: z.string().email('E-mail invalido.').optional(),
  telefone: z.string().optional()
});

export const UpdateClienteSchema = z.object({
  razao_social_nome: z.string().min(3).optional(),
  nome_fantasia: z.string().optional(),
  email: z.string().email('E-mail invalido.').optional(),
  telefone: z.string().optional(),
  situacao_cadastral: z.enum(['ATIVA', 'SUSPENSA', 'INAPTA', 'BAIXADA', 'NULA']).optional(),
  motivo_situacao_cadastral: z.string().optional(),
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  municipio: z.string().optional(),
  uf: z.string().length(2).optional(),
  bloqueio_fiscal: z.boolean().optional(),
  ativo: z.boolean().optional()
});

export const FilterClienteQuerySchema = z.object({
  busca: z.string().optional(),
  tipo_entidade: z.enum(['CLIENTE', 'FORNECEDOR', 'COLABORADOR_PJ']).optional(),
  situacao_cadastral: z.enum(['ATIVA', 'SUSPENSA', 'INAPTA', 'BAIXADA', 'NULA']).optional(),
  bloqueio_fiscal: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  ativo: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(500).default(20)
});

export type CreateClienteInput = z.infer<typeof CreateClienteSchema>;
export type UpdateClienteInput = z.infer<typeof UpdateClienteSchema>;
export type FilterClienteQuery = z.infer<typeof FilterClienteQuerySchema>;
