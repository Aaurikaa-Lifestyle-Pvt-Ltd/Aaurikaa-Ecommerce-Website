export type TipTapMark = {
  type?: string;
  attrs?: Record<string, unknown>;
};

export type TipTapNode = {
  type?: string;
  text?: string;
  marks?: TipTapMark[];
  content?: TipTapNode[];
  attrs?: Record<string, unknown>;
};
