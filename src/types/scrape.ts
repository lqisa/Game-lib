export type SourceType = 'dlsite' | 'dmm' | 'bangumi' | 'vndb' | 'steam';

export interface SearchResult {
  id: string;
  name: string;
  makerName: string;
  coverUrl: string;
}

export interface DetailResult {
  id: string;
  title: string;
  coverURL: string;
  makers: string[];
  genres: string[];
  tags: string[];
  description: string;
  /**
   * Per-entry adult flag where the vendor publishes one (Bangumi's `nsfw`). Carried to adoption so
   * the R18 column comes from metadata instead of the cover classifier - which is the only source
   * for Bangumi today, and the reason its ~1285 games were all left "unknown".
   */
  nsfw?: boolean;
}

export interface AdoptData {
  source: SourceType;
  sourceId: string;
  name: string;
  makerName: string;
  coverUrl: string;
  detail: DetailResult;
}
