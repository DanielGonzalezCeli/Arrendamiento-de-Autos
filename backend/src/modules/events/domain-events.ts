/**
 * Catálogo de eventos de dominio (docs/SOA_EDA.md). Los tres primeros son los del enum
 * WebhookSubscription.events del contrato y se entregan por webhook; los demás son internos.
 */
export enum DomainEventType {
  CarOrderConfirmed = 'CAR_ORDER_CONFIRMED',
  CarOrderCancelled = 'CAR_ORDER_CANCELLED',
  DepotUpdate = 'DEPOT_UPDATE',
  /** No existe en el contrato: se registra pero no se entrega al Hub (propuesto al equipo de integración). */
  CarOrderModified = 'CAR_ORDER_MODIFIED',
}

/** Eventos que un suscriptor puede recibir (enum del contrato). */
export const WEBHOOK_EVENT_TYPES = [
  DomainEventType.CarOrderConfirmed,
  DomainEventType.CarOrderCancelled,
  DomainEventType.DepotUpdate,
] as const;
