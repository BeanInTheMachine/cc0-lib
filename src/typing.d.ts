interface Window {
  ethereum?: import("ethers").Eip1193Provider & {
    on?: (event: string, cb: (...args: unknown[]) => void) => void;
    removeListener?: (event: string, cb: (...args: unknown[]) => void) => void;
  };
}

type Item = {
  id: string;
  Source: string;
  Type: string;
  "Social Link"?: string;
  Filetype: string;
  ENS?: string;
  Description: string;
  Thumbnails: ItemThumbnail[];
  Tags: string[];
  ID: number;
  Title: string;
  File?: string;
  Status?: "published" | "draft";
  SubmissionStatus?:
    | "draft"
    | "submitted"
    | "under-review"
    | "approved"
    | "rejected";
  ParentDB?: string;
  ThumbnailURL?: string;
};

type ItemThumbnail = {
  name: string;
  url: string;
  rawUrl: string;
};

