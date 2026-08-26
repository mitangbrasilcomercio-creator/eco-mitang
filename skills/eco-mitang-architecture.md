# Eco-Mitang Architecture & Engineering Guidelines

Guia de engenharia de software e regras de domínio da **Holding Eco-Mitang**:

## 1. As 4 Operações da Holding
1. **Manufatura de Baterias Subsea (Mitang Power)**: Baterias seladas de lítio para águas profundas.
2. **Locação de Equipamentos Offshore (Mitang Rental)**: Guinchos de convés 50T e maquinário pesado.
3. **Serviços Especializados Offshore (Mitang Services)**: Engenharia e manutenção com ART e QSMS.
4. **Cursos e Treinamentos Marítimos (Mitang Academy)**: Treinamentos homologados pela Marinha.

---

## 2. Princípios Arquiteturais Inegociáveis

1. **Multi-Tenant Estrito**: Isolamento em nível de banco de dados via **PostgreSQL RLS** e `app.current_empresa_id` setado via `SELECT set_config(...)` parametrizado.
2. **Arquitetura Orientada a Eventos**: Todas as transições de status publicam eventos de domínio no `globalEventBus`, desacoplando os módulos.
3. **Padrão Snapshot Financeiro**: Preços e condições contratuais congelados nas cotações e OSs, blindando o histórico contra reajustes dinâmicos do catálogo.
4. **CQRS em Tempo Real**: Dashboards agregados de forma atômica incremental via projeções de eventos, eliminando consultas pesadas na base OLTP.
5. **Governança & Gatekeepers**: Travas de alçada comercial (> 10%), travas de cronômetro aberto em OSs e imutabilidade criptográfica (SHA-256) em laudos de QSMS.
6. **Automação Cadastral & Monitoramento em Background**:
   - Cadastro inteligente via CNPJ com auto-enriquecimento na Receita Federal (BrasilAPI / RFB).
   - Bloqueio fiscal preventivo para entidades INAPTAS ou BAIXADAS.
   - Sincronização periódica em background que detecta alterações sem aviso prévio.
   - Histórico de auditoria imutável (SCD Tipo 2 / CDC) com registro da **data de vigência** da alteração.

---

## 3. "Essa Linha de Pensamento Vale para Tudo!"
- **Clientes**: CNPJ -> Enriquecimento -> Monitoramento de regularidade fiscal -> Histórico com data de vigência.
- **Fornecedores**: Qualificação -> Monitoramento contínuo de Certidões Negativas de Débito (CND) -> Bloqueio de compras em caso de inadimplência.
- **Catálogo & Insumos**: Monitoramento da cotação de células de lítio e matérias-primas -> Alerta de defasagem de margem em propostas pendentes.
- **QSMS Offshore**: Monitoramento de laudos de teste de carga e calibração de equipamentos -> Bloqueio preventivo de alocação de itens vencidos.
