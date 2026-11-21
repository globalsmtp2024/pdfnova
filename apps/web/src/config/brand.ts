import generated from "./brand.generated.json";

export type Brand = {
  name: string;
  tagline: string;
  domain: string;
  supportEmail: string;
};

export const brand: Brand = generated;
