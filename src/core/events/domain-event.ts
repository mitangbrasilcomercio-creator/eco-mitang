export interface DomainEvent<T = any> {
  eventId: string;
  eventType: string;
  timestamp: string;
  empresaId: string;
  payload: T;
}
