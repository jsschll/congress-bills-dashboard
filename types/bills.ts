export type GovernmentLevel = "Federal" | "State" | "City" | "District";

export interface LegislativeStep {
  stepNumber: number;
  totalSteps: number;
  stepName: string;
  isCompleted: boolean;
  isCurrent: boolean;
  date?: string;
}

export interface DeltaBreakdown {
  added: string[];
  changed: string[];
  removed: string[];
}

export interface BillItem {
  id: string;
  billNumber: string;
  title: string;
  level: GovernmentLevel;
  jurisdiction: string;
  primarySponsor: {
    name: string;
    title: string;
  };
  lastUpdated: string;
  status: LegislativeStep;
  allSteps: LegislativeStep[];
  shortPitch: string;
  deltaSummary: DeltaBreakdown;
  officialUrl: string;
  tags: string[];
}

export interface UserFollowPreferences {
  topics: string[];
  billIds: string[];
  politicianIds: string[];
  districts: string[];
}
