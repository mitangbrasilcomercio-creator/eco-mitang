import { InMemoryDB } from '../../core/database/db-client';
import { EventBus } from '../../core/events/event-bus';
import { AuditoriaQSMS, RegistroNaoConformidade } from './qsms.types';
import { QsmsAuditoriaAprovadaPayload, QsmsAuditoriaReprovadaPayload } from '../../core/events/events.types';
import * as crypto from 'crypto';

export class QsmsAuditoriaService {
  constructor(
    private readonly db: InMemoryDB,
    private readonly eventBus: EventBus
  ) {}

  async criarAuditoria(empresaId: string, osId: string, auditorId: string): Promise<AuditoriaQSMS> {
    const aud: AuditoriaQSMS = {
      id: crypto.randomUUID(),
      empresa_id: empresaId,
      os_id: osId,
      auditor_id: auditorId,
      resultado_final: 'PENDENTE'
    };
    this.db.data.auditorias_qsms.push(aud);
    return aud;
  }

  async aprovarAuditoria(empresaId: string, auditoriaId: string, auditorId: string, chavePrivada: string): Promise<AuditoriaQSMS> {
    const aud = this.db.data.auditorias_qsms.find(a => a.id === auditoriaId && a.empresa_id === empresaId);
    if (!aud) throw new Error('Auditoria nao encontrada.');
    if (aud.resultado_final === 'APROVADO') throw new Error('REGRA 3: Auditoria APROVADA e imutavel.');

    const os = this.db.data.ordens_servico.find(o => o.id === aud.os_id);
    if (!os) throw new Error('OS vinculada nao encontrada.');

    const dataAprovacao = new Date().toISOString();
    const hash = crypto.createHash('sha256').update(auditoriaId + dataAprovacao + chavePrivada).digest('hex');

    aud.resultado_final = 'APROVADO';
    aud.assinatura_digital_hash = hash;
    aud.aprovado_em = dataAprovacao;
    aud.dados_snapshot_auditoria = { os_numero: os.numero_os, tipo_os: os.tipo_os };

    await this.eventBus.publish<QsmsAuditoriaAprovadaPayload>({
      eventId: crypto.randomUUID(),
      eventType: 'QSMS.AUDITORIA_APROVADA',
      timestamp: dataAprovacao,
      empresaId: aud.empresa_id,
      payload: {
        auditoria_id: aud.id,
        os_id: os.id,
        empresa_id: aud.empresa_id,
        cotacao_origem_id: os.cotacao_origem_id,
        aprovado_em: dataAprovacao,
        assinatura_hash: hash
      }
    });

    return aud;
  }

  async reprovarAuditoria(empresaId: string, auditoriaId: string, descricaoRnc: string): Promise<{ auditoria: AuditoriaQSMS; rnc: RegistroNaoConformidade }> {
    if (!descricaoRnc || !descricaoRnc.trim()) throw new Error('REGRA 2: Descricao de RNC obrigatoria para reprovacao.');

    const aud = this.db.data.auditorias_qsms.find(a => a.id === auditoriaId && a.empresa_id === empresaId);
    if (!aud) throw new Error('Auditoria nao encontrada.');
    if (aud.resultado_final === 'APROVADO') throw new Error('REGRA 3: Auditoria APROVADA e imutavel.');

    aud.resultado_final = 'REPROVADO_RNC';

    const rnc: RegistroNaoConformidade = {
      id: crypto.randomUUID(),
      empresa_id: empresaId,
      auditoria_id: auditoriaId,
      descricao: descricaoRnc,
      status: 'ABERTA'
    };
    this.db.data.registros_nao_conformidade.push(rnc);

    const os = this.db.data.ordens_servico.find(o => o.id === aud.os_id);
    if (os) {
      os.status = 'BLOQUEADA_EM_RETRABALHO';
      os.bloqueio_qsms = true;
    }

    await this.eventBus.publish<QsmsAuditoriaReprovadaPayload>({
      eventId: crypto.randomUUID(),
      eventType: 'QSMS.AUDITORIA_REPROVADA',
      timestamp: new Date().toISOString(),
      empresaId: empresaId,
      payload: {
        auditoria_id: aud.id,
        rnc_id: rnc.id,
        os_id: aud.os_id,
        empresa_id: empresaId,
        descricao_rnc: descricaoRnc
      }
    });

    return { auditoria: aud, rnc };
  }
}
