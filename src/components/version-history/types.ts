export interface VersionListItem {
  id: string;
  kind: "AUTO" | "MANUAL" | "PRE_AI";
  createdAt: string;
  createdBy: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

export interface VersionDetail extends VersionListItem {
  snapshotJson: unknown;
}
