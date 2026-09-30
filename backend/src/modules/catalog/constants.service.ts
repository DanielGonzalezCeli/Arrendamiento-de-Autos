import { Injectable } from '@nestjs/common';
import { BUSINESS_RULES } from '../../domain/business-rules';
import { FuelPolicy, FuelType, Transmission } from '../../domain/enums';
import { CatalogService } from './catalog.service';

/** Claves admitidas por CarConstantsRequest.constants (enum del contrato). */
export const CONSTANT_KEYS = ['depot_services', 'fuel_policies', 'fuel_types', 'general', 'payment_timings', 'transmission'] as const;
export type ConstantKey = (typeof CONSTANT_KEYS)[number];

type Language = 'es' | 'en';
const SUPPORTED_LANGUAGES: Language[] = ['es', 'en'];

interface LabeledValue {
  code: string;
  name: string;
}

type Labels = Record<string, Record<Language, string>>;

const DEPOT_SERVICES: Labels = {
  AIRPORT_COUNTER: { es: 'Mostrador en aeropuerto', en: 'Airport counter' },
  SHUTTLE: { es: 'Traslado a la agencia', en: 'Shuttle to depot' },
  AFTER_HOURS_RETURN: { es: 'Devolución fuera de horario', en: 'After-hours return' },
  CITY_OFFICE: { es: 'Oficina en ciudad', en: 'City office' },
  DELIVERY: { es: 'Entrega a domicilio', en: 'Delivery' },
};
const FUEL_POLICIES: Labels = {
  [FuelPolicy.FullToFull]: { es: 'Lleno a lleno', en: 'Full to full' },
  [FuelPolicy.SameToSame]: { es: 'Mismo nivel', en: 'Same to same' },
  [FuelPolicy.Prepaid]: { es: 'Combustible prepagado', en: 'Prepaid fuel' },
};
const FUEL_TYPES: Labels = {
  [FuelType.Gasoline]: { es: 'Gasolina', en: 'Gasoline' },
  [FuelType.Diesel]: { es: 'Diésel', en: 'Diesel' },
  [FuelType.Hybrid]: { es: 'Híbrido', en: 'Hybrid' },
  [FuelType.Electric]: { es: 'Eléctrico', en: 'Electric' },
};
/** El pago lo procesa otro dominio antes de crear la orden (payment_reference). */
const PAYMENT_TIMINGS: Labels = {
  PAY_NOW: { es: 'Pago al reservar', en: 'Pay now' },
};
const TRANSMISSIONS: Labels = {
  [Transmission.Manual]: { es: 'Manual', en: 'Manual' },
  [Transmission.Automatic]: { es: 'Automática', en: 'Automatic' },
};

/** Constantes del sistema (POST /constants). */
@Injectable()
export class ConstantsService {
  constructor(private readonly catalog: CatalogService) {}

  async get(keys: ConstantKey[] | undefined, languages: string[] | undefined): Promise<Record<string, unknown>> {
    const language = pickLanguage(languages);
    const requested = keys?.length ? keys : [...CONSTANT_KEYS];
    const data: Record<string, unknown> = {};
    for (const key of requested) data[key] = await this.build(key, language);
    return data;
  }

  private async build(key: ConstantKey, language: Language): Promise<unknown> {
    switch (key) {
      case 'depot_services':
        return labeled(DEPOT_SERVICES, language);
      case 'fuel_policies':
        return labeled(FUEL_POLICIES, language);
      case 'fuel_types':
        return labeled(FUEL_TYPES, language);
      case 'payment_timings':
        return labeled(PAYMENT_TIMINGS, language);
      case 'transmission':
        return labeled(TRANSMISSIONS, language);
      case 'general':
        return this.general();
    }
  }

  private async general() {
    const categories = await this.catalog.listCategories();
    return {
      base_currency: BUSINESS_RULES.BASE_CURRENCY,
      supported_currencies: await this.catalog.supportedCurrencies(),
      tax_rate: BUSINESS_RULES.TAX_RATE,
      car_types: categories.map((c) => ({ code: c.code, name: c.name, min_driver_age: c.minDriverAge })),
      hold_ttl_minutes: BUSINESS_RULES.HOLD_TTL_MINUTES,
      search_token_ttl_minutes: BUSINESS_RULES.SEARCH_TTL_MINUTES,
      free_cancellation_hours: BUSINESS_RULES.FREE_CANCELLATION_HOURS,
      young_driver_age_limit: BUSINESS_RULES.YOUNG_DRIVER_AGE_LIMIT,
    };
  }
}

function pickLanguage(languages: string[] | undefined): Language {
  const match = languages
    ?.map((l) => l.slice(0, 2).toLowerCase())
    .find((l): l is Language => SUPPORTED_LANGUAGES.includes(l as Language));
  return match ?? 'es';
}

function labeled(labels: Labels, language: Language): LabeledValue[] {
  return Object.entries(labels).map(([code, names]) => ({ code, name: names[language] }));
}
