// UI micro-labels for the lexicon docs, resolved once per request from
// next-intl (common.docs) and threaded through the presentational components so
// they stay free of translation calls.
export interface DocsLabels {
  values: string;
  members: string;
  output: string;
  key: string;
  required: string;
}
