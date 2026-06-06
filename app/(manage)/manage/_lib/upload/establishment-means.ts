export type EstablishmentMeansOption = {
  value: string;
  label: string;
  description: string;
  gbifCodeLabel: string;
};

export const PARTNER_ESTABLISHMENT_MEANS_OPTIONS: EstablishmentMeansOption[] = [
  {
    value: "managed",
    label: "Your team planted them",
    description: "Trees were intentionally planted and are actively maintained by your community.",
    gbifCodeLabel: "managed",
  },
  {
    value: "native",
    label: "They grew here naturally",
    description: "Trees seeded and grew on their own. Species belongs in this region.",
    gbifCodeLabel: "native",
  },
  {
    value: "naturalised",
    label: "They regenerated naturally",
    description: "Trees that arrived from elsewhere and have established a self-sustaining population.",
    gbifCodeLabel: "naturalised",
  },
  {
    value: "uncertain",
    label: "Not sure",
    description: "Trees were already here when you started recording. Better to be honest than guess.",
    gbifCodeLabel: "uncertain",
  },
];
