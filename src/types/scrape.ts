export type SourceType = 'dlsite' | 'bangumi' | 'vndb' | 'steam';

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
}

export interface AdoptData {
  source: SourceType;
  sourceId: string;
  name: string;
  makerName: string;
  coverUrl: string;
  detail: DetailResult;
}