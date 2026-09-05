export interface NormalizationProfile {
  readonly id: string;
  readonly version: string;
  readonly unicodeForm: "NFC" | "NFKC";
  readonly lowercase: boolean;
  readonly removePunctuation: boolean;
  readonly collapseWhitespace: boolean;
}
