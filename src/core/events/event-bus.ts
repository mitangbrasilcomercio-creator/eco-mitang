import { DomainEvent } from './domain-event';
export type EventHandler<T = any> = (event: DomainEvent<T>) => Promise<void> | void;

export class EventBus {
  private handlers: Map<string, EventHandler[]> = new Map();

  subscribe<T = any>(eventType: string, handler: EventHandler<T>): void {
    const list = this.handlers.get(eventType) || [];
    list.push(handler);
    this.handlers.set(eventType, list);
  }

  async publish<T = any>(event: DomainEvent<T>): Promise<void> {
    const list = this.handlers.get(event.eventType) || [];
    const wildcard = this.handlers.get('*') || [];
    for (const h of [...list, ...wildcard]) {
      try { await h(event); } catch (err: any) { console.error('[EventBus Error]', err.message); }
    }
  }
}
export const globalEventBus = new EventBus();
